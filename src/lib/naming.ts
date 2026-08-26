/**
 * Construction des noms d'adsets au lancement.
 *
 * Extrait du composant Upload pour être vérifiable : c'est ici que se jouait
 * un défaut silencieux — le nom construit par le builder écrasait le nom de
 * repli (créa ou concept), si bien que quatre adsets sortaient sous quatre
 * fois « Broad | H/F | FR | Adv+ ». Indistinguables dans Ads Manager, donc
 * inexploitables pour un test créa.
 */

export type AdsetNamingFields = {
  audience: string
  stack: string
  genre: string
  age: string
  zone: string
  pays: string
  placement: string
  exclusion: string
}

/**
 * Assemble le nom d'un adset.
 *
 * `discriminant` est ce que la structure de test fait varier — le nom de la
 * créa quand chacune a son adset, celui du concept quand ils sont regroupés.
 * Il est traité comme une partie du nom parmi les autres : vide, il disparaît
 * sans laisser de séparateur orphelin, ce qui couvre le cas d'un adset unique.
 */
export function buildAdsetName(f: AdsetNamingFields, discriminant: string): string {
  return [
    f.audience,
    f.stack || null,
    f.genre || null,
    f.age || null,
    f.zone || null,
    f.pays,
    discriminant || null,
    f.placement,
    f.exclusion || null,
  ]
    .filter(Boolean)
    .join(' | ')
}

/** Deux adsets de même nom sont indistinguables une fois dans Meta. */
export function hasDuplicateNames(names: string[]): boolean {
  return names.length !== new Set(names).size
}
