import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { anthropic } from '@/lib/anthropic'
import { getAccountOverview, getCampaigns, getAdSets, getAds, type LeadSource } from '@/lib/meta'

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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'Metanalyzer <rapports@metanalyzer.app>',
          to: [config.email],
          subject: title,
          html: `<div style="font-family:sans-serif;max-width:700px;margin:auto;padding:24px">${content.replace(/\n/g, '<br>')}</div>`,
        }),
      })
    } catch { /* ignore */ }
  }

  if (channels.includes('notion') && config.notionToken && config.notionPageId) {
    try {
      await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.notionToken}`, 'Notion-Version': '2022-06-28' },
        body: JSON.stringify({
          parent: { page_id: config.notionPageId },
          properties: { title: { title: [{ text: { content: title } }] } },
          children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: content.slice(0, 2000) } }] } }],
        }),
      })
    } catch { /* ignore */ }
  }
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const dueAgents = await prisma.autopilotAgent.findMany({
    where: { isActive: true, OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }] },
    include: {
      adAccount: { select: { metaAccountId: true } },
      user: { select: { accessToken: true } },
    },
  })

  const results: { agentId: string; name: string; status: string }[] = []

  for (const agent of dueAgents) {
    try {
      const token = agent.user.accessToken
      const metaAccountId = agent.adAccount.metaAccountId
      if (!token || !metaAccountId) { results.push({ agentId: agent.id, name: agent.name, status: 'skip:no-token' }); continue }

      const datePreset = agent.analysisPeriod || 'last_7d'
      const bs = await prisma.brandSettings.findUnique({
        where: { adAccountId: agent.adAccountId },
        select: { leadSource: true },
      }).catch(() => null)
      const leadSource = (bs?.leadSource as LeadSource) || 'total'
      const [overview, campaigns, adsets, ads] = await Promise.all([
        getAccountOverview(metaAccountId, token, datePreset, leadSource),
        getCampaigns(metaAccountId, token, datePreset, leadSource),
        getAdSets(metaAccountId, token, datePreset, leadSource),
        getAds(metaAccountId, token, datePreset, leadSource),
      ])

      const userMessage = `${agent.instructions}\n\nFormat de sortie : ${agent.outputFormat || 'Markdown structuré'}\n\n# Données Meta Ads\n## Vue d'ensemble\n${JSON.stringify(overview, null, 2)}\n## Campagnes\n${JSON.stringify(campaigns.slice(0, 10), null, 2)}\n## Ad Sets\n${JSON.stringify(adsets.slice(0, 10), null, 2)}\n## Ads\n${JSON.stringify(ads.slice(0, 20), null, 2)}`

      let content = ''
      const stream = await anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: `Tu es un expert Meta Ads. Tu analyses les données du compte et tu génères des rapports précis et actionnables. Réponds en Markdown.`,
        messages: [{ role: 'user', content: userMessage }],
      })
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          content += chunk.delta.text
        }
      }

      const title = `${agent.name} — ${now.toLocaleDateString('fr-FR')}`
      await prisma.report.create({
        data: { title, content, type: 'autopilot', adAccountId: agent.adAccountId, agentId: agent.id },
      })
      await prisma.autopilotAgent.update({
        where: { id: agent.id },
        data: { lastRunAt: now, nextRunAt: calcNextRunAt(agent.frequency) },
      })
      await deliverReport(content, title, agent.deliveryChannels)
      results.push({ agentId: agent.id, name: agent.name, status: 'ok' })
    } catch (e) {
      results.push({ agentId: agent.id, name: agent.name, status: `error:${e instanceof Error ? e.message.slice(0, 60) : 'unknown'}` })
    }
  }

  return NextResponse.json({ ran: results.length, results })
}
