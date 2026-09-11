const META_API_VERSION = process.env.META_API_VERSION || 'v21.0'
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

export async function metaFetch(path: string, token: string, params: Record<string, string> = {}, timeoutMs = 15000) {
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set('access_token', token)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url.toString(), { signal: controller.signal })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err?.error?.message || 'Meta API error')
    }
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function getAdAccounts(token: string) {
  const data = await metaFetch('/me/adaccounts', token, {
    fields: 'id,name,currency,timezone_name,account_status,spend_cap,amount_spent',
    limit: '50',
  })
  return data.data || []
}

/**
 * La courbe de rétention vidéo.
 *
 * Ces champs ne sont pas dans `actions` : ce sont des champs d'insight à part
 * entière, et il faut les demander nommément. `computeVideoMetrics` les lisait
 * sans que personne ne les ait jamais réclamés — d'où des hold rates et des
 * taux de complétion nuls dans tous les rapports, sur tous les comptes.
 */
const CHAMPS_VIDEO = [
  'video_play_actions',
  'video_15_sec_watched_actions',
  'video_thruplay_watched_actions',
  'video_p25_watched_actions', 'video_p50_watched_actions',
  'video_p75_watched_actions', 'video_p95_watched_actions',
  'video_p100_watched_actions',
  'video_avg_time_watched_actions',
]
// `video_3_sec_watched_actions` n'existe plus sur cette version de l'API — vérifié
// contre le compte : elle refuse le champ entier. Les vues de 3 s se lisent dans
// `actions`, sous `video_view`.

const INSIGHT_FIELDS = [
  'spend', 'impressions', 'reach', 'frequency',
  'clicks', 'unique_clicks', 'ctr', 'unique_ctr', 'cpc', 'cpm',
  'outbound_clicks', 'outbound_clicks_ctr', 'cost_per_outbound_click',
  'actions', 'action_values', 'cost_per_action_type',
  'website_purchase_roas',
  ...CHAMPS_VIDEO,
].join(',')

/**
 * Always request these through `insights.date_preset(X){…}`.
 *
 * A `date_preset` passed as a query parameter scopes the edge being listed, not
 * the nested `insights` edge, which silently falls back to its own default
 * window. Ads, campaigns and ad sets therefore reported ~30 days whatever period
 * was selected — the dashboard showed 483 € against Meta's 38 €, and the
 * period-over-period comparison measured a fixed window against a moving one.
 */
const INSIGHT_FIELDS_NESTED = [
  'spend', 'impressions', 'reach', 'frequency',
  'clicks', 'unique_clicks', 'ctr', 'unique_ctr', 'cpc', 'cpm',
  'outbound_clicks', 'outbound_clicks_ctr',
  'actions', 'action_values', 'cost_per_action_type',
  'website_purchase_roas',
  ...CHAMPS_VIDEO,
].join(',')

function extractAction(actions: { action_type: string; value: string }[] | undefined, type: string): number {
  return Number(actions?.find(a => a.action_type === type)?.value || 0)
}

function extractActionValue(values: { action_type: string; value: string }[] | undefined, type: string): number {
  return Number(values?.find(a => a.action_type === type)?.value || 0)
}

/**
 * Which lead figure an account treats as authoritative.
 * 'total'   — Meta's own total (website + instant forms)
 * 'meta'    — instant form submissions only
 * 'website' — pixel/CAPI Lead events only
 * Accounts whose CRM pushes a CAPI `Lead` back for every instant-form lead see
 * the same person counted twice in the total; they should pick 'meta'.
 */
export type LeadSource = 'total' | 'meta' | 'website'

export function computeKPIs(d: Record<string, unknown>, leadSource: LeadSource = 'total') {
  const actions = d.actions as { action_type: string; value: string }[] | undefined
  const actionValues = d.action_values as { action_type: string; value: string }[] | undefined
  const costPer = d.cost_per_action_type as { action_type: string; value: string }[] | undefined
  const outboundClicks = d.outbound_clicks as { action_type: string; value: string }[] | undefined

  const spend = Number(d.spend || 0)
  const impressions = Number(d.impressions || 0)

  const linkClicks = extractAction(outboundClicks, 'link_click') || Number((d.outbound_clicks as {value:string}[])?.[0]?.value || 0)
  const landingPageViews = extractAction(actions, 'landing_page_view')
  const addToCart = extractAction(actions, 'add_to_cart') || extractAction(actions, 'offsite_conversion.fb_pixel_add_to_cart')
  const initiateCheckout = extractAction(actions, 'initiate_checkout') || extractAction(actions, 'offsite_conversion.fb_pixel_initiate_checkout')
  const purchases = extractAction(actions, 'purchase') || extractAction(actions, 'offsite_conversion.fb_pixel_purchase')
  // Meta reports leads as three separate rows: the `lead` total plus its two
  // sources. Chaining them with || undercounts an account that has both, so keep
  // the sources apart and only derive the total when Meta omits it.
  const leadsWebsite = extractAction(actions, 'offsite_conversion.fb_pixel_lead')
  const leadsMeta = extractAction(actions, 'onsite_conversion.lead_grouped') || extractAction(actions, 'leadgen.other')
  const leadsTotal = extractAction(actions, 'lead') || (leadsWebsite + leadsMeta)
  const leads =
    leadSource === 'meta' ? leadsMeta :
    leadSource === 'website' ? leadsWebsite :
    leadsTotal
  const purchaseValue = extractActionValue(actionValues, 'purchase') || extractActionValue(actionValues, 'offsite_conversion.fb_pixel_purchase')

  // Video
  const thruPlays = extractAction(actions, 'video_thruplay_watched')
  const video3s = extractAction(actions, 'video_view')

  return {
    // Funnel e-commerce
    'Revenue Brut (CA)': purchaseValue > 0 ? purchaseValue - spend : null,
    'AOV (Panier moyen)': purchases > 0 ? purchaseValue / purchases : null,
    'ATCR (Add to Cart Rate)': landingPageViews > 0 ? (addToCart / landingPageViews) * 100 : null,
    'ATC→Achat': addToCart > 0 ? (purchases / addToCart) * 100 : null,
    'ATC→Payment Initiate': addToCart > 0 ? (initiateCheckout / addToCart) * 100 : null,
    'Conversion Rate': landingPageViews > 0 ? (purchases / landingPageViews) * 100 : null,
    'Initiate Payment Rate': landingPageViews > 0 ? (initiateCheckout / landingPageViews) * 100 : null,
    'LPVR (Landing Page View Rate)': linkClicks > 0 ? (landingPageViews / linkClicks) * 100 : null,
    'LP View Drop': linkClicks > 0 ? ((linkClicks - landingPageViews) / linkClicks) * 100 : null,
    // Leadgen
    'Taux transfo Form': linkClicks > 0 ? (leads / linkClicks) * 100 : null,
    'Taux transfo LP': landingPageViews > 0 ? (leads / landingPageViews) * 100 : null,
    // Video
    'Hook Rate': impressions > 0 && video3s > 0 ? (video3s / impressions) * 100 : null,
    'Hold Rate': impressions > 0 && thruPlays > 0 ? (thruPlays / impressions) * 100 : null,
    // Counts
    'Achats': purchases || null,
    'Ajouts au panier': addToCart || null,
    'Prospects (leads)': leads || null,
    'Prospects site web': leadsWebsite || null,
    'Prospects Meta': leadsMeta || null,
    'Source prospects retenue': leadSource,
    ...(leadSource === 'total' && leadsWebsite > 0 && leadsMeta > 0
      ? { 'Alerte prospects': `Les deux sources sont actives (${leadsWebsite} site web + ${leadsMeta} Meta). Si le CRM renvoie un événement Lead pour chaque prospect issu des formulaires Meta, le total est un double comptage — vérifier avant de raisonner sur ce chiffre.` }
      : {}),
    'Paiements initiés': initiateCheckout || null,
    'Vues page destination': landingPageViews || null,
    'Clics sur lien': linkClicks || null,
    'Valeur de conversion': purchaseValue || null,
    // Costs from API
    'Coût par achat': extractAction(costPer, 'purchase') || extractAction(costPer, 'offsite_conversion.fb_pixel_purchase') || null,
    'Coût par ATC': extractAction(costPer, 'add_to_cart') || extractAction(costPer, 'offsite_conversion.fb_pixel_add_to_cart') || null,
    // Meta's own cost-per-lead is derived from its total, so it is wrong as soon
    // as the account narrows the source — recompute from the retained figure.
    'Coût par prospect': leadSource === 'total'
      ? (extractAction(costPer, 'lead') || (leads > 0 ? spend / leads : null))
      : (leads > 0 ? spend / leads : null),
    'Coût par vue LP': (d.cost_per_outbound_click as {value:string}[])?.[0]?.value || null,
  }
}

export async function getAccountOverview(accountId: string, token: string, datePreset = 'last_7d', leadSource: LeadSource = 'total') {
  const data = await metaFetch(`/${accountId}/insights`, token, {
    date_preset: datePreset,
    fields: INSIGHT_FIELDS,
  })
  const raw = data.data?.[0] || {}
  return { ...raw, _computed: computeKPIs(raw, leadSource) }
}

/**
 * Un budget Meta, dans la devise du compte.
 *
 * L'API rend les budgets dans l'**unité mineure** : `"3200"` vaut 32,00 €.
 * Transmis bruts au modèle, ils étaient lus comme trois mille deux cents euros
 * — un facteur cent sur chaque recommandation de budget, chaque ratio
 * budget/CPA et chaque plan de réallocation. L'audit de SB Piscine l'avait
 * relevé comme une « incohérence du compte » : c'était une conversion
 * manquante.
 *
 * `sync.ts` et la page d'envoi divisaient déjà par cent. Seules les deux
 * fonctions qui alimentent l'IA ne le faisaient pas.
 *
 * Les devises sans sous-unité — yen, won — n'ont pas d'unité mineure et
 * feraient ici une division de trop. Tous les comptes sont en euros ; le jour
 * où ce ne sera plus vrai, c'est `currency` du compte qu'il faudra lire.
 */
function budgetEnDevise(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n / 100 : null
}

export async function getCampaigns(accountId: string, token: string, datePreset = 'last_7d', leadSource: LeadSource = 'total') {
  const data = await metaFetch(`/${accountId}/campaigns`, token, {
    fields: [
      'id', 'name', 'status', 'objective', 'daily_budget', 'lifetime_budget',
      // La stratégie d'enchère n'était demandée nulle part : aucun prompt ne
      // pouvait la juger, et l'audit de structure la devinait.
      'bid_strategy',
      `insights.date_preset(${datePreset}){${INSIGHT_FIELDS_NESTED}}`,
    ].join(','),
    limit: '50',
  })
  return (data.data || []).map((c: Record<string, unknown>) => {
    // Les clés brutes sont retirées : les laisser à côté des converties
    // laisserait le modèle choisir, et il choisirait le plus gros nombre.
    const { daily_budget, lifetime_budget, ...reste } = c
    return {
      ...reste,
      // Un budget au niveau campagne signale un CBO ; son absence, un ABO.
      budgetQuotidien: budgetEnDevise(daily_budget),
      budgetTotal: budgetEnDevise(lifetime_budget),
      _computed: c.insights ? computeKPIs((c.insights as {data: Record<string, unknown>[]}).data?.[0] || {}, leadSource) : null,
    }
  })
}

export async function getAdSets(accountId: string, token: string, datePreset = 'last_7d', leadSource: LeadSource = 'total') {
  const data = await metaFetch(`/${accountId}/adsets`, token, {
    fields: [
      'id', 'name', 'status', 'campaign_id', 'daily_budget', 'lifetime_budget',
      'optimization_goal', 'targeting', 'learning_stage_info',
      'bid_strategy', 'bid_amount', 'destination_type',
      `insights.date_preset(${datePreset}){${INSIGHT_FIELDS_NESTED}}`,
    ].join(','),
    limit: '100',
  })
  return (data.data || []).map((a: Record<string, unknown>) => {
    const { daily_budget, lifetime_budget, ...reste } = a
    return {
      ...reste,
      budgetQuotidien: budgetEnDevise(daily_budget),
      budgetTotal: budgetEnDevise(lifetime_budget),
      _computed: a.insights ? computeKPIs((a.insights as {data: Record<string, unknown>[]}).data?.[0] || {}, leadSource) : null,
    }
  })
}

export async function getAds(accountId: string, token: string, datePreset = 'last_7d', leadSource: LeadSource = 'total') {
  const data = await metaFetch(`/${accountId}/ads`, token, {
    fields: [
      'id', 'name', 'status', 'adset_id', 'campaign_id',
      'creative{id,name,title,body,image_url,thumbnail_url,video_id}',
      `insights.date_preset(${datePreset}){${INSIGHT_FIELDS_NESTED}}`,
    ].join(','),
    limit: '200',
  })
  return (data.data || []).map((a: Record<string, unknown>) => ({
    ...a,
    _computed: a.insights ? computeKPIs((a.insights as {data: Record<string, unknown>[]}).data?.[0] || {}, leadSource) : null,
    // La rétention n'était jointe que par `getAdsWithCopy` : un scan de fatigue,
    // qui passe par ici, jugeait une vidéo sans voir où elle perdait son monde.
    _video: a.insights ? computeVideoMetrics(a) : null,
  }))
}

/* ── Ad copy ──────────────────────────────────────────────────────────────
   The creative node's own `title`/`body` are empty on Advantage+ and
   multi-placement ads: the copy lives in asset_feed_spec, and on ordinary ads
   in object_story_spec. Reading only the node meant the creative analyses were
   working off ad names. */

const CREATIVE_COPY_FIELDS = [
  'id', 'name', 'title', 'body', 'image_url', 'thumbnail_url', 'video_id',
  'call_to_action_type',
  'object_story_spec{link_data{message,name,description,caption,call_to_action{type},child_attachments{name,description,link}},video_data{message,title,link_description,call_to_action{type}}}',
  'asset_feed_spec{bodies,titles,descriptions,call_to_action_types}',
].join(',')

type TextItem = { text?: string }

function texts(items: unknown): string[] {
  return Array.isArray(items)
    ? (items as TextItem[]).map(i => (i?.text || '').trim()).filter(Boolean)
    : []
}

/** One flat shape whatever the creative type, so prompts never branch on it. */
function extractCopy(creative: Record<string, unknown> | undefined) {
  if (!creative) return null
  const oss = creative.object_story_spec as Record<string, unknown> | undefined
  const afs = creative.asset_feed_spec as Record<string, unknown> | undefined
  const link = oss?.link_data as Record<string, unknown> | undefined
  const video = oss?.video_data as Record<string, unknown> | undefined

  const cta =
    (link?.call_to_action as { type?: string } | undefined)?.type ||
    (video?.call_to_action as { type?: string } | undefined)?.type ||
    (Array.isArray(afs?.call_to_action_types) ? (afs!.call_to_action_types as string[])[0] : undefined) ||
    (creative.call_to_action_type as string | undefined) ||
    null

  const bodies = texts(afs?.bodies)
  const titles = texts(afs?.titles)
  const descriptions = texts(afs?.descriptions)

  const carousel = Array.isArray(link?.child_attachments)
    ? (link!.child_attachments as Record<string, string>[]).map((c, i) => ({
        carte: i + 1, titre: c.name || null, description: c.description || null,
      }))
    : null

  const copy = {
    texte_principal: (link?.message as string) || (video?.message as string) || bodies[0] || (creative.body as string) || null,
    titre: (link?.name as string) || (video?.title as string) || titles[0] || (creative.title as string) || null,
    description: (link?.description as string) || (video?.link_description as string) || descriptions[0] || null,
    cta,
    // Advantage+ rotates several variants; the extras matter for copy analysis
    variantes_texte: bodies.length > 1 ? bodies.slice(1) : null,
    variantes_titre: titles.length > 1 ? titles.slice(1) : null,
    cartes_carrousel: carousel?.length ? carousel : null,
  }

  return Object.values(copy).some(Boolean) ? copy : null
}

/**
 * Ads with their real copy, for the creative analyses.
 * Falls back to `getAds` if Meta rejects the richer field set, so a field that
 * stops being served degrades the output instead of breaking the request.
 */
export async function getAdsWithCopy(
  accountId: string,
  token: string,
  datePreset = 'last_7d',
  leadSource: LeadSource = 'total',
) {
  try {
    const data = await metaFetch(`/${accountId}/ads`, token, {
      fields: [
        'id', 'name', 'status', 'adset_id', 'campaign_id',
        `creative{${CREATIVE_COPY_FIELDS}}`,
        `insights.date_preset(${datePreset}){${INSIGHT_FIELDS_NESTED}}`,
      ].join(','),
      limit: '200',
    }, 25000)

    return (data.data || []).map((a: Record<string, unknown>) => {
      const creative = a.creative as Record<string, unknown> | undefined
      return {
        id: a.id,
        name: a.name,
        status: a.status,
        adset_id: a.adset_id,
        campaign_id: a.campaign_id,
        // The normalised copy only — the raw specs are large and redundant
        _copy: extractCopy(creative),
        _thumbnail: creative?.thumbnail_url || creative?.image_url || null,
        _isVideo: Boolean(creative?.video_id),
        _computed: a.insights ? computeKPIs((a.insights as { data: Record<string, unknown>[] }).data?.[0] || {}, leadSource) : null,
        _video: a.insights ? computeVideoMetrics(a) : null,
      }
    })
  } catch (e) {
    console.error('[meta] getAdsWithCopy a échoué, repli sur getAds :', e instanceof Error ? e.message : e)
    return getAds(accountId, token, datePreset, leadSource)
  }
}

const PRESET_DAYS: Record<string, number> = {
  last_3d: 3, last_7d: 7, last_14d: 14, last_30d: 30,
}

function ymd(d: Date) { return d.toISOString().split('T')[0] }

/**
 * The window of equal length immediately preceding `datePreset`.
 * Prompts that ask for week-over-week decline are fiction without it.
 */
export function previousWindow(datePreset = 'last_7d'): { since: string; until: string; days: number } {
  const days = PRESET_DAYS[datePreset] ?? 7
  const until = new Date(); until.setDate(until.getDate() - days - 1)
  const since = new Date(); since.setDate(since.getDate() - days * 2)
  return { since: ymd(since), until: ymd(until), days }
}

/**
 * Account totals and per-ad KPIs for the window before the current one, so the
 * model can compute a real delta instead of asserting one.
 */
export async function getPreviousPeriod(
  accountId: string,
  token: string,
  datePreset = 'last_7d',
  leadSource: LeadSource = 'total',
) {
  const { since, until, days } = previousWindow(datePreset)
  const time_range = JSON.stringify({ since, until })

  const [overviewRaw, adsRaw] = await Promise.all([
    metaFetch(`/${accountId}/insights`, token, { time_range, fields: INSIGHT_FIELDS }),
    // level=ad on the account insights edge is the reliable way to scope per-ad
    // rows to an arbitrary window
    metaFetch(`/${accountId}/insights`, token, {
      level: 'ad',
      time_range,
      fields: `ad_id,ad_name,${INSIGHT_FIELDS_NESTED}`,
      limit: '200',
    }),
  ])

  // Keep the raw delivery metrics: _computed carries no spend, impressions, CPM
  // or CTR, and without them the model reconstructs them from ratios and says
  // "estimé" through half the comparison.
  const overview = overviewRaw.data?.[0] || {}
  const ads = ((adsRaw.data || []) as Record<string, unknown>[]).map((a) => ({
    ad_id: a.ad_id,
    ad_name: a.ad_name,
    spend: a.spend,
    impressions: a.impressions,
    reach: a.reach,
    frequency: a.frequency,
    clicks: a.clicks,
    ctr: a.ctr,
    cpc: a.cpc,
    cpm: a.cpm,
    _computed: computeKPIs(a, leadSource),
  }))

  return {
    periode: `${since} → ${until} (${days} jours)`,
    overview: { ...overview, _computed: computeKPIs(overview, leadSource) },
    ads,
  }
}

/**
 * Lifetime spend and results per ad.
 *
 * The GoHighLevel pipeline counts deals over an ad's whole life, so dividing it
 * by a 30-day spend produces a cost per sale off by an order of magnitude. This
 * supplies the matching denominator.
 */
export async function getLifetimeAdSpend(
  accountId: string,
  token: string,
  leadSource: LeadSource = 'total',
): Promise<Record<string, { adName: string; spend: number; leads: number }>> {
  const out: Record<string, { adName: string; spend: number; leads: number }> = {}
  try {
    // Only spend and the lead actions are used here. The full insight set
    // repeated `spend`, which Meta rejects outright ("Field spend specified more
    // than once") — taking the whole call down for a column nobody could see.
    const data = await metaFetch(`/${accountId}/insights`, token, {
      level: 'ad',
      date_preset: 'maximum',
      fields: 'ad_id,ad_name,spend,actions',
      limit: '300',
    }, 25000)
    for (const row of (data.data || []) as Record<string, unknown>[]) {
      const id = row.ad_id as string
      if (!id) continue
      const kpis = computeKPIs(row, leadSource)
      out[id] = {
        adName: (row.ad_name as string) || id,
        spend: Number(row.spend || 0),
        leads: Number(kpis['Prospects (leads)'] || 0),
      }
    }
  } catch (e) {
    console.error('[meta] getLifetimeAdSpend a échoué :', e instanceof Error ? e.message : e)
  }
  return out
}

/**
 * Les ventilations du compte : placement, âge × genre, appareil.
 *
 * Elles existaient déjà, mais au niveau d'**une** publicité, dans
 * `/api/scalr/ad-detail` — c'est ce qui alimente la fiche créa. L'IA, elle, ne
 * les a jamais reçues : son contexte est bâti sur `getCampaigns`, `getAdSets`
 * et `getAds`, qui n'envoient aucun `breakdowns`. Elle ne voyait donc pas ce
 * que l'interface affiche déjà, et deux emplacements de la bibliothèque
 * restaient vides pour cette seule raison.
 *
 * Trois appels, en parallèle. Chaque ligne rendue par Meta est déjà un groupe :
 * on ne réagrège rien — additionner des portées ne produit pas une portée.
 *
 * Une ventilation qui échoue ne fait pas échouer l'analyse : elle revient
 * vide, et le prompt sait dire qu'il ne l'a pas.
 */
export type Ventilations = {
  placement: Record<string, unknown>[]
  ageGenre: Record<string, unknown>[]
  appareil: Record<string, unknown>[]
}

export async function getVentilations(
  accountId: string,
  token: string,
  datePreset = 'last_7d',
  leadSource: LeadSource = 'total',
): Promise<Ventilations> {
  const appel = async (breakdowns: string, cle: (r: Record<string, unknown>) => string) => {
    try {
      const data = await metaFetch(`/${accountId}/insights`, token, {
        date_preset: datePreset, breakdowns, fields: INSIGHT_FIELDS, limit: '200',
      })
      // `computeKPIs` ne rend que les indicateurs dérivés : la dépense, les
      // impressions et les clics restent sur la ligne brute. Les deux se
      // recollent ici, sinon le groupe n'a ni volume ni dénominateur.
      const lignes: Record<string, unknown>[] = data.data || []
      return lignes
        .map((r) => ({
          cle: cle(r),
          depense: Number(r.spend ?? 0),
          impressions: Number(r.impressions ?? 0),
          portee: Number(r.reach ?? 0),
          clics: Number(r.clicks ?? 0),
          ctr: r.ctr != null ? Number(r.ctr) : null,
          cpc: r.cpc != null ? Number(r.cpc) : null,
          cpm: r.cpm != null ? Number(r.cpm) : null,
          ...computeKPIs(r, leadSource),
        }))
        .filter((r) => r.depense > 0 || r.impressions > 0)
        .sort((a, b) => b.depense - a.depense)
    } catch (e) {
      console.error(`[meta] ventilation ${breakdowns} a échoué :`, e instanceof Error ? e.message : e)
      return []
    }
  }

  const [placement, ageGenre, appareil] = await Promise.all([
    // Meta rend la plateforme et la position séparément : recollées, elles
    // donnent le placement tel qu'un media buyer le nomme.
    appel('publisher_platform,platform_position', (r) =>
      [r.publisher_platform, r.platform_position].filter(Boolean).join(' · ') || 'inconnu'),
    appel('age,gender', (r) => [r.age, r.gender].filter(Boolean).join(' · ') || 'inconnu'),
    appel('impression_device', (r) => String(r.impression_device ?? 'inconnu')),
  ])
  return { placement, ageGenre, appareil }
}

export async function getDailyBreakdown(accountId: string, token: string, days = 7) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const data = await metaFetch(`/${accountId}/insights`, token, {
    time_increment: '1',
    fields: 'spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type,website_purchase_roas',
    time_range: JSON.stringify({
      since: since.toISOString().split('T')[0],
      until: new Date().toISOString().split('T')[0],
    }),
    limit: '50',
  })
  return data.data || []
}

export async function uploadImage(accountId: string, token: string, fileBuffer: Buffer, filename: string) {
  const form = new FormData()
  form.append('access_token', token)
  form.append('filename', filename)
  form.append('bytes', fileBuffer.toString('base64'))

  const res = await fetch(`${BASE_URL}/${accountId}/adimages`, {
    method: 'POST',
    body: form,
  })
  return res.json()
}

export async function uploadVideo(accountId: string, token: string, fileBuffer: Buffer, filename: string, title: string) {
  const form = new FormData()
  form.append('access_token', token)
  form.append('title', title)
  form.append('filename', filename)
  form.append('source', new Blob([new Uint8Array(fileBuffer)]))

  const res = await fetch(`https://graph-video.facebook.com/${META_API_VERSION}/${accountId}/advideos`, {
    method: 'POST',
    body: form,
  })
  return res.json()
}

export async function createAdCreative(accountId: string, token: string, creative: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}/${accountId}/adcreatives`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...creative, access_token: token }),
  })
  return res.json()
}

export async function createAd(accountId: string, token: string, ad: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}/${accountId}/ads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...ad, access_token: token }),
  })
  return res.json()
}

/**
 * La rétention vidéo d'une publicité, en valeurs brutes puis en taux.
 *
 * Les taux sont ambigus sans leur dénominateur : un hold rate rapporté aux
 * impressions et un hold rate rapporté aux lectures ne disent pas la même
 * chose, et le modèle n'a aucun moyen de deviner lequel on lui donne. Chaque
 * taux part donc avec le compte qui le fonde, et les paliers bruts restent
 * disponibles pour que la courbe puisse être tracée telle quelle.
 *
 * `null` plutôt que zéro quand la mesure n'existe pas : une créa statique n'a
 * pas un taux de complétion de 0 %, elle n'en a pas.
 */
export function computeVideoMetrics(ad: Record<string, unknown>) {
  const insightsData = (ad.insights as Record<string, unknown[]> | undefined)?.data
  const insights = (insightsData?.[0]) as Record<string, unknown> | undefined
  if (!insights) return null

  const val = (champ: string) =>
    Number((insights[champ] as { value: string }[] | undefined)?.[0]?.value || 0)

  const impressions = Number(insights.impressions || 0)
  const lectures = val('video_play_actions')
  const vues3s = extractAction(insights.actions as { action_type: string; value: string }[] | undefined, 'video_view')
  const vues15s = val('video_15_sec_watched_actions')
  const thruplays = val('video_thruplay_watched_actions')
  const p25 = val('video_p25_watched_actions')
  const p50 = val('video_p50_watched_actions')
  const p75 = val('video_p75_watched_actions')
  const p95 = val('video_p95_watched_actions')
  const p100 = val('video_p100_watched_actions')
  const dureeMoyenne = val('video_avg_time_watched_actions')

  // Aucun signal vidéo : la publicité est un statique, ou Meta n'a rien remonté.
  if (!lectures && !vues3s && !p25 && !p100) return null

  const taux = (part: number, tout: number) => (tout > 0 ? Math.round((part / tout) * 1000) / 10 : null)
  /**
   * Les paliers se rapportent aux **vues de 3 s**, pas aux lectures.
   *
   * `video_play_actions` compte tout démarrage, y compris ceux d'un scroll qui
   * ne s'arrête pas : sur ce compte, 385 847 lectures pour 65 412 vues de 3 s.
   * Rapporter le premier quart aux lectures donnait 5,3 % là où la convention
   * du métier — celle des seuils « fort = 70 % » — en lit 31,4 %.
   */
  const base = vues3s || lectures

  return {
    // Les paliers, tels que Meta les compte
    lectures, vues3s, vues15s, thruplays, p25, p50, p75, p95, p100,
    dureeMoyenneVue: dureeMoyenne || null,

    // Les taux, chacun avec le dénominateur qui le définit
    hookRate: taux(vues3s, impressions),
    hookRateDenominateur: `${vues3s} vues de 3 s sur ${impressions} impressions`,
    holdRate: taux(p25, base),
    holdRateDenominateur: `${p25} au premier quart sur ${base} vues de 3 s`,
    completionRate: taux(p100, base),
    completionRateDenominateur: `${p100} jusqu'au bout sur ${base} vues de 3 s`,

    // La courbe, prête à être lue d'un bloc
    retention: {
      '25%': taux(p25, base), '50%': taux(p50, base),
      '75%': taux(p75, base), '95%': taux(p95, base), '100%': taux(p100, base),
    },
  }
}
