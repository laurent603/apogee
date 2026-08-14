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
          const linkData = oss?.link_data as Record<string, unknown> | undefined
          const videoData = oss?.video_data as Record<string, unknown> | undefined
          const ctaLink = linkData?.call_to_action as { type?: string; value?: { link?: string; lead_gen_form_id?: string } } | undefined
          const ctaVideo = videoData?.call_to_action as { type?: string; value?: { link?: string; lead_gen_form_id?: string } } | undefined
          const cta = ctaLink || ctaVideo
          return {
            ...ad,
            _pageId: (oss?.page_id as string | undefined) || '',
            _parsed: {
              primary_text: (linkData?.message || videoData?.message || creative?.body || '') as string,
              headline: (linkData?.name || videoData?.title || creative?.title || '') as string,
              description: (linkData?.description || videoData?.link_description || '') as string,
              cta_type: (cta?.type || 'LEARN_MORE') as string,
              destination_url: (linkData?.link || videoData?.link || cta?.value?.link || '') as string,
              lead_gen_form_id: (cta?.value?.lead_gen_form_id || '') as string,
              thumbnail: (creative?.thumbnail_url || creative?.image_url || null) as string | null,
            },
          }
        })
      }

      // Try full fields (with object_story_spec)
      try {
        const data = await metaFetch(path, token, {
          fields: [
            'id', 'name', 'adset_id', 'campaign_id', 'status',
            'creative{id,name,title,body,image_url,thumbnail_url,video_id,' +
              'object_story_spec{page_id,' +
                'link_data{message,name,description,link,image_hash,call_to_action{type,value{link,lead_gen_form_id}}},' +
                'video_data{message,title,link_description,link,video_id,call_to_action{type,value{link,lead_gen_form_id}}}' +
              '}}',
          ].join(','),
          limit: '200',
        })
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
