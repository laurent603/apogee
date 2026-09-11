import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { anthropic, MODEL_REPORT, MODEL_CHAT, REPORT_REASONING, estTransitoire } from '@/lib/anthropic'
import { PROMPTS, BLOC_ACTIONNABLES, DISCIPLINE_RAPPORT, DISCIPLINE_GENERATIVE, RAPPORT_HTML, ORDRE_SORTIE, natureDuRapport } from '@/lib/prompts'
import { getAccountOverview, getCampaigns, getAdSets, getAds, getAdsWithCopy, getDailyBreakdown, getPreviousPeriod, getLifetimeAdSpend, type LeadSource } from '@/lib/meta'
import { prisma } from '@/lib/db'
import { renderKnowledgeForPrompt } from '@/lib/notion'
import { fetchAdImages, toImageBlocks } from '@/lib/adImages'
import { renderGhlForPrompt } from '@/lib/ghl'
import { notifyIncident } from '@/lib/notify'

/**
 * Le budget de temps, qui manquait.
 *
 * Cette route porte tous les rapports d'agent et toutes les discussions, et
 * elle tournait sur le défaut de la plateforme. En portant le plafond de
 * jetons à 32 000 pour les documents HTML sans toucher au temps, j'ai reproduit
 * exactement la panne des briefs : la fonction est coupée en pleine
 * génération, le navigateur garde ce qu'il a reçu, et le rapport s'arrête au
 * milieu d'un mot.
 *
 * Trois cents secondes ne suffisaient pas : une stratégie full-funnel mesure
 * trente mille jetons de sortie, soit six à sept minutes de rédaction — 362 s,
 * 372 s, 409 s selon les variantes essayées. La coupure était systématique.
 * C'est le plafond du compte, pas le nôtre : Hobby s'arrête à 300, Pro monte à
 * 800.
 */
export const maxDuration = 800

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
         *
         * Elle est jointe au **message**, pas au prompt système : placée dans
         * le système, à quinze mille jetons de la fin, le premier rapport
         * produit l'a purement ignorée. En dernière position, c'est la
         * dernière chose lue avant la rédaction.
         */
        /**
         * Diagnostic ou livrable génératif : les deux n'obéissent pas aux
         * mêmes règles. Un scan de fatigue doit tenir en un écran ; une
         * stratégie full-funnel doit produire cinq personas et douze angles,
         * et la discipline des diagnostics l'en empêchait.
         */
        const demande = customPrompt || `${category} ${analysisType} ${outputFormat || ''}`
        const generatif = natureDuRapport(demande) === 'generatif'
        // Un livrable génératif sort en document HTML : le Markdown ne sait
        // pas faire un bandeau de chiffres, une pastille d'état ni une carte.
        // Il ne porte alors pas de bloc d'actionnables — celui-ci se lit dans
        // un rapport Markdown, pas dans un document mis en page.
        /**
         * `DISCIPLINE_GENERATIVE` était orpheline depuis `4f48e42`.
         *
         * Son unique point d'appel — `disciplinePour(demande) + BLOC_ACTIONNABLES`
         * — a été remplacé par le branchement HTML, et la constante est restée
         * exportée sans personne pour l'importer. Depuis, aucun livrable
         * génératif ne recevait « produis le nombre demandé, et jamais moins »
         * ni « jamais deux fois la même mécanique » : d'où les banques d'angles
         * qui rendent huit entrées dont trois reposent sur le même ressort.
         *
         * Les deux blocs ne se recouvrent pas : l'un gouverne la matière,
         * l'autre la forme. La forme vient en dernier, c'est ce qui se lit juste
         * avant d'écrire.
         */
        const blocFinal = deep
          ? (generatif
              ? DISCIPLINE_GENERATIVE + RAPPORT_HTML
              : DISCIPLINE_RAPPORT + RAPPORT_HTML + BLOC_ACTIONNABLES + ORDRE_SORTIE)
          : ''

        /**
         * Une consigne de stratégie tapée dans la discussion mérite le modèle
         * des rapports.
         *
         * La diversité des propositions vient de la réflexion étendue : la
         * même consigne rendait cinq personas chez Opus et une liste plate
         * chez Sonnet, quand elle n'abandonnait pas une section en route. Le
         * seuil de longueur protège la discussion ordinaire — une question de
         * deux lignes n'a pas besoin de ça, et la réponse arriverait deux
         * minutes plus tard.
         */
        /**
         * Une demande générative passe en profondeur, quelle que soit sa
         * longueur.
         *
         * Un seuil de quatre cents signes renvoyait « construis-moi une
         * stratégie full-funnel avec personas et les 3 premiers briefs » —
         * cent neuf signes, parfaitement explicite — sur le modèle rapide et
         * le Markdown. Le vocabulaire suffit à trancher : personne ne demande
         * des personas ou des briefs par mégarde.
         */
        const chatProfond = !deep && generatif
        /**
         * Le document n'est plus réservé aux livrables génératifs.
         *
         * Un scan de fatigue, une revue hebdomadaire, un classement top/flop
         * sont exactement les livrables dont Laurent a fourni les exemplaires —
         * et le mot « fatigue » les envoyait sur la branche qui interdit le
         * HTML. La forme ne se décide plus au vocabulaire de la demande : elle
         * se décide à ce que la réponse contient, et c'est au modèle de le
         * voir, pas à une expression régulière.
         *
         * `chatProfond` ne commande donc plus que la **profondeur** — modèle de
         * rapport et réflexion étendue — pas la forme.
         */
        const disciplineChat = deep
          ? ''
          : (generatif ? DISCIPLINE_GENERATIVE + RAPPORT_HTML : RAPPORT_HTML)

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
        const demarrerFlux = () => anthropic.messages.stream({
          model: deep || chatProfond ? MODEL_REPORT : MODEL_CHAT,
          /**
           * Un document HTML coûte deux à trois fois son équivalent Markdown
           * en balises et en style. À seize mille, la dernière section sautait
           * — c'est exactement ce qu'on cherche à corriger.
           */
          /**
           * Le plafond de sortie, borné par le temps plus que par le modèle.
           *
           * L'audit Andromeda à 50 points a été coupé à 40 000 : avec la
           * réflexion étendue, qui compte dans ce plafond, un rapport dense le
           * dépasse. Le modèle accepte 64 000, mais à environ quatre-vingt-dix
           * jetons par seconde cela ferait sept cents secondes, contre huit
           * cents avant que Vercel ne coupe la fonction — sans marge pour
           * l'appel Meta ni l'écriture en base. 56 000 tient dans le budget.
           */
          max_tokens: deep || chatProfond ? 56000 : 24000,
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
                { type: 'text' as const, text: userMessage + imageNote + blocFinal + disciplineChat },
                ...toImageBlocks(images),
              ],
            },
          ],
          ...(deep || chatProfond ? REPORT_REASONING : {}),
        })

        /**
         * Une surcharge du modèle relance la génération — tant que rien n'a
         * été écrit à l'écran.
         *
         * Passé le premier caractère, recommencer produirait deux débuts de
         * rapport collés l'un à l'autre dans la fenêtre du navigateur : à ce
         * moment-là, mieux vaut l'erreur franche.
         */
        /**
         * Pourquoi la réponse s'est arrêtée.
         *
         * Une discussion s'est enregistrée coupée au milieu d'un mot, sans que
         * rien ne le signale : le flux se terminait proprement sur un
         * `stop_reason` de troncature que personne ne lisait. Une réponse
         * incomplète doit se voir à l'écran, et non passer pour une réponse.
         */
        let arret: string | null = null
        for (let essai = 0; ; essai++) {
          try {
            for await (const chunk of demarrerFlux()) {
              if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                fullResult += chunk.delta.text
                controller.enqueue(encoder.encode(chunk.delta.text))
              }
              if (chunk.type === 'message_delta' && chunk.delta.stop_reason) {
                arret = chunk.delta.stop_reason
              }
            }
            if (arret && arret !== 'end_turn' && arret !== 'stop_sequence') {
              const avis = `\n\n> ⚠️ **Réponse incomplète** — la génération s'est arrêtée avant la fin (\`${arret}\`). Relance la demande, ou restreins-la à une période plus courte.`
              fullResult += avis
              controller.enqueue(encoder.encode(avis))
            }
            break
          } catch (e) {
            if (fullResult || essai >= 2 || !estTransitoire(e)) throw e
            await new Promise((r) => setTimeout(r, essai === 0 ? 4000 : 12000))
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
