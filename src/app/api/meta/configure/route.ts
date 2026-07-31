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
      const data = await metaFetch(path, token, {
        fields: [
          'id', 'name', 'adset_id', 'campaign_id', 'status',
          'creative{id,name,title,body,image_url,thumbnail_url,video_id,call_to_action,link_url,object_story_spec}',
        ].join(','),
        limit: '200',
        filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'ADSET_PAUSED', 'CAMPAIGN_PAUSED'] }]),
      })

      const ads = (data.data || []).map((ad: Record<string, unknown>) => {
        const creative = ad.creative as Record<string, unknown> | undefined
        const oss = creative?.object_story_spec as Record<string, unknown> | undefined
        const linkData = oss?.link_data as Record<string, unknown> | undefined
        const videoData = oss?.video_data as Record<string, unknown> | undefined
        const cta = (creative?.call_to_action as { type?: string; value?: { link?: string } } | undefined)

        return {
          ...ad,
          _parsed: {
            primary_text: creative?.body || linkData?.message || videoData?.message || '',
            headline: creative?.title || linkData?.name || videoData?.title || '',
            description: linkData?.description || videoData?.link_description || '',
            cta_type: cta?.type || 'LEARN_MORE',
            destination_url: creative?.link_url || cta?.value?.link || linkData?.link || '',
            thumbnail: creative?.thumbnail_url || creative?.image_url || null,
          },
        }
      })
      return NextResponse.json(ads)
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
