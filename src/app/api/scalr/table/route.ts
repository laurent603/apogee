import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { computeMetrics, emptyTotals, previousWindow, variation, type Totals } from '@/lib/scalr/aggregate'
import { rowDecision, type Level } from '@/lib/scalr/decision'

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

const PERIODES: Record<string, number> = { '7d': 7, '14d': 14, '30d': 30, '90d': 90, '180d': 180 }

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
  const jours = PERIODES[p.get('periode') || '30d'] ?? 30
  const attribution = p.get('attribution') || 'default'

  const until = new Date(); until.setUTCHours(0, 0, 0, 0)
  const since = new Date(until); since.setUTCDate(since.getUTCDate() - jours)
  const prev = previousWindow(since, until)
  const base = { adAccountId: dbAccountId, attribution }
  const cle = CLE[level]
  const niveauEntite = level === 'crea' ? 'ad' : level

  const [entites, agg, aggPrev, joursRows, reglages] = await Promise.all([
    prisma.metaEntity.findMany({
      where: { adAccountId: dbAccountId, level: niveauEntite },
      select: { metaId: true, name: true, objective: true, status: true, effectiveStatus: true, dailyBudget: true, createdTime: true, parentMetaId: true },
    }),
    prisma.metaDailyAd.groupBy({ by: [cle], where: { ...base, date: { gte: since, lte: until } }, _sum: SUM }),
    prisma.metaDailyAd.groupBy({ by: [cle], where: { ...base, date: { gte: prev.since, lte: prev.until } }, _sum: SUM }),
    prisma.metaDailyAd.groupBy({ by: ['date'], where: { ...base, date: { gte: since, lte: until } } }),
    prisma.brandSettings.findUnique({
      where: { adAccountId: dbAccountId },
      select: { targetCpa: true, maxCpa: true },
    }),
  ])

  const nbJours = joursRows.length
  const parId = new Map(agg.map((a) => [String((a as Record<string, unknown>)[cle] ?? ''), a._sum]))
  const parIdPrev = new Map(aggPrev.map((a) => [String((a as Record<string, unknown>)[cle] ?? ''), a._sum]))

  // L'objectif du compte sert de repli : une publicité ne porte pas le sien.
  const objetCompte = (await prisma.metaEntity.findFirst({
    where: { adAccountId: dbAccountId, level: 'campaign', objective: { not: null } },
    select: { objective: true },
  }))?.objective || null

  const lignes = entites.map((e) => {
    const m = computeMetrics(toTotals(parId.get(e.metaId), nbJours), e.objective || objetCompte)
    const mPrev = computeMetrics(toTotals(parIdPrev.get(e.metaId), nbJours), e.objective || objetCompte)
    return {
      id: e.metaId,
      name: e.name,
      parentId: e.parentMetaId,
      objective: e.objective,
      status: e.effectiveStatus || e.status,
      dailyBudget: e.dailyBudget,
      createdTime: e.createdTime,
      ...m,
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

  const goals = {
    targetCpl: reglages?.targetCpa ?? null,
    maxCpl: reglages?.maxCpa ?? null,
  }
  const ctx = { goals, levelSpends: lignes.map((l) => l.spend), adCpls }

  const avecDecision = lignes.map((l) => {
    const d = rowDecision(
      { spend: l.spend, leads: l.leads, resultValue: l.resultValue, cpl: l.cpl,
        costPerResult: l.costPerResult, ctr: l.ctr, linkCtr: l.linkCtr, frequency: l.frequency },
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
    lignes: avecDecision.sort((a, b) => b.spend - a.spend),
  })
}
