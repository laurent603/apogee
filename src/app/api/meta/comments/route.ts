import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { metaFetch } from '@/lib/meta'
import { prisma } from '@/lib/db'

// Walking every ad's comment pages takes far longer than a single Graph call.
export const maxDuration = 300

type CommentItem = { message: string; createdTime: string; likeCount: number; author: string }
type PostItem = { adId: string; adName: string; postId: string; thumbnail?: string; comments: CommentItem[] }

/** Follow Graph API `paging.next` links, which already carry the token. */
async function drainPages(
  first: Record<string, unknown>,
  maxPages = 25,
): Promise<Record<string, unknown>[]> {
  const out = [...((first.data as Record<string, unknown>[]) || [])]
  let next = (first.paging as { next?: string } | undefined)?.next
  let pages = 1
  while (next && pages < maxPages) {
    try {
      const res = await fetch(next)
      if (!res.ok) break
      const page = await res.json()
      out.push(...((page.data as Record<string, unknown>[]) || []))
      next = page.paging?.next
      pages++
    } catch { break }
  }
  return out
}

/** Bounded-concurrency map, so scanning 200 ads does not fire 200 calls at once. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) await fn(items[cursor++])
    }),
  )
}

function parseFBComments(raw: Record<string, unknown>[]): CommentItem[] {
  const seen = new Set<string>()
  const out: CommentItem[] = []
  for (const c of raw) {
    const message = ((c.message as string) || '').trim()
    if (!message) continue
    const id = (c.id as string) || message
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      message,
      createdTime: c.created_time as string,
      likeCount: Number(c.like_count || 0),
      author: (c.from as Record<string, string>)?.name || 'Anonyme',
    })
  }
  return out
}

function parseIGComments(raw: Record<string, unknown>[]): CommentItem[] {
  const seen = new Set<string>()
  const out: CommentItem[] = []
  for (const c of raw) {
    const text = ((c.text as string) || '').trim()
    if (text) {
      const id = (c.id as string) || text
      if (!seen.has(id)) {
        seen.add(id)
        out.push({
          message: text,
          createdTime: c.timestamp as string,
          likeCount: Number(c.like_count || 0),
          author: (c.username as string) || 'Anonyme',
        })
      }
    }
    // Replies are a nested edge, not part of the parent list
    const replies = (c.replies as { data?: Record<string, unknown>[] } | undefined)?.data
    if (replies?.length) out.push(...parseIGComments(replies))
  }
  return out
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

    // Dark post comments are only readable with a PAGE token; a user token
    // returns an empty list rather than an error, so losing these tokens looks
    // exactly like "this ad has no comments".
    let meAccountsError: string | null = null
    try {
      const pagesFirst = await metaFetch('/me/accounts', token, {
        fields: 'id,access_token,instagram_business_account{id}',
        limit: '100',
      })
      const pages = await drainPages(pagesFirst)
      for (const page of pages as unknown as {
        id: string; access_token: string; instagram_business_account?: { id: string }
      }[]) {
        if (page.access_token) pageTokens[page.id] = page.access_token
        if (page.instagram_business_account?.id) {
          pageToIgId[page.id] = page.instagram_business_account.id
          if (page.access_token) igToPageToken[page.instagram_business_account.id] = page.access_token
        }
      }
    } catch (e) {
      meAccountsError = e instanceof Error ? e.message.slice(0, 150) : 'unknown'
    }

    // Toutes les pubs du compte, quel que soit leur statut, pagination comprise.
    // insights.actions donne le nombre de commentaires que Meta attribue à la pub :
    // source indépendante du post, qui révèle un effective_object_story_id erroné.
    const adFields =
      'id,name,effective_status,' +
      'creative{effective_object_story_id,object_story_id,thumbnail_url,' +
      'effective_instagram_media_id,instagram_user_id},' +
      'insights.date_preset(maximum){actions}'
    const adsFirst = await metaFetch(`/${metaAccountId}/ads`, token, {
      fields: adFields,
      limit: '100',
      filtering: JSON.stringify([{
        field: 'ad.effective_status',
        operator: 'IN',
        value: ['ACTIVE', 'PAUSED', 'ADSET_PAUSED', 'CAMPAIGN_PAUSED', 'PENDING_REVIEW',
                'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO', 'IN_PROCESS',
                'WITH_ISSUES', 'ARCHIVED'],
      }]),
    })
    const allAds = await drainPages(adsFirst)

    /** Comments Meta attributes to an ad, whichever post they actually landed on. */
    function adCommentCount(ad: Record<string, unknown>): number {
      const rows = (ad.insights as { data?: Record<string, unknown>[] } | undefined)?.data?.[0]
      const actions = rows?.actions as { action_type: string; value: string }[] | undefined
      return Number(actions?.find(a => a.action_type === 'comment')?.value || 0)
    }

    type AdMeta = { adName: string; thumbnail?: string }
    const fbPostMap = new Map<string, AdMeta>()    // FB postId → meta
    const igMediaMap = new Map<string, AdMeta>()   // IG media ID → meta

    // Ads Meta says received comments, so a post returning 0 stands out
    const adsWithComments: { adId: string; adName: string; expected: number; postId: string | null }[] = []
    let expectedTotal = 0

    const igUserIds = new Set<string>()

    for (const ad of allAds) {
      const creative = ad.creative as Record<string, string> | undefined
      const adName = ad.name as string
      const thumbnail = creative?.thumbnail_url
      const postId = creative?.effective_object_story_id || creative?.object_story_id
      // Meta hands the Instagram media id straight out — no need to guess it
      // from the Facebook post id, which never produced a valid one.
      const igMediaId = creative?.effective_instagram_media_id
      if (creative?.instagram_user_id) igUserIds.add(creative.instagram_user_id)

      const expected = adCommentCount(ad)
      if (expected > 0) {
        expectedTotal += expected
        adsWithComments.push({ adId: ad.id as string, adName, expected, postId: postId || null })
      }

      // An ad runs on both networks, so scan both rather than picking one
      if (postId && !fbPostMap.has(postId)) fbPostMap.set(postId, { adName, thumbnail })
      if (igMediaId && !igMediaMap.has(igMediaId)) igMediaMap.set(igMediaId, { adName, thumbnail })
    }

    // Fallback when /me/accounts came back short: ask each page that actually
    // owns an ad post for its own token and IG link.
    const pageIdsInAds = new Set<string>()
    for (const postId of fbPostMap.keys()) pageIdsInAds.add(postId.split('_')[0])
    const pageLookupErrors: string[] = []
    await mapLimit(
      [...pageIdsInAds].filter(pid => !pageTokens[pid]),
      4,
      async (pageId) => {
        try {
          const p = await metaFetch(`/${pageId}`, token, { fields: 'access_token,instagram_business_account{id}' })
          const at = p.access_token as string | undefined
          if (at) pageTokens[pageId] = at
          const ig = (p.instagram_business_account as { id?: string } | undefined)?.id
          if (ig) {
            pageToIgId[pageId] = ig
            if (at) igToPageToken[ig] = at
          }
        } catch (e) {
          pageLookupErrors.push(`${pageId}:${e instanceof Error ? e.message.slice(0, 90) : 'unknown'}`)
        }
      },
    )

    const igActorIdsFromPages = new Set<string>()
    for (const pageId of pageIdsInAds) {
      if (pageToIgId[pageId]) igActorIdsFromPages.add(pageToIgId[pageId])
    }

    // The per-ad comment counter aggregates Facebook and Instagram, so an ad whose
    // Facebook post is empty is running its comments on Instagram. Reaching them
    // needs an IG identity, which the page edge did not provide — try the other
    // documented routes and record which one answers.
    const igResolution: Record<string, unknown> = {}

    try {
      const r = await metaFetch(`/${metaAccountId}/instagram_accounts`, token, { fields: 'id,username' })
      const accs = (r.data || []) as { id: string; username?: string }[]
      igResolution.adAccountInstagram = accs
      for (const a of accs) {
        igActorIdsFromPages.add(a.id)
        if (!igToPageToken[a.id]) igToPageToken[a.id] = pageTokens[[...pageIdsInAds][0]] || token
      }
    } catch (e) {
      igResolution.adAccountInstagram = `err:${e instanceof Error ? e.message.slice(0, 120) : 'unknown'}`
    }

    for (const pageId of pageIdsInAds) {
      try {
        const r = await metaFetch(`/${pageId}/page_backed_instagram_accounts`, pageTokens[pageId] || token, { fields: 'id,username' })
        const accs = (r.data || []) as { id: string; username?: string }[]
        igResolution[`pageBacked:${pageId}`] = accs
        for (const a of accs) {
          igActorIdsFromPages.add(a.id)
          if (!igToPageToken[a.id]) igToPageToken[a.id] = pageTokens[pageId] || token
        }
      } catch (e) {
        igResolution[`pageBacked:${pageId}`] = `err:${e instanceof Error ? e.message.slice(0, 120) : 'unknown'}`
      }
    }

    // IG accounts named directly by the creatives, mapped to a page token so
    // their media can be read
    const anyPageToken = pageTokens[[...pageIdsInAds][0]] || token
    for (const igId of igUserIds) {
      igActorIdsFromPages.add(igId)
      if (!igToPageToken[igId]) igToPageToken[igId] = anyPageToken
    }
    igResolution.igUserIdsFromCreatives = [...igUserIds]

    const posts: PostItem[] = []
    const seenPostIds = new Set<string>()
    function addPost(p: PostItem) {
      if (seenPostIds.has(p.postId)) return
      seenPostIds.add(p.postId)
      posts.push(p)
    }

    // === FACEBOOK : commentaires des dark posts ===
    // filter=stream inclut les réponses, que le défaut (toplevel) omet.
    const fbDebugSummary: Record<string, number> = {}
    const fbTokenUsed: Record<string, string> = {}

    await mapLimit(Array.from(fbPostMap.entries()), 6, async ([postId, meta]) => {
      const [ownerId, storyId] = postId.split('_')
      const pageToken = pageTokens[ownerId]
      const candidates: [string, string][] = []
      if (pageToken) candidates.push(['page', pageToken])
      candidates.push(['user', token])
      // The ad-manager page id is not always the post's owner: a post surfaced as
      // /100063627366611/posts/1244... is not reachable as {page_id}_{story_id}.
      const idForms = [postId, storyId].filter(Boolean) as string[]
      for (const [kind, tok] of candidates) {
        // stream carries replies, toplevel is the API default — try both before
        // concluding a post has nothing
        for (const filter of ['stream', 'toplevel']) {
          for (const idForm of idForms) {
            const shape = idForm === postId ? 'composite' : 'story'
            try {
              const first = await metaFetch(`/${idForm}/comments`, tok, {
                fields: 'id,message,created_time,like_count,from{name}',
                filter,
                limit: '100',
                summary: 'true',
              })
              const raw = await drainPages(first)
              const total = (first.summary as { total_count?: number } | undefined)?.total_count
              if (total !== undefined) fbDebugSummary[postId] = Math.max(fbDebugSummary[postId] ?? 0, total)
              const comments = parseFBComments(raw)
              if (comments.length > 0) {
                fbTokenUsed[postId] = `${kind}:${filter}:${shape}`
                addPost({ adId: postId, adName: meta.adName, postId, thumbnail: meta.thumbnail, comments })
                return
              }
              fbTokenUsed[postId] = `${kind}:${filter}:${shape}:empty`
            } catch (e) {
              fbTokenUsed[postId] = `${kind}:${filter}:${shape}:err:${e instanceof Error ? e.message.slice(0, 60) : 'unknown'}`
            }
          }
        }
        // Only fall through to the user token when the page token was unusable
        if (kind === 'page' && !fbTokenUsed[postId]?.includes('err')) return
      }
    })

    // === INSTAGRAM : médias issus des ads ===
    const igDebugErrors: string[] = []
    const pageTokensIG = [...new Set([...Object.values(igToPageToken), token])]

    // Meta's own count per media, so an empty /comments reply can be told apart
    // from a media that genuinely has none
    const igReported: Record<string, number> = {}

    await mapLimit(Array.from(igMediaMap.entries()), 6, async ([igMediaId, meta]) => {
      if (pageTokensIG.length === 0) { igDebugErrors.push(`${igMediaId}:no-token`); return }
      for (const pt of pageTokensIG) {
        try {
          const info = await metaFetch(`/${igMediaId}`, pt, { fields: 'comments_count,media_type' })
          const count = Number(info.comments_count ?? -1)
          if (count >= 0) igReported[igMediaId] = count
        } catch (e) {
          igDebugErrors.push(`${igMediaId}:info:${e instanceof Error ? e.message.slice(0, 110) : 'unknown'}`)
        }
        try {
          const first = await metaFetch(`/${igMediaId}/comments`, pt, {
            fields: 'id,text,timestamp,like_count,username,replies{id,text,timestamp,like_count,username}',
            limit: '100',
          })
          const comments = parseIGComments(await drainPages(first))
          if (comments.length > 0) {
            addPost({ adId: igMediaId, adName: meta.adName, postId: igMediaId, thumbnail: meta.thumbnail, comments })
            return
          }
          igDebugErrors.push(`${igMediaId}:empty(reported=${igReported[igMediaId] ?? '?'})`)
        } catch (e) {
          igDebugErrors.push(`${igMediaId}:comments:${e instanceof Error ? e.message.slice(0, 110) : 'unknown'}`)
        }
      }
    })

    // === INSTAGRAM organiques des pages liées aux ads ===
    for (const igActorId of igActorIdsFromPages) {
      const pageToken = igToPageToken[igActorId]
      if (!pageToken) continue
      try {
        const mediaFirst = await metaFetch(`/${igActorId}/media`, pageToken, {
          fields: 'id,caption,timestamp,media_type,comments_count,thumbnail_url,media_url',
          limit: '100',
        })
        const media = (await drainPages(mediaFirst)) as unknown as {
          id: string; caption?: string; comments_count: number; thumbnail_url?: string; media_url?: string
        }[]
        await mapLimit(media.filter(m => m.comments_count > 0), 6, async (m) => {
          if (seenPostIds.has(m.id)) return
          try {
            const first = await metaFetch(`/${m.id}/comments`, pageToken, {
              fields: 'id,text,timestamp,like_count,username,replies{id,text,timestamp,like_count,username}',
              limit: '100',
            })
            const comments = parseIGComments(await drainPages(first))
            if (comments.length > 0) {
              addPost({
                adId: m.id,
                adName: (m.caption || '').slice(0, 60) || `Post Instagram ${m.id}`,
                postId: m.id,
                thumbnail: m.thumbnail_url || m.media_url,
                comments,
              })
            }
          } catch { /* ignore */ }
        })
      } catch { /* ignore */ }
    }

    // What does Meta consider the canonical node for the ad post that visibly
    // carries the most comments? permalink_url and from{id} expose the real owner.
    const postProbe: Record<string, unknown> = {}
    const topPost = adsWithComments[0]?.postId
    if (topPost) {
      const [ownerId, storyId] = topPost.split('_')
      const tok = pageTokens[ownerId] || token
      for (const idForm of [topPost, storyId]) {
        try {
          const r = await metaFetch(`/${idForm}`, tok, {
            fields: 'id,permalink_url,from{id,name},comments.summary(true).limit(0)',
          })
          postProbe[idForm] = {
            id: r.id,
            permalink_url: r.permalink_url,
            from: r.from,
            commentCount: (r.comments as { summary?: { total_count?: number } } | undefined)?.summary?.total_count,
          }
        } catch (e) {
          postProbe[idForm] = `err:${e instanceof Error ? e.message.slice(0, 120) : 'unknown'}`
        }
      }
    }

    const totalComments = posts.reduce((s, p) => s + p.comments.length, 0)
    // What Meta says exists, so a gap against totalComments is visible instead of silent
    const fbReportedTotal = Object.values(fbDebugSummary).reduce((s, n) => s + (n > 0 ? n : 0), 0)

    return NextResponse.json({
      posts,
      totalComments,
      adsScanned: fbPostMap.size + igMediaMap.size,
      debug: {
        adsFetched: allAds.length,
        fbPosts: fbPostMap.size,
        fbReportedTotal,
        // Meta's own per-ad comment counts: the gap against totalComments says
        // whether we are querying the wrong posts or the comments truly are gone
        expectedTotal,
        adsWithComments: adsWithComments.sort((a, b) => b.expected - a.expected).slice(0, 25),
        // The decisive signal: without page tokens, dark post comments read as 0
        pagesInAds: [...pageIdsInAds],
        pageTokensResolved: Object.keys(pageTokens).length,
        meAccountsError,
        pageLookupErrors: pageLookupErrors.slice(0, 10),
        fbTokenUsed,
        postProbe,
        fbSummary: fbDebugSummary,
        igMediaFromAds: igMediaMap.size,
        igReportedTotal: Object.values(igReported).reduce((s, n) => s + Math.max(n, 0), 0),
        igReported,
        igActorIds: [...igActorIdsFromPages],
        igResolution,
        igDebugErrors: igDebugErrors.slice(0, 30),
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
