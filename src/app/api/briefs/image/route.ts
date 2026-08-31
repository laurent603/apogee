import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * La fabrication d'image, depuis un prompt de brief.
 *
 * Route isolée, table dédiée, aucune modification de l'existant : la
 * fonctionnalité doit pouvoir être retirée sans rien casser. Elle s'éteint
 * d'elle-même si `OPENAI_API_KEY` n'est pas défini — l'écran ne montre alors
 * aucun bouton, et rien d'autre ne change.
 *
 * Le 9:16 n'existe pas dans les tailles proposées par le générateur : on
 * demande le portrait le plus proche et on le dit. Le recadrage exact viendra
 * avec l'incrustation du texte, qui produira les deux ratios depuis une seule
 * image plutôt que deux générations montrant deux personnes différentes.
 */

export const maxDuration = 300

/** Ce que le générateur sait produire, et ce qu'on en fait. */
const TAILLES: Record<string, { taille: string; exact: boolean }> = {
  '1:1': { taille: '1024x1024', exact: true },
  '9:16': { taille: '1024x1536', exact: false },
  '4:5': { taille: '1024x1536', exact: false },
  '16:9': { taille: '1536x1024', exact: false },
}

/** La capacité est annoncée à l'écran : sans clé, aucun bouton n'apparaît. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const briefId = req.nextUrl.searchParams.get('briefId')
  const disponible = Boolean(process.env.OPENAI_API_KEY)
  if (!briefId) return NextResponse.json({ disponible, images: [] })

  const images = await prisma.briefImage.findMany({
    where: { briefId },
    orderBy: { createdAt: 'desc' },
    take: 12,
  })
  return NextResponse.json({ disponible, images })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cle = process.env.OPENAI_API_KEY
  if (!cle) {
    return NextResponse.json({ error: 'Clé OpenAI absente : la génération d’images est désactivée.' }, { status: 503 })
  }

  const { briefId, ratio, prompt } = await req.json().catch(() => ({})) as
    { briefId?: string; ratio?: string; prompt?: string }
  if (!briefId || !prompt) return NextResponse.json({ error: 'briefId et prompt requis' }, { status: 400 })

  const cible = TAILLES[ratio || '1:1'] ?? TAILLES['1:1']

  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cle}` },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: cible.taille,
      }),
    })

    const json = await r.json().catch(() => null)
    if (!r.ok) {
      // Le message du fournisseur est rendu tel quel : un nom de modèle ou un
      // paramètre refusé se corrige en un aller-retour si on le lit, en dix si
      // on le remplace par « échec de génération ».
      const msg = json?.error?.message || `HTTP ${r.status}`
      return NextResponse.json({ error: `OpenAI : ${String(msg).slice(0, 300)}` }, { status: 502 })
    }

    const item = json?.data?.[0]
    let donnees: string | null = item?.b64_json ?? null
    // Certains modèles rendent une URL temporaire plutôt que l'image : on la
    // télécharge tout de suite, elle expire en moins d'une heure.
    if (!donnees && item?.url) {
      const img = await fetch(item.url)
      donnees = Buffer.from(await img.arrayBuffer()).toString('base64')
    }
    if (!donnees) return NextResponse.json({ error: 'Réponse sans image' }, { status: 502 })

    const image = await prisma.briefImage.create({
      data: { briefId, ratio: ratio || '1:1', taille: cible.taille, donnees, prompt },
    })

    return NextResponse.json({
      image: { ...image, donnees: undefined },
      donnees,
      exact: cible.exact,
    })
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

  await prisma.briefImage.delete({ where: { id } }).catch(() => null)
  return NextResponse.json({ ok: true })
}
