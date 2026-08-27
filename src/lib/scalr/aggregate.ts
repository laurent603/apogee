/**
 * Agrégation des lignes journalières en métriques de période.
 *
 * Les ratios ne sont jamais stockés ni moyennés : un CPL de période, c'est la
 * dépense totale divisée par les prospects totaux, pas la moyenne des CPL
 * journaliers. Les deux diffèrent d'autant plus que les journées sont
 * inégales, et la moyenne des ratios flatte systématiquement les petits jours.
 *
 * Un piège traité explicitement : **la portée ne s'additionne pas.** Meta
 * compte des personnes uniques ; la même personne touchée lundi et mardi
 * compte une fois sur la semaine, deux fois si on somme les journées. La
 * somme est donc exposée comme une borne haute, jamais comme une portée, et
 * la fréquence qui en découlerait est tue sur les périodes multi-jours.
 */

export type Totals = {
  spend: number
  impressions: number
  reachSum: number
  clicks: number
  linkClicks: number
  outboundClicks: number
  landingPageViews: number
  addToCart: number
  initiateCheckout: number
  purchases: number
  revenue: number
  formLeads: number
  pixelLeads: number
  totalLeads: number
  directions: number
  postEngagement: number
  videoStarts: number
  video3s: number
  video15s: number
  thruplays: number
  video25: number
  video50: number
  video75: number
  video95: number
  /** Nombre de journées distinctes agrégées : au-delà d'une, la portée
   *  sommée cesse d'être une portée. */
  days: number
}

export const TOTAL_KEYS: (keyof Totals)[] = [
  'spend', 'impressions', 'reachSum', 'clicks', 'linkClicks', 'outboundClicks',
  'landingPageViews', 'addToCart', 'initiateCheckout', 'purchases', 'revenue',
  'formLeads', 'pixelLeads', 'totalLeads', 'directions', 'postEngagement',
  'videoStarts', 'video3s', 'video15s', 'thruplays',
  'video25', 'video50', 'video75', 'video95', 'days',
]

export function emptyTotals(): Totals {
  return Object.fromEntries(TOTAL_KEYS.map((k) => [k, 0])) as Totals
}

/** Une ligne de la table `MetaDailyAd`, ou tout objet portant les mêmes noms. */
export type DailyLike = Partial<Record<keyof Totals | 'reach', number>>

export function addRow(acc: Totals, row: DailyLike): Totals {
  for (const k of TOTAL_KEYS) {
    if (k === 'days' || k === 'reachSum') continue
    acc[k] += Number(row[k] ?? 0)
  }
  acc.reachSum += Number(row.reach ?? row.reachSum ?? 0)
  acc.days += 1
  return acc
}

export function sumRows(rows: DailyLike[]): Totals {
  return rows.reduce<Totals>((acc, r) => addRow(acc, r), emptyTotals())
}

/* ─── Ratios ────────────────────────────────────────────────────────────── */

const r2 = (n: number) => Math.round(n * 100) / 100
/** `null` plutôt que 0 quand le dénominateur est vide : une créa sans vue
 *  vidéo n'a pas un hold rate de 0 %, elle n'en a pas. Un 0 la ferait couler
 *  au fond d'un classement au lieu d'en être écartée. */
const pct = (a: number, b: number) => (b > 0 ? r2((a / b) * 100) : null)
const per = (a: number, b: number) => (b > 0 ? r2(a / b) : null)

export type PeriodMetrics = ReturnType<typeof computeMetrics>

/**
 * `objective` conditionne ce qui compte comme résultat — un compte de
 * notoriété n'a pas de prospects, son résultat est le nombre de personnes
 * touchées. Sans lui, le coût par résultat n'a aucun sens.
 */
export function computeMetrics(t: Totals, objective?: string | null) {
  const obj = String(objective || '').toUpperCase()
  const leads = t.formLeads || t.pixelLeads || t.totalLeads

  // Même cascade que `resolvePrimaryResult`, appliquée à des totaux.
  const result = (() => {
    if (obj.includes('LEAD') || leads > 0) return { value: leads, label: 'Prospects formulaire', type: 'lead' as const }
    if (t.directions > 0) return { value: t.directions, label: 'Itinéraires', type: 'directions' as const }
    if (t.purchases > 0) return { value: t.purchases, label: 'Achats', type: 'purchase' as const }
    if (t.landingPageViews > 0 && (obj.includes('TRAFFIC') || obj.includes('LINK')))
      return { value: t.landingPageViews, label: 'Vues LP', type: 'landing_page_view' as const }
    if (t.linkClicks > 0 && (obj.includes('TRAFFIC') || obj.includes('AWARENESS') || obj.includes('REACH')))
      return { value: t.linkClicks, label: 'Clics lien', type: 'link_click' as const }
    if (t.postEngagement > 0 && (obj.includes('ENGAGEMENT') || obj.includes('AWARENESS')))
      return { value: t.postEngagement, label: 'Engagements', type: 'engagement' as const }
    if (t.reachSum > 0 && (obj.includes('AWARENESS') || obj.includes('REACH')))
      return { value: t.reachSum, label: 'Personnes touchées', type: 'reach' as const }
    return { value: 0, label: 'Résultat', type: 'none' as const }
  })()

  const multiJours = t.days > 1

  return {
    spend: r2(t.spend),
    impressions: t.impressions,
    clicks: t.clicks,
    linkClicks: t.linkClicks,

    /** Somme des portées journalières. Sur plusieurs jours c'est une borne
     *  haute, pas une portée : les mêmes personnes sont recomptées. */
    reachSum: t.reachSum,
    reachIsApproximate: multiJours,
    /** Tue sur une période multi-jours : elle se calculerait sur une portée
     *  surévaluée et sous-estimerait donc la répétition réelle. */
    frequency: multiJours ? null : per(t.impressions, t.reachSum),

    leads,
    formLeads: t.formLeads,
    pixelLeads: t.pixelLeads,
    purchases: t.purchases,
    revenue: r2(t.revenue),

    resultValue: result.value,
    resultLabel: result.label,
    resultType: result.type,
    costPerResult: per(t.spend, result.value),

    cpl: per(t.spend, leads),
    cpa: per(t.spend, t.purchases),
    roas: t.spend > 0 ? r2(t.revenue / t.spend) : null,
    ctr: pct(t.clicks, t.impressions),
    linkCtr: pct(t.linkClicks, t.impressions),
    cpm: t.impressions > 0 ? r2((t.spend / t.impressions) * 1000) : null,
    cpc: per(t.spend, t.clicks),
    cpcLink: per(t.spend, t.linkClicks),
    convRate: pct(leads, t.linkClicks),

    // Tunnel du clic à l'achat
    funnel: {
      linkClicks: t.linkClicks,
      landingPageViews: t.landingPageViews,
      addToCart: t.addToCart,
      initiateCheckout: t.initiateCheckout,
      purchases: t.purchases,
      lpvRate: pct(t.landingPageViews, t.linkClicks),
      atcRate: pct(t.addToCart, t.landingPageViews),
      checkoutRate: pct(t.initiateCheckout, t.addToCart),
      purchaseRate: pct(t.purchases, t.initiateCheckout),
    },

    hasVideo: t.video3s > 0,
    video3s: t.video3s,
    video15s: t.video15s,
    hookRate: t.video3s > 0 ? pct(t.video3s, t.impressions) : null,
    holdRate: pct(t.video15s, t.video3s),
    completionRate: t.video3s > 0 ? pct(t.video95, t.impressions) : null,

    days: t.days,
  }
}

/* ─── Comparaison de périodes ───────────────────────────────────────────── */

/** Variation en pourcentage, `null` quand la référence est nulle : passer de
 *  0 à 10 n'est pas une hausse de l'infini, c'est un démarrage. */
export function variation(courant: number | null, precedent: number | null): number | null {
  if (courant === null || precedent === null || precedent === 0) return null
  return Math.round(((courant - precedent) / precedent) * 1000) / 10
}

/** Fenêtre précédente de même longueur, collée à celle demandée. */
export function previousWindow(since: Date, until: Date): { since: Date; until: Date } {
  const span = until.getTime() - since.getTime()
  const prevUntil = new Date(since.getTime() - 86_400_000)
  const prevSince = new Date(prevUntil.getTime() - span)
  return { since: prevSince, until: prevUntil }
}
