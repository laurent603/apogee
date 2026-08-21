import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { anthropic } from '@/lib/anthropic'
import { PROMPTS } from '@/lib/prompts'
import { getAccountOverview, getCampaigns, getAdSets, getAds, getDailyBreakdown } from '@/lib/meta'
import { prisma } from '@/lib/db'

type PromptCategory = keyof typeof PROMPTS

function getPrompt(category: PromptCategory, key: string): string {
  const cat = PROMPTS[category] as Record<string, string>
  return cat[key] || Object.values(cat)[0]
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { accountId, dbAccountId, category, analysisType, datePreset = 'last_7d', brandSettings, customPrompt, agentRole, outputFormat } = body

  if (!accountId || !category) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  const token = session.accessToken as string
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const [overview, campaigns, adsets, ads, daily] = await Promise.all([
          getAccountOverview(accountId, token, datePreset),
          getCampaigns(accountId, token, datePreset),
          getAdSets(accountId, token, datePreset),
          getAds(accountId, token, datePreset),
          getDailyBreakdown(accountId, token, datePreset === 'last_7d' ? 7 : datePreset === 'last_14d' ? 14 : 30),
        ])

        const rolePersonas: Record<string, string> = {
          performance_manager: 'Tu es un Performance Manager Meta Ads expert. Tu analyses les données avec un focus sur le ROAS, CPM, CPA et la rentabilité globale. Tu prends des décisions data-driven et identifies les leviers de performance prioritaires.',
          media_buyer: 'Tu es un Media Buyer Meta Ads expert. Tu analyses les enchères, budgets, audiences et placements. Tu optimises l\'allocation budgétaire et identifies les opportunités de scaling.',
          creative_strategist: 'Tu es un Creative Strategist Meta Ads expert. Tu analyses les performances créatives : hook rate, hold rate, angles créatifs, fatigue publicitaire. Tu recommandes des briefs créatifs et des angles de communication qui convertissent.',
          copywriter: 'Tu es un Copywriter spécialisé Meta Ads. Tu analyses les accroches, descriptions et CTA. Tu proposes des variantes de copy optimisées pour la conversion.',
        }
        const rolePrompt = agentRole ? (rolePersonas[agentRole] || rolePersonas.performance_manager) : null
        const outputInstruction = outputFormat ? `\n\nFormat de sortie attendu : ${outputFormat}` : ''

        const systemPrompt = customPrompt
          ? `${rolePrompt || 'Tu es un expert Meta Ads et consultant en marketing digital.'} Tu analyses les données réelles du compte Meta Ads fourni et tu réponds précisément à la demande. Tes réponses sont structurées, actionnables et basées uniquement sur les données fournies. Tu utilises des tableaux, des titres et des listes.${outputInstruction}`
          : getPrompt(category as PromptCategory, analysisType)

        const dataContext = `
# Données du compte Meta Ads

## Brand Settings
${brandSettings ? JSON.stringify(brandSettings, null, 2) : 'Non renseigné'}

## Vue d'ensemble (${datePreset})
${JSON.stringify(overview, null, 2)}

## Campagnes
${JSON.stringify(campaigns, null, 2)}

## Ad Sets
${JSON.stringify(adsets, null, 2)}

## Ads
${JSON.stringify(ads, null, 2)}

## Données journalières
${JSON.stringify(daily, null, 2)}
`

        const userMessage = customPrompt
          ? `${dataContext}\n\n---\n\nQuestion de l'utilisateur : ${customPrompt}`
          : `${dataContext}\n\n---\nLance maintenant l'analyse demandée avec ces données réelles.`

        let fullResult = ''
        const claudeStream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        })

        for await (const chunk of claudeStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullResult += chunk.delta.text
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }

        if (dbAccountId && fullResult) {
          await prisma.report.create({
            data: {
              title: `${category} — ${analysisType} — ${new Date().toLocaleDateString('fr-FR')}`,
              type: category,
              content: fullResult,
              adAccountId: dbAccountId,
            },
          }).catch(() => {})
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n**Erreur:** ${String(err)}`))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
