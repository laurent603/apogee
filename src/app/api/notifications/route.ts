import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * Journal des incidents.
 *
 * Les lignes n'ont pas de clé étrangère vers AdAccount (voir le modèle), donc
 * le filtrage par compte se fait sur la colonne `adAccountId` telle quelle.
 * Les incidents sans compte — un lancement dont le compte n'a pas pu être
 * résolu, par exemple — restent visibles quel que soit le filtre : ce sont
 * précisément ceux qu'il ne faut pas perdre.
 */

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbAccountId = req.nextUrl.searchParams.get('dbAccountId') || undefined

  const [items, unread] = await Promise.all([
    prisma.errorLog.findMany({
      where: dbAccountId ? { OR: [{ adAccountId: dbAccountId }, { adAccountId: null }] } : undefined,
      orderBy: { lastSeenAt: 'desc' },
      take: 100,
    }),
    prisma.errorLog.count({
      where: {
        isRead: false,
        ...(dbAccountId ? { OR: [{ adAccountId: dbAccountId }, { adAccountId: null }] } : {}),
      },
    }),
  ])

  return NextResponse.json({ items, unread })
}

/** Marque comme lu : une seule ligne, ou toutes celles du filtre courant. */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, allRead, dbAccountId } = await req.json() as {
    id?: string; allRead?: boolean; dbAccountId?: string
  }

  if (allRead) {
    await prisma.errorLog.updateMany({
      where: dbAccountId ? { OR: [{ adAccountId: dbAccountId }, { adAccountId: null }] } : undefined,
      data: { isRead: true },
    })
  } else if (id) {
    await prisma.errorLog.update({ where: { id }, data: { isRead: true } })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  const all = req.nextUrl.searchParams.get('all')

  if (all === '1') {
    const dbAccountId = req.nextUrl.searchParams.get('dbAccountId') || undefined
    await prisma.errorLog.deleteMany({
      where: dbAccountId ? { OR: [{ adAccountId: dbAccountId }, { adAccountId: null }] } : undefined,
    })
  } else if (id) {
    await prisma.errorLog.delete({ where: { id } })
  }

  return NextResponse.json({ ok: true })
}
