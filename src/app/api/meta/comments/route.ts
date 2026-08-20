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

    // Pubs → pageIds uniques + thumbnail par page
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
      if (!pageId) continue
      uniquePageIds.add(pageId)
      if (creative?.thumbnail_url && !pageIdToThumbnail[pageId]) {
        pageIdToThumbnail[pageId] = creative.thumbnail_url
      }
    }

    // Étape 1 : récupérer les postIds via ads_posts pour chaque page
    const pagePostIds: { pageId: string; postId: string; message: string }[] = []

    await Promise.allSettled(
      Array.from(uniquePageIds).map(async (pageId) => {
        const pt = pageTokens[pageId] || token
        try {
          const data = await metaFetch(`/${pageId}/ads_posts`, pt, {
            fields: 'id,message',
            include_hidden: 'true',
            limit: '100',
          })
          for (const post of (data.data || []) as { id: string; message?: string }[]) {
            pagePostIds.push({ pageId, postId: post.id, message: post.message || '' })
          }
        } catch { /* ignore */ }
      })
    )

    // Étape 2 : pour chaque postId, récupérer les commentaires
    const postResults = await Promise.allSettled(
      pagePostIds.slice(0, 150).map(async ({ pageId, postId, message }) => {
        const pt = pageTokens[pageId] || token
        try {
          const data = await metaFetch(`/${postId}/comments`, pt, {
            fields: 'message,created_time,like_count,from{name}',
            limit: '100',
          })
          const comments = parseComments(data.data || [])
          return { postId, adName: message.slice(0, 80) || postId, thumbnail: pageIdToThumbnail[pageId], comments }
        } catch {
          return { postId, adName: message.slice(0, 80) || postId, thumbnail: pageIdToThumbnail[pageId], comments: [] }
        }
      })
    )

    const posts: PostItem[] = (postResults as PromiseFulfilledResult<{ postId: string; adName: string; thumbnail?: string; comments: CommentItem[] }>[])
      .filter((r) => r.status === 'fulfilled' && r.value.comments.length > 0)
      .map((r) => ({
        adId: r.value.postId,
        adName: r.value.adName,
        postId: r.value.postId,
        thumbnail: r.value.thumbnail,
        comments: r.value.comments,
      }))

    const totalComments = posts.reduce((s, p) => s + p.comments.length, 0)

    return NextResponse.json({ posts, totalComments, adsScanned: pagePostIds.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
