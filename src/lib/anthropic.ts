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
