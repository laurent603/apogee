import sharp from 'sharp'

/**
 * « Recréer pour ce client » : une pub concurrente qui marche sert de modèle
 * à une image neuve, au logo, aux couleurs et à l'offre du client. On reprend
 * la mécanique (composition, hiérarchie, angle), jamais la marque du concurrent.
 *
 * Le modèle rend un carré ; la Story en est tirée (versStory) : demandée en
 * 9:16, il posait logo et titres dans les 20 % du haut à chaque essai.
 */

// Nano Banana Pro écrit le mieux le français dans l'image ; 2.1 prend le relais s'il est saturé.
const MODELES_IMAGE = ['gemini-3-pro-image', 'gemini-nano-banana-2.1']
const DELAI = 90_000
// 2K : de quoi tenir les 1 080 px de Meta. Seul Pro accepte le réglage.
const TAILLE_IMAGE: Record<string, string> = { 'gemini-3-pro-image': '2K' }
// La requête inline plafonne à 20 Mo, base64 compris.
const TAILLE_PHOTO_MAX = 4 * 1024 * 1024

export const FORMATS_CREA = ['1:1', '9:16'] as const
export type FormatCrea = (typeof FORMATS_CREA)[number]

export type MarqueClient = {
  nom: string
  site: string | null
  secteur: string | null
  description: string | null
  proposition: string | null
  couleurs: string[]
}

type Jointe = { mimeType: string; data: string }

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

/** Télécharge une image pour la joindre à la requête ; null si trop lourde ou introuvable. */
export async function jointe(url: string, max = Infinity): Promise<Jointe | null> {
  const r = await fetch(url).catch(() => null)
  if (!r?.ok) return null
  const octets = Buffer.from(await r.arrayBuffer())
  if (octets.length > max) return null
  const type = (r.headers.get('content-type') || '').split(';')[0].trim()
  const mimeType = type.startsWith('image/') ? type : TYPES[url.split('?')[0].split('.').pop()?.toLowerCase() ?? ''] ?? 'image/jpeg'
  return { mimeType, data: octets.toString('base64') }
}

export const jointePhoto = (url: string) => jointe(url, TAILLE_PHOTO_MAX)

/** La consigne, images numérotées dans l'ordre où elles sont jointes. */
export function consigne(m: MarqueClient, avecLogo: boolean, nbPhotos: number, precision?: string) {
  let n = 1
  const lignes = [
    'Tu es directeur artistique en publicité Meta à réponse directe.',
    `Image ${n++} : une publicité d'un concurrent, qui marche. Crée une NOUVELLE publicité pour « ${m.nom} » en reprenant ce qui la fait marcher : sa composition, sa hiérarchie visuelle, le type de visuel et l'angle du message.`,
    'Interdit : le nom, le logo, les couleurs de marque, les personnes et les phrases du concurrent. Écris des textes neufs, en français, courts et sans faute d’orthographe.',
    `Ce que fait ${m.nom} : ${[m.secteur, m.description, m.proposition].filter(Boolean).join('. ') || 'voir son site'}.${m.site ? ` Site : ${m.site}.` : ''}`,
    avecLogo
      ? `Image ${n++} : le logo de ${m.nom}. Pose-le tel quel, sans le redessiner ni changer ses couleurs.`
      : `Pas de logo fourni : écris « ${m.nom} » en texte sobre là où le concurrent met le sien.`,
    m.couleurs.length > 0 && `Couleurs de marque, la principale d'abord : ${m.couleurs.join(', ')}.`,
    nbPhotos > 0 &&
      `${nbPhotos > 1 ? `Images ${n} à ${n + nbPhotos - 1}` : `Image ${n}`} : des photos réelles de ${m.nom}. Utilise-les comme visuel principal plutôt que d'en inventer un.`,
    'N’invente ni prix, ni chiffre, ni promotion, ni label, ni avis que la marque n’a pas donnés.',
    precision?.trim() && `Précision : ${precision.trim()}`,
    'Format carré 1:1. Garde une petite marge entre les textes et les bords.',
  ]
  return lignes.filter(Boolean).join('\n')
}

/** Une image générée. Les erreurs sont formulées pour l'utilisateur. */
export async function genererImage(images: Jointe[], texte: string): Promise<{ octets: Buffer; mimeType: string; modele: string }> {
  const cle = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '')
  if (!cle) throw new Error('GEMINI_API_KEY manquant')
  const corps = (modele: string) => JSON.stringify({
    contents: [{ role: 'user', parts: [...images.map((inlineData) => ({ inlineData })), { text: texte }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1', ...(TAILLE_IMAGE[modele] && { imageSize: TAILLE_IMAGE[modele] }) } },
  })

  let derniere = 'Gemini est saturé en ce moment : réessayez dans quelques minutes.'
  for (const modele of MODELES_IMAGE) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': cle },
      body: corps(modele),
      signal: AbortSignal.timeout(DELAI),
    }).catch(() => null)
    if (!r) continue
    const j = await r.json().catch(() => null)
    const message: string = j?.error?.message ?? ''
    // L'offre gratuite de l'API a un quota d'images à 0 : inutile d'essayer le modèle suivant.
    if (r.status === 429 && message.includes('free_tier')) {
      throw new Error('La clé Gemini est sur l’offre gratuite, qui ne génère pas d’images : activez la facturation dans Google AI Studio.')
    }
    if (r.status === 429 || r.status === 503) continue
    if (!r.ok) throw new Error(`Gemini a refusé la génération : ${r.status} ${message}`)
    const partie = j?.candidates?.[0]?.content?.parts?.find((p: { inlineData?: Jointe }) => p.inlineData)
    if (partie) return { octets: Buffer.from(partie.inlineData.data, 'base64'), mimeType: partie.inlineData.mimeType, modele: j.modelVersion ?? modele }
    derniere = `Gemini n’a pas rendu d’image (${j?.candidates?.[0]?.finishReason ?? j?.promptFeedback?.blockReason ?? 'sans raison donnée'}).`
  }
  throw new Error(derniere)
}

/**
 * La Story 1080 × 1920 tirée d'un carré : le carré au centre (de 22 % à 78 %
 * de la hauteur, hors des bandes que couvre l'interface). Chaque bande
 * prolonge le bord du carré, étiré et flouté : le fond continue, sans le
 * fantôme des textes et visages qu'un flou de l'image entière y laissait.
 */
export async function versStory(carre: Buffer): Promise<Buffer> {
  const [L, H, BANDE] = [1080, 1920, 420]
  const centre = await sharp(carre).resize(L, L).toBuffer()
  const bord = (top: number) =>
    sharp(centre).extract({ left: 0, top, width: L, height: 16 }).resize(L, BANDE, { fit: 'fill' }).blur(30).modulate({ brightness: 0.85 }).toBuffer()
  return sharp({ create: { width: L, height: H, channels: 3, background: '#000000' } })
    .composite([
      { input: await bord(0), top: 0, left: 0 },
      { input: centre, top: BANDE, left: 0 },
      { input: await bord(L - 16), top: BANDE + L, left: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer()
}
