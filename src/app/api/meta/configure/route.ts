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

      function extractFromCreative(creative: Record<string, unknown> | undefined) {
        const oss = creative?.object_story_spec as Record<string, unknown> | undefined
        const ld = oss?.link_data as Record<string, unknown> | undefined
        const vd = oss?.video_data as Record<string, unknown> | undefined
        const ossCta = (ld?.call_to_action || vd?.call_to_action) as { type?: string; value?: { link?: string; lead_gen_form_id?: string } } | undefined
        // Advantage+ creative: copy in asset_feed_spec (accessible on creative node directly)
        const afs = creative?.asset_feed_spec as Record<string, unknown> | undefined
        const afsBodies = (afs?.bodies as Array<{ text: string }> | undefined) || []
        const afsTitles = (afs?.titles as Array<{ text: string }> | undefined) || []
        const afsDescs = (afs?.descriptions as Array<{ text: string }> | undefined) || []
        const afsCtas = (afs?.call_to_action_types as string[] | undefined) || []
        const afsCTAs = (afs?.call_to_actions as Array<{ type: string; value?: { lead_gen_form_id?: string; link?: string } }> | undefined) || []
        const afsLinks = (afs?.link_urls as Array<{ website_url: string }> | undefined) || []
        return {
          _pageId: (oss?.page_id as string | undefined) || '',
          primary_text: (ld?.message || vd?.message || afsBodies[0]?.text || creative?.body || '') as string,
          headline: (ld?.name || vd?.title || afsTitles[0]?.text || creative?.title || '') as string,
          description: (ld?.description || vd?.link_description || afsDescs[0]?.text || '') as string,
          cta_type: (ossCta?.type || afsCtas[0] || 'LEARN_MORE') as string,
          destination_url: (ld?.link || vd?.link || ossCta?.value?.link || afsCTAs[0]?.value?.link || afsLinks[0]?.website_url || '') as string,
          lead_gen_form_id: (ossCta?.value?.lead_gen_form_id || afsCTAs[0]?.value?.lead_gen_form_id || '') as string,
          thumbnail: (creative?.thumbnail_url || creative?.image_url || null) as string | null,
        }
      }

      // Fetch ads — for Advantage+ creative, do a follow-up fetch of the creative directly
      try {
        const data = await metaFetch(path, token, {
          fields: [
            'id', 'name', 'adset_id', 'campaign_id', 'status',
            'creative{id,name,title,body,image_url,thumbnail_url,video_id,' +
              'object_story_spec{page_id,' +
                'link_data{message,name,description,link,image_hash,call_to_action{type,value}},' +
                'video_data{message,title,link_description,link,video_id,call_to_action{type,value}}' +
              '}}',
          ].join(','),
          limit: '200',
        })
        const ads = (data.data as Record<string, unknown>[] || [])
        const results = await Promise.all(ads.map(async (ad: Record<string, unknown>) => {
          let creative = ad.creative as Record<string, unknown> | undefined
          let parsed = extractFromCreative(creative)
          // Advantage+ creative: object_story_spec has only page_id, copy is in asset_feed_spec
          // Fetch the creative directly to get asset_feed_spec
          if (!parsed.primary_text && creative?.id) {
            try {
              const cr2 = await metaFetch(`/${creative.id}`, token, {
                fields: 'id,body,title,asset_feed_spec,object_story_spec',
              })
              creative = { ...creative, ...cr2 }
              parsed = extractFromCreative(creative)
            } catch { /* keep empty */ }
          }
          return { ...ad, creative, _pageId: parsed._pageId, _parsed: { ...parsed } }
        }))
        return NextResponse.json(results)
      } catch (e1) {
        console.error('Ads full-fields error:', e1)
        // Fallback: minimal fields only
        try {
          const data = await metaFetch(path, token, {
            fields: 'id,name,adset_id,campaign_id,status,creative{id,name,title,body,image_url,thumbnail_url}',
            limit: '200',
          })
          const ads = (data.data as Record<string, unknown>[] || [])
          return NextResponse.json(ads.map((ad: Record<string, unknown>) => {
            const creative = ad.creative as Record<string, unknown> | undefined
            const parsed = extractFromCreative(creative)
            return { ...ad, _pageId: parsed._pageId, _parsed: { ...parsed } }
          }))
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
