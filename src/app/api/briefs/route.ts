import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type Anthropic from '@anthropic-ai/sdk'
import { anthropic, MODEL_REPORT, REPORT_REASONING } from '@/lib/anthropic'
import { BRIEF_CREA } from '@/lib/prompts'

/**
 * Les briefs créa.
 *
 * Un brief naît d'une publicité et de son analyse, jamais du vide : les
 * chiffres sont ce qui lui permet de dire quelle faiblesse il corrige. La
 * route rassemble donc les trois — la publicité, ses métriques, la dernière
 * analyse enregistrée — avant d'écrire quoi que ce soit.
 */

export const maxDuration = 120

const CONSCIENCE: Record<string, string> = {
  unaware: 'Unaware — ignore le problème',
  problem: 'Problem Aware — ressent le problème',
  solution: 'Solution Aware — cherche une solution',
  product: 'Product Aware — compare les offres',
  most: 'Most Aware — prêt à acheter',
}

const STATUTS = ['a_produire', 'produit', 'lance']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const id = p.get('id')

  // Un brief demandé par son identifiant est rendu entier : c'est le seul cas
  // où l'on veut son texte.
  if (id) {
    const brief = await prisma.brief.findUnique({ where: { id } })
    if (!brief) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    return NextResponse.json({ brief })
  }

  const dbAccountId = p.get('dbAccountId')
  const statut = p.get('statut')
  const adId = p.get('adId')

  const briefs = await prisma.brief.findMany({
    where: {
      adAccountId: dbAccountId || undefined,
      statut: statut && statut !== 'all' ? statut : undefined,
      adId: adId || undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, title: true, adId: true, adName: true, statut: true,
      ton: true, conscience: true, format: true,
      downloadedAt: true, createdAt: true,
    },
  })

  const parStatut = await prisma.brief.groupBy({
    by: ['statut'],
    where: { adAccountId: dbAccountId || undefined },
    _count: true,
  })

  return NextResponse.json({
    briefs,
    statuts: parStatut.map((s) => ({ statut: s.statut, nombre: s._count })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { dbAccountId, adId, adName, ton, conscience, format, angle } = await req.json().catch(() => ({})) as {
    dbAccountId?: string; adId?: string; adName?: string
    ton?: string; conscience?: string; format?: string
    /** Une objection relevée dans les commentaires, avec ses preuves. */
    angle?: {
      objection: string
      occurrences?: number
      verbatims?: { texte: string; pub?: string; likes?: number }[]
      ce_que_ca_revele?: string
      reponse_suggeree?: string
    }
  }
  if (!dbAccountId || !adId) {
    return NextResponse.json({ error: 'Compte et publicité requis' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Clé Anthropic absente' }, { status: 500 })
  }

  const [reglages, analyse, entite] = await Promise.all([
    prisma.brandSettings.findUnique({ where: { adAccountId: dbAccountId } }),
    // La dernière analyse de cette créa : c'est elle qui porte le diagnostic.
    prisma.report.findFirst({
      where: { adAccountId: dbAccountId, adId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, content: true, createdAt: true },
    }),
    prisma.metaEntity.findFirst({
      where: { adAccountId: dbAccountId, level: 'ad', metaId: adId },
      select: { name: true, createdTime: true, creativeType: true },
    }),
  ])

  /**
   * Les chiffres de la publicité, sur trente jours.
   *
   * Lus en base plutôt que chez Meta : c'est la même source que le tableau et
   * l'analyse, donc le brief ne peut pas citer un chiffre que l'écran ne
   * montre pas.
   */
  const until = new Date(); until.setUTCHours(0, 0, 0, 0)
  const since = new Date(until); since.setUTCDate(since.getUTCDate() - 30)
  const chiffres = await prisma.metaDailyAd.aggregate({
    where: { adAccountId: dbAccountId, adId, attribution: 'default', date: { gte: since, lte: until } },
    _sum: {
      spend: true, impressions: true, clicks: true, linkClicks: true, reach: true,
      formLeads: true, pixelLeads: true, totalLeads: true,
      video3s: true, video15s: true, thruplays: true, video95: true, videoStarts: true,
    },
  })

  const n = (v: number | null | undefined) => Number(v ?? 0)
  const s = chiffres._sum
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10000) / 100 : null)
  const par = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) / 100 : null)
  const leads = n(s.formLeads) || n(s.pixelLeads) || n(s.totalLeads)

  const mesures = {
    periode: `${since.toISOString().slice(0, 10)} → ${until.toISOString().slice(0, 10)}`,
    depense: Math.round(n(s.spend) * 100) / 100,
    impressions: n(s.impressions),
    prospects: leads,
    cpl: par(n(s.spend), leads),
    ctr: pct(n(s.clicks), n(s.impressions)),
    ctrLien: pct(n(s.linkClicks), n(s.impressions)),
    cpcLien: par(n(s.spend), n(s.linkClicks)),
    hookRate: pct(n(s.video3s), n(s.impressions)),
    holdRate: pct(n(s.video15s), n(s.video3s)),
    completion: pct(n(s.video95), n(s.impressions)),
    clicVersLead: pct(leads, n(s.linkClicks)),
  }

  const nom = adName || entite?.name || adId

  const contexte = `# Publicité analysée
Nom : ${nom}
Identifiant : ${adId}
Format actuel : ${entite?.creativeType || 'inconnu'}

## Chiffres sur 30 jours
${JSON.stringify(mesures, null, 2)}

## Analyse la plus récente
${analyse?.content
  ? `Datée du ${analyse.createdAt.toLocaleDateString('fr-FR')} :\n\n${analyse.content}`
  : "Aucune analyse enregistrée pour cette créa — appuie-toi uniquement sur les chiffres ci-dessus, et dis-le."}

## Contexte du compte
${reglages ? JSON.stringify({
    entreprise: reglages.companyName, secteur: reglages.industry,
    proposition: reglages.uniqueValueProp, produit: reglages.productDescription,
    audience: reglages.targetAudience, persona: reglages.targetPersona,
    objections: reglages.audienceObjections, positionnement: reglages.marketPositioning,
  }, null, 2) : 'Non renseigné'}

${angle ? `## L'objection à traiter

Ce brief ne part pas d'un diagnostic de performance mais d'une objection
relevée dans les commentaires de ce compte. Elle revient ${angle.occurrences ?? 'plusieurs'} fois.

**« ${angle.objection} »**

${angle.ce_que_ca_revele ? `Ce qu'elle révèle : ${angle.ce_que_ca_revele}\n` : ''}
${angle.reponse_suggeree ? `Piste de réponse déjà identifiée : ${angle.reponse_suggeree}\n` : ''}
Mots exacts des prospects — sers-t'en, ce sont eux qui donnent le ton juste,
et une accroche qui reprend leur formulation est reconnue immédiatement :
${(angle.verbatims || []).map((v) => `- « ${v.texte} »${v.pub ? ` (${v.pub})` : ''}`).join('\n')}

La créa doit **désamorcer cette objection**, pas la contourner. Nomme-la si
c'est plus honnête que de l'éviter.

` : ''}## Ce qui est demandé
Ton : ${ton || 'à choisir selon les données'}
Niveau de conscience visé : ${CONSCIENCE[conscience as string] || 'à déduire des données'}
Format : ${format || 'à recommander'}`

  try {
    // Le modèle et l'effort viennent du module partagé : un brief est un
    // rapport, il mérite le même raisonnement que les analyses.
    const reponse = await anthropic.messages.create({
      model: MODEL_REPORT,
      /**
       * Les jetons de réflexion se comptent dans ce budget.
       *
       * À 8 000, un brief complet accompagné de deux prompts d'image — près de
       * quinze cents caractères chacun — était coupé en pleine phrase. Le bloc
       * JSON final devenait invalide, l'écran croyait le brief dépourvu de
       * feuille de tournage, et le prompt affiché s'arrêtait au milieu d'un mot.
       */
      max_tokens: 32000,
      system: BRIEF_CREA,
      messages: [{ role: 'user', content: contexte }],
      ...REPORT_REASONING,
    })

    const texte = reponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text).join('\n')

    if (!texte.trim()) return NextResponse.json({ error: 'Brief vide' }, { status: 502 })

    // Un brief coupé n'est pas à moitié utile : son bloc technique est
    // invalide, donc ni feuille de tournage ni prompts d'image. Mieux vaut le
    // refuser que l'enregistrer et le laisser décevoir plus tard.
    if (reponse.stop_reason === 'max_tokens') {
      return NextResponse.json(
        { error: 'Brief interrompu avant la fin — relancez la génération.' },
        { status: 502 },
      )
    }

    const brief = await prisma.brief.create({
      data: {
        adAccountId: dbAccountId, adId, adName: nom,
        title: angle ? `Brief — objection : ${String(angle.objection).slice(0, 70)}` : `Brief — ${nom}`,
        content: texte,
        reportId: analyse?.id ?? null,
        ton: ton || null, conscience: conscience || null, format: format || null,
      },
    })

    return NextResponse.json({ brief, sansAnalyse: !analyse })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message.slice(0, 300) : 'Erreur inconnue' },
      { status: 502 },
    )
  }
}

/** Change le statut, ou marque le téléchargement. */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, statut, telecharge } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (statut && !STATUTS.includes(statut)) {
    return NextResponse.json({ error: 'Statut inconnu' }, { status: 400 })
  }

  const brief = await prisma.brief.update({
    where: { id },
    data: {
      ...(statut ? { statut } : {}),
      ...(telecharge ? { downloadedAt: new Date() } : {}),
    },
    select: { id: true, statut: true, downloadedAt: true },
  })
  return NextResponse.json({ brief })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  await prisma.brief.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
