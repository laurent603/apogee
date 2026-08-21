import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { metaFetch } from '@/lib/meta'
import { prisma } from '@/lib/db'

/* ── Types matching the client payload ──────────────────────────────────────── */

interface LaunchAsset {
  id: string
  ratio: string | null
  hash: string | null
  videoId: string | null
}
interface LaunchAdGroup {
  adName: string
  assets: LaunchAsset[]
}
interface LaunchTreeNode {
  adsetName: string
  adGroups: LaunchAdGroup[]
  _adTemplateOverride?: LaunchAd | null
}
interface LaunchCampaign {
  id: string; name: string; status: string; objective: string
  daily_budget?: string; budget_rebalance_flag?: boolean; _isNew?: boolean
}
interface LaunchAdset {
  id: string; name: string; status: string; optimization_goal: string
  daily_budget?: string
  targeting?: {
    age_min?: number; age_max?: number; genders?: number[]
    geo_locations?: { countries?: string[] }
    custom_audiences?: { id: string; name: string }[]
  }
  promoted_object?: { pixel_id?: string; custom_event_type?: string; page_id?: string }
  _isNew?: boolean
}
interface LaunchAd {
  id: string; name: string; _isNew?: boolean; _pageId?: string
  creative?: { object_story_spec?: { page_id?: string } }
  _parsed: { primary_text: string; headline: string; description: string; cta_type: string; destination_url: string; lead_gen_form_id?: string }
}
interface LaunchBody {
  accountId: string
  campaign: LaunchCampaign | null
  adsetTemplate: LaunchAdset | null
  adTemplate: LaunchAd | null
  treeNodes: LaunchTreeNode[]
  testStructure: string
  launchStatus: string
  launchDate: string
  launchTime: string
  budget: string
}

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

// Map CreateAdsetModal optimization labels → valid Meta API values
const OPT_GOAL_MAP: Record<string, string> = {
  MAXIMIZE_NUMBER_OF_CONVERSIONS: 'OFFSITE_CONVERSIONS',
  MAXIMIZE_CONVERSION_VALUE: 'VALUE',
  MAXIMIZE_NUMBER_OF_LEADS: 'LEAD_GENERATION',
  MAXIMIZE_NUMBER_OF_LINK_CLICKS: 'LINK_CLICKS',
  MAXIMIZE_REACH: 'REACH',
}

// Optimization goals that need a pixel promoted_object
const NEEDS_PIXEL = new Set(['OFFSITE_CONVERSIONS', 'VALUE'])
// Optimization goals that need a page promoted_object
const NEEDS_PAGE = new Set(['LEAD_GENERATION', 'PAGE_LIKES'])

function metaError(data: Record<string, unknown>): string {
  const e = data.error as Record<string, unknown> | undefined
  if (!e) return JSON.stringify(data)
  const parts = [e.message as string]
  if (e.error_user_msg) parts.push(e.error_user_msg as string)
  if (e.error_subcode) parts.push(`(subcode: ${e.error_subcode})`)
  return parts.filter(Boolean).join(' — ')
}

// Strip empty arrays and deprecated fields from Meta targeting
function cleanTargeting(t: LaunchAdset['targeting']): Record<string, unknown> {
  if (!t) return { geo_locations: { countries: ['FR'] }, age_min: 18, age_max: 65 }
  const out: Record<string, unknown> = {}
  if (t.geo_locations) out.geo_locations = t.geo_locations
  if (t.age_min) out.age_min = t.age_min
  if (t.age_max) out.age_max = t.age_max
  if (t.genders) out.genders = t.genders
  // Only include custom_audiences if non-empty — empty array causes Invalid parameter
  if (t.custom_audiences && t.custom_audiences.length > 0) {
    out.custom_audiences = t.custom_audiences.map(a => ({ id: a.id }))
  }
  return out
}

async function metaPost(path: string, token: string, body: Record<string, unknown>) {
  const res = await fetch(`https://graph.facebook.com/v21.0${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
  })
  return res.json() as Promise<Record<string, unknown>>
}

/* ── Handler ─────────────────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return new Response('data: ❌ Non authentifié\n\n', { status: 401, headers: { 'Content-Type': 'text/event-stream' } })
  }
  const token = session.accessToken as string

  let body: LaunchBody
  try {
    body = await req.json()
  } catch {
    return new Response('data: ❌ Payload invalide\n\n', { status: 400, headers: { 'Content-Type': 'text/event-stream' } })
  }

  const { accountId, campaign, adsetTemplate, adTemplate, treeNodes, testStructure, launchStatus, launchDate, launchTime, budget } = body

  if (!accountId) {
    return new Response('data: ❌ accountId manquant\n\n', { status: 400, headers: { 'Content-Type': 'text/event-stream' } })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const logLines: string[] = []
      let launchCampaignId: string | undefined
      let launchAdsetCount = 0
      let launchAdCount = 0
      let historyStatus = 'success'

      function send(msg: string) {
        logLines.push(msg)
        controller.enqueue(encoder.encode(`data: ${msg}\n\n`))
      }

      // Instagram identity for the page, required as soon as a creative targets
      // instagram_positions (Meta error subcode 1772103). Read-only lookup: the
      // linked IG business account first, then an existing page-backed account.
      // Never creates one — a missing identity degrades to Facebook-only routing.
      const igAccountCache = new Map<string, string | null>()
      async function getInstagramUserId(pageId: string): Promise<string | null> {
        if (igAccountCache.has(pageId)) return igAccountCache.get(pageId)!
        let igId: string | null = null
        try {
          const info = await metaFetch(`/${pageId}`, token, { fields: 'instagram_business_account{id}' })
          igId = (info?.instagram_business_account as { id?: string } | undefined)?.id || null
        } catch { /* fall through */ }
        if (!igId) {
          try {
            const pbia = await metaFetch(`/${pageId}/page_backed_instagram_accounts`, token, { fields: 'id' })
            igId = ((pbia?.data as { id?: string }[] | undefined)?.[0]?.id) || null
          } catch { /* fall through */ }
        }
        igAccountCache.set(pageId, igId)
        return igId
      }

      try {
        /* ── 1. Campaign ───────────────────────────────────────────────────── */
        const budgetCents = Math.round(Number(budget || 50) * 100)
        // CBO: explicit flag OR campaign-level budget on imported campaign
        const isCBO = !!(campaign?.budget_rebalance_flag) || !!campaign?.daily_budget

        let campaignId: string
        if (campaign?._isNew) {
          send(`Création de la campagne "${campaign.name}"...`)
          // Map legacy objectives to OUTCOME_* format (required for API v21+)
          const OBJECTIVE_MAP: Record<string, string> = {
            LEAD_GENERATION: 'OUTCOME_LEADS',
            CONVERSIONS: 'OUTCOME_SALES',
            LINK_CLICKS: 'OUTCOME_TRAFFIC',
            BRAND_AWARENESS: 'OUTCOME_AWARENESS',
            REACH: 'OUTCOME_AWARENESS',
            VIDEO_VIEWS: 'OUTCOME_ENGAGEMENT',
            POST_ENGAGEMENT: 'OUTCOME_ENGAGEMENT',
            PAGE_LIKES: 'OUTCOME_ENGAGEMENT',
            APP_INSTALLS: 'OUTCOME_APP_PROMOTION',
          }
          const rawObjective = campaign.objective || 'OUTCOME_SALES'
          const mappedObjective = OBJECTIVE_MAP[rawObjective] || rawObjective
          const campaignBody: Record<string, unknown> = {
            name: campaign.name,
            objective: mappedObjective,
            status: campaign.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
            special_ad_categories: [],
          }
          if (isCBO) {
            // CBO: budget at campaign level (budget_rebalance_flag deprecated in v7+)
            campaignBody.daily_budget = String(budgetCents)
          } else {
            // ABO: budget at adset level
            campaignBody.is_adset_budget_sharing_enabled = false
          }
          // Explicitly declare bid strategy — Meta may default to LOWEST_COST_WITH_BID_CAP
          // for some OUTCOME_* campaign types, causing adset creation to fail (subcode 1815857)
          campaignBody.bid_strategy = 'LOWEST_COST_WITHOUT_CAP'
          console.log('[launch] campaign body:', JSON.stringify(campaignBody))
          const data = await metaPost(`/${accountId}/campaigns`, token, campaignBody)
          if (data.error) throw new Error(`Campagne : ${metaError(data)}`)
          campaignId = data.id as string
          send(`✓ Campagne créée (id: ${campaignId})`)
        } else if (campaign?.id) {
          campaignId = campaign.id
          send(`✓ Campagne : "${campaign.name}"`)
        } else {
          throw new Error('Aucune campagne sélectionnée')
        }

        launchCampaignId = campaignId

        /* ── 2. Determine adset status + start_time ────────────────────────── */
        let adsetStatus = 'PAUSED'
        let startTime: string | undefined
        if (launchStatus === 'LIVE_NOW') adsetStatus = 'ACTIVE'
        if (launchStatus === 'SCHEDULED_LIVE') { adsetStatus = 'ACTIVE'; startTime = launchDate && launchTime ? `${launchDate}T${launchTime}:00` : undefined }
        if (launchStatus === 'SCHEDULED_PAUSED') { adsetStatus = 'PAUSED'; startTime = launchDate && launchTime ? `${launchDate}T${launchTime}:00` : undefined }

        // Lead gen objective check (used both for adset destination_type and ad creation)
        const isLeadGenObjective = campaign?.objective === 'OUTCOME_LEADS' || campaign?.objective === 'LEAD_GENERATION'

        /* ── 3. For each tree node: adset + ads ────────────────────────────── */

        // In "insert-in-adset" mode with an existing adset template, reuse the
        // existing adset ID for every node instead of creating new ones.
        const useExistingAdset =
          testStructure === 'insert-in-adset' &&
          !adsetTemplate?._isNew &&
          !!adsetTemplate?.id

        for (const node of treeNodes) {
          let adsetId: string

          if (useExistingAdset) {
            // ── Reuse existing adset ──────────────────────────────────────────
            adsetId = adsetTemplate!.id
            send(`✓ Insertion dans l'adset existant : "${adsetTemplate!.name}" (id: ${adsetId})`)
          } else {
            // ── Create new adset ──────────────────────────────────────────────
            send(`Création de l'adset "${node.adsetName}"...`)

            const rawOptGoal = adsetTemplate?.optimization_goal || 'OFFSITE_CONVERSIONS'
            let optimizationGoal = OPT_GOAL_MAP[rawOptGoal] ?? rawOptGoal
            // For OUTCOME_LEADS campaigns, force LEAD_GENERATION (QUALITY_LEAD requires special account enablement)
            if (isLeadGenObjective) {
              optimizationGoal = 'LEAD_GENERATION'
            }

            const adsetRaw = adsetTemplate as (LaunchAdset & Record<string, unknown>) | null
            const billingEvent = (!adsetTemplate?._isNew && adsetRaw?.billing_event)
              ? String(adsetRaw.billing_event)
              : 'IMPRESSIONS'

            const adsetBody: Record<string, unknown> = {
              name: node.adsetName,
              campaign_id: campaignId,
              status: adsetStatus,
              optimization_goal: optimizationGoal,
              billing_event: billingEvent,
              targeting: cleanTargeting(adsetTemplate?.targeting),
            }

            // OUTCOME_LEADS / LEAD_GENERATION adsets must declare ON_AD destination
            if (isLeadGenObjective) {
              adsetBody.destination_type = 'ON_AD'
            }

            if (!isCBO) {
              const rawBudget = adsetTemplate?.daily_budget
              const adsetBudgetCents = rawBudget
                ? (adsetTemplate?._isNew
                    ? Math.round(Number(rawBudget) * 100)
                    : Number(rawBudget))
                : budgetCents
              adsetBody.daily_budget = String(adsetBudgetCents)
            }

            if (NEEDS_PIXEL.has(optimizationGoal) && adsetTemplate?.promoted_object?.pixel_id) {
              adsetBody.promoted_object = {
                pixel_id: adsetTemplate.promoted_object.pixel_id,
                custom_event_type: adsetTemplate.promoted_object.custom_event_type || 'PURCHASE',
              }
            } else if (NEEDS_PAGE.has(optimizationGoal) || isLeadGenObjective) {
              // page_id cascade: per-adset override → global ad template → adset template promoted_object
              const adsetPageId = node._adTemplateOverride?._pageId
                || adTemplate?._pageId
                || adsetTemplate?.promoted_object?.page_id
                || ''
              if (adsetPageId) adsetBody.promoted_object = { page_id: adsetPageId }
            }

            if (startTime) adsetBody.start_time = startTime

            console.log('[launch] adset body:', JSON.stringify(adsetBody))
            const adsetData = await metaPost(`/${accountId}/adsets`, token, adsetBody)
            if (adsetData.error) throw new Error(`Adset : ${metaError(adsetData)}`)
            adsetId = adsetData.id as string
            send(`✓ Adset créé : "${node.adsetName}" (id: ${adsetId})`)
            launchAdsetCount++
          }

          /* Create ads in this adset */
          const effectiveAdTemplate = node._adTemplateOverride ?? adTemplate
          for (const ag of node.adGroups) {
            const imageAsset = ag.assets.find(a => a.hash)
            const videoAsset = ag.assets.find(a => a.videoId)

            if (!imageAsset?.hash && !videoAsset?.videoId) {
              send(`⚠ "${ag.adName}" : aucun asset uploadé — ad ignorée`)
              continue
            }

            // page_id cascade: _pageId → creative.object_story_spec.page_id → API lookup
            let pageId = effectiveAdTemplate?._pageId || effectiveAdTemplate?.creative?.object_story_spec?.page_id || ''
            if (!pageId && effectiveAdTemplate?.id) {
              try {
                const adInfo = await metaFetch(`/${effectiveAdTemplate.id}`, token, {
                  fields: 'creative{object_story_spec{page_id}}',
                })
                pageId = (adInfo?.creative as { object_story_spec?: { page_id?: string } } | undefined)?.object_story_spec?.page_id || ''
              } catch {}
            }
            if (!pageId) {
              send(`⚠ "${ag.adName}" : page Facebook manquante — configurez l'ad avec une page`)
              continue
            }

            // DEBUG: log what effectiveAdTemplate._parsed looks like when received
            console.log('[launch] effectiveAdTemplate._parsed:', JSON.stringify(effectiveAdTemplate?._parsed))
            console.log('[launch] effectiveAdTemplate.id:', effectiveAdTemplate?.id, '| _isNew:', effectiveAdTemplate?._isNew)

            // Re-fetch creative copy from Meta if primary_text is missing
            // (happens with minimal-fields fallback OR Advantage+ creative with asset_feed_spec)
            let resolvedParsed = effectiveAdTemplate?._parsed
            if (!resolvedParsed?.primary_text && effectiveAdTemplate?.id && !effectiveAdTemplate._isNew) {
              try {
                // Step 1: get creative ID via ad
                const adInfo = await metaFetch(`/${effectiveAdTemplate.id}`, token, {
                  fields: 'creative{id,object_story_spec{page_id,link_data{message,name,description,link,call_to_action{type,value}},video_data{message,title,link_description,link,call_to_action{type,value}}}}',
                })
                let cr = adInfo?.creative as Record<string, unknown> | undefined
                const oss2 = cr?.object_story_spec as Record<string, unknown> | undefined
                const ld2 = oss2?.link_data as Record<string, unknown> | undefined
                const vd2 = oss2?.video_data as Record<string, unknown> | undefined
                const ossCta2 = (ld2?.call_to_action || vd2?.call_to_action) as { type?: string; value?: Record<string, string> } | undefined
                if (!pageId) pageId = (oss2?.page_id as string | undefined) || ''
                let primaryText2 = (ld2?.message || vd2?.message || '') as string
                let headline2 = (ld2?.name || vd2?.title || '') as string
                let description2 = (ld2?.description || vd2?.link_description || '') as string
                let ctaType2 = (ossCta2?.type || '') as string
                let destUrl2 = (ld2?.link || vd2?.link || ossCta2?.value?.link || '') as string
                let leadFormId2 = (ossCta2?.value?.lead_gen_form_id || '') as string
                // Step 2: Advantage+ creative — fetch creative directly for asset_feed_spec
                if (!primaryText2 && cr?.id) {
                  try {
                    const crDirect = await metaFetch(`/${cr.id}`, token, {
                      fields: 'id,body,title,asset_feed_spec,object_story_spec',
                    })
                    cr = { ...cr, ...crDirect }
                    const afs = crDirect.asset_feed_spec as Record<string, unknown> | undefined
                    const afsBodies = (afs?.bodies as Array<{ text: string }> | undefined) || []
                    const afsTitles = (afs?.titles as Array<{ text: string }> | undefined) || []
                    const afsDescs = (afs?.descriptions as Array<{ text: string }> | undefined) || []
                    const afsCtas = (afs?.call_to_action_types as string[] | undefined) || []
                    const afsCTAs = (afs?.call_to_actions as Array<{ type: string; value?: { lead_gen_form_id?: string; link?: string } }> | undefined) || []
                    const afsLinks = (afs?.link_urls as Array<{ website_url: string }> | undefined) || []
                    primaryText2 = afsBodies[0]?.text || (crDirect.body as string) || ''
                    headline2 = afsTitles[0]?.text || (crDirect.title as string) || ''
                    description2 = afsDescs[0]?.text || ''
                    ctaType2 = afsCtas[0] || ''
                    destUrl2 = afsCTAs[0]?.value?.link || afsLinks[0]?.website_url || ''
                    leadFormId2 = afsCTAs[0]?.value?.lead_gen_form_id || ''
                  } catch { /* keep empty */ }
                }
                resolvedParsed = {
                  primary_text: (primaryText2 || resolvedParsed?.primary_text || '') as string,
                  headline: (headline2 || resolvedParsed?.headline || '') as string,
                  description: (description2 || resolvedParsed?.description || '') as string,
                  cta_type: (ctaType2 || resolvedParsed?.cta_type || 'LEARN_MORE') as string,
                  destination_url: (destUrl2 || resolvedParsed?.destination_url || '') as string,
                  lead_gen_form_id: (leadFormId2 || resolvedParsed?.lead_gen_form_id || '') as string,
                }
                console.log('[launch] re-fetched parsed:', JSON.stringify(resolvedParsed))
              } catch (e) {
                console.error('[launch] re-fetch creative error:', e)
              }
            }

            const primaryText = resolvedParsed?.primary_text || 'Découvrez notre offre'
            const headline = resolvedParsed?.headline || ''
            const description = resolvedParsed?.description || ''
            const ctaType = resolvedParsed?.cta_type || 'LEARN_MORE'
            let destinationUrl = resolvedParsed?.destination_url || ''
            // Only use lead_gen_form_id for lead gen campaigns — ignore for Sales/Traffic
            let leadGenFormId = isLeadGenObjective ? (resolvedParsed?.lead_gen_form_id || '') : ''

            // For lead gen campaigns: fail with actionable message if form ID still missing
            if (!leadGenFormId && isLeadGenObjective) {
              throw new Error(`Campagne prospects : Lead Gen Form ID manquant pour "${ag.adName}". Sélectionnez un formulaire dans le panneau Campaign Structure.`)
            }

            // For lead gen form ads, link_data.link must be an external URL (not Facebook)
            // Auto-fetch the page's website URL as fallback if no destination URL was provided
            if (!destinationUrl && leadGenFormId && pageId) {
              try {
                const pagesData = await metaFetch('/me/accounts', token, { fields: 'id,website', limit: '50' })
                const pg = (pagesData.data || []).find((p: { id: string; website?: string }) => p.id === pageId)
                if (pg?.website) destinationUrl = pg.website as string
              } catch { /* ignore — will fail at creative creation if still empty */ }
            }
            if (!destinationUrl && isLeadGenObjective && leadGenFormId) {
              throw new Error(`Campagne prospects "${ag.adName}" : URL du site web manquante. Renseignez-la dans la section "Site web" du panneau Campaign Structure.`)
            }

            console.log('[launch] leadGenFormId:', leadGenFormId, '| ctaType:', ctaType, '| destinationUrl:', destinationUrl)

            // CTA value: lead gen form takes priority over destination URL
            const ctaValue: Record<string, string> = leadGenFormId
              ? { lead_gen_form_id: leadGenFormId }
              : { link: destinationUrl || 'https://example.com' }

            // Separate assets by format (vertical 9:16 = story, everything else = feed)
            const isVertical = (r: string | null) => r === '9:16'
            const videoAssets = ag.assets.filter(a => a.videoId)
            const imageAssets = ag.assets.filter(a => a.hash)
            const feedVideo = videoAssets.find(a => !isVertical(a.ratio))
            const storyVideo = videoAssets.find(a => isVertical(a.ratio))
            const feedImage = imageAssets.find(a => !isVertical(a.ratio))
            const storyImage = imageAssets.find(a => isVertical(a.ratio))

            // Poll until Meta video is ready and return thumbnail URL
            async function waitForVideo(videoId: string): Promise<string | undefined> {
              for (let i = 0; i < 15; i++) {
                const info = await metaFetch(`/${videoId}`, token, { fields: 'status,picture' })
                const vs = (info.status as Record<string, unknown> | undefined)?.video_status as string | undefined
                if (vs === 'ready' || (!vs && info.picture)) return info.picture as string | undefined
                await new Promise(r => setTimeout(r, 2000))
              }
            }

            // Build object_story_spec for a single video
            async function buildVideoSpec(videoId: string): Promise<Record<string, unknown>> {
              let thumb: string | undefined
              try { thumb = await waitForVideo(videoId) } catch { /* proceed */ }
              return {
                page_id: pageId,
                video_data: {
                  video_id: videoId,
                  message: primaryText,
                  title: headline,
                  link_description: description,
                  call_to_action: { type: ctaType, value: ctaValue },
                  ...(thumb ? { image_url: thumb } : {}),
                },
              }
            }

            // Build object_story_spec for a single image
            function buildImageSpec(hash: string): Record<string, unknown> {
              return {
                page_id: pageId,
                link_data: {
                  image_hash: hash,
                  link: destinationUrl || 'https://example.com',
                  message: primaryText,
                  name: headline,
                  description,
                  call_to_action: { type: ctaType, value: ctaValue },
                },
              }
            }

            // Create one creative + one ad for a given spec
            async function postAd(spec: Record<string, unknown>, adName: string) {
              send(`Création du créatif "${adName}"...`)
              const creativeBody: Record<string, unknown> = {
                name: adName,
                object_story_spec: spec,
                degrees_of_freedom_spec: {
                  creative_features_spec: { standard_enhancements: { enroll_status: 'OPT_OUT' } },
                },
                ...(leadGenFormId ? { destination_type: 'ON_AD' } : {}),
              }
              console.log('[launch] creative body:', JSON.stringify(creativeBody))
              const creativeData = await metaPost(`/${accountId}/adcreatives`, token, creativeBody)
              if (creativeData.error) throw new Error(`Créatif "${adName}" : ${metaError(creativeData)}`)
              const creativeId = creativeData.id as string
              const adData = await metaPost(`/${accountId}/ads`, token, {
                name: adName,
                adset_id: adsetId,
                creative: { creative_id: creativeId },
                status: adsetStatus,
                ...(leadGenFormId ? { destination_type: 'ON_AD' } : {}),
              })
              if (adData.error) throw new Error(`Ad "${adName}" : ${metaError(adData)}`)
              send(`✓ Ad créée : "${adName}"`)
              launchAdCount++
            }

            // Placement positions accepted inside asset_customization_rules.customization_spec
            const FB_FEED_POS = ['feed', 'marketplace', 'video_feeds', 'right_hand_column', 'search', 'instream_video']
            const FB_STORY_POS = ['story', 'facebook_reels']
            const IG_FEED_POS = ['stream', 'explore', 'explore_home', 'profile_feed']
            const IG_STORY_POS = ['story', 'reels']

            const FEED_LABEL = 'apogee_feed'
            const STORY_LABEL = 'apogee_story'

            // Rules binding each labelled asset to its placements. Without these,
            // Meta treats the assets as a dynamic-creative pool and rotates them
            // across every placement — which is why a feed crea showed up in Stories.
            // Instagram positions are only claimed when an IG identity exists,
            // otherwise Meta rejects the ad with subcode 1772103.
            function buildCustomizationRules(labelKey: 'video_label' | 'image_label', withInstagram: boolean) {
              const platforms = withInstagram ? ['facebook', 'instagram'] : ['facebook']
              return [
                {
                  customization_spec: {
                    publisher_platforms: platforms,
                    facebook_positions: FB_FEED_POS,
                    ...(withInstagram ? { instagram_positions: IG_FEED_POS } : {}),
                  },
                  [labelKey]: { name: FEED_LABEL },
                },
                {
                  customization_spec: {
                    publisher_platforms: platforms,
                    facebook_positions: FB_STORY_POS,
                    ...(withInstagram ? { instagram_positions: IG_STORY_POS } : {}),
                  },
                  [labelKey]: { name: STORY_LABEL },
                },
              ]
            }

            // Create the multi-format creative + ad.
            // Meta's rejection of asset_feed_spec surfaces as an opaque "(#3) Application
            // does not have the capability" regardless of cause, so we probe several
            // documented body shapes in order and report which one Meta accepted.
            async function postMultiFormatAd(
              assets: { type: 'video'; videoId: string; label: string }[] | { type: 'image'; hash: string; label: string }[],
              adName: string
            ) {
              send(`Création du créatif "${adName}"...`)

              const isVideo = (assets[0] as { type: string }).type === 'video'
              const adFormat = isVideo ? 'SINGLE_VIDEO' : 'SINGLE_IMAGE'
              const labelKey = isVideo ? 'video_label' : 'image_label'

              // link_urls is required by asset customization even for lead gen (subcode 1885800)
              const linkUrls = [{ website_url: destinationUrl || 'https://example.com' }]
              const afsCta = leadGenFormId
                ? { call_to_actions: [{ type: ctaType || 'SIGN_UP', value: { lead_gen_form_id: leadGenFormId, link: destinationUrl || 'https://example.com' } }], link_urls: linkUrls }
                : { call_to_action_types: [ctaType || 'LEARN_MORE'], link_urls: linkUrls }

              const copy = {
                bodies: [{ text: primaryText }],
                ...(headline ? { titles: [{ text: headline }] } : {}),
                ...(description ? { descriptions: [{ text: description }] } : {}),
                ...afsCta,
              }

              // Poll videos once — probing must not re-run the 30s wait per candidate
              const thumbs = isVideo
                ? await Promise.all((assets as { videoId: string }[]).map(a => waitForVideo(a.videoId).catch(() => undefined)))
                : []

              function assetList(withLabels: boolean) {
                if (isVideo) {
                  return {
                    videos: (assets as { videoId: string; label: string }[]).map((a, i) => ({
                      video_id: a.videoId,
                      ...(thumbs[i] ? { thumbnail_url: thumbs[i] } : {}),
                      ...(withLabels ? { adlabels: [{ name: a.label }] } : {}),
                    })),
                  }
                }
                return {
                  images: (assets as { hash: string; label: string }[]).map(a => ({
                    hash: a.hash,
                    ...(withLabels ? { adlabels: [{ name: a.label }] } : {}),
                  })),
                }
              }

              const leadGen = leadGenFormId ? { destination_type: 'ON_AD' } : {}

              // Claiming instagram_positions requires an IG identity on the creative
              const igUserId = await getInstagramUserId(pageId)
              if (!igUserId) {
                send(`⚠ Aucun compte Instagram rattaché à la page — routage limité à Facebook`)
              }
              const storySpec = {
                page_id: pageId,
                ...(igUserId ? { instagram_user_id: igUserId } : {}),
              }

              // This tool is for creative testing: keep Meta from altering the assets
              const NO_ADVANTAGE = {
                degrees_of_freedom_spec: {
                  creative_features_spec: {
                    standard_enhancements: { enroll_status: 'OPT_OUT' },
                  },
                },
              }

              // Ordered by preference: first that Meta accepts wins.
              const candidates: { label: string; routed: boolean; body: Record<string, unknown> }[] = [
                ...(igUserId ? [{
                  label: 'routage Facebook + Instagram',
                  routed: true,
                  body: {
                    name: adName,
                    object_story_spec: storySpec,
                    asset_feed_spec: {
                      ...assetList(true), ...copy,
                      ad_formats: [adFormat],
                      asset_customization_rules: buildCustomizationRules(labelKey, true),
                    },
                    ...NO_ADVANTAGE,
                    ...leadGen,
                  },
                }] : []),
                {
                  label: 'routage Facebook uniquement',
                  routed: true,
                  body: {
                    name: adName,
                    object_story_spec: storySpec,
                    asset_feed_spec: {
                      ...assetList(true), ...copy,
                      ad_formats: [adFormat],
                      asset_customization_rules: buildCustomizationRules(labelKey, false),
                    },
                    ...NO_ADVANTAGE,
                    ...leadGen,
                  },
                },
                {
                  label: 'sans routage par placement',
                  routed: false,
                  body: {
                    name: adName,
                    object_story_spec: storySpec,
                    asset_feed_spec: { ...assetList(false), ...copy, ad_formats: [adFormat] },
                    ...NO_ADVANTAGE,
                    ...leadGen,
                  },
                },
              ]

              // A creative Meta accepts can still be refused at the ad step (e.g.
              // subcode 1772103 on a missing IG identity), so a candidate only counts
              // as successful once the ad itself is created.
              const failures: string[] = []
              let placed = false

              for (const c of candidates) {
                console.log(`[launch] creative candidate "${c.label}":`, JSON.stringify(c.body))
                const creativeData = await metaPost(`/${accountId}/adcreatives`, token, c.body)
                if (creativeData.error) {
                  const msg = metaError(creativeData)
                  failures.push(`${c.label} (créatif) → ${msg}`)
                  send(`⚠ Variante « ${c.label} » refusée au créatif : ${msg}`)
                  continue
                }

                const adData = await metaPost(`/${accountId}/ads`, token, {
                  name: adName, adset_id: adsetId, creative: { creative_id: creativeData.id }, status: adsetStatus,
                  ...(leadGenFormId ? { destination_type: 'ON_AD' } : {}),
                })
                if (adData.error) {
                  const msg = metaError(adData)
                  failures.push(`${c.label} (ad) → ${msg}`)
                  send(`⚠ Variante « ${c.label} » refusée à l'ad : ${msg}`)
                  continue
                }

                send(c.routed
                  ? `✓ Ad créée : "${adName}" — ${c.label} (feed → Feed, story → Stories/Reels)`
                  : `✓ Ad créée : "${adName}" — sans routage par placement`)
                launchAdCount++
                placed = true
                break
              }

              if (!placed) {
                throw new Error(`Ad "${adName}" : aucune variante acceptée par Meta.\n${failures.join('\n')}`)
              }
            }

            // Multi-format (feed + story) → 1 ad with asset_feed_spec + placement routing
            if (feedVideo?.videoId && storyVideo?.videoId) {
              await postMultiFormatAd([
                { type: 'video', videoId: feedVideo.videoId, label: FEED_LABEL },
                { type: 'video', videoId: storyVideo.videoId, label: STORY_LABEL },
              ], ag.adName)
            } else if (feedImage?.hash && storyImage?.hash) {
              await postMultiFormatAd([
                { type: 'image', hash: feedImage.hash, label: FEED_LABEL },
                { type: 'image', hash: storyImage.hash, label: STORY_LABEL },
              ], ag.adName)
            } else {
              // Single asset
              const vid = videoAssets[0]
              const img = imageAssets[0]
              if (vid?.videoId) {
                await postAd(await buildVideoSpec(vid.videoId), ag.adName)
              } else if (img?.hash) {
                await postAd(buildImageSpec(img.hash), ag.adName)
              } else {
                send(`⚠ "${ag.adName}" : aucun asset uploadé — ad ignorée`)
              }
            }
          }
        }

        send(`🎉 ${treeNodes.length} adset${treeNodes.length > 1 ? 's' : ''} et ${treeNodes.reduce((n, node) => n + node.adGroups.length, 0)} ad${treeNodes.reduce((n, node) => n + node.adGroups.length, 0) > 1 ? 's' : ''} publiés dans Meta Ads Manager !`)
      } catch (err) {
        historyStatus = 'error'
        send(`❌ ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        // Save launch history (fire and forget)
        let userId = (session.user as { id?: string })?.id
        // If userId is a Facebook numeric ID (not a cuid), resolve the real DB User.id
        if (userId && /^\d+$/.test(userId)) {
          try {
            const u = await prisma.user.findUnique({ where: { facebookId: userId } })
            if (u) userId = u.id
          } catch { /* keep existing */ }
        }
        if (userId) {
          prisma.launchHistory.create({
            data: {
              userId,
              metaAccountId: accountId,
              campaignName: campaign?.name || 'Campagne inconnue',
              campaignId: launchCampaignId,
              objective: campaign?.objective,
              structure: body.testStructure,
              adsetCount: launchAdsetCount,
              adCount: launchAdCount,
              status: historyStatus,
              logs: logLines.join('\n'),
            },
          }).catch((e) => console.error('[launch] history save failed:', e))
        }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
