import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { anthropic, MODEL_REPORT, MODEL_CHAT, REPORT_REASONING } from '@/lib/anthropic'
import { PROMPTS } from '@/lib/prompts'
import { getAccountOverview, getCampaigns, getAdSets, getAds, getAdsWithCopy, getDailyBreakdown, getPreviousPeriod, type LeadSource } from '@/lib/meta'
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
  const { accountId, dbAccountId, category, analysisType, datePreset = 'last_7d', brandSettings, customPrompt, agentRole, outputFormat, deep } = body

  if (!accountId || !category) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  const token = session.accessToken as string
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const leadSource = (brandSettings?.leadSource as LeadSource) || 'total'
        // Creative work needs the actual copy; everything else keeps the lighter
        // payload it already had
        const needsCopy = category === 'creativeStrategy' || agentRole === 'creative_strategist' || agentRole === 'copywriter'
        const [overview, campaigns, adsets, ads, daily, previous] = await Promise.all([
          getAccountOverview(accountId, token, datePreset, leadSource),
          getCampaigns(accountId, token, datePreset, leadSource),
          getAdSets(accountId, token, datePreset, leadSource),
          needsCopy
            ? getAdsWithCopy(accountId, token, datePreset, leadSource)
            : getAds(accountId, token, datePreset, leadSource),
          getDailyBreakdown(accountId, token, datePreset === 'last_7d' ? 7 : datePreset === 'last_14d' ? 14 : 30),
          // Fatigue and trend prompts need a real baseline to subtract from
          getPreviousPeriod(accountId, token, datePreset, leadSource).catch(() => null),
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

        const leadSourceNote = {
          total: `Le champ "Prospects (leads)" est le total Meta (site web + formulaires). Si "Alerte prospects" est présente dans les données, les deux sources sont actives et le total peut être un double comptage : signale-le au lieu de raisonner dessus comme si c'était fiable.`,
          meta: `Ce compte ne retient QUE les prospects issus des formulaires instantanés Meta. "Prospects (leads)" et "Coût par prospect" sont déjà calculés sur cette base. Ignore "Prospects site web" : ce sont des doublons renvoyés par le CRM via la CAPI, jamais de vrais prospects supplémentaires.`,
          website: `Ce compte ne retient QUE les prospects du site web (pixel/CAPI). "Prospects (leads)" et "Coût par prospect" sont déjà calculés sur cette base. Ignore "Prospects Meta".`,
        }[leadSource]

        const dataContext = `
# Données du compte Meta Ads

## Définition des prospects (à respecter impérativement)
${leadSourceNote}

## Brand Settings
${brandSettings ? JSON.stringify(brandSettings, null, 2) : 'Non renseigné'}

## Vue d'ensemble (${datePreset})
${JSON.stringify(overview, null, 2)}

## Campagnes
${JSON.stringify(campaigns, null, 2)}

## Ad Sets
${JSON.stringify(adsets, null, 2)}

## Ads${needsCopy ? ` — le champ _copy contient le texte réel de chaque publicité
(texte_principal, titre, description, cta, variantes, cartes de carrousel).
Cite-le mot pour mot quand tu analyses une créa ; ne paraphrase pas et n'invente
aucun texte. Une publicité dont _copy est null n'a pas de texte exploitable — dis-le
au lieu de raisonner sur son nom de fichier.` : ''}
${JSON.stringify(ads, null, 2)}

## Données journalières
${JSON.stringify(daily, null, 2)}

## Période précédente — base de comparaison
${previous
  ? `Fenêtre de même durée précédant immédiatement la période courante : ${previous.periode}.
Toute variation (fatigue, tendance, évolution) doit être calculée entre cette période et la période courante — jamais affirmée sans ce calcul. Une ad absente d'ici est trop récente pour être jugée : signale-la comme telle au lieu de lui inventer une tendance.

### Vue d'ensemble (période précédente)
${JSON.stringify(previous.overview, null, 2)}

### Ads (période précédente)
${JSON.stringify(previous.ads, null, 2)}`
  : `Indisponible. N'affirme aucune variation, tendance ou fatigue : tu n'as qu'une seule période. Dis explicitement que la comparaison n'a pas pu être faite.`}
`

        const userMessage = customPrompt
          ? `${dataContext}\n\n---\n\nQuestion de l'utilisateur : ${customPrompt}`
          : `${dataContext}\n\n---\nLance maintenant l'analyse demandée avec ces données réelles.`

        // A scheduled report wants depth; a chat turn wants to come back quickly.
        // Keyed off an explicit flag, not the persona — chat picks a persona too.
        let fullResult = ''
        const claudeStream = anthropic.messages.stream({
          model: deep ? MODEL_REPORT : MODEL_CHAT,
          max_tokens: 16000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
          ...(deep ? REPORT_REASONING : {}),
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
