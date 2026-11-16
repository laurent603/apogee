import type { Jointe } from './recreer'

/**
 * Le second moteur de « Recréer » : l'image de ChatGPT (API OpenAI, endpoint
 * d'édition, qui accepte plusieurs images de référence). Mise en page plus
 * « pub » que Gemini, mais il redessine souvent le logo : l'utilisateur choisit
 * le moteur créa par créa.
 */

export const MODELE_OPENAI = 'chatgpt-image-latest'
const DELAI = 110_000

/** Sur Vercel, la clé a été enregistrée sous `API_Open_AI` : les trois noms sont acceptés. */
const cle = () => (process.env.OPENAI_API_KEY || process.env.API_Open_AI || process.env.OPENAI_KEY || '').trim().replace(/^["']|["']$/g, '')

export async function genererOpenAI(images: Jointe[], consigne: string): Promise<{ octets: Buffer; mimeType: string; modele: string }> {
  if (!cle()) throw new Error('Clé OpenAI absente : ajoutez OPENAI_API_KEY.')
  const form = new FormData()
  form.set('model', MODELE_OPENAI)
  form.set('prompt', consigne)
  form.set('size', '1024x1024')
  form.set('quality', 'high')
  // Reprend plus fidèlement les vraies photos jointes (le logo, lui, reste souvent redessiné).
  form.set('input_fidelity', 'high')
  images.forEach((j, i) => form.append('image[]', new Blob([new Uint8Array(Buffer.from(j.data, 'base64'))], { type: j.mimeType }), `image-${i}.${j.mimeType.split('/')[1] ?? 'png'}`))

  const r = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { authorization: `Bearer ${cle()}` }, body: form, signal: AbortSignal.timeout(DELAI),
  }).catch(() => null)
  if (!r) throw new Error('OpenAI n’a pas répondu à temps : réessayez.')
  const j = await r.json().catch(() => null)
  const message: string = j?.error?.message ?? ''
  if (r.status === 401) throw new Error('Clé OpenAI refusée.')
  if (r.status === 429) throw new Error(/quota|billing|credit/i.test(message) ? 'Crédit OpenAI épuisé : rechargez le compte.' : 'OpenAI est saturé : réessayez dans quelques minutes.')
  if (!r.ok) throw new Error(`OpenAI a refusé la génération : ${r.status} ${message}`.trim())
  const b64 = j?.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI n’a pas rendu d’image.')
  return { octets: Buffer.from(b64, 'base64'), mimeType: 'image/png', modele: MODELE_OPENAI }
}
