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

    // Pages + leurs tokens
    const pageTokens: Record<string, string> = {}
    try {
      const pagesData = await metaFetch('/me/accounts', token, { fields: 'id,access_token', limit: '50' })
      for (const page of (pagesData.data || []) as { id: string; access_token: string }[]) {
        pageTokens[page.id] = page.access_token
      }
    } catch { /* ignore */ }

    // Pubs → postIds uniques + pageIds
    const adsData = await metaFetch(`/${metaAccountId}/ads`, token, {
      fields: 'id,name,creative{effective_object_story_id,object_story_id,thumbnail_url}',
      limit: '200',
    })

    const adMap: Map<string, { adId: string; adName: string; pageId: string; thumbnail?: string }> = new Map()
    for (const ad of (adsData.data || []) as Record<string, unknown>[]) {
      const creative = ad.creative as Record<string, string> | undefined
      const postId = creative?.effective_object_story_id || creative?.object_story_id
      if (!postId || adMap.has(postId)) continue
      adMap.set(postId, {
        adId: ad.id as string,
        adName: ad.name as string,
        pageId: postId.split('_')[0],
        thumbnail: creative?.thumbnail_url,
      })
    }

    const toFetch = Array.from(adMap.entries()).slice(0, 50)

    // Approche 1 : /{postId}/comments pour chaque pub
    const postResults = await Promise.allSettled(
      toFetch.map(async ([postId, meta]) => {
        const pt = pageTokens[meta.pageId] || token
        try {
          const data = await metaFetch(`/${postId}/comments`, pt, {
            fields: 'message,created_time,like_count,from{name}',
            limit: '100',
          })
          return { postId, ...meta, comments: parseComments(data.data || []) }
        } catch {
          return { postId, ...meta, comments: [] }
        }
      })
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posts: PostItem[] = (postResults as any[])
      .filter((r) => r.status === 'fulfilled' && r.value.comments.length > 0)
      .map((r) => ({
        adId: r.value.adId,
        adName: r.value.adName,
        postId: r.value.postId,
        thumbnail: r.value.thumbnail,
        comments: r.value.comments,
      }))

    // Approche 2 : ads_posts pour TOUTES les pages (dark posts non retournés par /comments)
    const uniquePageIds = new Set(toFetch.map(([, m]) => m.pageId))
    const seenPostIds = new Set(posts.map((p) => p.postId))

    if (uniquePageIds.size > 0) {
      const fallbackResults = await Promise.allSettled(
        Array.from(uniquePageIds).map(async (pageId) => {
          const pt = pageTokens[pageId] || token
          try {
            const data = await metaFetch(`/${pageId}/ads_posts`, pt, {
              fields: 'id,message,comments.limit(100){message,created_time,like_count,from{name}}',
              include_hidden: 'true',
              limit: '100',
            })
            return { pageId, posts: data.data || [] }
          } catch {
            return { pageId, posts: [] }
          }
        })
      )

      for (const result of fallbackResults) {
        if (result.status !== 'fulfilled') continue
        for (const post of result.value.posts as Record<string, unknown>[]) {
          const postId = post.id as string
          if (seenPostIds.has(postId)) continue
          const commentsData = (post.comments as { data?: Record<string, unknown>[] } | undefined)?.data || []
          const comments = parseComments(commentsData)
          if (comments.length === 0) continue
          seenPostIds.add(postId)
          posts.push({
            adId: postId,
            adName: ((post.message as string) || '').slice(0, 60) || postId,
            postId,
            comments,
          })
        }
      }
    }

    const totalComments = posts.reduce((s, p) => s + p.comments.length, 0)

    return NextResponse.json({ posts, totalComments, adsScanned: toFetch.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
