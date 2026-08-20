import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { metaFetch } from '@/lib/meta'
import { prisma } from '@/lib/db'

type CommentItem = { message: string; createdTime: string; likeCount: number; author: string }
type PostItem = { adId: string; adName: string; postId: string; thumbnail?: string; comments: CommentItem[] }

function parseComments(raw: Record<string, unknown>[]): CommentItem[] {
  return raw
    .filter((c) => ((c.message as string) || '').trim().length >= 2)
    .map((c) => ({
      message: (c.message as string).trim(),
      createdTime: c.created_time as string,
      likeCount: Number(c.like_count || 0),
      author: (c.from as Record<string, string>)?.name || 'Anonyme',
    }))
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('accountId')
    if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })

    const token = session.accessToken as string

    // Résoudre l'accountId DB → Meta
    let metaAccountId = accountId
    if (!accountId.startsWith('act_')) {
      try {
        const row = await prisma.adAccount.findUnique({ where: { id: accountId }, select: { metaAccountId: true } })
        if (row?.metaAccountId) metaAccountId = row.metaAccountId
      } catch { /* ignore */ }
    }

    // Page tokens (utilisés en fallback si user token échoue)
    const pageTokens: Record<string, string> = {}
    try {
      const pagesData = await metaFetch('/me/accounts', token, { fields: 'id,access_token', limit: '50' })
      for (const page of (pagesData.data || []) as { id: string; access_token: string }[]) {
        pageTokens[page.id] = page.access_token
      }
    } catch { /* ignore */ }

    // Pubs → postIds uniques
    const adsData = await metaFetch(`/${metaAccountId}/ads`, token, {
      fields: 'id,name,creative{effective_object_story_id,object_story_id,thumbnail_url}',
      limit: '200',
    })

    // Map postId → { adName, pageId, thumbnail }
    const adMap = new Map<string, { adName: string; pageId: string; thumbnail?: string }>()
    for (const ad of (adsData.data || []) as Record<string, unknown>[]) {
      const creative = ad.creative as Record<string, string> | undefined
      const postId = creative?.effective_object_story_id || creative?.object_story_id
      if (!postId || adMap.has(postId)) continue
      adMap.set(postId, {
        adName: ad.name as string,
        pageId: postId.split('_')[0],
        thumbnail: creative?.thumbnail_url,
      })
    }

    const toFetch = Array.from(adMap.entries()).slice(0, 150)

    // Récupérer les commentaires : essai avec user token, fallback page token
    const results = await Promise.allSettled(
      toFetch.map(async ([postId, meta]) => {
        const pageToken = pageTokens[meta.pageId]

        // Essai 1 : user token
        try {
          const data = await metaFetch(`/${postId}/comments`, token, {
            fields: 'message,created_time,like_count,from{name}',
            limit: '100',
          })
          const comments = parseComments(data.data || [])
          if (comments.length > 0) {
            return { postId, ...meta, comments }
          }
        } catch { /* essai suivant */ }

        // Essai 2 : page token si disponible
        if (pageToken) {
          try {
            const data = await metaFetch(`/${postId}/comments`, pageToken, {
              fields: 'message,created_time,like_count,from{name}',
              limit: '100',
            })
            return { postId, ...meta, comments: parseComments(data.data || []) }
          } catch { /* ignore */ }
        }

        return { postId, ...meta, comments: [] }
      })
    )

    const posts: PostItem[] = (results as PromiseFulfilledResult<{ postId: string; adName: string; pageId: string; thumbnail?: string; comments: CommentItem[] }>[])
      .filter((r) => r.status === 'fulfilled' && r.value.comments.length > 0)
      .map((r) => ({
        adId: r.value.postId,
        adName: r.value.adName,
        postId: r.value.postId,
        thumbnail: r.value.thumbnail,
        comments: r.value.comments,
      }))

    const totalComments = posts.reduce((s, p) => s + p.comments.length, 0)

    return NextResponse.json({ posts, totalComments, adsScanned: toFetch.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
