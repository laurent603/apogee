/**
 * Une publicité de la Meta Ad Library, ramenée à ce que la veille garde.
 *
 * La forme d'entrée est celle que la page de la bibliothèque reçoit (JSON
 * embarqué et réponses /api/graphql/) : un `collated_result` avec son
 * `snapshot`. Ce fichier n'importe rien, pour pouvoir être vérifié avec
 * `node scripts/veille-normaliser.check.mjs`.
 */

export type MediaSource = { type: 'image' | 'video'; url: string; apercu?: string }

export type PubNormalisee = {
  adArchiveId: string
  pageId: string
  pageNom: string
  format: string
  texte: string | null
  titre: string | null
  description: string | null
  cta: string | null
  lienUrl: string | null
  plateformes: string[]
  debut: Date | null
  fin: Date | null
  active: boolean
  medias: MediaSource[]
}

const MEDIAS_MAX = 10

/** Les DCO portent des gabarits (`{{product.name}}`) à la place du texte. */
function propre(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t && !t.includes('{{') ? t : null
}

/**
 * Le serveur télécharge ces liens : on n'accepte que le CDN de Meta, sinon
 * n'importe qui détenant la clé pourrait lui faire appeler une adresse
 * interne.
 */
function urlMeta(v: unknown): string | null {
  if (typeof v !== 'string') return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && u.hostname.endsWith('.fbcdn.net') ? u.toString() : null
  } catch {
    return null
  }
}

function date(v: unknown): Date | null {
  return typeof v === 'number' && v > 0 ? new Date(v * 1000) : null
}

type Brut = Record<string, any>

function mediaDe(m: Brut, videoSd: boolean): MediaSource | null {
  const hd = urlMeta(m.video_hd_url)
  const sd = urlMeta(m.video_sd_url)
  const video = videoSd ? sd ?? hd : hd ?? sd
  if (video) {
    const apercu = urlMeta(m.video_preview_image_url)
    return apercu ? { type: 'video', url: video, apercu } : { type: 'video', url: video }
  }
  const image = urlMeta(m.original_image_url) ?? urlMeta(m.resized_image_url)
  return image ? { type: 'image', url: image } : null
}

/**
 * `videoSd` : les scans Espion prennent la vidéo en définition standard,
 * trois à quatre fois plus légère ; une sauvegarde garde la HD.
 */
export function normaliserPub(brut: unknown, { videoSd = false } = {}): PubNormalisee {
  const p = brut as Brut
  const s = (p?.snapshot ?? {}) as Brut
  const adArchiveId = String(p?.ad_archive_id ?? '')
  const pageId = String(p?.page_id ?? s.page_id ?? '')
  if (!/^\d+$/.test(adArchiveId)) throw new Error('ad_archive_id invalide')
  if (!/^\d+$/.test(pageId)) throw new Error('page_id invalide')

  const cartes: Brut[] = Array.isArray(s.cards) ? s.cards : []
  const premiere = cartes[0] ?? {}
  const medias = [
    ...(Array.isArray(s.videos) ? s.videos : []),
    ...(Array.isArray(s.images) ? s.images : []),
    ...cartes,
  ]
    .map((m) => mediaDe(m, videoSd))
    .filter((m): m is MediaSource => m !== null)
    .slice(0, MEDIAS_MAX)

  return {
    adArchiveId,
    pageId,
    // Le nom de premier niveau est l'annonceur ; celui du snapshot peut être
    // le créateur d'un contenu de marque.
    pageNom: propre(p.page_name) ?? propre(s.page_name) ?? pageId,
    format: propre(s.display_format) ?? 'IMAGE',
    texte: propre(s.body?.text) ?? propre(premiere.body),
    titre: propre(s.title) ?? propre(premiere.title),
    description: propre(s.link_description) ?? propre(premiere.link_description),
    cta: propre(s.cta_text) ?? propre(premiere.cta_text),
    lienUrl: propre(s.link_url) ?? propre(premiere.link_url),
    plateformes: Array.isArray(p.publisher_platform)
      ? p.publisher_platform.filter((x: unknown) => typeof x === 'string').map((x: string) => x.toLowerCase())
      : [],
    debut: date(p.start_date),
    fin: date(p.end_date),
    active: p.is_active !== false,
    medias,
  }
}
