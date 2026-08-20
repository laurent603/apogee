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

    // Résoudre l'accountId : si c'est un ID DB (pas act_XXXXX), chercher le metaAccountId
    let metaAccountId = accountId
    if (!accountId.startsWith('act_')) {
      try {
        const row = await prisma.adAccount.findUnique({ where: { id: accountId }, select: { metaAccountId: true } })
        if (row?.metaAccountId) metaAccountId = row.metaAccountId
      } catch { /* ignore */ }
    }

    // Step 1 : récupérer les pages gérées par l'utilisateur + leurs tokens
    let pageTokens: Record<string, string> = {}
    try {
      const pagesData = await metaFetch('/me/accounts', token, { fields: 'id,access_token', limit: '50' })
      for (const page of (pagesData.data || []) as { id: string; access_token: string }[]) {
        pageTokens[page.id] = page.access_token
      }
    } catch {
      // pas de pages — on continuera avec le user token
    }

    // Step 2 : récupérer les pubs avec leur post ID
    const adsData = await metaFetch(`/${metaAccountId}/ads`, token, {
      fields: 'id,name,creative{effective_object_story_id,object_story_id,thumbnail_url}',
      limit: '200',
    })

    const ads: Array<{ id: string; name: string; postId: string | null; pageId: string | null; thumbnail?: string }> =
      (adsData.data || []).map((ad: Record<string, unknown>) => {
        const creative = ad.creative as Record<string, string> | undefined
        const postId = creative?.effective_object_story_id || creative?.object_story_id || null
        // effective_object_story_id format: "{pageId}_{postId}"
        const pageId = postId ? postId.split('_')[0] : null
        return {
          id: ad.id as string,
          name: ad.name as string,
          postId,
          pageId,
          thumbnail: creative?.thumbnail_url,
        }
      })

    // Dédupliquer par postId
    const seen = new Set<string>()
    const uniqueAds = ads.filter((a) => {
      if (!a.postId || seen.has(a.postId)) return false
      seen.add(a.postId)
      return true
    })

    const toFetch = uniqueAds.slice(0, 50)

    const spamPatterns = /^(https?:\/\/|www\.)|^\s*[\p{Emoji}\s]+\s*$/u

    // Step 3 : récupérer les commentaires en utilisant le page token si disponible
    const results = await Promise.allSettled(
      toFetch.map(async (ad) => {
        // Utiliser le page token si dispo, sinon user token
        const pageToken = (ad.pageId && pageTokens[ad.pageId]) ? pageTokens[ad.pageId] : token
        try {
          const data = await metaFetch(`/${ad.postId}/comments`, pageToken, {
            fields: 'message,created_time,like_count,from{name}',
            limit: '100',
            filter: 'toplevel',
          })
          const comments = (data.data || [])
            .filter((c: Record<string, unknown>) => {
              const msg = ((c.message as string) || '').trim()
              const from = c.from as Record<string, string> | undefined
              if (!from?.name) return false
              if (msg.length < 4) return false
              if (spamPatterns.test(msg)) return false
              return true
            })
            .map((c: Record<string, unknown>) => ({
              message: (c.message as string).trim(),
              createdTime: c.created_time as string,
              likeCount: Number(c.like_count || 0),
              author: (c.from as Record<string, string>).name,
            }))
          return { adId: ad.id, adName: ad.name, postId: ad.postId, thumbnail: ad.thumbnail, comments }
        } catch (e) {
          return {
            adId: ad.id,
            adName: ad.name,
            postId: ad.postId,
            thumbnail: ad.thumbnail,
            comments: [],
            error: e instanceof Error ? e.message : 'unknown',
          }
        }
      })
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allPosts = results
      .filter((r) => r.status === 'fulfilled')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r) => (r as any).value)

    const posts = allPosts.filter((p: { comments: unknown[] }) => p.comments.length > 0)
    const totalComments = posts.reduce((sum: number, p: { comments: unknown[] }) => sum + p.comments.length, 0)

    // Debug : erreurs des posts sans commentaires
    const errors = allPosts
      .filter((p: { error?: string }) => p.error)
      .slice(0, 3)
      .map((p: { adName: string; error: string }) => `${p.adName}: ${p.error}`)

    return NextResponse.json({
      posts,
      totalComments,
      adsScanned: toFetch.length,
      debug: {
        pagesFound: Object.keys(pageTokens).length,
        adsWithPostId: uniqueAds.length,
        firstErrors: errors,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
