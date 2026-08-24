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

const INSIGHT_FIELDS = [
  'spend', 'impressions', 'reach', 'frequency',
  'clicks', 'unique_clicks', 'ctr', 'unique_ctr', 'cpc', 'cpm',
  'outbound_clicks', 'outbound_clicks_ctr', 'cost_per_outbound_click',
  'actions', 'action_values', 'cost_per_action_type',
  'website_purchase_roas',
].join(',')

const INSIGHT_FIELDS_NESTED = [
  'spend', 'impressions', 'reach', 'frequency',
  'clicks', 'unique_clicks', 'ctr', 'unique_ctr', 'cpc', 'cpm',
  'outbound_clicks', 'outbound_clicks_ctr',
  'actions', 'action_values', 'cost_per_action_type',
  'website_purchase_roas',
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

export async function getCampaigns(accountId: string, token: string, datePreset = 'last_7d', leadSource: LeadSource = 'total') {
  const data = await metaFetch(`/${accountId}/campaigns`, token, {
    fields: [
      'id', 'name', 'status', 'objective', 'daily_budget', 'lifetime_budget',
      `insights{${INSIGHT_FIELDS_NESTED}}`,
    ].join(','),
    date_preset: datePreset,
    limit: '50',
  })
  return (data.data || []).map((c: Record<string, unknown>) => ({
    ...c,
    _computed: c.insights ? computeKPIs((c.insights as {data: Record<string, unknown>[]}).data?.[0] || {}, leadSource) : null,
  }))
}

export async function getAdSets(accountId: string, token: string, datePreset = 'last_7d', leadSource: LeadSource = 'total') {
  const data = await metaFetch(`/${accountId}/adsets`, token, {
    fields: [
      'id', 'name', 'status', 'campaign_id', 'daily_budget', 'optimization_goal',
      'targeting', 'learning_stage_info',
      `insights{${INSIGHT_FIELDS_NESTED}}`,
    ].join(','),
    date_preset: datePreset,
    limit: '100',
  })
  return (data.data || []).map((a: Record<string, unknown>) => ({
    ...a,
    _computed: a.insights ? computeKPIs((a.insights as {data: Record<string, unknown>[]}).data?.[0] || {}, leadSource) : null,
  }))
}

export async function getAds(accountId: string, token: string, datePreset = 'last_7d', leadSource: LeadSource = 'total') {
  const data = await metaFetch(`/${accountId}/ads`, token, {
    fields: [
      'id', 'name', 'status', 'adset_id', 'campaign_id',
      'creative{id,name,title,body,image_url,thumbnail_url,video_id}',
      `insights{${INSIGHT_FIELDS_NESTED}}`,
    ].join(','),
    date_preset: datePreset,
    limit: '200',
  })
  return (data.data || []).map((a: Record<string, unknown>) => ({
    ...a,
    _computed: a.insights ? computeKPIs((a.insights as {data: Record<string, unknown>[]}).data?.[0] || {}, leadSource) : null,
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
        `insights{${INSIGHT_FIELDS_NESTED}}`,
      ].join(','),
      date_preset: datePreset,
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

export function computeVideoMetrics(ad: Record<string, unknown>) {
  const insightsData = (ad.insights as Record<string, unknown[]> | undefined)?.data
  const insights = (insightsData?.[0]) as Record<string, unknown> | undefined
  if (!insights) return null

  const impressions = Number(insights.impressions || 0)
  const video3s = (insights.video_3_sec_watched_actions as { value: string }[])?.[0]?.value
  const videoP25 = (insights.video_p25_watched_actions as { value: string }[])?.[0]?.value
  const videoP100 = (insights.video_p100_watched_actions as { value: string }[])?.[0]?.value

  const hookRate = impressions > 0 ? (Number(video3s || 0) / impressions) * 100 : null
  const holdRate = video3s ? (Number(videoP25 || 0) / Number(video3s)) * 100 : null
  const completionRate = impressions > 0 ? (Number(videoP100 || 0) / impressions) * 100 : null

  return { hookRate, holdRate, completionRate }
}
