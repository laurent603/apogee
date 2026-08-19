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
    // Step 1: fetch creative with only safe fields (no asset_feed_spec sub-fields)
    const result = await metaFetch(`/${adId}`, token, {
      fields: 'id,name,creative{id,name,body,title,leadgen_form_id,object_story_spec,effective_object_story_spec,asset_feed_spec}',
    })
    return NextResponse.json(result, {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
