import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deliverReport } from '@/lib/deliver'

function calcNextRunAt(frequency: string): Date {
  const next = new Date()
  switch (frequency) {
    case 'daily':        next.setDate(next.getDate() + 1); break
    case 'every_3_days': next.setDate(next.getDate() + 3); break
    case 'weekly':       next.setDate(next.getDate() + 7); break
    case 'monthly':      next.setDate(next.getDate() + 30); break
    default:             next.setDate(next.getDate() + 1)
  }
  next.setHours(7, 0, 0, 0)
  return next
}


export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const dbAccountId = searchParams.get('dbAccountId')

  const reports = await prisma.report.findMany({
    where: { adAccountId: dbAccountId || undefined, adAccount: { userId: session.user.id } },
    include: { agent: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({ reports })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { agentId, dbAccountId, title, content } = await req.json()

  const report = await prisma.report.create({
    data: { title, content, type: 'autopilot', adAccountId: dbAccountId, agentId: agentId || null },
  })

  let delivery: Awaited<ReturnType<typeof deliverReport>> = []
  if (agentId) {
    const agent = await prisma.autopilotAgent.findUnique({
      where: { id: agentId },
      select: {
        frequency: true, deliveryChannels: true,
        adAccount: { select: { name: true, brandSettings: { select: { reportEmail: true, reportEmailEnabled: true } } } },
      },
    })
    if (agent) {
      await prisma.autopilotAgent.update({
        where: { id: agentId },
        data: { lastRunAt: new Date(), nextRunAt: calcNextRunAt(agent.frequency) },
      })
      const bs = agent.adAccount?.brandSettings
      delivery = await deliverReport(
        content, title, agent.deliveryChannels, agent.adAccount?.name,
        bs?.reportEmailEnabled ? bs.reportEmail : null,
      )
    }
  }

  // Returned so a failed send surfaces in the UI instead of vanishing
  return NextResponse.json({ report, delivery })
}
