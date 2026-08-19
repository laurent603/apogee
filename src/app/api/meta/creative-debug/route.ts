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
    const adResult = await metaFetch(`/${adId}`, token, {
      fields: 'id,name,creative{id,name,title,body,leadgen_form_id,' +
        'object_story_spec{page_id,link_data{message,name,description,link,call_to_action{type,value}},video_data{message,title,link_description,link,call_to_action{type,value}}},' +
        'effective_object_story_spec{page_id,link_data{message,name,description,link,call_to_action{type,value}},video_data{message,title,link_description,link,call_to_action{type,value}}},' +
        'asset_feed_spec{bodies,titles,descriptions,call_to_action_types,link_urls}}',
    })

    const cr = adResult.creative as Record<string, unknown> | undefined
    const oss = cr?.object_story_spec as Record<string, unknown> | undefined
    const eoss = cr?.effective_object_story_spec as Record<string, unknown> | undefined
    const afs = cr?.asset_feed_spec as Record<string, unknown> | undefined

    return NextResponse.json({
      ad_id: adId,
      _extracted: {
        'creative.body': cr?.body,
        'creative.title': cr?.title,
        'oss.link_data.message': (oss?.link_data as Record<string,unknown>)?.message,
        'eoss.link_data.message': (eoss?.link_data as Record<string,unknown>)?.message,
        'oss.video_data.message': (oss?.video_data as Record<string,unknown>)?.message,
        'eoss.video_data.message': (eoss?.video_data as Record<string,unknown>)?.message,
        'afs.bodies[0].text': (afs?.bodies as Array<{text:string}>)?.[0]?.text,
        'afs.titles[0].text': (afs?.titles as Array<{text:string}>)?.[0]?.text,
      },
      _raw_creative: cr,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
