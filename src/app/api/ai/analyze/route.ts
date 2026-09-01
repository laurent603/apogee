import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { anthropic, MODEL_REPORT, MODEL_CHAT, REPORT_REASONING } from '@/lib/anthropic'
import { PROMPTS, BLOC_ACTIONNABLES } from '@/lib/prompts'
import { getAccountOverview, getCampaigns, getAdSets, getAds, getAdsWithCopy, getDailyBreakdown, getPreviousPeriod, getLifetimeAdSpend, type LeadSource } from '@/lib/meta'
import { prisma } from '@/lib/db'
import { renderKnowledgeForPrompt } from '@/lib/notion'
import { fetchAdImages, toImageBlocks } from '@/lib/adImages'
import { renderGhlForPrompt } from '@/lib/ghl'
import { notifyIncident } from '@/lib/notify'

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
  const { accountId, dbAccountId, category, analysisType, datePreset = 'last_7d', brandSettings, customPrompt, agentRole, outputFormat, deep, adId, adName, enregistrer, titre, typeRapport, historique } = body

  if (!accountId || !category) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  const token = session.accessToken as string
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const leadSource = (brandSettings?.leadSource as LeadSource) || 'total'

        // What became of the leads. Relevant to every analysis that weighs a
        // creative or a budget, not only to creative work.
        const ghlRow = dbAccountId
          ? await prisma.ghlConnection.findUnique({ where: { adAccountId: dbAccountId } }).catch(() => null)
          : null
        // All-time deals need an all-time denominator, or the cost per sale is
        // out by an order of magnitude
        const lifetimeSpend = ghlRow?.adStats
          ? await getLifetimeAdSpend(accountId, token, leadSource)
          : undefined
        const ghl = ghlRow?.adStats
          ? renderGhlForPrompt(ghlRow.adStats, {
              totalOpps: ghlRow.totalOpps, attributed: ghlRow.attributed,
              wonCount: ghlRow.wonCount, wonValue: ghlRow.wonValue, valueFilled: ghlRow.valueFilled,
            }, lifetimeSpend)
          : null
        // Creative work needs the actual copy; everything else keeps the lighter
        // payload it already had
        const needsCopy = category === 'creativeStrategy' || agentRole === 'creative_strategist' || agentRole === 'copywriter'
        // Reference copy the account's own strategist wrote — only worth loading
        // for creative work, and only if it has been synced
        const knowledge = needsCopy && dbAccountId
          ? renderKnowledgeForPrompt(
              (await prisma.creativeKnowledge.findUnique({
                where: { adAccountId: dbAccountId }, select: { content: true },
              }).catch(() => null))?.content
            )
          : null
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
        // Une consigne de format qui réclame du HTML annulerait la règle du
        // socle système, puisqu'elle arrive après elle.
        const formatDemande = /html|<[a-z]/i.test(outputFormat || '') ? '' : (outputFormat || '')
        const outputInstruction = formatDemande ? `\n\nFormat de sortie attendu : ${formatDemande}` : ''

        /**
         * Seul un rapport d'agent porte le bloc final : `deep` n'est envoyé
         * que par l'exécution d'un agent. Une réponse de discussion qui se
         * terminerait par du JSON serait du bruit.
         *
         * La consigne vit ici, et non dans les instructions de l'agent :
         * celles-ci dorment en base, et modifier les modèles du code
         * n'aurait rien changé aux agents déjà créés.
         */
        const blocFinal = deep ? BLOC_ACTIONNABLES : ''

        const systemPrompt = customPrompt
          ? `${rolePrompt || 'Tu es un expert Meta Ads et consultant en marketing digital.'} Tu analyses les données réelles du compte Meta Ads fourni et tu réponds précisément à la demande. Tes réponses sont structurées, actionnables et basées uniquement sur les données fournies. Tu utilises des tableaux, des titres et des listes. Tu réponds en Markdown et n'émets jamais de HTML ni de bloc de code contenant du HTML.${outputInstruction}${blocFinal}`
          : `${getPrompt(category as PromptCategory, analysisType)}${blocFinal}`

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
${ghl ? `
${ghl}
` : ''}
${knowledge ? `
## Référentiel créatif du compte
Textes publicitaires écrits pour ce compte par son creative strategist, classés
selon SA grille (étape de tunnel, niveau de conscience, angle…).

Ce référentiel fait autorité sur trois points :
- **La taxonomie** : reprends ses niveaux de conscience et ses étapes de tunnel tels quels. N'invente pas ta propre grille.
- **Le style** : accroches, rythme, vocabulaire. Tout texte que tu produis doit pouvoir s'insérer dans ce corpus sans détonner.
- **Le déjà-fait** : un angle présent ici mais absent des publicités actives est une piste à signaler, pas une découverte à présenter comme neuve.

C'est une référence, pas des données de performance : ne lui attribue aucun chiffre.

${knowledge}
` : ''}

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

        // Creative work is judged on what the ad looks like, not only on what
        // it says — send the visuals when the model is going to reason about them
        const images = needsCopy ? await fetchAdImages(ads).catch(() => []) : []
        const imageNote = images.length
          ? `\n\n---\nLes visuels des ${images.length} publicités les plus dépensières sont joints. Regarde-les : composition, texte incrusté, cohérence entre l'accroche visuelle et le texte. Ne commente que ce que tu vois réellement.`
          : ''

        // A scheduled report wants depth; a chat turn wants to come back quickly.
        // Keyed off an explicit flag, not the persona — chat picks a persona too.
        let fullResult = ''
        const claudeStream = anthropic.messages.stream({
          model: deep ? MODEL_REPORT : MODEL_CHAT,
          max_tokens: 16000,
          system: systemPrompt,
          messages: [
            /**
             * Les tours précédents, quand l'appelant en tient.
             *
             * Une discussion n'envoyait que le dernier message : l'agent
             * redécouvrait le compte et la question à chaque tour, sans rien
             * savoir de ce qui avait été dit. D'où l'impression qu'il oublie
             * les questions de base et part dans toutes les directions — il
             * n'avait aucun fil à suivre.
             *
             * Les dix derniers échanges suffisent : au-delà, on paie un
             * contexte que la conversation n'exploite plus.
             */
            ...(Array.isArray(historique) ? historique : [])
              .filter((m: { role?: string; content?: string }) =>
                (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
              .slice(-10)
              .map((m: { role: string; content: string }) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content.slice(0, 12000),
              })),
            {
              role: 'user' as const,
              content: [
                { type: 'text' as const, text: userMessage + imageNote },
                ...toImageBlocks(images),
              ],
            },
          ],
          ...(deep ? REPORT_REASONING : {}),
        })

        for await (const chunk of claudeStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullResult += chunk.delta.text
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }

        /**
         * L'appelant enregistre parfois lui-même.
         *
         * Une exécution d'agent passait par ici puis réenregistrait le rapport
         * par sa propre route — celle qui gère aussi l'envoi par courriel et la
         * prochaine échéance. Résultat : deux lignes dans l'historique pour une
         * seule analyse, l'une préfixée « autopilot — », l'autre non.
         */
        if (dbAccountId && fullResult && enregistrer !== false) {
          await prisma.report.create({
            data: {
              // Le nom de la créa fait un bien meilleur titre que la catégorie :
              // c'est ce qu'on cherche en revenant six semaines plus tard.
              /**
               * Un titre fourni l'emporte sur le titre construit.
               *
               * Une conversation libre s'enregistrait sous « autopilot —
               * session — 01/09/2026 » : un intitulé technique, impossible à
               * distinguer d'un rapport d'agent dans l'historique.
               */
              title: titre
                || (adName
                  ? `${adName} — ${new Date().toLocaleDateString('fr-FR')}`
                  : `${category} — ${analysisType} — ${new Date().toLocaleDateString('fr-FR')}`),
              type: typeRapport || category,
              content: fullResult,
              adAccountId: dbAccountId,
              adId: typeof adId === 'string' ? adId : null,
              adName: typeof adName === 'string' ? adName : null,
            },
          }).catch(async (e) => {
            // L'analyse s'est affichée à l'écran mais n'ira pas dans
            // l'Historique : sans trace, elle est simplement perdue au refresh.
            await notifyIncident({
              level: 'warning',
              source: 'agent_chat',
              title: 'Analyse produite mais non enregistrée',
              error: e,
              cause: 'Le texte affiché à l\'écran n\'a pas été sauvegardé dans l\'Historique. Copiez-le avant de quitter la page si vous en avez besoin.',
              adAccountId: dbAccountId,
              email: false,
            })
          })
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n**Erreur:** ${String(err)}`))
        // Pas de mail : l'erreur est déjà sous les yeux de l'utilisateur.
        // La trace sert à repérer les pannes récurrentes.
        await notifyIncident({
          source: 'agent_chat',
          title: `Échec de l'analyse — ${category}`,
          error: err,
          context: `Catégorie : ${category}\nType : ${analysisType}`,
          adAccountId: dbAccountId,
          email: false,
        })
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
