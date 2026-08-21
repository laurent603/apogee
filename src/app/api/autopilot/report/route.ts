import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

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

async function deliverReport(content: string, title: string, deliveryChannels: string) {
  let config: Record<string, unknown> = {}
  try { config = JSON.parse(deliveryChannels) } catch { config = { channels: ['in_app'] } }
  const channels: string[] = (config.channels as string[]) || ['in_app']

  if (channels.includes('email') && config.email && process.env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'Metanalyzer <rapports@metanalyzer.app>',
          to: [config.email],
          subject: title,
          html: `<div style="font-family:sans-serif;max-width:700px;margin:auto;padding:24px">${content.replace(/\n/g, '<br>')}</div>`,
        }),
      })
    } catch { /* delivery error — don't block */ }
  }

  if (channels.includes('notion') && config.notionToken && config.notionPageId) {
    try {
      await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.notionToken}`,
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({
          parent: { page_id: config.notionPageId },
          properties: { title: { title: [{ text: { content: title } }] } },
          children: [{
            object: 'block', type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: content.slice(0, 2000) } }] },
          }],
        }),
      })
    } catch { /* delivery error */ }
  }
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

  if (agentId) {
    const agent = await prisma.autopilotAgent.findUnique({ where: { id: agentId }, select: { frequency: true, deliveryChannels: true } })
    if (agent) {
      await prisma.autopilotAgent.update({
        where: { id: agentId },
        data: { lastRunAt: new Date(), nextRunAt: calcNextRunAt(agent.frequency) },
      })
      await deliverReport(content, title, agent.deliveryChannels)
    }
  }

  return NextResponse.json({ report })
}
