import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAds } from '@/lib/meta'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('accountId')
  const limit = parseInt(searchParams.get('limit') || '10')
  const datePreset = searchParams.get('datePreset') || 'last_7d'

  if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 })

  try {
    const ads = await getAds(accountId, session.accessToken as string, datePreset)

    const spenders = ads
      .map((ad: Record<string, unknown>) => {
        const insights = (ad.insights as { data: Record<string, unknown>[] } | undefined)?.data?.[0]
        if (!insights) return null

        const spend = parseFloat(String(insights.spend || '0'))
        if (spend === 0) return null

        const actions = insights.actions as { action_type: string; value: string }[] | undefined
        const actionValues = insights.action_values as { action_type: string; value: string }[] | undefined
        const roasArr = insights.website_purchase_roas as { action_type: string; value: string }[] | undefined
        const costPer = insights.cost_per_action_type as { action_type: string; value: string }[] | undefined

        const purchases = parseFloat(
          actions?.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || '0'
        )
        // `lead` is Meta's total; when absent, sum its website and instant-form
        // sources rather than picking whichever matches first
        const actionVal = (type: string) => parseFloat(actions?.find(a => a.action_type === type)?.value || '0')
        const leads =
          actionVal('lead') ||
          actionVal('offsite_conversion.fb_pixel_lead') +
            (actionVal('onsite_conversion.lead_grouped') || actionVal('leadgen.other'))
        const purchaseValue = parseFloat(
          actionValues?.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || '0'
        )
        const roas = parseFloat(roasArr?.[0]?.value || '0')
        const cpa = parseFloat(
          costPer?.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase' || a.action_type === 'lead')?.value || '0'
        )

        const creative = ad.creative as { thumbnail_url?: string; image_url?: string; title?: string } | undefined

        return {
          id: ad.id,
          name: ad.name,
          status: ad.status,
          thumbnail: creative?.thumbnail_url || creative?.image_url || null,
          spend,
          roas: roas || (purchaseValue > 0 && spend > 0 ? purchaseValue / spend : null),
          cpa: cpa || (purchases > 0 ? spend / purchases : leads > 0 ? spend / leads : null),
          purchases,
          leads,
          revenue: purchaseValue,
          impressions: parseInt(String(insights.impressions || '0')),
          cpm: parseFloat(String(insights.cpm || '0')),
          ctr: parseFloat(String(insights.ctr || '0')),
        }
      })
      .filter(Boolean)
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (b!.spend as number) - (a!.spend as number))
      .slice(0, limit)

    return NextResponse.json({ spenders })
  } catch (err) {
    console.error('Top spenders error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
