import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type Anthropic from '@anthropic-ai/sdk'
import { anthropic, MODEL_REPORT, REPORT_REASONING, avecReprise } from '@/lib/anthropic'
import { BRIEF_CREA } from '@/lib/prompts'

/**
 * Les briefs créa.
 *
 * Un brief naît d'une publicité et de son analyse, jamais du vide : les
 * chiffres sont ce qui lui permet de dire quelle faiblesse il corrige. La
 * route rassemble donc les trois — la publicité, ses métriques, la dernière
 * analyse enregistrée — avant d'écrire quoi que ce soit.
 */

/**
 * Le budget de temps suit celui des jetons.
 *
 * Il était resté à 120 s alors que le brief a grandi : méthode de direction
 * artistique, contraintes de fabrication, contexte du compte, et un bloc JSON
 * qui porte désormais le brief entier — jusqu'à 32 000 jetons, réflexion
 * comprise. La génération dépassait, Vercel coupait, et l'écran ne recevait
 * qu'un 504 sans explication.
 */
export const maxDuration = 300

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
    /**
     * Le point de départ du brief, quand il ne vient pas d'un diagnostic de
     * performance : une objection relevée dans les commentaires, ou un point
     * actionnable extrait d'un rapport d'agent. Les deux se rangent dans la
     * même forme — un constat, ses preuves, une piste — et se distinguent par
     * leur origine, qui change ce que le prompt en dit.
     */
    angle?: {
      objection: string
      occurrences?: number
      verbatims?: { texte: string; pub?: string; likes?: number }[]
      ce_que_ca_revele?: string
      reponse_suggeree?: string
      origine?: 'commentaires' | 'agent'
      /** Le rapport dont il est tiré, pour que le brief sache d'où il parle. */
      agent?: string
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

  /**
   * Ce que le compte sait déjà, et que le brief ignorait.
   *
   * Un brief écrit dans le vide reproposait des angles déjà usés et
   * inventait des promesses chiffrées que l'économie du compte ne soutient
   * pas. L'application connaît pourtant ses gagnantes et son point mort : les
   * lui donner coûte deux requêtes et change la nature du conseil.
   */
  const [parPub, entitesAds] = await Promise.all([
    prisma.metaDailyAd.groupBy({
      by: ['adId'],
      where: { adAccountId: dbAccountId, attribution: 'default', date: { gte: since, lte: until } },
      _sum: { spend: true, formLeads: true, pixelLeads: true, totalLeads: true, impressions: true, clicks: true },
    }),
    prisma.metaEntity.findMany({
      where: { adAccountId: dbAccountId, level: 'ad' },
      select: { metaId: true, name: true, creativeType: true },
    }),
  ])
  const nomDe = new Map(entitesAds.map((e) => [e.metaId, e]))

  /**
   * Les publicités qui marchent, mesurées et nommées.
   *
   * Le nom d'une créa porte son angle chez vous — « avis-client-2 »,
   * « statique_made-in-fr ». Les donner avec leur CPL évite de proposer une
   * variation de ce qui tourne déjà, ou de rejouer ce qui a échoué.
   */
  const gagnantes = parPub
    .map((r) => {
      const leads = n(r._sum.formLeads) || n(r._sum.pixelLeads) || n(r._sum.totalLeads)
      const depense = n(r._sum.spend)
      const e = nomDe.get(String(r.adId ?? ''))
      return {
        nom: e?.name ?? String(r.adId ?? ''),
        format: e?.creativeType ?? null,
        depense: Math.round(depense),
        prospects: leads,
        cpl: leads > 0 ? Math.round((depense / leads) * 100) / 100 : null,
      }
    })
    .filter((r) => r.prospects >= 3 && r.cpl !== null)
    .sort((a, b) => (a.cpl as number) - (b.cpl as number))
    .slice(0, 6)

  const perdantes = parPub
    .map((r) => {
      const leads = n(r._sum.formLeads) || n(r._sum.pixelLeads) || n(r._sum.totalLeads)
      const depense = n(r._sum.spend)
      const e = nomDe.get(String(r.adId ?? ''))
      return { nom: e?.name ?? '', depense: Math.round(depense), prospects: leads }
    })
    .filter((r) => r.nom && r.prospects === 0 && r.depense >= 50)
    .sort((a, b) => b.depense - a.depense)
    .slice(0, 4)

  const economie = {
    cplCible: reglages?.targetCpa ?? null,
    cplMaximum: reglages?.maxCpa ?? null,
    cplDerive: reglages?.cplDerive ?? null,
    panierMoyen: reglages?.averageOrderValue ?? null,
    margeProduitPct: reglages?.productMarginPct ?? null,
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

## Ce qui marche déjà sur ce compte
${gagnantes.length
  ? `Les publicités les plus efficaces des 30 derniers jours, du meilleur CPL au moins bon.
Leur nom porte souvent leur angle : ne repropose pas une variation de ce qui
tourne déjà, et ne rejoue pas un angle qui a échoué.

${JSON.stringify(gagnantes, null, 2)}`
  : 'Aucune publicité n’a produit assez de prospects sur 30 jours pour servir de référence.'}
${perdantes.length ? `\nCes publicités ont dépensé sans produire un seul prospect — leur angle est à écarter :\n${JSON.stringify(perdantes, null, 2)}` : ''}

## L'économie du compte
${JSON.stringify(economie, null, 2)}
Aucune promesse chiffrée ne doit contredire ces seuils, et aucun chiffre
absent d'ici ne doit apparaître dans la créa.

## Contexte du compte
${reglages ? JSON.stringify({
    entreprise: reglages.companyName, secteur: reglages.industry,
    proposition: reglages.uniqueValueProp, produit: reglages.productDescription,
    audience: reglages.targetAudience, persona: reglages.targetPersona,
    objections: reglages.audienceObjections, positionnement: reglages.marketPositioning,
  }, null, 2) : 'Non renseigné'}

${angle && angle.origine === 'agent' ? `## Le point à traiter

Ce brief ne part pas d'un diagnostic de performance que tu établis toi-même :
il répond à un point relevé par ${angle.agent ? `l'agent « ${angle.agent} »` : 'un agent d\'analyse'} sur ce compte.

**${angle.objection}**

${angle.ce_que_ca_revele ? `Le constat chiffré : ${angle.ce_que_ca_revele}\n` : ''}
${angle.reponse_suggeree ? `La piste déjà identifiée : ${angle.reponse_suggeree}\n` : ''}
Traite ce point précis. Les chiffres ci-dessus viennent de l'analyse : reprends-les
plutôt que d'en recalculer d'approchants, et ne t'écarte pas vers un autre sujet
même si les données du compte t'en suggèrent un.

` : angle ? `## L'objection à traiter

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
    /**
     * Le budget est un plafond, pas une dépense : on paie ce qui est produit.
     *
     * À 8 000, un brief complet accompagné de deux prompts d'image — près de
     * quinze cents caractères chacun — était coupé en pleine phrase. Le bloc
     * JSON final devenait invalide, l'écran croyait le brief dépourvu de
     * feuille de tournage, et le prompt affiché s'arrêtait au milieu d'un mot.
     * Les jetons de réflexion se comptent dans ce même budget, d'où la marge.
     *
     * Au-delà d'environ seize mille jetons, une requête d'un seul tenant peut
     * expirer avant la fin de la génération. Le flux évite ce délai ; la
     * réponse complète est récupérée à la fin, la route rend toujours du JSON.
     */
    // Rien n'est rendu au navigateur avant la fin : une surcharge du modèle
    // peut donc être reprise sans que l'écran en voie quoi que ce soit.
    const reponse = await avecReprise(
      () => anthropic.messages.stream({
        model: MODEL_REPORT,
        max_tokens: 32000,
        system: BRIEF_CREA,
        messages: [{ role: 'user', content: contexte }],
        ...REPORT_REASONING,
      }).finalMessage(),
      { echeance: Date.now() + 240_000 },
    )

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
        title: angle
          ? angle.origine === 'agent'
            ? `Brief — ${angle.agent || 'agent'} : ${String(angle.objection).slice(0, 70)}`
            : `Brief — objection : ${String(angle.objection).slice(0, 70)}`
          : `Brief — ${nom}`,
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
