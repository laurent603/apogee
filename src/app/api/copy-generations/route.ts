import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/** Generated copy lives with the Creative Strategist page, not in the reports history. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbAccountId = req.nextUrl.searchParams.get('dbAccountId')
  if (!dbAccountId) return NextResponse.json({ generations: [] })

  const generations = await prisma.copyGeneration.findMany({
    where: { adAccountId: dbAccountId, adAccount: { userId: session.user.id } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  return NextResponse.json({ generations })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { dbAccountId, mode, awareness, product, offer, audience, tone, cta, result } = await req.json()
  if (!dbAccountId || !product || !result) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  }

  const generation = await prisma.copyGeneration.create({
    data: {
      adAccountId: dbAccountId,
      mode: mode || 'direct',
      awareness: awareness || null,
      product, offer: offer || null, audience: audience || null,
      tone: tone || null, cta: cta || null,
      result: typeof result === 'string' ? result : JSON.stringify(result),
    },
  })
  return NextResponse.json({ generation })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  // Scoped through the account relation so one user cannot delete another's
  const gen = await prisma.copyGeneration.findFirst({
    where: { id, adAccount: { userId: session.user.id } },
    select: { id: true },
  })
  if (!gen) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  await prisma.copyGeneration.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
