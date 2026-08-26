import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

/**
 * Journal des incidents.
 *
 * Le filtrage est STRICT : un compte sélectionné ne montre que ses propres
 * incidents. Un incident sans compte ne remonte jamais sous un autre — il
 * serait attribué à tort, ce qui est exactement ce qu'on veut éviter.
 *
 * Ces orphelins ne sont pas perdus pour autant : ils sont comptés à part et
 * consultables via `unassigned=1`. Tous les points d'appel renseignent
 * désormais le compte, donc un orphelin signale un bug, pas un cas normal.
 */

function scope(dbAccountId?: string, unassigned?: boolean): Prisma.ErrorLogWhereInput | undefined {
  if (unassigned) return { adAccountId: null }
  if (dbAccountId) return { adAccountId: dbAccountId }
  return undefined // aucun compte sélectionné : on montre tout
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbAccountId = req.nextUrl.searchParams.get('dbAccountId') || undefined
  const unassigned = req.nextUrl.searchParams.get('unassigned') === '1'
  const where = scope(dbAccountId, unassigned)

  const [items, unread, orphans] = await Promise.all([
    prisma.errorLog.findMany({ where, orderBy: { lastSeenAt: 'desc' }, take: 100 }),
    prisma.errorLog.count({ where: { ...(where || {}), isRead: false } }),
    // Signalé séparément pour qu'un incident non rattaché reste visible
    // quelque part sans polluer le compte affiché.
    prisma.errorLog.count({ where: { adAccountId: null } }),
  ])

  return NextResponse.json({ items, unread, orphans })
}

/** Marque comme lu : une ligne, ou toutes celles du périmètre courant. */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, allRead, dbAccountId, unassigned } = await req.json() as {
    id?: string; allRead?: boolean; dbAccountId?: string; unassigned?: boolean
  }

  if (allRead) {
    await prisma.errorLog.updateMany({ where: scope(dbAccountId, unassigned), data: { isRead: true } })
  } else if (id) {
    await prisma.errorLog.update({ where: { id }, data: { isRead: true } })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    await prisma.errorLog.delete({ where: { id } }).catch(() => null)
  } else if (req.nextUrl.searchParams.get('all') === '1') {
    await prisma.errorLog.deleteMany({
      where: scope(
        req.nextUrl.searchParams.get('dbAccountId') || undefined,
        req.nextUrl.searchParams.get('unassigned') === '1',
      ),
    })
  }

  return NextResponse.json({ ok: true })
}
