import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const dbAccountId = searchParams.get('dbAccountId')

  const agents = await prisma.autopilotAgent.findMany({
    where: { userId: session.user.id, adAccountId: dbAccountId || undefined },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ agents })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { dbAccountId, ...data } = body

  const agent = await prisma.autopilotAgent.create({
    data: { ...data, userId: session.user.id, adAccountId: dbAccountId },
  })

  return NextResponse.json({ agent })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, ...data } = body

  const agent = await prisma.autopilotAgent.update({ where: { id }, data })
  return NextResponse.json({ agent })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  await prisma.autopilotAgent.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
