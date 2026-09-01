import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { anthropic, MODEL_REPORT, REPORT_REASONING } from '@/lib/anthropic'
import { getAccountOverview, getCampaigns, getAdSets, getAds, getAdsWithCopy, getPreviousPeriod, getLifetimeAdSpend, type LeadSource } from '@/lib/meta'
import { SYSTEM_BASE, DATA_FLOORS, DIRECTION_GUARD, BLOC_ACTIONNABLES } from '@/lib/prompts'

/**
 * Le format de sortie demandé à l'agent, débarrassé de toute demande de HTML.
 *
 * Ce champ est saisi une fois puis stocké : deux gabarits réclamaient
 * « Dashboard HTML visuel », et les agents créés à partir d'eux gardaient cette
 * consigne en base longtemps après la correction du gabarit. Elle arrive en fin
 * de message, donc elle l'emportait sur la règle du socle système, et le
 * rapport partait en document HTML — affiché comme code source par l'e-mail
 * comme par l'application, puisque ni l'un ni l'autre n'attend du HTML.
 *
 * Nettoyer ici plutôt qu'en base seulement : c'est le seul endroit par lequel
 * tous les agents passent, quels que soient leur âge et leur provenance.
 */
function formatDeSortie(brut: string | null | undefined): string {
  const v = (brut || '').trim()
  if (!v) return 'Markdown structuré : titres, tableaux, listes.'
  if (!/html|<[a-z]/i.test(v)) return v
  return 'Markdown structuré : titres, tableaux, listes. Aucun HTML.'
}
import { deliverReport } from '@/lib/deliver'
import { renderKnowledgeForPrompt } from '@/lib/notion'
import { renderGhlForPrompt } from '@/lib/ghl'
import { notifyIncident } from '@/lib/notify'
import { cronAutorise } from '@/lib/cron-auth'

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
  if (!cronAutorise(req)) {
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
    // Ce que l'agent n'a pas réussi à charger. Un rapport peut se générer
    // sans ces données et paraître normal : on le signale sans crier au feu.
    const degraded: string[] = []
    try {
      const token = agent.user.accessToken
      const metaAccountId = agent.adAccount.metaAccountId
      if (!token || !metaAccountId) {
        results.push({ agentId: agent.id, name: agent.name, status: 'skip:no-token' })
        // Un agent actif sans jeton ne tournera jamais : c'est une panne
        // silencieuse, pas un cas normal à ignorer.
        await notifyIncident({
          source: 'agent_cron',
          title: `Agent « ${agent.name} » ne peut pas démarrer`,
          error: !token
            ? 'Aucun jeton d\'accès Facebook sur le compte utilisateur rattaché à cet agent.'
            : 'Le compte publicitaire rattaché à cet agent n\'a pas d\'identifiant Meta.',
          cause: !token
            ? 'La session Facebook du propriétaire a probablement expiré. Une reconnexion à l\'application régénère le jeton.'
            : 'Le compte a été créé sans metaAccountId. Resélectionnez-le dans le sélecteur de compte.',
          adAccountId: agent.adAccountId,
          accountName: agent.adAccount.name,
          agentName: agent.name,
          email: true,
        })
        continue
      }

      const datePreset = agent.analysisPeriod || 'last_7d'
      const bs = await prisma.brandSettings.findUnique({
        where: { adAccountId: agent.adAccountId },
        select: { leadSource: true, reportEmail: true, reportEmailEnabled: true },
      }).catch(() => null)
      const leadSource = (bs?.leadSource as LeadSource) || 'total'

      const ghlRow = await prisma.ghlConnection.findUnique({ where: { adAccountId: agent.adAccountId } }).catch(() => null)
      // Sans dépense lifetime, la colonne « Coût/vente » se vide et le modèle
      // retombe sur le taux de gain seul — exactement l'erreur de classement
      // qu'on cherche à éviter. À signaler, pas à avaler.
      const lifetimeSpend = ghlRow?.adStats
        ? await getLifetimeAdSpend(metaAccountId, token, leadSource).catch((e) => {
            degraded.push(`Dépense totale par publicité indisponible (${e instanceof Error ? e.message : 'erreur'}) — la colonne « Coût/vente » du tableau CRM sera vide.`)
            return undefined
          })
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
        getPreviousPeriod(metaAccountId, token, datePreset, leadSource).catch((e) => {
          degraded.push(`Période de comparaison indisponible (${e instanceof Error ? e.message : 'erreur'}) — le rapport ne pourra affirmer aucune tendance.`)
          return null
        }),
      ])

      const comparison = previous
        ? `\n## Période précédente (${previous.periode})\nCalcule toute variation entre cette période et la période courante — ne l'affirme jamais sans ce calcul.\n### Vue d'ensemble\n${JSON.stringify(previous.overview, null, 2)}\n### Ads\n${JSON.stringify(previous.ads.slice(0, 20), null, 2)}`
        : `\n## Période précédente\nIndisponible — n'affirme aucune tendance ni fatigue, et dis-le explicitement.`

      const userMessage = `${agent.instructions}\n\nFormat de sortie : ${formatDeSortie(agent.outputFormat)}\n\n# Données Meta Ads\n## Vue d'ensemble\n${JSON.stringify(overview, null, 2)}\n## Campagnes\n${JSON.stringify(campaigns.slice(0, 10), null, 2)}\n## Ad Sets\n${JSON.stringify(adsets.slice(0, 10), null, 2)}\n## Ads\n${JSON.stringify(ads.slice(0, 20), null, 2)}${comparison}${ghl ? `\n${ghl}` : ''}${knowledge ? `\n## Référentiel créatif du compte\nTextes écrits pour ce compte par son creative strategist. Reprends SA taxonomie (niveaux de conscience, étapes de tunnel) et son style ; n'invente pas ta propre grille et ne lui attribue aucun chiffre de performance.\n\n${knowledge}` : ''}`

      let content = ''
      const stream = await anthropic.messages.stream({
        model: MODEL_REPORT,
        max_tokens: 16000,
        ...REPORT_REASONING,
        system: `${SYSTEM_BASE}\n${DATA_FLOORS}\n${DIRECTION_GUARD}\n\nTu génères des rapports précis et actionnables en Markdown.${BLOC_ACTIONNABLES}`,
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

      // Le rapport existe en base mais n'est arrivé nulle part. C'est le
      // scénario « j'ai lancé un audit et je n'ai jamais reçu le mail ».
      if (failed.length) {
        await notifyIncident({
          source: 'delivery',
          title: `Rapport « ${agent.name} » généré mais non livré`,
          error: failed.map(f => `${f.channel} : ${f.detail || 'échec sans détail'}`).join('\n'),
          cause: 'Le rapport est bien enregistré et reste consultable dans l\'onglet Historique de l\'Autopilot. Seul l\'acheminement a échoué.',
          adAccountId: agent.adAccountId,
          accountName: agent.adAccount.name,
          agentName: agent.name,
          email: true,
        })
      }

      // Rapport livré, mais bâti sur des données incomplètes.
      if (degraded.length) {
        await notifyIncident({
          level: 'warning',
          source: 'enrichment',
          title: `Rapport « ${agent.name} » généré avec des données manquantes`,
          error: degraded.join('\n'),
          cause: 'Le rapport a été produit et livré, mais il lui manque des données. Ses conclusions peuvent être incomplètes sans que rien ne le signale dans le texte.',
          adAccountId: agent.adAccountId,
          accountName: agent.adAccount.name,
          agentName: agent.name,
          email: false,
        })
      }
    } catch (e) {
      results.push({ agentId: agent.id, name: agent.name, status: `error:${e instanceof Error ? e.message.slice(0, 60) : 'unknown'}` })
      await notifyIncident({
        source: 'agent_cron',
        title: `Échec de l'agent « ${agent.name} »`,
        error: e,
        cause: degraded.length
          ? `L'agent avait déjà rencontré des problèmes de données avant de s'arrêter :\n${degraded.join('\n')}`
          : undefined,
        context: `Compte : ${agent.adAccount.name}\nRôle : ${agent.role}\nPériode : ${agent.analysisPeriod || 'last_7d'}\nFréquence : ${agent.frequency}`,
        adAccountId: agent.adAccountId,
        accountName: agent.adAccount.name,
        agentName: agent.name,
        email: true,
      })
    }
  }

  // Purge de rétention : sans elle le journal grossit indéfiniment.
  await prisma.errorLog
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } } })
    .catch(() => null)

  return NextResponse.json({ ran: results.length, results })
}
