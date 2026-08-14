import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { metaFetch } from '@/lib/meta'

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
  promoted_object?: { pixel_id?: string; custom_event_type?: string }
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
      function send(msg: string) {
        controller.enqueue(encoder.encode(`data: ${msg}\n\n`))
      }

      try {
        /* ── 1. Campaign ───────────────────────────────────────────────────── */
        let campaignId: string
        if (campaign?._isNew) {
          send(`Création de la campagne "${campaign.name}"...`)
          const budgetCents = Math.round(Number(budget || 50) * 100)
          const campaignBody: Record<string, unknown> = {
            name: campaign.name,
            objective: campaign.objective || 'OUTCOME_SALES',
            status: campaign.status || 'PAUSED',
            special_ad_categories: [],
          }
          if (campaign.budget_rebalance_flag) {
            campaignBody.budget_rebalance_flag = true
            campaignBody.daily_budget = String(budgetCents)
          }
          const data = await metaPost(`/${accountId}/campaigns`, token, campaignBody)
          if (data.error) throw new Error(`Campagne : ${(data.error as Record<string, string>).message}`)
          campaignId = data.id as string
          send(`✓ Campagne créée (id: ${campaignId})`)
        } else if (campaign?.id) {
          campaignId = campaign.id
          send(`✓ Campagne : "${campaign.name}"`)
        } else {
          throw new Error('Aucune campagne sélectionnée')
        }

        /* ── 2. Determine adset status + start_time ────────────────────────── */
        let adsetStatus = 'PAUSED'
        let startTime: string | undefined
        if (launchStatus === 'LIVE_NOW') adsetStatus = 'ACTIVE'
        if (launchStatus === 'SCHEDULED_LIVE') { adsetStatus = 'ACTIVE'; startTime = launchDate && launchTime ? `${launchDate}T${launchTime}:00` : undefined }
        if (launchStatus === 'SCHEDULED_PAUSED') { adsetStatus = 'PAUSED'; startTime = launchDate && launchTime ? `${launchDate}T${launchTime}:00` : undefined }

        const isCBO = campaign?.budget_rebalance_flag ?? false
        const budgetCents = Math.round(Number(budget || 50) * 100)

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
            const optimizationGoal = OPT_GOAL_MAP[rawOptGoal] ?? rawOptGoal

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
            } else if (NEEDS_PAGE.has(optimizationGoal) && adTemplate?._pageId) {
              adsetBody.promoted_object = { page_id: adTemplate._pageId }
            }

            if (startTime) adsetBody.start_time = startTime

            console.log('[launch] adset body:', JSON.stringify(adsetBody))
            const adsetData = await metaPost(`/${accountId}/adsets`, token, adsetBody)
            if (adsetData.error) throw new Error(`Adset : ${metaError(adsetData)}`)
            adsetId = adsetData.id as string
            send(`✓ Adset créé : "${node.adsetName}" (id: ${adsetId})`)
          }

          /* Create ads in this adset */
          for (const ag of node.adGroups) {
            const imageAsset = ag.assets.find(a => a.hash)
            const videoAsset = ag.assets.find(a => a.videoId)

            if (!imageAsset?.hash && !videoAsset?.videoId) {
              send(`⚠ "${ag.adName}" : aucun asset uploadé — ad ignorée`)
              continue
            }

            // page_id cascade: _pageId → creative.object_story_spec.page_id → API lookup
            let pageId = adTemplate?._pageId || adTemplate?.creative?.object_story_spec?.page_id || ''
            if (!pageId && adTemplate?.id) {
              try {
                const adInfo = await metaFetch(`/${adTemplate.id}`, token, {
                  fields: 'creative{object_story_spec{page_id}}',
                })
                pageId = (adInfo?.creative as { object_story_spec?: { page_id?: string } } | undefined)?.object_story_spec?.page_id || ''
              } catch {}
            }
            if (!pageId) {
              send(`⚠ "${ag.adName}" : page Facebook manquante — configurez l'ad avec une page`)
              continue
            }

            // If _parsed is empty (fallback minimal fetch was used), re-fetch creative from Meta
            let resolvedParsed = adTemplate?._parsed
            if ((!resolvedParsed?.primary_text && !resolvedParsed?.lead_gen_form_id) && adTemplate?.id && !adTemplate._isNew) {
              try {
                const adInfo = await metaFetch(`/${adTemplate.id}`, token, {
                  fields: 'creative{object_story_spec{page_id,link_data{message,name,description,link,call_to_action{type,value}},video_data{message,title,link_description,link,call_to_action{type,value}}}}',
                })
                const cr = adInfo?.creative as Record<string, unknown> | undefined
                const oss2 = cr?.object_story_spec as Record<string, unknown> | undefined
                const ld = oss2?.link_data as Record<string, unknown> | undefined
                const vd = oss2?.video_data as Record<string, unknown> | undefined
                const ctaRaw = (ld?.call_to_action || vd?.call_to_action) as { type?: string; value?: Record<string, string> } | undefined
                if (!pageId) pageId = (oss2?.page_id as string | undefined) || ''
                resolvedParsed = {
                  primary_text: (ld?.message || vd?.message || resolvedParsed?.primary_text || '') as string,
                  headline: (ld?.name || vd?.title || resolvedParsed?.headline || '') as string,
                  description: (ld?.description || vd?.link_description || resolvedParsed?.description || '') as string,
                  cta_type: (ctaRaw?.type || resolvedParsed?.cta_type || 'LEARN_MORE') as string,
                  destination_url: (ld?.link || vd?.link || ctaRaw?.value?.link || resolvedParsed?.destination_url || '') as string,
                  lead_gen_form_id: (ctaRaw?.value?.lead_gen_form_id || resolvedParsed?.lead_gen_form_id || '') as string,
                  thumbnail: resolvedParsed?.thumbnail ?? null,
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
            const destinationUrl = resolvedParsed?.destination_url || ''
            const leadGenFormId = resolvedParsed?.lead_gen_form_id || ''
            console.log('[launch] leadGenFormId:', leadGenFormId, '| ctaType:', ctaType)

            // CTA value: lead gen form takes priority over destination URL
            const ctaValue: Record<string, string> = leadGenFormId
              ? { lead_gen_form_id: leadGenFormId }
              : { link: destinationUrl || 'https://example.com' }

            send(`Création du créatif "${ag.adName}"...`)

            let storySpec: Record<string, unknown>
            if (videoAsset?.videoId) {
              storySpec = {
                page_id: pageId,
                video_data: {
                  video_id: videoAsset.videoId,
                  message: primaryText,
                  title: headline,
                  link_description: description,
                  call_to_action: { type: ctaType, value: ctaValue },
                },
              }
            } else {
              storySpec = {
                page_id: pageId,
                link_data: {
                  image_hash: imageAsset!.hash,
                  ...(leadGenFormId ? {} : { link: destinationUrl || 'https://example.com' }),
                  message: primaryText,
                  name: headline,
                  description,
                  call_to_action: { type: ctaType, value: ctaValue },
                },
              }
            }

            const creativeBody: Record<string, unknown> = {
              name: ag.adName,
              object_story_spec: storySpec,
            }

            console.log('[launch] creative body:', JSON.stringify(creativeBody))
            const creativeData = await metaPost(`/${accountId}/adcreatives`, token, creativeBody)
            if (creativeData.error) throw new Error(`Créatif "${ag.adName}" : ${metaError(creativeData)}`)
            const creativeId = creativeData.id as string

            const adData = await metaPost(`/${accountId}/ads`, token, {
              name: ag.adName,
              adset_id: adsetId,
              creative: { creative_id: creativeId },
              status: adsetStatus,
            })
            if (adData.error) throw new Error(`Ad "${ag.adName}" : ${metaError(adData)}`)
            send(`✓ Ad créée : "${ag.adName}"`)
          }
        }

        send(`🎉 ${treeNodes.length} adset${treeNodes.length > 1 ? 's' : ''} et ${treeNodes.reduce((n, node) => n + node.adGroups.length, 0)} ad${treeNodes.reduce((n, node) => n + node.adGroups.length, 0) > 1 ? 's' : ''} publiés dans Meta Ads Manager !`)
      } catch (err) {
        send(`❌ ${err instanceof Error ? err.message : String(err)}`)
      } finally {
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
