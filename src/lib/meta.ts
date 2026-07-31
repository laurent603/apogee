const META_API_VERSION = process.env.META_API_VERSION || 'v21.0'
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

export async function metaFetch(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set('access_token', token)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString())
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err?.error?.message || 'Meta API error')
  }
  return res.json()
}

export async function getAdAccounts(token: string) {
  const data = await metaFetch('/me/adaccounts', token, {
    fields: 'id,name,currency,timezone_name,account_status,spend_cap,amount_spent',
    limit: '50',
  })
  return data.data || []
}

export async function getAccountOverview(accountId: string, token: string, datePreset = 'last_7d') {
  const data = await metaFetch(`/${accountId}/insights`, token, {
    date_preset: datePreset,
    fields: [
      'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm',
      'reach', 'frequency', 'actions', 'cost_per_action_type', 'website_purchase_roas',
      'action_values', 'conversions', 'cost_per_conversion',
    ].join(','),
  })
  return data.data?.[0] || {}
}

export async function getCampaigns(accountId: string, token: string, datePreset = 'last_7d') {
  const data = await metaFetch(`/${accountId}/campaigns`, token, {
    fields: [
      'id', 'name', 'status', 'objective', 'daily_budget', 'lifetime_budget',
      'insights{spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type,website_purchase_roas,frequency}',
    ].join(','),
    date_preset: datePreset,
    limit: '50',
  })
  return data.data || []
}

export async function getAdSets(accountId: string, token: string, datePreset = 'last_7d') {
  const data = await metaFetch(`/${accountId}/adsets`, token, {
    fields: [
      'id', 'name', 'status', 'campaign_id', 'daily_budget', 'optimization_goal',
      'targeting', 'learning_stage_info',
      'insights{spend,impressions,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type,reach}',
    ].join(','),
    date_preset: datePreset,
    limit: '100',
  })
  return data.data || []
}

export async function getAds(accountId: string, token: string, datePreset = 'last_7d') {
  const data = await metaFetch(`/${accountId}/ads`, token, {
    fields: [
      'id', 'name', 'status', 'adset_id', 'campaign_id', 'creative{id,name,title,body,image_url,thumbnail_url,video_id}',
      'insights{spend,impressions,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type,reach}',
    ].join(','),
    date_preset: datePreset,
    limit: '200',
  })
  return data.data || []
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
