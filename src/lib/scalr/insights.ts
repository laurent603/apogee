/**
 * Lecture des insights Meta — portage de la couche métier de Scalr.
 *
 * Scalr fait autorité sur le media buying : ces règles ont été affinées à
 * l'usage sur des comptes réels et savent des choses que le calcul naïf
 * ignore. Trois exemples de ce qui serait perdu à réécrire depuis zéro :
 *
 * - Le « résultat » d'une campagne dépend de son objectif. Un compte local
 *   compte des itinéraires, une campagne de notoriété compte des personnes
 *   touchées. Diviser la dépense par des achats inexistants ne dit rien.
 * - Meta range les conversions personnalisées dans `conversions`, pas dans
 *   `actions`. Ne lire que `actions` sous-compte ces comptes-là.
 * - Les prospects arrivent sur trois lignes distinctes (formulaire, pixel,
 *   total). Les fusionner par `||` sous-compte ceux qui ont les deux sources.
 *
 * Fonctions pures : aucun appel réseau ici, donc vérifiables sur des données
 * réelles capturées.
 */

/* ─── Types ─────────────────────────────────────────────────────────────── */

export type MetaAction = { action_type?: string; value?: string | number }

/** Une ligne brute d'insights telle que Meta la renvoie. */
export type InsightRow = {
  spend?: string | number
  impressions?: string | number
  reach?: string | number
  clicks?: string | number
  frequency?: string | number
  inline_link_clicks?: string | number
  outbound_clicks?: MetaAction[]
  actions?: MetaAction[]
  conversions?: MetaAction[]
  action_values?: MetaAction[]
  conversion_values?: MetaAction[]
  video_play_actions?: MetaAction[]
  video_15_sec_watched_actions?: MetaAction[]
  video_thruplay_watched_actions?: MetaAction[]
  video_p25_watched_actions?: MetaAction[]
  video_p50_watched_actions?: MetaAction[]
  video_p75_watched_actions?: MetaAction[]
  video_p95_watched_actions?: MetaAction[]
  [k: string]: unknown
}

export type PrimaryResult = {
  value: number
  label: string
  type: 'lead' | 'directions' | 'landing_page_view' | 'link_click' | 'engagement' | 'reach' | 'none'
}

/** Fenêtre d'attribution. Le même compte ne raconte pas la même histoire
 *  selon la fenêtre : c'est un réglage de media buyer, pas un détail. */
export type Attribution = 'default' | '1d_click' | '7d_click' | '1d_view'
export type ActionReportTime = 'conversion' | 'impression'

/* ─── Liste de champs ───────────────────────────────────────────────────── */

/**
 * Champs demandés à Meta. `conversions` et `conversion_values` accompagnent
 * `actions` et `action_values` : les conversions personnalisées ne vivent que
 * dans les premiers.
 */
export const INSIGHT_FIELDS = [
  'spend', 'impressions', 'reach', 'frequency', 'clicks',
  'inline_link_clicks', 'outbound_clicks', 'ctr', 'cpm', 'cpc',
  'actions', 'conversions', 'action_values', 'conversion_values', 'purchase_roas',
  'video_play_actions',
  'video_15_sec_watched_actions',
  'video_thruplay_watched_actions',
  'video_p25_watched_actions', 'video_p50_watched_actions',
  'video_p75_watched_actions', 'video_p95_watched_actions',
].join(',')

/**
 * Repli quand Meta refuse la liste complète : certains comptes n'exposent pas
 * tous les champs vidéo, et l'appel entier échoue alors pour un seul champ
 * indisponible. Mieux vaut des métriques partielles qu'un écran vide.
 */
export function fallbackFieldsFor(fields: string): string {
  const essential = ['spend', 'impressions', 'reach', 'frequency', 'clicks',
    'inline_link_clicks', 'actions', 'action_values']
  return fields === INSIGHT_FIELDS ? essential.join(',') : essential.slice(0, 5).join(',')
}

/** Erreurs Meta qui méritent un second essai avec moins de champs. */
export function isRetryableInsightsError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('unsupported get request')
    || m.includes('unknown field')
    || m.includes('invalid parameter')
    || m.includes('please reduce the amount of data')
    || m.includes('reduce the amount')
}

/** Ajoute la fenêtre d'attribution aux paramètres, si elle n'est pas celle
 *  par défaut du compte. */
export function withAttribution(
  params: Record<string, string>,
  attribution: Attribution = 'default',
): Record<string, string> {
  if (attribution === 'default') return params
  return { ...params, action_attribution_windows: JSON.stringify([attribution]) }
}

/* ─── Extraction ────────────────────────────────────────────────────────── */

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Somme les actions dont le type figure dans `types`.
 *
 * Cas particulier repris de Scalr : les champs vidéo (`video_play_actions`…)
 * sont eux-mêmes des tableaux d'actions dont le `action_type` ne porte pas le
 * nom du champ. Quand on interroge un tel champ par son propre nom, on somme
 * toutes ses entrées.
 */
export function extractActionValue(
  ins: InsightRow | null | undefined,
  types: string[],
  field: string = 'actions',
): number {
  if (!ins) return 0
  const arr = ins[field]
  if (!Array.isArray(arr)) return 0

  const selfNamed = field !== 'actions' && field !== 'action_values'
    && types.length === 1 && types[0] === field

  let sum = 0
  for (const a of arr as MetaAction[]) {
    if (selfNamed) { sum += num(a?.value); continue }
    if (a?.action_type && types.includes(a.action_type)) sum += num(a.value)
  }
  return field === 'action_values' || field === 'conversion_values' ? sum : Math.round(sum)
}

/** Recherche approximative sur le nom du type d'action, avec exclusions.
 *  Sert de dernier recours quand un compte nomme ses conversions autrement. */
export function extractActionValueByKeyword(
  ins: InsightRow | null | undefined,
  needles: string[],
  exclude: string[] = [],
  fields: string[] = ['actions'],
): number {
  if (!ins) return 0
  let sum = 0
  for (const field of fields) {
    const arr = ins[field]
    if (!Array.isArray(arr)) continue
    for (const a of arr as MetaAction[]) {
      const type = String(a?.action_type || '').toLowerCase()
      if (!type) continue
      if (exclude.some((bad) => type.includes(bad.toLowerCase()))) continue
      if (needles.some((n) => type.includes(n.toLowerCase()))) sum += num(a.value)
    }
  }
  return Math.round(sum)
}

/* ─── Prospects ─────────────────────────────────────────────────────────── */

const FORM_LEAD_TYPES = [
  'onsite_conversion.lead_grouped',
  'onsite_conversion.leadgen_grouped',
  'leadgen_grouped',
  'onsite_conversion.leadgen',
  'onsite_conversion.lead',
]

const PIXEL_LEAD_TYPES = [
  'offsite_conversion.fb_pixel_lead',
  'offsite_conversion.lead',
  'onsite_web_lead',
]

/** Prospects issus d'un formulaire Meta (le lead reste dans Facebook). */
export function extractFormLeads(ins: InsightRow | null | undefined): number {
  for (const field of ['actions', 'conversions']) {
    const v = extractActionValue(ins, FORM_LEAD_TYPES, field)
    if (v > 0) return v
  }
  return 0
}

/** Prospects remontés par le pixel depuis le site. */
export function extractPixelLeads(ins: InsightRow | null | undefined): number {
  for (const field of ['actions', 'conversions']) {
    const v = extractActionValue(ins, PIXEL_LEAD_TYPES, field)
    if (v > 0) return v
  }
  return 0
}

/** Total tel que Meta le déclare, avec repli approximatif. `post` est exclu
 *  pour ne pas confondre un engagement de publication avec un prospect. */
export function extractTotalLeads(ins: InsightRow | null | undefined): number {
  for (const field of ['actions', 'conversions']) {
    const v = extractActionValue(ins, ['lead'], field)
    if (v > 0) return v
  }
  return extractActionValueByKeyword(ins, ['lead', 'leadgen', 'prospect'], ['post'], ['actions', 'conversions'])
}

export function extractOutboundClicks(ins: InsightRow | null | undefined): number {
  if (!ins) return 0
  const v = extractActionValue(ins, ['outbound_click'], 'outbound_clicks')
  if (v > 0) return v
  const arr = ins.outbound_clicks
  return Array.isArray(arr) ? Math.round(num((arr as MetaAction[])[0]?.value)) : 0
}

/* ─── Résultat principal ────────────────────────────────────────────────── */

export function isLeadObjective(objective: string): boolean {
  return objective.toUpperCase().includes('LEAD')
}

/**
 * Détermine ce qui compte comme « résultat » pour cette campagne.
 *
 * Une cascade, pas une formule : l'objectif décide. Un garage compte des
 * itinéraires, une campagne de trafic des vues de page d'atterrissage, une
 * campagne de notoriété des personnes touchées. Sans ça, le coût par résultat
 * n'a aucun sens sur les trois quarts des comptes.
 */
export function resolvePrimaryResult(
  ins: InsightRow | null | undefined,
  base: { objective?: string },
  leads: number,
): PrimaryResult {
  const objective = String(base.objective || '').toUpperCase()

  if (isLeadObjective(objective) || leads > 0) {
    return { value: leads, label: 'Prospects formulaire', type: 'lead' }
  }

  const directions = extractActionValueByKeyword(
    ins, ['direction', 'directions', 'itineraire', 'itinéraire'], [], ['actions', 'conversions'],
  )
  if (directions > 0) return { value: directions, label: 'Itinéraires', type: 'directions' }

  const landing = extractActionValue(ins, ['landing_page_view', 'omni_landing_page_view'])
  if (landing > 0 && (objective.includes('TRAFFIC') || objective.includes('LINK'))) {
    return { value: landing, label: 'Vues LP', type: 'landing_page_view' }
  }

  const linkClicks = num(ins?.inline_link_clicks) || extractActionValue(ins, ['link_click'])
  if (linkClicks > 0 && (objective.includes('TRAFFIC') || objective.includes('AWARENESS') || objective.includes('REACH'))) {
    return { value: linkClicks, label: 'Clics lien', type: 'link_click' }
  }

  const postEngagement = extractActionValue(ins, ['post_engagement', 'page_engagement'])
  if (postEngagement > 0 && (objective.includes('ENGAGEMENT') || objective.includes('AWARENESS'))) {
    return { value: postEngagement, label: 'Engagements', type: 'engagement' }
  }

  const reach = num(ins?.reach)
  if (reach > 0 && (objective.includes('AWARENESS') || objective.includes('REACH'))) {
    return { value: reach, label: 'Personnes touchées', type: 'reach' }
  }

  return { value: 0, label: 'Résultat', type: 'none' }
}

/* ─── Ligne de métriques ────────────────────────────────────────────────── */

export type MetricRow = ReturnType<typeof formatInsightRow>

const r2 = (n: number) => Math.round(n * 100) / 100
const pct = (a: number, b: number) => (b > 0 ? r2((a / b) * 100) : null)
const per = (a: number, b: number) => (b > 0 ? r2(a / b) : null)

/**
 * Met une ligne brute Meta en forme.
 *
 * Les ratios valent `null` quand leur dénominateur est nul, jamais 0 : une
 * créa sans vue vidéo n'a pas un hold rate de 0 %, elle n'en a pas. Afficher
 * 0 la ferait passer pour mauvaise dans un classement.
 */
export function formatInsightRow(
  ins: InsightRow | null | undefined,
  base: { objective?: string } & Record<string, unknown> = {},
) {
  const spend = num(ins?.spend)
  const impressions = num(ins?.impressions)
  const reach = num(ins?.reach)
  const clicks = num(ins?.clicks)
  const linkClicks = num(ins?.inline_link_clicks) || extractActionValue(ins, ['link_click'])
  const outboundClicks = extractOutboundClicks(ins)

  const formLeads = extractFormLeads(ins)
  const pixelLeads = extractPixelLeads(ins)
  const totalLeads = extractTotalLeads(ins)
  const leads = formLeads || pixelLeads || totalLeads

  const PURCHASE = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']
  const purchases = extractActionValue(ins, PURCHASE)
  const revenue = extractActionValue(ins, PURCHASE, 'action_values')

  // Vidéo. Le palier 15 s est bien servi par l'API v21 — vérifié sur données
  // réelles, où il vaut exactement ThruPlay.
  const videoStarts = extractActionValue(ins, ['video_play_actions'], 'video_play_actions')
  const video3s = extractActionValue(ins, ['video_view'])
  const video15s = extractActionValue(ins, ['video_15_sec_watched_actions'], 'video_15_sec_watched_actions')
  const thruplays = extractActionValue(ins, ['video_thruplay_watched_actions'], 'video_thruplay_watched_actions')
  const video25 = extractActionValue(ins, ['video_p25_watched_actions'], 'video_p25_watched_actions')
  const video50 = extractActionValue(ins, ['video_p50_watched_actions'], 'video_p50_watched_actions')
  const video75 = extractActionValue(ins, ['video_p75_watched_actions'], 'video_p75_watched_actions')
  const video95 = extractActionValue(ins, ['video_p95_watched_actions'], 'video_p95_watched_actions')

  const result = resolvePrimaryResult(ins, base, leads)

  return {
    ...base,
    spend: r2(spend),
    impressions,
    reach,
    clicks,
    linkClicks,
    outboundClicks,
    frequency: r2(num(ins?.frequency)),

    leads,
    formLeads,
    pixelLeads,
    totalLeads,
    purchases,
    revenue: r2(revenue),

    resultValue: result.value,
    resultLabel: result.label,
    resultType: result.type,
    costPerResult: per(spend, result.value),

    cpl: per(spend, leads),
    cpa: per(spend, purchases),
    roas: spend > 0 ? r2(revenue / spend) : null,
    ctr: pct(clicks, impressions),
    linkCtr: pct(linkClicks, impressions),
    cpm: impressions > 0 ? r2((spend / impressions) * 1000) : null,
    cpc: per(spend, clicks),
    cpcLink: per(spend, linkClicks),
    convRate: pct(leads, linkClicks),

    videoStarts,
    video3s,
    video15s,
    thruplays,
    video25,
    video50,
    video75,
    video95,
    /** Distingue une vraie vidéo d'un visuel fixe. Meta remonte deux ou trois
     *  démarrages fantômes sur des statiques : seules les vues 3 s font foi. */
    hasVideo: video3s > 0,
    /** Part des impressions qui accrochent 3 secondes.
     *  `null` sur un visuel fixe : il n'a pas un hook rate de 0 %, il n'en a
     *  pas. Le mettre à 0 le ferait couler au fond d'un classement par hook. */
    hookRate: video3s > 0 ? pct(video3s, impressions) : null,
    /** Rétention : parmi ceux qui ont accroché, combien tiennent 15 secondes.
     *  Définition retenue par l'agence — ni celle de Scalr (ThruPlay ÷
     *  impressions) ni celle d'Apogee (25 % ÷ 3 s), qui donnaient des chiffres
     *  différents pour un même nom. */
    holdRate: pct(video15s, video3s),
    completionRate: video3s > 0 ? pct(video95, impressions) : null,
  }
}
