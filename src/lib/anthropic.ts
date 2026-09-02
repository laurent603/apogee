import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

/**
 * Deep reasoning for reports — multi-factor decomposition (CPA causes, fatigue
 * across two windows) is where a model that thinks before answering earns its
 * cost, and where the previous generation produced contradictory tables.
 */
export const MODEL_REPORT = 'claude-opus-5'

/** Interactive chat and comment extraction: same price as before, one generation newer. */
export const MODEL_CHAT = 'claude-sonnet-5'

/** Adaptive thinking, on for report generation only. */
export const REPORT_REASONING = {
  thinking: { type: 'adaptive' as const },
  output_config: { effort: 'high' as const },
}

/**
 * Une panne passagère du modèle, par opposition à une erreur de notre fait.
 *
 * Un prompt trop long ou une clé invalide ne guériront pas d'un second essai ;
 * une surcharge des serveurs, si. On ne recommence que sur la seconde famille.
 */
export function estTransitoire(e: unknown): boolean {
  const err = e as { status?: number; message?: string; error?: { type?: string } }
  const statut = err?.status
  if (statut === 408 || statut === 409 || statut === 429 || (statut && statut >= 500)) return true
  const texte = `${err?.error?.type || ''} ${err?.message || ''}`.toLowerCase()
  return /overloaded|rate_limit|timeout|econnreset|socket hang up|fetch failed/.test(texte)
}

/**
 * Relance un appel au modèle quand il échoue pour une raison passagère.
 *
 * Le SDK réessaie déjà les requêtes refusées d'emblée, mais pas un flux qui
 * s'interrompt en cours de route : c'est pourtant ainsi qu'arrive une
 * surcharge (`overloaded_error`, HTTP 529) sur les rapports longs. Sans
 * reprise, une heure de cron partait à la poubelle et l'utilisateur recevait
 * un e-mail d'échec pour un incident qui se serait résolu tout seul.
 *
 * L'échéance existe parce qu'une fonction serverless est coupée sans préavis :
 * mieux vaut renoncer à la reprise et rendre l'erreur que se faire tuer au
 * milieu, sans notification du tout.
 */
export async function avecReprise<T>(
  travail: () => Promise<T>,
  { essais = 3, echeance, attentes = [4000, 12000] }: { essais?: number; echeance?: number; attentes?: number[] } = {},
): Promise<T> {
  let derniere: unknown
  for (let i = 0; i < essais; i++) {
    try {
      return await travail()
    } catch (e) {
      derniere = e
      const attente = attentes[Math.min(i, attentes.length - 1)]
      const dernierTour = i === essais - 1
      const tempsManquant = echeance !== undefined && Date.now() + attente > echeance
      if (dernierTour || tempsManquant || !estTransitoire(e)) throw e
      await new Promise((r) => setTimeout(r, attente))
    }
  }
  throw derniere
}

export async function analyzeWithClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: MODEL_CHAT,
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')
  return content.text
}

export async function streamAnalyze(
  systemPrompt: string,
  userMessage: string,
  onChunk: (text: string) => void
): Promise<string> {
  let full = ''
  const stream = anthropic.messages.stream({
    model: MODEL_CHAT,
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      full += chunk.delta.text
      onChunk(chunk.delta.text)
    }
  }
  return full
}
