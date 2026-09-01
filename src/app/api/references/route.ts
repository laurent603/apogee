import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type Anthropic from '@anthropic-ai/sdk'
import { anthropic, MODEL_REPORT, REPORT_REASONING } from '@/lib/anthropic'
import { DECONSTRUCTION } from '@/lib/prompts'

/**
 * Les créas de référence d'un compte, et leur plan de composition.
 *
 * Les meilleures références sont les gagnantes : elles sont jugées par les
 * chiffres, pas par l'œil. On les propose donc automatiquement, triées par
 * CPL — mais une créa dynamique ou une vidéo n'a pas d'image exploitable,
 * d'où l'ajout manuel qui reste possible.
 */

export const maxDuration = 300

const V = process.env.META_API_VERSION || 'v21.0'

/** Récupère l'image pleine taille d'une publicité, pas sa vignette. */
async function imageDeLaPub(adId: string, token: string): Promise<string | null> {
  try {
    const u = new URL(`https://graph.facebook.com/${V}/${adId}`)
    u.searchParams.set('fields', 'creative{image_url,thumbnail_url,object_story_spec}')
    u.searchParams.set('access_token', token)
    const j = await (await fetch(u)).json()
    const c = j?.creative ?? {}
    const url: string | undefined =
      c.image_url ||
      c.object_story_spec?.link_data?.picture ||
      c.thumbnail_url
    if (!url) return null
    const img = await fetch(url)
    if (!img.ok) return null
    return Buffer.from(await img.arrayBuffer()).toString('base64')
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbAccountId = req.nextUrl.searchParams.get('dbAccountId')
  if (!dbAccountId) return NextResponse.json({ error: 'dbAccountId requis' }, { status: 400 })

  const references = await prisma.creaReference.findMany({
    where: { adAccountId: dbAccountId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, image: true, source: true, adId: true, adName: true, cpl: true, plan: true, createdAt: true },
  })

  /**
   * Les gagnantes proposées : meilleur CPL sur trente jours, hors créas déjà
   * retenues. On ne charge pas leur image ici — ce serait une requête Meta par
   * candidate pour un écran qu'on ne consultera peut-être pas.
   */
  const until = new Date(); until.setUTCHours(0, 0, 0, 0)
  const since = new Date(until); since.setUTCDate(since.getUTCDate() - 30)
  const [agg, entites] = await Promise.all([
    prisma.metaDailyAd.groupBy({
      by: ['adId'],
      where: { adAccountId: dbAccountId, attribution: 'default', date: { gte: since, lte: until } },
      _sum: { spend: true, formLeads: true, pixelLeads: true, totalLeads: true },
    }),
    prisma.metaEntity.findMany({
      where: { adAccountId: dbAccountId, level: 'ad' },
      select: { metaId: true, name: true, creativeType: true, thumbnailUrl: true },
    }),
  ])
  const nomDe = new Map(entites.map((e) => [e.metaId, e]))
  const dejaPris = new Set(references.map((r) => r.adId).filter(Boolean))

  const gagnantes = agg
    .map((r) => {
      const n = (v: number | null | undefined) => Number(v ?? 0)
      const leads = n(r._sum.formLeads) || n(r._sum.pixelLeads) || n(r._sum.totalLeads)
      const depense = n(r._sum.spend)
      const e = nomDe.get(String(r.adId ?? ''))
      return {
        adId: String(r.adId ?? ''),
        nom: e?.name ?? '',
        format: e?.creativeType ?? null,
        vignette: e?.thumbnailUrl ?? null,
        prospects: leads,
        cpl: leads > 0 ? Math.round((depense / leads) * 100) / 100 : null,
      }
    })
    .filter((r) => r.adId && r.nom && r.prospects >= 3 && r.cpl !== null && !dejaPris.has(r.adId))
    .sort((a, b) => (a.cpl as number) - (b.cpl as number))
    .slice(0, 8)

  return NextResponse.json({ references, gagnantes })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { dbAccountId, image, adId, adName, cpl } = await req.json().catch(() => ({})) as {
    dbAccountId?: string; image?: string; adId?: string; adName?: string; cpl?: number
  }
  if (!dbAccountId) return NextResponse.json({ error: 'dbAccountId requis' }, { status: 400 })

  let donnees = image ?? null
  if (!donnees && adId) {
    const token = session.accessToken as string | undefined
    if (!token) return NextResponse.json({ error: 'Jeton Meta absent' }, { status: 400 })
    donnees = await imageDeLaPub(adId, token)
    if (!donnees) {
      return NextResponse.json(
        { error: 'Cette publicité n’expose pas d’image — créa dynamique ou vidéo. Ajoutez-la manuellement.' },
        { status: 422 },
      )
    }
  }
  if (!donnees) return NextResponse.json({ error: 'Image requise' }, { status: 400 })

  const ref = await prisma.creaReference.create({
    data: { adAccountId: dbAccountId, image: donnees, source: adId ? 'winner' : 'upload', adId, adName, cpl },
    select: { id: true, source: true, adName: true, cpl: true, createdAt: true },
  })
  return NextResponse.json({ reference: { ...ref, image: donnees } })
}

/** Déconstruit une référence en plan de composition. */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Clé Anthropic absente' }, { status: 500 })
  }

  const { id } = await req.json().catch(() => ({})) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const ref = await prisma.creaReference.findUnique({ where: { id } })
  if (!ref) return NextResponse.json({ error: 'Référence introuvable' }, { status: 404 })

  try {
    const reponse = await anthropic.messages.stream({
      model: MODEL_REPORT,
      max_tokens: 16000,
      system: DECONSTRUCTION,
      messages: [{
        role: 'user',
        content: [
          // Le modèle doit voir la publicité : c'est tout l'objet de la
          // manœuvre. La décrire en mots reviendrait au point de départ.
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: ref.image } },
          { type: 'text', text: 'Extrais le plan de composition de cette publicité.' },
        ],
      }],
      ...REPORT_REASONING,
    }).finalMessage()

    if (reponse.stop_reason === 'max_tokens') {
      return NextResponse.json({ error: 'Analyse interrompue — relancez.' }, { status: 502 })
    }

    const brut = reponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text).join('\n').trim()
    const json = brut.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    try { JSON.parse(json) } catch {
      return NextResponse.json({ error: 'Plan non exploitable (JSON invalide)' }, { status: 502 })
    }

    await prisma.creaReference.update({ where: { id }, data: { plan: json } })
    return NextResponse.json({ plan: json })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message.slice(0, 300) : 'Erreur inconnue' },
      { status: 502 },
    )
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  await prisma.creaReference.delete({ where: { id } }).catch(() => null)
  return NextResponse.json({ ok: true })
}
