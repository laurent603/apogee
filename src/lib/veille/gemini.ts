/**
 * « Décortiquer cette pub » : Gemini regarde la vidéo (image et son) ou
 * l'image, et rend l'accroche, l'angle, le concept, la structure et la
 * transcription horodatée. Claude ne lit pas l'audio d'une vidéo ; Gemini le
 * fait en un seul appel.
 */

// Mesuré le 12/11/2026 : gemini-3.5-flash répond en 4 à 7 s (image, vidéo) ;
// l'alias gemini-flash-latest était saturé (503, ou rien en 90 s) et
// gemini-2.5-flash n'est plus ouvert aux nouveaux comptes. L'alias reste en
// secours, avec 50 s par modèle pour tenir dans la limite Vercel de 120 s.
const MODELES = ['gemini-3.5-flash', 'gemini-flash-latest']
const DELAI_PAR_MODELE = 50_000
// La requête inline plafonne à 20 Mo, base64 compris.
const TAILLE_MAX = 14 * 1024 * 1024

export type Decorticage = {
  accroche: string
  angle: string
  concept: string
  promesse: string
  appelAction: string
  structure: { type: string; resume: string }[]
  transcription: { debut: number; source: 'voix' | 'ecran'; texte: string }[]
  modele: string
  date: string
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    accroche: { type: 'STRING' },
    angle: { type: 'STRING' },
    concept: { type: 'STRING' },
    promesse: { type: 'STRING' },
    appelAction: { type: 'STRING' },
    structure: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { type: { type: 'STRING' }, resume: { type: 'STRING' } }, required: ['type', 'resume'] },
    },
    transcription: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { debut: { type: 'NUMBER' }, source: { type: 'STRING', enum: ['voix', 'ecran'] }, texte: { type: 'STRING' } },
        required: ['debut', 'source', 'texte'],
      },
    },
  },
  required: ['accroche', 'angle', 'concept', 'promesse', 'appelAction', 'structure', 'transcription'],
}

const CONSIGNE = `Tu es stratège créatif en publicité Meta à réponse directe. Décortique cette publicité : le média joint et le texte de l'annonce ci-dessous. Réponds en français.
- accroche : la première phrase qui arrête le scroll, citée telle qu'elle est dite ou écrite.
- angle : en 2 à 4 mots, ce que la pub met en avant (ex. « Fonctionnement produit », « Peur de l'arnaque », « Économies chiffrées », « Preuve sociale »).
- concept : en 2 à 4 mots, la forme créative (ex. « Listicle / chiffres clés », « Témoignage client », « Face caméra fondateur », « Avant / après »).
- promesse : le bénéfice promis, en une phrase.
- appelAction : ce que la pub demande de faire, en une phrase.
- structure : les étapes du message dans l'ordre ; type parmi Accroche, Problème, Agitation, Solution, Preuve, Offre, Objection, Appel à l'action ; résumé d'une phrase.
- transcription : pour une vidéo, chaque phrase de voix off (source « voix ») et chaque texte affiché à l'écran (source « ecran »), avec son instant de début en secondes ; pour une image, chaque bloc de texte visible (source « ecran », debut 0). Recopie les textes tels quels, sans les corriger ni les traduire.`

const TYPES: Record<string, string> = { mp4: 'video/mp4', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }

export async function decortiquer(mediaUrl: string, annonce: { titre: string | null; texte: string | null }): Promise<Decorticage> {
  const cle = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '')
  if (!cle) throw new Error('GEMINI_API_KEY manquant')
  const mimeType = TYPES[mediaUrl.split('?')[0].split('.').pop()?.toLowerCase() ?? '']
  if (!mimeType) throw new Error('Format de média non pris en charge')

  const media = await fetch(mediaUrl)
  if (!media.ok) throw new Error(`Média introuvable (${media.status})`)
  const octets = Buffer.from(await media.arrayBuffer())
  if (octets.length > TAILLE_MAX) throw new Error('Média trop lourd pour l’analyse (plus de 14 Mo)')

  const contexte = `\n\nTitre de l'annonce : ${annonce.titre ?? '—'}\nTexte de l'annonce : ${annonce.texte ?? '—'}`
  const corps = JSON.stringify({
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: octets.toString('base64') } }, { text: CONSIGNE + contexte }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
  })
  let r: Response | null = null
  let j: any = null
  let erreur = ''
  for (const modele of MODELES) {
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': cle },
        body: corps,
        signal: AbortSignal.timeout(DELAI_PAR_MODELE),
      })
    } catch {
      r = null
      erreur = `${modele} n’a pas répondu en ${DELAI_PAR_MODELE / 1000} s`
      continue
    }
    j = await r.json().catch(() => null)
    if (r.status !== 503 && r.status !== 429) break
    erreur = `${modele} saturé (${r.status})`
  }
  if (!r?.ok) throw new Error(`Gemini a refusé l’analyse : ${r ? `${r.status} ${j?.error?.message ?? ''}` : erreur}`)
  const texte = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
  if (!texte) throw new Error('Gemini n’a rien renvoyé')
  const brut = JSON.parse(texte)
  return {
    ...brut,
    transcription: [...(brut.transcription ?? [])].sort((a, b) => a.debut - b.debut),
    modele: j.modelVersion ?? MODELES[0],
    date: new Date().toISOString(),
  }
}
