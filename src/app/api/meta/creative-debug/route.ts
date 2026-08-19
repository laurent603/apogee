import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { metaFetch } from '@/lib/meta'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const token = session.accessToken as string

  // Accept either adId or adsetId — if adsetId, fetch first ad from that adset
  let adId = searchParams.get('adId')
  const adsetId = searchParams.get('adsetId')

  try {
    if (!adId && adsetId) {
      const adsData = await metaFetch(`/${adsetId}/ads`, token, { fields: 'id,name', limit: '5' })
      const ads = adsData.data as { id: string; name: string }[] || []
      return NextResponse.json({
        _note: 'Pass one of these ad IDs as ?adId=XXX to inspect its creative',
        ads: ads.map(a => ({ id: a.id, name: a.name })),
      })
    }

    if (!adId) return NextResponse.json({ error: 'Pass ?adId=XXX or ?adsetId=XXX' }, { status: 400 })

    // Fetch the ad to get its creative ID
    const adResult = await metaFetch(`/${adId}`, token, { fields: 'id,name,creative{id}' })
    const creativeId = (adResult.creative as Record<string, unknown>)?.id as string

    if (!creativeId) {
      return NextResponse.json({ error: 'No creative found on this ad', ad: adResult })
    }

    // Fetch the creative directly — this gives the most reliable field access
    const creativeResult = await metaFetch(`/${creativeId}`, token, {
      fields: 'id,name,body,title,object_story_spec,effective_object_story_spec,asset_feed_spec',
    })

    return NextResponse.json({
      ad_id: adId,
      creative_id: creativeId,
      creative: creativeResult,
      _note: 'Look at: body, title, object_story_spec.link_data.message, effective_object_story_spec.link_data.message, asset_feed_spec.bodies[0].text',
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
