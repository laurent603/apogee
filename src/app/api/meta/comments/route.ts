import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { metaFetch } from '@/lib/meta'
import { prisma } from '@/lib/db'

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

    // Step 1 : pages gérées + leurs tokens
    const pageTokens: Record<string, string> = {}
    try {
      const pagesData = await metaFetch('/me/accounts', token, { fields: 'id,access_token', limit: '50' })
      for (const page of (pagesData.data || []) as { id: string; access_token: string }[]) {
        pageTokens[page.id] = page.access_token
      }
    } catch { /* ignore */ }

    // Step 2 : pubs → page IDs uniques
    const adsData = await metaFetch(`/${metaAccountId}/ads`, token, {
      fields: 'id,name,creative{effective_object_story_id,object_story_id,thumbnail_url}',
      limit: '200',
    })

    const pageIdToThumbnail: Record<string, string> = {}
    const uniquePageIds = new Set<string>()

    for (const ad of (adsData.data || []) as Record<string, unknown>[]) {
      const creative = ad.creative as Record<string, string> | undefined
      const postId = creative?.effective_object_story_id || creative?.object_story_id
      if (!postId) continue
      const pageId = postId.split('_')[0]
      if (pageId) {
        uniquePageIds.add(pageId)
        if (creative?.thumbnail_url && !pageIdToThumbnail[pageId]) {
          pageIdToThumbnail[pageId] = creative.thumbnail_url
        }
      }
    }

    // Step 3 : pour chaque page, récupérer les ads_posts avec commentaires inline
    const commentFields = 'comments.limit(100){message,created_time,like_count,from{name}}'
    const adPostFields = `id,message,${commentFields}`

    const pageResults = await Promise.allSettled(
      Array.from(uniquePageIds).map(async (pageId) => {
        const pt = pageTokens[pageId] || token
        try {
          // ads_posts retourne tous les posts liés aux pubs (dark posts inclus)
          const data = await metaFetch(`/${pageId}/ads_posts`, pt, {
            fields: adPostFields,
            include_hidden: 'true',
            limit: '100',
          })
          return { pageId, posts: data.data || [], error: null }
        } catch (e) {
          return { pageId, posts: [], error: e instanceof Error ? e.message : 'unknown' }
        }
      })
    )

    // Agréger les commentaires par post
    type CommentItem = { message: string; createdTime: string; likeCount: number; author: string }
    type PostItem = { adId: string; adName: string; postId: string; thumbnail?: string; comments: CommentItem[] }

    const posts: PostItem[] = []
    const errors: string[] = []

    for (const result of pageResults) {
      if (result.status !== 'fulfilled') continue
      const { pageId, posts: pagePosts, error } = result.value
      if (error) { errors.push(`page ${pageId}: ${error}`); continue }

      for (const post of pagePosts as Record<string, unknown>[]) {
        const postId = post.id as string
        const commentsData = (post.comments as { data?: Record<string, unknown>[] } | undefined)?.data || []
        if (commentsData.length === 0) continue

        const comments: CommentItem[] = commentsData
          .filter((c) => ((c.message as string) || '').trim().length >= 2)
          .map((c) => ({
            message: (c.message as string).trim(),
            createdTime: c.created_time as string,
            likeCount: Number(c.like_count || 0),
            author: (c.from as Record<string, string>)?.name || 'Anonyme',
          }))

        if (comments.length > 0) {
          posts.push({
            adId: postId,
            adName: (post.message as string | undefined)?.slice(0, 60) || postId,
            postId,
            thumbnail: pageIdToThumbnail[pageId],
            comments,
          })
        }
      }
    }

    const totalComments = posts.reduce((s, p) => s + p.comments.length, 0)

    return NextResponse.json({
      posts,
      totalComments,
      adsScanned: uniquePageIds.size,
      debug: { pagesFound: Object.keys(pageTokens).length, uniquePageIds: uniquePageIds.size, firstErrors: errors.slice(0, 3) },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
