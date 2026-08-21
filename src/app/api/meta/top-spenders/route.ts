import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAds, type LeadSource } from '@/lib/meta'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('accountId')
  const dbAccountId = searchParams.get('dbAccountId')
  const limit = parseInt(searchParams.get('limit') || '10')
  const datePreset = searchParams.get('datePreset') || 'last_7d'

  if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 })

  let leadSource: LeadSource = 'total'
  if (dbAccountId) {
    const bs = await prisma.brandSettings
      .findUnique({ where: { adAccountId: dbAccountId }, select: { leadSource: true } })
      .catch(() => null)
    leadSource = (bs?.leadSource as LeadSource) || 'total'
  }

  try {
    const ads = await getAds(accountId, session.accessToken as string, datePreset, leadSource)

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
        // getAds already computed these under the account's lead definition
        const computed = ad._computed as Record<string, unknown> | null
        const leads = Number(computed?.['Prospects (leads)'] ?? 0)
        const purchaseValue = parseFloat(
          actionValues?.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || '0'
        )
        const roas = parseFloat(roasArr?.[0]?.value || '0')
        const cpa =
          parseFloat(costPer?.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || '0') ||
          Number(computed?.['Coût par prospect'] ?? 0)

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
