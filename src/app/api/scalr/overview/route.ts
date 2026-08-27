import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { computeMetrics, previousWindow, variation, emptyTotals, type Totals } from '@/lib/scalr/aggregate'

/**
 * Vue d'ensemble du cockpit, servie depuis Postgres.
 *
 * Les totaux sont demandés à la base plutôt que calculés en mémoire : sur
 * plusieurs comptes et trois mois, charger les lignes pour les additionner
 * côté serveur reviendrait à refaire lentement ce que Postgres fait bien.
 */

export const maxDuration = 60

const PERIODES: Record<string, number> = {
  '7d': 7, '14d': 14, '30d': 30, '90d': 90, '180d': 180,
}

const SUM_FIELDS = {
  spend: true, impressions: true, reach: true, clicks: true, linkClicks: true,
  outboundClicks: true, landingPageViews: true, addToCart: true, initiateCheckout: true,
  purchases: true, revenue: true, formLeads: true, pixelLeads: true, totalLeads: true,
  directions: true, postEngagement: true, videoStarts: true, video3s: true,
  video15s: true, thruplays: true, video25: true, video50: true, video75: true, video95: true,
} as const

type SumResult = Partial<Record<keyof typeof SUM_FIELDS, number | null>>

function toTotals(sum: SumResult, days: number): Totals {
  const t = emptyTotals()
  for (const k of Object.keys(SUM_FIELDS) as (keyof typeof SUM_FIELDS)[]) {
    if (k === 'reach') { t.reachSum = Number(sum.reach ?? 0); continue }
    ;(t as unknown as Record<string, number>)[k] = Number(sum[k] ?? 0)
  }
  t.days = days
  return t
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const dbAccountId = p.get('dbAccountId')
  if (!dbAccountId) return NextResponse.json({ error: 'dbAccountId requis' }, { status: 400 })

  const jours = PERIODES[p.get('periode') || '30d'] ?? 30
  const until = new Date(); until.setUTCHours(0, 0, 0, 0)
  const since = new Date(until); since.setUTCDate(since.getUTCDate() - jours)
  const prev = previousWindow(since, until)

  const base = { adAccountId: dbAccountId, attribution: 'default' }

  const [sumCur, sumPrev, parJour, parCampagne, campagnes, etat] = await Promise.all([
    prisma.metaDailyAd.aggregate({ where: { ...base, date: { gte: since, lte: until } }, _sum: SUM_FIELDS }),
    prisma.metaDailyAd.aggregate({ where: { ...base, date: { gte: prev.since, lte: prev.until } }, _sum: SUM_FIELDS }),
    prisma.metaDailyAd.groupBy({
      by: ['date'],
      where: { ...base, date: { gte: since, lte: until } },
      _sum: { spend: true, impressions: true, clicks: true, formLeads: true, pixelLeads: true, totalLeads: true, purchases: true, revenue: true },
      orderBy: { date: 'asc' },
    }),
    prisma.metaDailyAd.groupBy({
      by: ['campaignId'],
      where: { ...base, date: { gte: since, lte: until } },
      _sum: SUM_FIELDS,
      _count: { _all: true },
    }),
    prisma.metaEntity.findMany({
      where: { adAccountId: dbAccountId, level: 'campaign' },
      select: { metaId: true, name: true, objective: true, status: true, effectiveStatus: true, dailyBudget: true },
    }),
    prisma.metaSyncState.findUnique({ where: { adAccountId: dbAccountId }, select: { lastSyncedAt: true, lastError: true } }),
  ])

  // L'objectif dominant du compte sert de repli quand une ligne n'en porte pas.
  const objectifCompte = campagnes.find((c) => c.objective)?.objective || null
  const parId = new Map(campagnes.map((c) => [c.metaId, c]))

  const joursCur = parJour.length
  const courant = computeMetrics(toTotals(sumCur._sum, joursCur), objectifCompte)
  const precedent = computeMetrics(toTotals(sumPrev._sum, joursCur), objectifCompte)

  const evolution = (cle: keyof typeof courant) =>
    variation(courant[cle] as number | null, precedent[cle] as number | null)

  const serie = parJour.map((d) => {
    const leads = (d._sum.formLeads || 0) || (d._sum.pixelLeads || 0) || (d._sum.totalLeads || 0)
    return {
      date: d.date.toISOString().slice(0, 10),
      spend: Math.round((d._sum.spend || 0) * 100) / 100,
      impressions: d._sum.impressions || 0,
      clicks: d._sum.clicks || 0,
      leads,
      purchases: d._sum.purchases || 0,
      revenue: Math.round((d._sum.revenue || 0) * 100) / 100,
      cpl: leads > 0 ? Math.round(((d._sum.spend || 0) / leads) * 100) / 100 : null,
    }
  })

  const campagnesVue = parCampagne
    .map((c) => {
      const meta = c.campaignId ? parId.get(c.campaignId) : undefined
      const m = computeMetrics(toTotals(c._sum, joursCur), meta?.objective || objectifCompte)
      return {
        campaignId: c.campaignId,
        name: meta?.name || '(campagne inconnue)',
        objective: meta?.objective || null,
        status: meta?.effectiveStatus || meta?.status || null,
        dailyBudget: meta?.dailyBudget ?? null,
        ...m,
      }
    })
    .sort((a, b) => b.spend - a.spend)

  return NextResponse.json({
    periode: { since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10), jours },
    precedente: { since: prev.since.toISOString().slice(0, 10), until: prev.until.toISOString().slice(0, 10) },
    fraicheur: etat?.lastSyncedAt ?? null,
    erreurSync: etat?.lastError ?? null,
    courant,
    precedent,
    evolutions: {
      spend: evolution('spend'),
      resultValue: evolution('resultValue'),
      costPerResult: evolution('costPerResult'),
      cpl: evolution('cpl'),
      cpa: evolution('cpa'),
      roas: evolution('roas'),
      ctr: evolution('ctr'),
      linkCtr: evolution('linkCtr'),
      cpm: evolution('cpm'),
      cpc: evolution('cpc'),
      cpcLink: evolution('cpcLink'),
      revenue: evolution('revenue'),
      leads: evolution('leads'),
      purchases: evolution('purchases'),
      impressions: evolution('impressions'),
      clicks: evolution('clicks'),
      hookRate: evolution('hookRate'),
      holdRate: evolution('holdRate'),
    },
    serie,
    campagnes: campagnesVue,
  })
}
