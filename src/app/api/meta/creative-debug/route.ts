import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { metaFetch } from '@/lib/meta'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const adId = searchParams.get('adId')
  if (!adId) return NextResponse.json({ error: 'Missing adId' }, { status: 400 })

  const token = session.accessToken as string

  try {
    const creativeFields = 'id,name,body,title,image_url,thumbnail_url,leadgen_form_id,' +
      'object_story_spec{page_id,link_data{message,name,description,link,call_to_action{type,value}},video_data{message,title,link_description,link,call_to_action{type,value}}},' +
      'effective_object_story_spec{page_id,link_data{message,name,description,link,call_to_action{type,value}},video_data{message,title,link_description,link,call_to_action{type,value}}},' +
      'asset_feed_spec{bodies,titles,descriptions,call_to_action_types,link_urls}'
    const result = await metaFetch(`/${adId}`, token, {
      fields: `id,name,creative{${creativeFields}}`,
    })
    return NextResponse.json(result, {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
