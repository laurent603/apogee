import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { anthropic, MODEL_REPORT, REPORT_REASONING } from '@/lib/anthropic'
import { getAccountOverview, getCampaigns, getAdSets, getAds, getAdsWithCopy, getPreviousPeriod, getLifetimeAdSpend, type LeadSource } from '@/lib/meta'
import { SYSTEM_BASE, DATA_FLOORS, DIRECTION_GUARD } from '@/lib/prompts'
import { deliverReport } from '@/lib/deliver'
import { renderKnowledgeForPrompt } from '@/lib/notion'
import { renderGhlForPrompt } from '@/lib/ghl'

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
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const dueAgents = await prisma.autopilotAgent.findMany({
    where: { isActive: true, OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }] },
    include: {
      adAccount: { select: { metaAccountId: true, name: true } },
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
        select: { leadSource: true, reportEmail: true, reportEmailEnabled: true },
      }).catch(() => null)
      const leadSource = (bs?.leadSource as LeadSource) || 'total'

      const ghlRow = await prisma.ghlConnection.findUnique({ where: { adAccountId: agent.adAccountId } }).catch(() => null)
      const lifetimeSpend = ghlRow?.adStats
        ? await getLifetimeAdSpend(metaAccountId, token, leadSource)
        : undefined
      const ghl = ghlRow?.adStats
        ? renderGhlForPrompt(ghlRow.adStats, {
            totalOpps: ghlRow.totalOpps, attributed: ghlRow.attributed,
            wonCount: ghlRow.wonCount, wonValue: ghlRow.wonValue, valueFilled: ghlRow.valueFilled,
          }, lifetimeSpend)
        : null

      const isCreative = agent.role === 'creative_strategist' || agent.role === 'copywriter'
      const knowledge = isCreative
        ? renderKnowledgeForPrompt(
            (await prisma.creativeKnowledge.findUnique({
              where: { adAccountId: agent.adAccountId }, select: { content: true },
            }).catch(() => null))?.content
          )
        : null
      const [overview, campaigns, adsets, ads, previous] = await Promise.all([
        getAccountOverview(metaAccountId, token, datePreset, leadSource),
        getCampaigns(metaAccountId, token, datePreset, leadSource),
        getAdSets(metaAccountId, token, datePreset, leadSource),
        isCreative
          ? getAdsWithCopy(metaAccountId, token, datePreset, leadSource)
          : getAds(metaAccountId, token, datePreset, leadSource),
        getPreviousPeriod(metaAccountId, token, datePreset, leadSource).catch(() => null),
      ])

      const comparison = previous
        ? `\n## Période précédente (${previous.periode})\nCalcule toute variation entre cette période et la période courante — ne l'affirme jamais sans ce calcul.\n### Vue d'ensemble\n${JSON.stringify(previous.overview, null, 2)}\n### Ads\n${JSON.stringify(previous.ads.slice(0, 20), null, 2)}`
        : `\n## Période précédente\nIndisponible — n'affirme aucune tendance ni fatigue, et dis-le explicitement.`

      const userMessage = `${agent.instructions}\n\nFormat de sortie : ${agent.outputFormat || 'Markdown structuré'}\n\n# Données Meta Ads\n## Vue d'ensemble\n${JSON.stringify(overview, null, 2)}\n## Campagnes\n${JSON.stringify(campaigns.slice(0, 10), null, 2)}\n## Ad Sets\n${JSON.stringify(adsets.slice(0, 10), null, 2)}\n## Ads\n${JSON.stringify(ads.slice(0, 20), null, 2)}${comparison}${ghl ? `\n${ghl}` : ''}${knowledge ? `\n## Référentiel créatif du compte\nTextes écrits pour ce compte par son creative strategist. Reprends SA taxonomie (niveaux de conscience, étapes de tunnel) et son style ; n'invente pas ta propre grille et ne lui attribue aucun chiffre de performance.\n\n${knowledge}` : ''}`

      let content = ''
      const stream = await anthropic.messages.stream({
        model: MODEL_REPORT,
        max_tokens: 16000,
        ...REPORT_REASONING,
        system: `${SYSTEM_BASE}\n${DATA_FLOORS}\n${DIRECTION_GUARD}\n\nTu génères des rapports précis et actionnables en Markdown.`,
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
      const delivery = await deliverReport(
        content, title, agent.deliveryChannels, agent.adAccount.name,
        bs?.reportEmailEnabled ? bs.reportEmail : null,
      )
      const failed = delivery.filter(d => !d.ok)
      results.push({
        agentId: agent.id,
        name: agent.name,
        status: failed.length ? `ok:livraison-partielle(${failed.map(f => `${f.channel}:${f.detail}`).join('; ')})` : 'ok',
      })
    } catch (e) {
      results.push({ agentId: agent.id, name: agent.name, status: `error:${e instanceof Error ? e.message.slice(0, 60) : 'unknown'}` })
    }
  }

  return NextResponse.json({ ran: results.length, results })
}
