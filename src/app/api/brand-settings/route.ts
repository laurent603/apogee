import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const dbAccountId = searchParams.get('dbAccountId')
  if (!dbAccountId) return NextResponse.json({ error: 'Missing dbAccountId' }, { status: 400 })

  const settings = await prisma.brandSettings.findUnique({ where: { adAccountId: dbAccountId } })
  return NextResponse.json({ settings })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { dbAccountId, ...data } = body

  if (!dbAccountId) return NextResponse.json({ error: 'Missing dbAccountId' }, { status: 400 })

  const settings = await prisma.brandSettings.upsert({
    where: { adAccountId: dbAccountId },
    update: data,
    create: { adAccountId: dbAccountId, ...data },
  })

  return NextResponse.json({ settings })
}
