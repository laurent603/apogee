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

    // Fetch via ad ID with the exact same fields as configure/route.ts uses
    // Step 1: get creative ID via ad
    const adResult = await metaFetch(`/${adId}`, token, { fields: 'id,name,creative{id}' })
    const creativeId = (adResult.creative as Record<string,unknown>)?.id as string

    // Step 2: fetch creative directly — try body/title/asset_feed_spec (no effective_object_story_spec)
    let creativeRaw: Record<string, unknown> = {}
    try {
      creativeRaw = await metaFetch(`/${creativeId}`, token, {
        fields: 'id,name,body,title,asset_feed_spec,object_story_spec',
      })
    } catch (e) {
      creativeRaw = { _error: String(e) }
    }

    const afs = creativeRaw.asset_feed_spec as Record<string, unknown> | undefined
    const oss = creativeRaw.object_story_spec as Record<string, unknown> | undefined

    return NextResponse.json({
      ad_id: adId,
      creative_id: creativeId,
      _extracted: {
        'creative.body': creativeRaw.body,
        'creative.title': creativeRaw.title,
        'oss.page_id': oss?.page_id,
        'oss.link_data': oss?.link_data,
        'oss.video_data': oss?.video_data,
        'afs keys': afs ? Object.keys(afs) : null,
        'afs.bodies': (afs?.bodies as Array<{text:string}>)?.map(b => b.text),
        'afs.titles': (afs?.titles as Array<{text:string}>)?.map(t => t.text),
      },
      _raw_creative: creativeRaw,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
