import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * Les listes d'audiences enregistrées d'un compte.
 *
 * Le stade 3 de la méthode J7 rejoue la même liste canonique d'un mois sur
 * l'autre. La ressaisir à chaque fois — dix audiences, leurs villes, leurs
 * rayons, leurs intérêts — est le plus sûr moyen de ne plus le faire.
 */

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbAccountId = new URL(req.url).searchParams.get('dbAccountId')
  if (!dbAccountId) return NextResponse.json({ error: 'Missing dbAccountId' }, { status: 400 })

  const sets = await prisma.audienceSet.findMany({
    where: { adAccountId: dbAccountId, adAccount: { userId: session.user.id } },
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json(sets)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { dbAccountId, name, audiences } = await req.json()
  if (!dbAccountId || !name?.trim() || !Array.isArray(audiences)) {
    return NextResponse.json({ error: 'Missing dbAccountId, name or audiences' }, { status: 400 })
  }

  // Le compte doit appartenir à l'utilisateur : `dbAccountId` vient du client.
  const compte = await prisma.adAccount.findFirst({
    where: { id: dbAccountId, userId: session.user.id },
    select: { id: true },
  })
  if (!compte) return NextResponse.json({ error: 'Unknown account' }, { status: 404 })

  // Réenregistrer sous un nom déjà pris remplace la liste : c'est ce qu'on
  // attend d'un « enregistrer » après avoir corrigé deux rayons.
  const set = await prisma.audienceSet.upsert({
    where: { adAccountId_name: { adAccountId: dbAccountId, name: name.trim() } },
    update: { audiences },
    create: { adAccountId: dbAccountId, name: name.trim(), audiences },
  })
  return NextResponse.json(set)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { count } = await prisma.audienceSet.deleteMany({
    where: { id, adAccount: { userId: session.user.id } },
  })
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
