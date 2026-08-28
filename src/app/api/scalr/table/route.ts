import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { computeMetrics, emptyTotals, previousWindow, variation, type Totals } from '@/lib/scalr/aggregate'
import { rowDecision, type Level } from '@/lib/scalr/decision'
import { economie } from '@/lib/scalr/economie'

/**
 * Le tableau, à n'importe quel grain.
 *
 * Une seule route pour campagnes, adsets et publicités : ce ne sont pas
 * quatre écrans, c'est un écran et un niveau de lecture. Le verdict, les
 * métriques et les variations se calculent pareil, seul le regroupement
 * change.
 *
 * Deux points qui ne s'improvisent pas :
 *
 * - **Toutes les entités du compte sont listées, y compris celles sans
 *   diffusion**, remplies à zéro. C'est ce qui fait apparaître les
 *   « Nouveau test », et surtout ce qui donne aux médianes leur population
 *   réelle — les restreindre aux lignes actives déplace le seuil de coupe et
 *   épargne des publicités qui brûlent du budget pour rien.
 * - **Les repères viennent du compte entier**, pas de la page affichée. Un
 *   filtre ne doit pas changer le verdict d'une ligne : on ne juge pas une
 *   créa différemment selon ce qu'on a choisi de regarder à côté.
 */

export const maxDuration = 60

const PERIODES: Record<string, number> = { '7d': 7, '14d': 14, '30d': 30, '60d': 60, '90d': 90, '180d': 180 }

const JOUR = 86_400_000
const estUneDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

/**
 * La fenêtre demandée : un raccourci, ou deux dates.
 *
 * Une plage libre est acceptée telle quelle. Elle prive la fréquence de sa
 * portée dédoublonnée — celle-ci n'est stockée que pour les fenêtres
 * standard — et la ligne le signale au lieu de présenter une valeur gonflée
 * par la somme des journées.
 */
function fenetreDemandee(p: URLSearchParams) {
  const auj = new Date(); auj.setUTCHours(0, 0, 0, 0)
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

  const depuis = p.get('since'), jusqua = p.get('until')
  if (estUneDate(depuis) && estUneDate(jusqua) && depuis <= jusqua) {
    return { since: d(depuis), until: d(jusqua), fenetre: null }
  }

  const preset = p.get('periode') || '30d'
  if (preset === 'today') return { since: auj, until: auj, fenetre: null }
  if (preset === 'yesterday') {
    const h = new Date(auj.getTime() - JOUR)
    return { since: h, until: h, fenetre: null }
  }
  const jours = PERIODES[preset] ?? 30
  const since = new Date(auj); since.setUTCDate(since.getUTCDate() - jours)
  return { since, until: auj, fenetre: `${jours}d` }
}

const SUM = {
  spend: true, impressions: true, reach: true, clicks: true, linkClicks: true,
  outboundClicks: true, landingPageViews: true, addToCart: true, initiateCheckout: true,
  purchases: true, revenue: true, formLeads: true, pixelLeads: true, totalLeads: true,
  directions: true, postEngagement: true, videoStarts: true, video3s: true,
  video15s: true, thruplays: true, video25: true, video50: true, video75: true, video95: true,
} as const

type Sum = Partial<Record<keyof typeof SUM, number | null>>

function toTotals(sum: Sum | undefined, days: number): Totals {
  const t = emptyTotals()
  for (const k of Object.keys(SUM) as (keyof typeof SUM)[]) {
    if (k === 'reach') { t.reachSum = Number(sum?.reach ?? 0); continue }
    ;(t as unknown as Record<string, number>)[k] = Number(sum?.[k] ?? 0)
  }
  t.days = days
  return t
}

const CLE: Record<Level, 'campaignId' | 'adsetId' | 'adId'> = {
  campaign: 'campaignId', adset: 'adsetId', ad: 'adId', crea: 'adId',
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const dbAccountId = p.get('dbAccountId')
  if (!dbAccountId) return NextResponse.json({ error: 'dbAccountId requis' }, { status: 400 })

  const level = (p.get('level') || 'campaign') as Level
  if (!['campaign', 'adset', 'ad', 'crea'].includes(level)) {
    return NextResponse.json({ error: 'level invalide' }, { status: 400 })
  }
  const attribution = p.get('attribution') || 'default'

  const { since, until, fenetre } = fenetreDemandee(p)
  const jours = Math.round((until.getTime() - since.getTime()) / JOUR)
  const prev = previousWindow(since, until)
  const base = { adAccountId: dbAccountId, attribution }
  const cle = CLE[level]
  const niveauEntite = level === 'crea' ? 'ad' : level

  const [entites, agg, aggPrev, joursRows, reglages, portees, ancetres, crmFenetre] = await Promise.all([
    prisma.metaEntity.findMany({
      where: { adAccountId: dbAccountId, level: niveauEntite },
      select: { metaId: true, name: true, objective: true, status: true, effectiveStatus: true, dailyBudget: true, createdTime: true, parentMetaId: true, thumbnailUrl: true, creativeType: true },
    }),
    prisma.metaDailyAd.groupBy({ by: [cle], where: { ...base, date: { gte: since, lte: until } }, _sum: SUM }),
    prisma.metaDailyAd.groupBy({ by: [cle], where: { ...base, date: { gte: prev.since, lte: prev.until } }, _sum: SUM }),
    prisma.metaDailyAd.groupBy({ by: ['date'], where: { ...base, date: { gte: since, lte: until } } }),
    prisma.brandSettings.findUnique({
      where: { adAccountId: dbAccountId },
      select: { targetCpa: true, maxCpa: true, cpaCibleRetargeting: true, toleranceWinner: true,
                 facteurRegardable: true, facteurConfirme: true, volumeMinWinner: true,
                 volumeMinEntite: true, hookMinWinner: true, freqFatigue: true,
                 linkCtrFaible: true, ctrFaible: true, joursNouveauTest: true,
                 partAcquisition: true, cplDerive: true,
                 averageOrderValue: true, productMarginPct: true },
    }),
    // Portée dédupliquée, demandée à Meta pour cette fenêtre. Une plage libre
    // n'en a pas : la fréquence sera marquée comme approchée plutôt que
    // présentée comme exacte.
    fenetre
      ? prisma.metaPeriodReach.findMany({
          where: { adAccountId: dbAccountId, level: niveauEntite, window: fenetre },
          select: { metaId: true, reach: true, impressions: true },
        })
      : Promise.resolve([] as { metaId: string; reach: number | null; impressions: number | null }[]),
    // La campagne et l'ad set de chaque ligne : sans eux, filtrer les
    // publicités par campagne serait impossible, une publicité ne connaissant
    // que son ad set.
    prisma.metaEntity.findMany({
      where: { adAccountId: dbAccountId, level: { in: ['campaign', 'adset'] } },
      select: { metaId: true, level: true, name: true, objective: true, parentMetaId: true },
    }),
    // Le tunnel sur la période : il donne le taux de signature d'où se déduit
    // la cible, quand le compte a choisi ce mode.
    prisma.ghlDaily.aggregate({
      where: { adAccountId: dbAccountId, date: { gte: since, lte: until } },
      _sum: { leads: true, signes: true },
    }),
  ])

  const parIdPortee = new Map(portees.map((r) => [r.metaId, r]))

  const nbJours = joursRows.length
  const parId = new Map(agg.map((a) => [String((a as Record<string, unknown>)[cle] ?? ''), a._sum]))
  const parIdPrev = new Map(aggPrev.map((a) => [String((a as Record<string, unknown>)[cle] ?? ''), a._sum]))

  // L'objectif du compte sert de repli : une publicité ne porte pas le sien.
  const objetCompte = (await prisma.metaEntity.findFirst({
    where: { adAccountId: dbAccountId, level: 'campaign', objective: { not: null } },
    select: { objective: true },
  }))?.objective || null

  const campagnes = ancetres.filter((a) => a.level === 'campaign')
  const adsets = ancetres.filter((a) => a.level === 'adset')
  const campParId = new Map(campagnes.map((c) => [c.metaId, c]))
  const adsetParId = new Map(adsets.map((a) => [a.metaId, a]))

  /** L'objectif se lit sur la campagne, quel que soit le grain de la ligne. */
  function filiationObjectif(parent: string): string | null {
    const direct = campParId.get(parent)
    if (direct) return direct.objective ?? null
    const a = adsetParId.get(parent)
    return (a?.parentMetaId ? campParId.get(a.parentMetaId)?.objective : null) ?? null
  }

  /** Remonte la chaîne publicité → ad set → campagne, à n'importe quel grain. */
  function filiation(e: { metaId: string; name: string; parentMetaId: string | null }) {
    if (niveauEntite === 'campaign') {
      return { campaignId: e.metaId, campaignName: e.name, adsetId: null, adsetName: null }
    }
    if (niveauEntite === 'adset') {
      const c = e.parentMetaId ? campParId.get(e.parentMetaId) : null
      return { campaignId: c?.metaId ?? null, campaignName: c?.name ?? null, adsetId: e.metaId, adsetName: e.name }
    }
    const a = e.parentMetaId ? adsetParId.get(e.parentMetaId) : null
    const c = a?.parentMetaId ? campParId.get(a.parentMetaId) : null
    return {
      campaignId: c?.metaId ?? null, campaignName: c?.name ?? null,
      adsetId: a?.metaId ?? null, adsetName: a?.name ?? null,
    }
  }

  const lignes = entites.map((e) => {
    // L'objectif décide de ce qui compte comme résultat. Le prendre sur la
    // campagne de la ligne plutôt que sur la première campagne du compte
    // change ce que lit un compte qui mélange les objectifs — une campagne
    // de notoriété n'a pas le même résultat principal qu'une campagne de
    // génération de prospects.
    const objectif = e.objective ?? (e.parentMetaId ? filiationObjectif(e.parentMetaId) : null) ?? objetCompte
    const m = computeMetrics(toTotals(parId.get(e.metaId), nbJours), objectif)
    const mPrev = computeMetrics(toTotals(parIdPrev.get(e.metaId), nbJours), objectif)

    // La portée de période remplace la somme des journées, et rend la
    // fréquence exploitable — sans elle, la règle de fatigue reste lettre morte.
    const portee = parIdPortee.get(e.metaId)
    const reach = portee?.reach ?? null
    const frequency = reach && reach > 0 ? Math.round((m.impressions / reach) * 100) / 100 : null

    return {
      id: e.metaId,
      name: e.name,
      parentId: e.parentMetaId,
      ...filiation(e),
      objective: objectif,
      status: e.effectiveStatus || e.status,
      dailyBudget: e.dailyBudget,
      createdTime: e.createdTime,
      thumbnailUrl: e.thumbnailUrl,
      creativeType: e.creativeType,
      ...m,
      reachSum: reach ?? m.reachSum,
      reachIsApproximate: reach === null,
      frequency,
      precedent: mPrev,
    }
  })

  // Repères calculés sur le compte entier, jamais sur la page filtrée.
  const adsAgg = level === 'ad' || level === 'crea'
    ? agg
    : await prisma.metaDailyAd.groupBy({ by: ['adId'], where: { ...base, date: { gte: since, lte: until } }, _sum: SUM })
  const adEntites = niveauEntite === 'ad'
    ? entites
    : await prisma.metaEntity.findMany({ where: { adAccountId: dbAccountId, level: 'ad' }, select: { metaId: true } })
  const parIdAds = new Map(adsAgg.map((a) => [String((a as Record<string, unknown>).adId ?? ''), a._sum]))
  const adCpls = adEntites.map((e) => computeMetrics(toTotals(parIdAds.get(e.metaId), nbJours), objetCompte).cpl || 0)

  /** Les seuils réglés pour ce compte ; absents, ceux du moteur s'appliquent. */
  const seuils = {
    toleranceWinner: reglages?.toleranceWinner, facteurRegardable: reglages?.facteurRegardable,
    facteurConfirme: reglages?.facteurConfirme, volumeMinWinner: reglages?.volumeMinWinner,
    volumeMinEntite: reglages?.volumeMinEntite, hookMinWinner: reglages?.hookMinWinner,
    freqFatigue: reglages?.freqFatigue, linkCtrFaible: reglages?.linkCtrFaible,
    ctrFaible: reglages?.ctrFaible, joursNouveauTest: reglages?.joursNouveauTest,
  }

  /**
   * La cible, saisie ou déduite.
   *
   * Déduite, elle vient de la valeur d'un client, de la marge et du taux de
   * signature réel — trois chiffres qui se vérifient, là où un CPL cible tapé
   * à la main ne se vérifie jamais. Le basculement est explicite : sans lui,
   * un compte verrait ses verdicts changer sans qu'on ait rien demandé.
   */
  /** Le comptage Meta de la même fenêtre : c'est lui qui donne au taux de
   *  signature le dénominateur du CPL qu'il servira à juger. */
  const depenseFenetre = lignes.reduce((t, l) => t + l.spend, 0)
  const leadsMetaFenetre = lignes.reduce((t, l) => t + l.leads, 0)

  const eco = reglages?.cplDerive
    ? economie({
        valeurClient: reglages.averageOrderValue ?? null,
        margePct: reglages.productMarginPct ?? null,
        partAcquisitionPct: reglages.partAcquisition ?? null,
        leads: Number(crmFenetre._sum.leads ?? 0),
        signes: Number(crmFenetre._sum.signes ?? 0),
        // Le dénominateur du taux doit être celui du CPL qu'il sert à juger.
        leadsMeta: leadsMetaFenetre,
        depense: depenseFenetre,
      })
    : null

  const goals = {
    // Le repli sur la saisie compte : une cible déduite indisponible ne doit
    // pas laisser le compte sans repère.
    targetCpl: eco?.cplCible ?? reglages?.targetCpa ?? null,
    maxCpl: eco?.cplPointMort ?? reglages?.maxCpa ?? null,
  }
  const ctx = { goals, seuils, levelSpends: lignes.map((l) => l.spend), adCpls }

  const avecDecision = lignes.map((l) => {
    const d = rowDecision(
      { spend: l.spend, leads: l.leads, resultValue: l.resultValue, cpl: l.cpl,
        costPerResult: l.costPerResult, ctr: l.ctr, linkCtr: l.linkCtr, frequency: l.frequency, hookRate: l.hookRate,
        // Sans eux, une ligne en pause depuis des mois se lit « nouveau test ».
        status: l.status, createdTime: l.createdTime },
      level, ctx,
    )
    const varie = (cle: keyof typeof l.precedent) =>
      variation(l[cle as keyof typeof l] as number | null, l.precedent[cle] as number | null)
    return {
      ...l,
      decision: d,
      variations: {
        spend: varie('spend'), impressions: varie('impressions'), clicks: varie('clicks'),
        linkClicks: varie('linkClicks'), outboundClicks: varie('outboundClicks'),
        resultValue: varie('resultValue'), leads: varie('leads'), convRate: varie('convRate'),
        costPerResult: varie('costPerResult'), cpl: varie('cpl'), cpm: varie('cpm'), cpc: varie('cpc'),
        ctr: varie('ctr'), linkCtr: varie('linkCtr'), frequency: varie('frequency'),
        hookRate: varie('hookRate'), holdRate: varie('holdRate'), thruplays: varie('thruplays'),
        reachSum: varie('reachSum'),
      },
      precedent: undefined,
    }
  })

  return NextResponse.json({
    level,
    periode: { since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10), jours },
    precedente: { since: prev.since.toISOString().slice(0, 10), until: prev.until.toISOString().slice(0, 10) },
    attribution,
    goals,
    // De quoi expliquer d'où vient la cible, quand elle est déduite.
    economie: eco,
    lignes: avecDecision.sort((a, b) => b.spend - a.spend),
    // De quoi remplir les listes de la barre d'outils. Les ad sets portent
    // leur campagne : la liste se restreint à la campagne choisie plutôt que
    // d'étaler les ad sets de tout le compte.
    options: {
      campagnes: campagnes
        .map((c) => ({ id: c.metaId, nom: c.name }))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
      adsets: adsets
        .map((a) => ({ id: a.metaId, nom: a.name, campagneId: a.parentMetaId }))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
      objectifs: [...new Set(campagnes.map((c) => c.objective).filter(Boolean))].sort() as string[],
      formats: [...new Set(avecDecision.map((l) => l.creativeType).filter(Boolean))].sort() as string[],
    },
  })
}
