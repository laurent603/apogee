import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAccountOverview, getCampaigns, getAdSets, getAds, getDailyBreakdown, computeVideoMetrics } from '@/lib/meta'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('accountId')
  const type = searchParams.get('type') || 'overview'
  const datePreset = searchParams.get('datePreset') || 'last_7d'

  if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 })

  const token = session.accessToken as string

  try {
    switch (type) {
      case 'overview': {
        const data = await getAccountOverview(accountId, token, datePreset)
        return NextResponse.json(data)
      }
      case 'campaigns': {
        const data = await getCampaigns(accountId, token, datePreset)
        return NextResponse.json(data)
      }
      case 'adsets': {
        const data = await getAdSets(accountId, token, datePreset)
        return NextResponse.json(data)
      }
      case 'ads': {
        const ads = await getAds(accountId, token, datePreset)
        const enriched = ads.map((ad: Record<string, unknown>) => ({
          ...ad,
          videoMetrics: computeVideoMetrics(ad),
        }))
        return NextResponse.json(enriched)
      }
      case 'daily': {
        const days = parseInt(searchParams.get('days') || '7')
        const data = await getDailyBreakdown(accountId, token, days)
        return NextResponse.json(data)
      }
      default:
        return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
    }
  } catch (err) {
    console.error('Meta insights error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
