import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { metaFetch } from '@/lib/meta'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('accountId')
  const type = searchParams.get('type') || 'campaigns'

  if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 })
  const token = session.accessToken as string

  try {
    if (type === 'campaigns') {
      const data = await metaFetch(`/${accountId}/campaigns`, token, {
        fields: 'id,name,status,objective,daily_budget,lifetime_budget,budget_rebalance_flag,special_ad_categories',
        limit: '100',
        filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED'] }]),
      })
      return NextResponse.json(data.data || [])
    }

    if (type === 'adsets') {
      const campaignId = searchParams.get('campaignId')
      const path = campaignId ? `/${campaignId}/adsets` : `/${accountId}/adsets`
      const data = await metaFetch(path, token, {
        fields: [
          'id', 'name', 'campaign_id', 'status',
          'optimization_goal', 'billing_event', 'bid_strategy',
          'daily_budget', 'lifetime_budget',
          'targeting',
          'promoted_object',
          'attribution_spec',
          'start_time', 'end_time',
        ].join(','),
        limit: '200',
        filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'ADSET_PAUSED'] }]),
      })
      return NextResponse.json(data.data || [])
    }

    if (type === 'ads') {
      const adsetId = searchParams.get('adsetId')
      const campaignId = searchParams.get('campaignId')
      const path = adsetId ? `/${adsetId}/ads` : campaignId ? `/${campaignId}/ads` : `/${accountId}/ads`

      function parseAds(data: Record<string, unknown>) {
        return (data.data as Record<string, unknown>[] || []).map((ad: Record<string, unknown>) => {
          const creative = ad.creative as Record<string, unknown> | undefined
          const oss = creative?.object_story_spec as Record<string, unknown> | undefined
          const eoss = creative?.effective_object_story_spec as Record<string, unknown> | undefined
          // For text fields, try BOTH specs — for Advantage+ creative, oss.link_data.message is
          // empty while eoss.link_data.message has the real running text. Always prefer eoss for copy.
          const ossLd = oss?.link_data as Record<string, unknown> | undefined
          const ossVd = oss?.video_data as Record<string, unknown> | undefined
          const eossLd = eoss?.link_data as Record<string, unknown> | undefined
          const eossVd = eoss?.video_data as Record<string, unknown> | undefined
          // For URL/CTA use oss if available, eoss as fallback
          const ctaLink = (ossLd?.call_to_action || eossLd?.call_to_action) as { type?: string; value?: { link?: string; lead_gen_form_id?: string } } | undefined
          const ctaVideo = (ossVd?.call_to_action || eossVd?.call_to_action) as { type?: string; value?: { link?: string; lead_gen_form_id?: string } } | undefined
          const cta = ctaLink || ctaVideo
          return {
            ...ad,
            _pageId: ((oss?.page_id || eoss?.page_id) as string | undefined) || '',
            _parsed: {
              // Prefer eoss for copy (has real running text on Advantage+ creative)
              primary_text: (eossLd?.message || eossVd?.message || ossLd?.message || ossVd?.message || creative?.body || '') as string,
              headline: (eossLd?.name || eossVd?.title || ossLd?.name || ossVd?.title || creative?.title || '') as string,
              description: (eossLd?.description || eossVd?.link_description || ossLd?.description || ossVd?.link_description || '') as string,
              cta_type: (cta?.type || 'LEARN_MORE') as string,
              destination_url: (ossLd?.link || ossVd?.link || eossLd?.link || eossVd?.link || cta?.value?.link || '') as string,
              lead_gen_form_id: (cta?.value?.lead_gen_form_id || '') as string,
              thumbnail: (creative?.thumbnail_url || creative?.image_url || null) as string | null,
            },
          }
        })
      }

      // Try full fields (object_story_spec + effective_object_story_spec + asset_feed_spec for Advantage+)
      try {
        const data = await metaFetch(path, token, {
          fields: [
            'id', 'name', 'adset_id', 'campaign_id', 'status',
            'creative{id,name,title,body,image_url,thumbnail_url,video_id,' +
              'object_story_spec{page_id,' +
                'link_data{message,name,description,link,image_hash,call_to_action{type,value}},' +
                'video_data{message,title,link_description,link,video_id,call_to_action{type,value}}' +
              '},' +
              'effective_object_story_spec{page_id,' +
                'link_data{message,name,description,link,image_hash,call_to_action{type,value}},' +
                'video_data{message,title,link_description,link,video_id,call_to_action{type,value}}' +
              '}}',
          ].join(','),
          limit: '200',
        })
        // DEBUG: log first ad's creative to understand Meta API response structure
        const firstAd = (data.data as Record<string, unknown>[])?.[0]
        if (firstAd) {
          const cr = firstAd.creative as Record<string, unknown> | undefined
          console.log('[configure/ads] DEBUG first ad creative keys:', Object.keys(cr || {}))
          console.log('[configure/ads] DEBUG object_story_spec:', JSON.stringify(cr?.object_story_spec).slice(0, 400))
          console.log('[configure/ads] DEBUG effective_object_story_spec:', JSON.stringify(cr?.effective_object_story_spec).slice(0, 400))
          console.log('[configure/ads] DEBUG asset_feed_spec:', JSON.stringify(cr?.asset_feed_spec).slice(0, 400))
          console.log('[configure/ads] DEBUG body/title:', cr?.body, '|', cr?.title)
        }
        return NextResponse.json(parseAds(data))
      } catch (e1) {
        console.error('Ads full-fields error:', e1)
        // Fallback: minimal fields only
        try {
          const data = await metaFetch(path, token, {
            fields: 'id,name,adset_id,campaign_id,status,creative{id,name,title,body,image_url,thumbnail_url}',
            limit: '200',
          })
          return NextResponse.json(parseAds(data))
        } catch (e2) {
          const msg = e2 instanceof Error ? e2.message : String(e2)
          console.error('Ads minimal-fields error:', msg)
          return NextResponse.json({ _error: msg, data: [] })
        }
      }
    }

    if (type === 'pages') {
      const data = await metaFetch('/me/accounts', token, {
        fields: 'id,name,picture',
        limit: '50',
      })
      return NextResponse.json(data.data || [])
    }

    if (type === 'leadforms') {
      const pageId = searchParams.get('pageId')
      if (!pageId) return NextResponse.json({ error: 'Missing pageId' }, { status: 400 })

      // /{pageId}/leadgen_forms requires a Page Access Token (error #190 with user token)
      // Approach 1: /me/accounts returns page tokens for all managed pages
      let pageToken = token
      try {
        const accounts = await metaFetch('/me/accounts', token, { fields: 'id,access_token', limit: '50' })
        const match = (accounts.data || []).find((p: { id: string; access_token?: string }) => p.id === pageId)
        if (match?.access_token) pageToken = match.access_token
      } catch {
        // Approach 2: fetch page token directly from the page node
        try {
          const pageData = await metaFetch(`/${pageId}`, token, { fields: 'access_token' })
          if (pageData.access_token) pageToken = pageData.access_token as string
        } catch { /* fall through — will likely fail with #190 */ }
      }

      const data = await metaFetch(`/${pageId}/leadgen_forms`, pageToken, {
        fields: 'id,name,status,lead_count',
        limit: '50',
      })
      return NextResponse.json(data.data || [])
    }

    if (type === 'pixels') {
      const data = await metaFetch(`/${accountId}/adspixels`, token, {
        fields: 'id,name,last_fired_time',
        limit: '50',
      })
      return NextResponse.json(data.data || [])
    }

    if (type === 'audiences') {
      const data = await metaFetch(`/${accountId}/customaudiences`, token, {
        fields: 'id,name,approximate_count_lower_bound,subtype',
        limit: '100',
        filtering: JSON.stringify([{ field: 'subtype', operator: 'NOT_IN', value: ['LOOKALIKE'] }]),
      })
      return NextResponse.json(data.data || [])
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  } catch (err) {
    console.error('Configure API error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
