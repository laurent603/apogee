import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { metaFetch } from '@/lib/meta'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('accountId')
    if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })

    const token = session.accessToken as string

    // Fetch ads with their effective post IDs (no filtering param — simpler)
    const adsData = await metaFetch(`/${accountId}/ads`, token, {
      fields: 'id,name,creative{effective_object_story_id,thumbnail_url}',
      limit: '100',
    })

    const ads: Array<{ id: string; name: string; postId: string | null; thumbnail?: string }> = (adsData.data || []).map(
      (ad: Record<string, unknown>) => {
        const creative = ad.creative as Record<string, string> | undefined
        return {
          id: ad.id as string,
          name: ad.name as string,
          postId: creative?.effective_object_story_id ?? null,
          thumbnail: creative?.thumbnail_url,
        }
      }
    )

    // Deduplicate by postId
    const seen = new Set<string>()
    const uniqueAds = ads.filter((a) => {
      if (!a.postId || seen.has(a.postId)) return false
      seen.add(a.postId)
      return true
    })

    // Fetch comments for each unique post (parallel, max 50 ads)
    const toFetch = uniqueAds.slice(0, 50)
    const results = await Promise.allSettled(
      toFetch.map(async (ad) => {
        try {
          const data = await metaFetch(`/${ad.postId}/comments`, token, {
            fields: 'message,created_time,like_count,from{name}',
            limit: '100',
            filter: 'toplevel',
          })
          const comments = (data.data || [])
            .filter((c: Record<string, unknown>) => {
              const msg = (c.message as string) || ''
              return msg.trim().length > 2
            })
            .map((c: Record<string, unknown>) => ({
              message: c.message as string,
              createdTime: c.created_time as string,
              likeCount: Number(c.like_count || 0),
              author: (c.from as Record<string, string>)?.name || 'Anonyme',
            }))
          return { adId: ad.id, adName: ad.name, postId: ad.postId, thumbnail: ad.thumbnail, comments }
        } catch {
          return { adId: ad.id, adName: ad.name, postId: ad.postId, thumbnail: ad.thumbnail, comments: [] }
        }
      })
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posts = results
      .filter((r) => r.status === 'fulfilled')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r) => (r as any).value)
      .filter((p: { comments: unknown[] }) => p.comments.length > 0)

    const totalComments = (posts as { comments: unknown[] }[]).reduce((sum, p) => sum + p.comments.length, 0)

    return NextResponse.json({ posts, totalComments, adsScanned: toFetch.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
