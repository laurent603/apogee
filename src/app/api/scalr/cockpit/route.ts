import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { computeMetrics, emptyTotals, previousWindow, variation, type Totals } from '@/lib/scalr/aggregate'
import { rowDecision } from '@/lib/scalr/decision'
import { sante, signaux, type Pub } from '@/lib/scalr/cockpit'

/**
 * Le cockpit : l'état du compte, et ce qu'il y a à traiter.
 *
 * Une seule route pour toute la page. Le score, les panneaux et les signaux
 * lisent les mêmes totaux et les mêmes verdicts — un cockpit qui se
 * contredirait d'un bloc à l'autre ne servirait à rien.
 *
 * Les verdicts viennent de `rowDecision`, celui du tableau de pilotage. C'est
 * ce qui garantit que « 3 publicités à couper » ici ouvre bien trois lignes
 * là-bas.
 */

export const maxDuration = 60

const PERIODES: Record<string, number> = { '7d': 7, '14d': 14, '30d': 30, '60d': 60, '90d': 90 }

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

  const [sumCur, sumPrev, parJour, parPub, parPubPrec, entites, reglages, portees, etat, ghl] =
    await Promise.all([
      prisma.metaDailyAd.aggregate({ where: { ...base, date: { gte: since, lte: until } }, _sum: SUM }),
      prisma.metaDailyAd.aggregate({ where: { ...base, date: { gte: prev.since, lte: prev.until } }, _sum: SUM }),
      prisma.metaDailyAd.groupBy({
        by: ['date'],
        where: { ...base, date: { gte: since, lte: until } },
        _sum: { spend: true, impressions: true, clicks: true, formLeads: true, pixelLeads: true, totalLeads: true, purchases: true, revenue: true },
        orderBy: { date: 'asc' },
      }),
      prisma.metaDailyAd.groupBy({ by: ['adId'], where: { ...base, date: { gte: since, lte: until } }, _sum: SUM }),
      prisma.metaDailyAd.groupBy({ by: ['adId'], where: { ...base, date: { gte: prev.since, lte: prev.until } }, _sum: SUM }),
      prisma.metaEntity.findMany({
        where: { adAccountId: dbAccountId, level: { in: ['ad', 'campaign'] } },
        select: { metaId: true, level: true, name: true, objective: true },
      }),
      prisma.brandSettings.findUnique({
        where: { adAccountId: dbAccountId },
        select: { targetCpa: true, maxCpa: true },
      }),
      prisma.metaPeriodReach.findMany({
        where: { adAccountId: dbAccountId, window: `${jours}d`, level: { in: ['account', 'ad'] } },
        select: { metaId: true, level: true, reach: true },
      }),
      prisma.metaSyncState.findUnique({ where: { adAccountId: dbAccountId }, select: { lastSyncedAt: true, lastError: true } }),
      prisma.ghlConnection.findUnique({
        where: { adAccountId: dbAccountId },
        select: { token: true, totalOpps: true, attributed: true, wonCount: true, wonValue: true, syncedAt: true },
      }),
    ])

  const objectif = entites.find((e) => e.level === 'campaign' && e.objective)?.objective || null
  const nbJours = parJour.length

  const courant = computeMetrics(toTotals(sumCur._sum, nbJours), objectif)
  const precedent = computeMetrics(toTotals(sumPrev._sum, nbJours), objectif)

  /**
   * La fréquence du compte demande une portée dédoublonnée à l'échelle du
   * compte. Additionner celle des publicités compterait plusieurs fois la même
   * personne et gonflerait la fréquence — c'est précisément l'erreur qui
   * rendait la règle de fatigue inexploitable.
   */
  const porteeCompte = portees.find((r) => r.level === 'account')?.reach ?? null
  const frequency = porteeCompte && porteeCompte > 0
    ? Math.round((courant.impressions / porteeCompte) * 100) / 100
    : null

  const porteeParPub = new Map(portees.filter((r) => r.level === 'ad').map((r) => [r.metaId, r.reach]))
  const pubs = entites.filter((e) => e.level === 'ad')
  const parId = new Map(parPub.map((a) => [String(a.adId ?? ''), a._sum]))
  const parIdPrec = new Map(parPubPrec.map((a) => [String(a.adId ?? ''), a._sum]))

  const lignes = pubs.map((e) => {
    const m = computeMetrics(toTotals(parId.get(e.metaId), nbJours), objectif)
    const portee = porteeParPub.get(e.metaId)
    return {
      id: e.metaId,
      name: e.name,
      ...m,
      frequency: portee && portee > 0 ? Math.round((m.impressions / portee) * 100) / 100 : null,
    }
  })

  // Les repères se calculent sur le compte entier — jamais sur un sous-ensemble.
  const goals = { targetCpl: reglages?.targetCpa ?? null, maxCpl: reglages?.maxCpa ?? null }
  const ctx = { goals, levelSpends: lignes.map((l) => l.spend), adCpls: lignes.map((l) => l.cpl || 0) }

  const avecDecision: Pub[] = lignes.map((l) => ({
    id: l.id,
    name: l.name,
    spend: l.spend,
    leads: l.leads,
    resultValue: l.resultValue,
    cpl: l.cpl,
    costPerResult: l.costPerResult,
    ctr: l.ctr,
    frequency: l.frequency,
    decision: rowDecision(
      { spend: l.spend, leads: l.leads, resultValue: l.resultValue, cpl: l.cpl,
        costPerResult: l.costPerResult, ctr: l.ctr, linkCtr: l.linkCtr, frequency: l.frequency },
      'ad', ctx,
    ),
  }))

  const totaux = { ...courant, frequency }
  const totauxPrec = { ...precedent, frequency: null }

  const crm = ghl?.token
    ? {
        connecte: true,
        opportunites: ghl.totalOpps,
        attribuees: ghl.attributed,
        signees: ghl.wonCount,
        ca: ghl.wonValue,
        synchro: ghl.syncedAt,
      }
    : null

  const evo = (cle: keyof typeof courant) =>
    variation(courant[cle] as number | null, precedent[cle] as number | null)

  const compte = (kind: string) => avecDecision.filter((x) => x.decision.kind === kind).length
  const compteLabel = (label: string) => avecDecision.filter((x) => x.decision.label === label).length

  return NextResponse.json({
    periode: { since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10), jours },
    precedente: { since: prev.since.toISOString().slice(0, 10), until: prev.until.toISOString().slice(0, 10) },
    fraicheur: etat?.lastSyncedAt ?? null,
    erreurSync: etat?.lastError ?? null,
    goals,
    courant: totaux,
    precedent: totauxPrec,
    // La portée du compte n'est stockée que depuis la synchro qui l'a ajoutée :
    // tant qu'elle manque, la fréquence est tue plutôt qu'approchée.
    frequenceIndisponible: porteeCompte === null,
    evolutions: {
      spend: evo('spend'), leads: evo('leads'), resultValue: evo('resultValue'),
      costPerResult: evo('costPerResult'), cpl: evo('cpl'), cpm: evo('cpm'),
      ctr: evo('ctr'), linkCtr: evo('linkCtr'), convRate: evo('convRate'),
      revenue: evo('revenue'), roas: evo('roas'), impressions: evo('impressions'),
    },
    sante: sante(totaux, sumPrev._sum.spend ? totauxPrec : null, avecDecision, goals),
    signaux: signaux(avecDecision, totaux, crm),
    verdicts: {
      cut: compte('cut'), scale: compte('scale'), watch: compte('watch'),
      iterate: compte('iterate'), objective: compte('objective'), test: compte('test'),
      decliner: compteLabel('À décliner'), fatigue: compteLabel('Fatigue'),
    },
    crm,
    serie: parJour.map((d) => {
      const leads = (d._sum.formLeads || 0) || (d._sum.pixelLeads || 0) || (d._sum.totalLeads || 0)
      return {
        date: d.date.toISOString().slice(0, 10),
        spend: Math.round((d._sum.spend || 0) * 100) / 100,
        leads,
        cpl: leads > 0 ? Math.round(((d._sum.spend || 0) / leads) * 100) / 100 : null,
      }
    }),
    nbPubs: avecDecision.length,
    prevPubs: parIdPrec.size,
  })
}
