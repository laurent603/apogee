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
    // Try as ad first, then as creative directly
    let adResult: Record<string, unknown> = {}
    let creativeResult: Record<string, unknown> = {}

    try {
      adResult = await metaFetch(`/${adId}`, token, { fields: 'id,name,creative' })
    } catch (e1) {
      adResult = { _error: String(e1) }
    }

    // Get creative ID — either from ad lookup or treat the ID itself as a creative ID
    const creativeId = (adResult.creative as Record<string, unknown>)?.id as string || adId
    try {
      creativeResult = await metaFetch(`/${creativeId}`, token, {
        fields: 'id,name,body,title,object_story_spec,effective_object_story_spec,asset_feed_spec',
      })
    } catch (e2) {
      creativeResult = { _error: String(e2) }
    }

    return NextResponse.json({
      ad: adResult,
      creative: creativeResult,
      _note: 'body/title at top level = copy fields. Check object_story_spec.link_data.message and effective_object_story_spec.link_data.message',
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
