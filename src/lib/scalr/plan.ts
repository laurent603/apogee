/**
 * Le plan de composition, et son exécution.
 *
 * Le composeur empilait les dispositifs par le bas. Les plans extraits de vos
 * créas décrivent tout autre chose : des zones **positionnées**, un fond qui
 * peut être un aplat de marque, une photo détourée posée dans une zone, des
 * cartes, un bandeau d'icônes. Deux créas du même compte ne partagent que le
 * vocabulaire, jamais la structure — d'où un renderer piloté par le plan
 * plutôt que par un gabarit.
 */

export type Zone = { id: string; x: number; y: number; l: number; h: number }

export type Plan = {
  nom?: string
  ratio?: string
  fond?: { type?: 'couleur' | 'photo_plein' | 'photo_encart'; couleur?: string | null; note?: string }
  photo?: { traitement?: 'plein' | 'encart' | 'detouree' | 'absente'; zone?: string | null }
  grille?: Zone[]
  blocs?: { zone: string; dispositif: string; align?: 'gauche' | 'centre' | 'droite'; poids?: number }[]
  hierarchie?: string[]
  densite?: 'faible' | 'moyenne' | 'haute'
  accent?: string
  remarques?: string[]
}

/** Un plan exploitable, ou rien — plutôt qu'une composition à moitié fausse. */
export function planValide(brut: unknown): Plan | null {
  const p = brut as Plan | null
  if (!p || typeof p !== 'object') return null
  if (!Array.isArray(p.grille) || !p.grille.length) return null
  if (!Array.isArray(p.blocs) || !p.blocs.length) return null
  const ids = new Set(p.grille.map((z) => z.id))
  // Un bloc qui vise une zone absente ne se dessine nulle part : mieux vaut le
  // savoir ici que découvrir un trou dans la créa.
  if (!p.blocs.every((b) => ids.has(b.zone))) return null
  return p
}

/**
 * Où l'accent se pose, déduit de la phrase du plan.
 *
 * Chez TSD l'accent marque le chiffre ; chez Oxygène, la deuxième ligne du
 * titre — il n'y a aucun chiffre dans cette créa. Une heuristique unique se
 * trompait donc la moitié du temps. Le plan le dit en toutes lettres : on le
 * lit plutôt que de le deviner.
 */
export type ModeAccent = 'chiffres' | 'deuxieme_ligne' | 'mots'

export function modeAccent(plan: Plan | null): ModeAccent {
  const a = (plan?.accent ?? '').toLowerCase()
  if (/(seconde|deuxi[eè]me)\s+ligne/.test(a)) return 'deuxieme_ligne'
  if (/chiffre|montant|prix|pourcentage|%|€/.test(a)) return 'chiffres'
  return 'mots'
}
