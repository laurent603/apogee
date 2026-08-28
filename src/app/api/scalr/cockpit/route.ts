import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { computeMetrics, emptyTotals, previousWindow, variation, type Totals } from '@/lib/scalr/aggregate'
import { rowDecision } from '@/lib/scalr/decision'
import {
  sante, signaux, saturation, verdictSaturation, verdictLeadgen, verdictMedia, verdictCreatif,
  ecart, type Pub,
} from '@/lib/scalr/cockpit'
import { economie, verdictSignature } from '@/lib/scalr/economie'

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

  const [sumCur, sumPrev, parJour, parPub, parPubPrec, entites, parCampagne, reglages, portees, etat, ghl, crmCur, crmPrec] =
    await Promise.all([
      prisma.metaDailyAd.aggregate({ where: { ...base, date: { gte: since, lte: until } }, _sum: SUM }),
      prisma.metaDailyAd.aggregate({ where: { ...base, date: { gte: prev.since, lte: prev.until } }, _sum: SUM }),
      prisma.metaDailyAd.groupBy({
        by: ['date'],
        where: { ...base, date: { gte: since, lte: until } },
        _sum: { spend: true, impressions: true, reach: true, clicks: true, linkClicks: true, formLeads: true, pixelLeads: true, totalLeads: true, purchases: true, revenue: true },
        orderBy: { date: 'asc' },
      }),
      prisma.metaDailyAd.groupBy({ by: ['adId'], where: { ...base, date: { gte: since, lte: until } }, _sum: SUM }),
      prisma.metaDailyAd.groupBy({ by: ['adId'], where: { ...base, date: { gte: prev.since, lte: prev.until } }, _sum: SUM }),
      // Les ad sets sont ici pour une seule raison : relier une publicité à sa
      // campagne, donc à son objectif. Une publicité ne connaît que son ad set.
      prisma.metaEntity.findMany({
        where: { adAccountId: dbAccountId, level: { in: ['ad', 'adset', 'campaign'] } },
        select: { metaId: true, level: true, name: true, objective: true, parentMetaId: true,
                  status: true, effectiveStatus: true, createdTime: true },
      }),
      prisma.metaDailyAd.groupBy({ by: ['campaignId'], where: { ...base, date: { gte: since, lte: until } }, _sum: SUM }),
      prisma.brandSettings.findUnique({
        where: { adAccountId: dbAccountId },
        select: { targetCpa: true, maxCpa: true, cpaCibleRetargeting: true, toleranceWinner: true,
                 facteurRegardable: true, facteurConfirme: true, volumeMinWinner: true,
                 volumeMinEntite: true, hookMinWinner: true, freqFatigue: true,
                 linkCtrFaible: true, ctrFaible: true, joursNouveauTest: true,
                 partAcquisition: true, cplDerive: true,
                 averageOrderValue: true, productMarginPct: true },
      }),
      prisma.metaPeriodReach.findMany({
        where: { adAccountId: dbAccountId, window: `${jours}d`, level: { in: ['account', 'ad', 'campaign'] } },
        select: { metaId: true, level: true, reach: true },
      }),
      prisma.metaSyncState.findUnique({ where: { adAccountId: dbAccountId }, select: { lastSyncedAt: true, lastError: true } }),
      prisma.ghlConnection.findUnique({
        where: { adAccountId: dbAccountId },
        select: { token: true, totalOpps: true, attributed: true, wonCount: true, wonValue: true, syncedAt: true },
      }),
      // Le tunnel CRM se lit sur la période demandée, comme les insights Meta,
      // et sur la précédente pour que chaque chiffre porte son évolution.
      prisma.ghlDaily.aggregate({
        where: { adAccountId: dbAccountId, date: { gte: since, lte: until } },
        _sum: { leads: true, rdv: true, devis: true, signes: true, ca: true },
      }),
      prisma.ghlDaily.aggregate({
        where: { adAccountId: dbAccountId, date: { gte: prev.since, lte: prev.until } },
        _sum: { leads: true, rdv: true, devis: true, signes: true, ca: true },
      }),
    ])

  const objectif = entites.find((e) => e.level === 'campaign' && e.objective)?.objective || null
  const nbJours = parJour.length

  /**
   * L'objectif de chaque publicité, lu sur sa campagne.
   *
   * Le tableau le fait déjà ; le dashboard appliquait le premier objectif du
   * compte à toutes les publicités. Sur un compte qui mélange les objectifs,
   * le résultat principal n'était donc pas le même des deux côtés, et le même
   * moteur rendait deux verdicts différents : « 2 publicités à couper » d'un
   * côté, une seule de l'autre.
   */
  const campParId = new Map(entites.filter((e) => e.level === 'campaign').map((e) => [e.metaId, e]))
  const adsetParId = new Map(entites.filter((e) => e.level === 'adset').map((e) => [e.metaId, e]))
  const objectifDe = (parent: string | null): string | null => {
    if (!parent) return null
    const direct = campParId.get(parent)
    if (direct) return direct.objective ?? null
    const a = adsetParId.get(parent)
    return (a?.parentMetaId ? campParId.get(a.parentMetaId)?.objective : null) ?? null
  }

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
    const objectifPub = e.objective ?? objectifDe(e.parentMetaId) ?? objectif
    const m = computeMetrics(toTotals(parId.get(e.metaId), nbJours), objectifPub)
    const portee = porteeParPub.get(e.metaId)
    return {
      id: e.metaId,
      name: e.name,
      status: e.effectiveStatus || e.status,
      createdTime: e.createdTime,
      ...m,
      frequency: portee && portee > 0 ? Math.round((m.impressions / portee) * 100) / 100 : null,
    }
  })

  // Les repères se calculent sur le compte entier — jamais sur un sous-ensemble.
  /** Les seuils réglés pour ce compte ; absents, ceux du moteur s'appliquent. */
  const seuils = {
    toleranceWinner: reglages?.toleranceWinner, facteurRegardable: reglages?.facteurRegardable,
    facteurConfirme: reglages?.facteurConfirme, volumeMinWinner: reglages?.volumeMinWinner,
    volumeMinEntite: reglages?.volumeMinEntite, hookMinWinner: reglages?.hookMinWinner,
    freqFatigue: reglages?.freqFatigue, linkCtrFaible: reglages?.linkCtrFaible,
    ctrFaible: reglages?.ctrFaible, joursNouveauTest: reglages?.joursNouveauTest,
  }
  /** Les totaux Meta de la fenêtre, pour aligner le dénominateur du taux. */
  const depenseFenetre = courant.spend
  const leadsMetaFenetre = courant.leads

  const eco = reglages?.cplDerive
    ? economie({
        valeurClient: reglages.averageOrderValue ?? null,
        margePct: reglages.productMarginPct ?? null,
        partAcquisitionPct: reglages.partAcquisition ?? null,
        leads: Number(crmCur._sum.leads ?? 0),
        signes: Number(crmCur._sum.signes ?? 0),
        leadsMeta: leadsMetaFenetre,
        depense: depenseFenetre,
      })
    : null

  const goals = {
    targetCpl: eco?.cplCible ?? reglages?.targetCpa ?? null,
    maxCpl: eco?.cplPointMort ?? reglages?.maxCpa ?? null,
  }
  const ctx = { goals, seuils, levelSpends: lignes.map((l) => l.spend), adCpls: lignes.map((l) => l.cpl || 0) }

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
        costPerResult: l.costPerResult, ctr: l.ctr, linkCtr: l.linkCtr, frequency: l.frequency, hookRate: l.hookRate,
        // Sans eux, une ligne en pause depuis des mois se lit « nouveau test ».
        status: l.status, createdTime: l.createdTime },
      'ad', ctx,
    ),
  }))

  const totaux = { ...courant, frequency }
  const totauxPrec = { ...precedent, frequency: null }

  /**
   * Le tunnel CRM sur la période, et son coût côté média.
   *
   * Un coût par rendez-vous ou par signature rapporte la dépense Meta à ce que
   * le CRM a réellement produit — c'est la seule mesure qui relie le budget au
   * chiffre d'affaires, et elle vaut mieux qu'un CPL pour décider d'un budget.
   */
  const nCrm = (v: number | null | undefined) => Number(v ?? 0)
  const tunnel = {
    leads: nCrm(crmCur._sum.leads), rdv: nCrm(crmCur._sum.rdv),
    devis: nCrm(crmCur._sum.devis), signes: nCrm(crmCur._sum.signes), ca: nCrm(crmCur._sum.ca),
  }
  const tunnelPrec = {
    leads: nCrm(crmPrec._sum.leads), rdv: nCrm(crmPrec._sum.rdv),
    devis: nCrm(crmPrec._sum.devis), signes: nCrm(crmPrec._sum.signes), ca: nCrm(crmPrec._sum.ca),
  }
  const parts = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
  const cout = (d: number, q: number) => (q > 0 ? Math.round((d / q) * 100) / 100 : null)

  const crm = ghl?.token
    ? {
        connecte: true,
        opportunites: ghl.totalOpps,
        attribuees: ghl.attributed,
        signees: ghl.wonCount,
        ca: ghl.wonValue,
        synchro: ghl.syncedAt,
        tunnel: {
          ...tunnel,
          tauxRdv: parts(tunnel.rdv, tunnel.leads),
          tauxDevis: parts(tunnel.devis, tunnel.rdv),
          tauxSigne: parts(tunnel.signes, tunnel.leads),
          coutRdv: cout(courant.spend, tunnel.rdv),
          coutSigne: cout(courant.spend, tunnel.signes),
          roas: courant.spend > 0 && tunnel.ca > 0 ? Math.round((tunnel.ca / courant.spend) * 100) / 100 : null,
        },
        evolutions: {
          leads: ecart(tunnel.leads, tunnelPrec.leads),
          rdv: ecart(tunnel.rdv, tunnelPrec.rdv),
          devis: ecart(tunnel.devis, tunnelPrec.devis),
          signes: ecart(tunnel.signes, tunnelPrec.signes),
          ca: ecart(tunnel.ca, tunnelPrec.ca),
          tauxRdv: ecart(parts(tunnel.rdv, tunnel.leads), parts(tunnelPrec.rdv, tunnelPrec.leads)),
          tauxDevis: ecart(parts(tunnel.devis, tunnel.rdv), parts(tunnelPrec.devis, tunnelPrec.rdv)),
          tauxSigne: ecart(parts(tunnel.signes, tunnel.leads), parts(tunnelPrec.signes, tunnelPrec.leads)),
        },
        // Sans étiquettes renseignées le tunnel reste à zéro : le dire évite de
        // faire passer une configuration absente pour une contre-performance.
        aDesJours: nCrm(crmCur._sum.leads) + nCrm(crmCur._sum.rdv) + nCrm(crmCur._sum.signes) > 0,
      }
    : null

  const evo = (cle: keyof typeof courant) =>
    variation(courant[cle] as number | null, precedent[cle] as number | null)

  const serie = parJour.map((d) => {
    const leads = (d._sum.formLeads || 0) || (d._sum.pixelLeads || 0) || (d._sum.totalLeads || 0)
    const spend = d._sum.spend || 0
    const impressions = d._sum.impressions || 0
    const reach = d._sum.reach || 0
    return {
      date: d.date.toISOString().slice(0, 10),
      spend: Math.round(spend * 100) / 100,
      leads,
      cpl: leads > 0 ? Math.round((spend / leads) * 100) / 100 : null,
      ctr: impressions > 0 ? Math.round(((d._sum.clicks || 0) / impressions) * 10000) / 100 : null,
      reach,
      impressions,
      cpm: impressions > 0 ? Math.round((spend / impressions) * 100000) / 100 : null,
    }
  })

  // Les campagnes portent leur propre portée dédoublonnée : leur fréquence est
  // donc exacte, là où la somme de leurs journées la gonflerait.
  const porteeParCampagne = new Map(portees.filter((r) => r.level === 'campaign').map((r) => [r.metaId, r.reach]))
  const nomCampagne = new Map(entites.filter((e) => e.level === 'campaign').map((e) => [e.metaId, e.name]))
  const campagnes = parCampagne
    .map((c) => {
      const id = String(c.campaignId ?? '')
      const m = computeMetrics(toTotals(c._sum, nbJours), objectif)
      const portee = porteeParCampagne.get(id)
      return {
        id,
        name: nomCampagne.get(id) || '(campagne inconnue)',
        spend: m.spend,
        cpm: m.cpm,
        cpc: m.cpc,
        frequency: portee && portee > 0 ? Math.round((m.impressions / portee) * 100) / 100 : null,
      }
    })
    .filter((c) => c.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 12)

  const sat = saturation(
    serie.map((d) => ({ date: d.date, spend: d.spend, reach: d.reach, impressions: d.impressions, cpm: d.cpm })),
    porteeCompte,
  )

  const compte = (kind: string) => avecDecision.filter((x) => x.decision.kind === kind).length
  const compteLabel = (label: string) => avecDecision.filter((x) => x.decision.label === label).length

  return NextResponse.json({
    periode: { since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10), jours },
    precedente: { since: prev.since.toISOString().slice(0, 10), until: prev.until.toISOString().slice(0, 10) },
    fraicheur: etat?.lastSyncedAt ?? null,
    erreurSync: etat?.lastError ?? null,
    goals,
    economie: eco,
    verdictEconomie: verdictSignature(eco?.coutParSignature ?? null, eco?.margeParClient ?? null),
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
      clicks: evo('clicks'), linkClicks: evo('linkClicks'), cpc: evo('cpc'),
      cpcLink: evo('cpcLink'), outboundClicks: evo('outboundClicks'),
      cpcOutbound: evo('cpcOutbound'), postEngagement: evo('postEngagement'),
      landingPageViews: evo('landingPageViews'), reachSum: evo('reachSum'),
      hookRate: evo('hookRate'), holdRate: evo('holdRate'), video3s: evo('video3s'),
      videoStarts: evo('videoStarts'), video25: evo('video25'), video50: evo('video50'),
      video75: evo('video75'), video95: evo('video95'), thruplays: evo('thruplays'),
      costPerThruplay: evo('costPerThruplay'),
    },
    sante: sante(totaux, sumPrev._sum.spend ? totauxPrec : null, avecDecision, goals),
    signaux: signaux(avecDecision, totaux, crm),
    verdicts: {
      cut: compte('cut'), scale: compte('scale'), watch: compte('watch'),
      iterate: compte('iterate'), objective: compte('objective'), test: compte('test'),
      winner: compteLabel('Winner'), scaler: compteLabel('Scaler'), fatigue: compteLabel('Fatigue'),
      paused: compte('paused'),
    },
    crm,
    serie,
    campagnes,
    saturation: sat,
    verdicts_blocs: {
      saturation: verdictSaturation(sat),
      leadgen: verdictLeadgen(totaux, ecart(courant.convRate, precedent.convRate), ecart(courant.cpl, precedent.cpl)),
      media: verdictMedia(ecart(courant.cpm, precedent.cpm), ecart(courant.linkCtr, precedent.linkCtr)),
      creatif: verdictCreatif(courant.hookRate, courant.holdRate, ecart(courant.hookRate, precedent.hookRate)),
    },
    // Le détail : chaque bloc dépliable lit ces valeurs et leur évolution.
    detail: {
      leadgen: ['spend', 'leads', 'cpl', 'convRate', 'reachSum', 'frequency'],
      media: ['impressions', 'clicks', 'ctr', 'linkClicks', 'linkCtr', 'cpc', 'cpm', 'cpcLink', 'outboundClicks', 'cpcOutbound', 'postEngagement', 'landingPageViews'],
      creatif: ['hookRate', 'holdRate', 'video3s', 'videoStarts', 'video25', 'video50', 'video75', 'video95', 'thruplays', 'costPerThruplay'],
    },
    nbPubs: avecDecision.length,
    prevPubs: parIdPrec.size,
  })
}
