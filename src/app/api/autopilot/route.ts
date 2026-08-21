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
  const { dbAccountId, metaAccountId, accountName, name, description, role, frequency, runMode, analysisPeriod, instructions, outputFormat, deliveryChannels } = body

  // Resolve adAccountId: find by DB id, fallback to upsert by metaAccountId
  let resolvedAccountId: string | null = null
  try {
    // Try direct DB id first (UUID)
    if (dbAccountId && !dbAccountId.startsWith('act_')) {
      const found = await prisma.adAccount.findUnique({ where: { id: dbAccountId } })
      if (found) resolvedAccountId = found.id
    }
    // Fallback: upsert by metaAccountId (when dbAccountId is act_xxx or not found)
    if (!resolvedAccountId) {
      const metaId = metaAccountId || dbAccountId
      if (metaId) {
        const acc = await prisma.adAccount.upsert({
          where: { userId_metaAccountId: { userId: session.user.id, metaAccountId: metaId } },
          update: { name: accountName || metaId },
          create: { metaAccountId: metaId, name: accountName || metaId, userId: session.user.id },
        })
        resolvedAccountId = acc.id
      }
    }
  } catch { /* ignore, resolvedAccountId stays null */ }

  if (!resolvedAccountId) {
    return NextResponse.json({ error: 'Compte publicitaire introuvable' }, { status: 400 })
  }

  const agent = await prisma.autopilotAgent.create({
    data: {
      name, description, role, frequency,
      runMode: runMode || 'report',
      analysisPeriod: analysisPeriod || 'last_7d',
      instructions: instructions || '',
      outputFormat: outputFormat || '',
      deliveryChannels: deliveryChannels || 'in_app',
      userId: session.user.id,
      adAccountId: resolvedAccountId,
    },
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
