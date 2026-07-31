import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { analyzeWithClaude } from '@/lib/anthropic'
import { PROMPTS } from '@/lib/prompts'
import { getAccountOverview, getCampaigns, getAdSets, getAds, getDailyBreakdown } from '@/lib/meta'
import { prisma } from '@/lib/db'

type PromptCategory = keyof typeof PROMPTS
type PromptKey = string

function getPrompt(category: PromptCategory, key: PromptKey): string {
  const cat = PROMPTS[category] as Record<string, string>
  return cat[key] || Object.values(cat)[0]
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { accountId, dbAccountId, category, analysisType, datePreset = 'last_7d', brandSettings } = body

  if (!accountId || !category) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  const token = session.accessToken as string

  try {
    // Fetch relevant data based on analysis type
    const [overview, campaigns, adsets, ads, daily] = await Promise.all([
      getAccountOverview(accountId, token, datePreset),
      getCampaigns(accountId, token, datePreset),
      getAdSets(accountId, token, datePreset),
      getAds(accountId, token, datePreset),
      getDailyBreakdown(accountId, token, datePreset === 'last_7d' ? 7 : datePreset === 'last_14d' ? 14 : 30),
    ])

    const systemPrompt = getPrompt(category as PromptCategory, analysisType)

    const userMessage = `
# Données du compte Meta Ads

## Brand Settings (Profil Client)
${brandSettings ? JSON.stringify(brandSettings, null, 2) : 'Non renseigné'}

## Vue d'ensemble du compte (${datePreset})
${JSON.stringify(overview, null, 2)}

## Campagnes
${JSON.stringify(campaigns, null, 2)}

## Ad Sets
${JSON.stringify(adsets, null, 2)}

## Ads
${JSON.stringify(ads, null, 2)}

## Données journalières
${JSON.stringify(daily, null, 2)}

---
Lance maintenant l'analyse demandée avec ces données réelles.
`

    const result = await analyzeWithClaude(systemPrompt, userMessage)

    // Save report
    if (dbAccountId) {
      await prisma.report.create({
        data: {
          title: `${category} — ${analysisType} — ${new Date().toLocaleDateString('fr-FR')}`,
          type: category,
          content: result,
          adAccountId: dbAccountId,
        },
      })
    }

    return NextResponse.json({ result })
  } catch (err) {
    console.error('AI analyze error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
