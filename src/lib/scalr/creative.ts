/**
 * Format d'une créa, et vignette.
 *
 * Portage de `detectCreativeType` / `detectTypeFromName`. L'ordre compte :
 * **le nom prime sur la structure Meta**. Ce n'est pas un raccourci, c'est
 * une conséquence de la convention de nommage — une créa nommée
 * `statique_6_PV` est un visuel fixe même si Meta l'a emballée dans un
 * `video_data` pour l'animer. L'intention du media buyer l'emporte sur la
 * mécanique de la plateforme.
 */

export type CreativeType = 'Image' | 'Vidéo' | 'Carrousel' | 'Inconnu'

/** Minuscules, accents retirés — la convention n'est pas écrite deux fois
 *  pareil d'une créa à l'autre. */
function normalise(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/** Détection par le nom. Les variantes d'orthographe viennent de Scalr :
 *  « carrousel », « carroussel », « carousel » cohabitent dans les comptes. */
export function detectTypeFromName(nom: string): CreativeType | null {
  const n = normalise(nom)
  if (!n) return null
  if (/(^|[^a-z0-9])(carrou?ss?el|carousel)([^a-z0-9]|$)/.test(n)) return 'Carrousel'
  if (/(^|[^a-z0-9])videos?([^a-z0-9]|$)/.test(n)) return 'Vidéo'
  if (/(^|[^a-z0-9])(statique|statiques|static|statics)([^a-z0-9]|$)/.test(n)) return 'Image'
  return null
}

type Creative = {
  name?: string
  image_url?: string
  thumbnail_url?: string
  image_hash?: string
  object_story_spec?: {
    link_data?: { child_attachments?: unknown[]; media?: { type?: string } }
    template_data?: unknown
    video_data?: unknown
    photo_data?: unknown
  }
}

export function detectCreativeType(creative: Creative | null | undefined, adName = ''): CreativeType {
  // Le nom de la publicité d'abord, celui du créatif ensuite.
  const parNom = detectTypeFromName(adName) || detectTypeFromName(creative?.name || '')
  if (parNom) return parNom

  const spec = creative?.object_story_spec
  if (spec?.link_data?.child_attachments?.length || spec?.template_data) return 'Carrousel'
  if (spec?.video_data) return 'Vidéo'
  if (normalise(String(spec?.link_data?.media?.type || '')) === 'video') return 'Vidéo'
  if (spec?.photo_data) return 'Image'
  if (creative?.image_url || creative?.image_hash || creative?.thumbnail_url) return 'Image'

  return 'Inconnu'
}

/** `image_url` d'abord : la vignette Meta est basse définition et devient
 *  floue dès qu'on l'agrandit dans une galerie. */
export function thumbnailUrl(creative: Creative | null | undefined): string | null {
  return creative?.image_url || creative?.thumbnail_url || null
}

/** Champs à demander à Meta pour renseigner les deux fonctions ci-dessus. */
export const CREATIVE_FIELDS =
  'creative{id,name,thumbnail_url,image_url,image_hash,object_story_spec}'
