import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { metaFetch } from '@/lib/meta'
import { prisma } from '@/lib/db'

type CommentItem = { message: string; createdTime: string; likeCount: number; author: string }
type PostItem = { adId: string; adName: string; postId: string; thumbnail?: string; comments: CommentItem[] }

function parseFBComments(raw: Record<string, unknown>[]): CommentItem[] {
  return raw
    .filter((c) => ((c.message as string) || '').trim().length >= 2)
    .map((c) => ({
      message: (c.message as string).trim(),
      createdTime: c.created_time as string,
      likeCount: Number(c.like_count || 0),
      author: (c.from as Record<string, string>)?.name || 'Anonyme',
    }))
}

function parseIGComments(raw: Record<string, unknown>[]): CommentItem[] {
  return raw
    .filter((c) => ((c.text as string) || '').trim().length >= 2)
    .map((c) => ({
      message: (c.text as string).trim(),
      createdTime: c.timestamp as string,
      likeCount: Number(c.like_count || 0),
      author: (c.username as string) || 'Anonyme',
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

    // Pages → tokens + IG Business Account connecté
    const pageTokens: Record<string, string> = {}
    const pageToIgId: Record<string, string> = {}
    const igToPageToken: Record<string, string> = {}

    try {
      const pagesData = await metaFetch('/me/accounts', token, {
        fields: 'id,access_token,instagram_business_account{id}',
        limit: '50',
      })
      for (const page of (pagesData.data || []) as {
        id: string; access_token: string; instagram_business_account?: { id: string }
      }[]) {
        pageTokens[page.id] = page.access_token
        if (page.instagram_business_account?.id) {
          pageToIgId[page.id] = page.instagram_business_account.id
          igToPageToken[page.instagram_business_account.id] = page.access_token
        }
      }
    } catch { /* ignore */ }

    // Pubs avec champs étendus pour récupérer instagram_permalink_url
    const adsData = await metaFetch(`/${metaAccountId}/ads`, token, {
      fields: 'id,name,creative{effective_object_story_id,object_story_id,thumbnail_url}',
      limit: '200',
      date_preset: 'maximum',
    })

    type AdMeta = { adName: string; thumbnail?: string }
    const fbPostMap = new Map<string, AdMeta>()    // FB postId → meta
    const igMediaMap = new Map<string, AdMeta>()   // IG media ID → meta

    for (const ad of (adsData.data || []) as Record<string, unknown>[]) {
      const creative = ad.creative as Record<string, string> | undefined
      const adName = ad.name as string
      const thumbnail = creative?.thumbnail_url
      const postId = creative?.effective_object_story_id || creative?.object_story_id

      if (!postId) continue
      const parts = postId.split('_')
      const firstPart = parts[0]
      const postPart = parts[1]

      if (igToPageToken[firstPart]) {
        // Actor Instagram direct — ID composé IG natif
        if (!igMediaMap.has(postId)) igMediaMap.set(postId, { adName, thumbnail })
      } else if (pageToIgId[firstPart] && postPart) {
        // Page Facebook avec IG connecté → essayer {ig_user_id}_{post_part}
        const igCompoundId = `${pageToIgId[firstPart]}_${postPart}`
        if (!igMediaMap.has(igCompoundId)) igMediaMap.set(igCompoundId, { adName, thumbnail })
        // Garder aussi le postId FB original
        if (!fbPostMap.has(postId)) fbPostMap.set(postId, { adName, thumbnail })
      } else {
        // Facebook post pur
        if (!fbPostMap.has(postId)) fbPostMap.set(postId, { adName, thumbnail })
      }
    }

    // Collecter les IG account IDs des pages utilisées dans les ads FB
    const igActorIdsFromPages = new Set<string>()
    for (const postId of fbPostMap.keys()) {
      const fbPageId = postId.split('_')[0]
      if (pageToIgId[fbPageId]) igActorIdsFromPages.add(pageToIgId[fbPageId])
    }

    const posts: PostItem[] = []

    // === FACEBOOK : commentaires sur dark posts (ads) via expansion de champs ===
    const fbDebugSummary: Record<string, number> = {}

    await Promise.allSettled(
      Array.from(fbPostMap.entries()).slice(0, 30).map(async ([postId, meta]) => {
        const pageToken = pageTokens[postId.split('_')[0]]
        const tokens = [pageToken, token].filter(Boolean) as string[]
        for (const tok of tokens) {
          try {
            // Expansion de champs inline + summary pour connaître le vrai count
            const postData = await metaFetch(`/${postId}`, tok, {
              fields: 'id,comments.limit(100).summary(true){message,created_time,like_count,from{name}}',
            })
            const commentsSummary = (postData.comments as { data?: Record<string, unknown>[]; summary?: { total_count: number } } | undefined)
            const totalCount = commentsSummary?.summary?.total_count ?? -1
            const rawComments = commentsSummary?.data || []
            fbDebugSummary[postId] = totalCount
            const comments = parseFBComments(rawComments)
            if (comments.length > 0 && !posts.some(p => p.postId === postId)) {
              posts.push({ adId: postId, adName: meta.adName, postId, thumbnail: meta.thumbnail, comments })
              return
            }
          } catch { /* ignore */ }
        }
      })
    )

    // === INSTAGRAM : médias obtenus depuis instagram_permalink_url ===
    const igDebugErrors: string[] = []
    const pageTokensIG = Object.values(igToPageToken)

    await Promise.allSettled(
      Array.from(igMediaMap.entries()).slice(0, 5).map(async ([igMediaId, meta]) => {
        if (pageTokensIG.length === 0) { igDebugErrors.push(`${igMediaId}:no-token`); return }

        for (const pt of pageTokensIG) {
          try {
            const commentsData = await metaFetch(`/${igMediaId}/comments`, pt, {
              fields: 'text,timestamp,like_count,username',
              limit: '100',
            })
            const comments = parseIGComments(commentsData.data || [])
            igDebugErrors.push(`${igMediaId}:comments:${comments.length}`)
            if (comments.length > 0) {
              posts.push({ adId: igMediaId, adName: meta.adName, postId: igMediaId, thumbnail: meta.thumbnail, comments })
              return
            }
          } catch (e) {
            igDebugErrors.push(`${igMediaId}:err:${e instanceof Error ? e.message.slice(0, 80) : 'unknown'}`)
          }
        }
      })
    )

    // === INSTAGRAM organiques depuis les pages connectées aux ads FB ===
    for (const igActorId of igActorIdsFromPages) {
      const pageToken = igToPageToken[igActorId]
      if (!pageToken) continue
      try {
        const mediaData = await metaFetch(`/${igActorId}/media`, pageToken, {
          fields: 'id,caption,timestamp,media_type,comments_count,thumbnail_url,media_url',
          limit: '50',
        })
        await Promise.allSettled(
          ((mediaData.data || []) as { id: string; caption?: string; comments_count: number; thumbnail_url?: string; media_url?: string }[])
            .filter((m) => m.comments_count > 0)
            .slice(0, 50)
            .map(async (media) => {
              if (posts.some(p => p.postId === media.id)) return
              try {
                const commentsData = await metaFetch(`/${media.id}/comments`, pageToken, {
                  fields: 'text,timestamp,like_count,username',
                  limit: '100',
                })
                const comments = parseIGComments(commentsData.data || [])
                if (comments.length > 0) {
                  posts.push({
                    adId: media.id,
                    adName: (media.caption || '').slice(0, 60) || `Post Instagram ${media.id}`,
                    postId: media.id,
                    thumbnail: media.thumbnail_url || media.media_url,
                    comments,
                  })
                }
              } catch { /* ignore */ }
            })
        )
      } catch { /* ignore */ }
    }

    const totalComments = posts.reduce((s, p) => s + p.comments.length, 0)

    return NextResponse.json({
      posts,
      totalComments,
      adsScanned: fbPostMap.size + igMediaMap.size,
      debug: {
        fbPosts: fbPostMap.size,
        fbSummary: fbDebugSummary,
        igMediaFromPermalink: igMediaMap.size,
        igActorIds: [...igActorIdsFromPages],
        igPermalinkSample: [...igMediaMap.keys()].slice(0, 3),
        igDebugErrors,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
