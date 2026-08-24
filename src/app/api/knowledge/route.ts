import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { fetchNotionKnowledge } from '@/lib/notion'

// A hundred Notion pages against a ~3 req/s limit takes well over a minute
export const maxDuration = 300

/** Status only — never returns the token or the full corpus. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbAccountId = req.nextUrl.searchParams.get('dbAccountId')
  if (!dbAccountId) return NextResponse.json({ error: 'dbAccountId requis' }, { status: 400 })

  const k = await prisma.creativeKnowledge.findUnique({
    where: { adAccountId: dbAccountId },
    select: { notionSourceId: true, itemCount: true, syncedAt: true, syncError: true, notionToken: true },
  })

  return NextResponse.json({
    knowledge: k
      ? {
          notionSourceId: k.notionSourceId,
          hasToken: Boolean(k.notionToken),
          itemCount: k.itemCount,
          syncedAt: k.syncedAt,
          syncError: k.syncError,
        }
      : null,
  })
}

/** Saves the connection settings without fetching anything. */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { dbAccountId, notionToken, notionSourceId } = await req.json()
  if (!dbAccountId) return NextResponse.json({ error: 'dbAccountId requis' }, { status: 400 })

  // An empty token from the client means "unchanged", so the stored secret is
  // never wiped just because the field renders blank
  const data: Record<string, string | null> = { notionSourceId: notionSourceId || null }
  if (notionToken) data.notionToken = notionToken

  await prisma.creativeKnowledge.upsert({
    where: { adAccountId: dbAccountId },
    update: data,
    create: { adAccountId: dbAccountId, notionSourceId: notionSourceId || null, notionToken: notionToken || null },
  })

  return NextResponse.json({ ok: true })
}

/** Runs the sync and stores the corpus. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { dbAccountId } = await req.json()
  if (!dbAccountId) return NextResponse.json({ error: 'dbAccountId requis' }, { status: 400 })

  const k = await prisma.creativeKnowledge.findUnique({ where: { adAccountId: dbAccountId } })
  if (!k?.notionToken || !k?.notionSourceId) {
    return NextResponse.json({ error: 'Renseignez le token et l\'ID de la source Notion avant de synchroniser.' }, { status: 400 })
  }

  try {
    const { items, kind } = await fetchNotionKnowledge(k.notionSourceId, k.notionToken)
    await prisma.creativeKnowledge.update({
      where: { adAccountId: dbAccountId },
      data: {
        content: JSON.stringify(items),
        itemCount: items.length,
        syncedAt: new Date(),
        syncError: null,
      },
    })
    return NextResponse.json({ ok: true, itemCount: items.length, kind })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue'
    await prisma.creativeKnowledge.update({
      where: { adAccountId: dbAccountId },
      data: { syncError: message.slice(0, 400) },
    }).catch(() => {})
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
