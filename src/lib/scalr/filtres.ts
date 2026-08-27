import { METRICS, type MetricDef } from './metrics'

/**
 * Les filtres libres de la barre d'outils.
 *
 * Porté de Scalr, avec deux corrections.
 *
 * **Un champ proposé est un champ qui filtre.** Scalr offre quarante champs
 * mais n'en résout que dix-huit : poser une condition sur « Country » ou
 * « Publisher platform » renvoie la chaîne vide pour chaque ligne, donc ne
 * filtre rien — sans le dire. Un filtre qui ne fait rien coûte plus cher
 * qu'un filtre absent, parce qu'on croit avoir filtré. La liste ci-dessous
 * ne contient que des champs qu'on sait lire.
 *
 * **Les nombres se comparent comme des nombres.** Scalr n'expose que des
 * opérateurs de texte : « Spend Is 100 » teste l'égalité de deux chaînes, et
 * « dépense supérieure à 100 » — la condition la plus utile de toutes —
 * n'est pas exprimable. Chaque champ porte ici son type, et le type décide
 * des opérateurs.
 */

export type TypeChamp = 'texte' | 'nombre' | 'date'

export type ChampFiltre = {
  cle: string
  label: string
  type: TypeChamp
  /** Le groupe sert au regroupement dans la liste déroulante. */
  groupe: string
  lire: (row: Record<string, unknown>) => unknown
}

const texte = (cle: string, label: string, groupe: string, lire?: (r: Record<string, unknown>) => unknown): ChampFiltre =>
  ({ cle, label, type: 'texte', groupe, lire: lire || ((r) => r[cle]) })

/** Les champs d'identité, ceux qui ne sont pas des mesures. */
const IDENTITE: ChampFiltre[] = [
  texte('name', 'Nom', 'Identité'),
  texte('campaignName', 'Campagne', 'Identité'),
  texte('adsetName', 'Ad set', 'Identité'),
  texte('objective', 'Objectif', 'Identité'),
  texte('status', 'Statut', 'Identité'),
  texte('creativeType', 'Format créa', 'Identité'),
  texte('decision', 'Décision', 'Identité', (r) =>
    (r.decision as { label?: string } | undefined)?.label ?? ''),
  { cle: 'createdTime', label: 'Date de lancement', type: 'date', groupe: 'Identité',
    lire: (r) => (r.createdTime ? String(r.createdTime).slice(0, 10) : '') },
]

/**
 * Toutes les métriques du registre deviennent filtrables.
 *
 * Elles y sont déjà décrites — libellé, groupe, unité — et les redéclarer ici
 * les ferait diverger à la première évolution.
 */
const MESURES: ChampFiltre[] = METRICS.map((m: MetricDef) => ({
  cle: m.key,
  label: m.label,
  type: 'nombre' as const,
  groupe: m.group,
  lire: (r: Record<string, unknown>) => r[m.key],
}))

export const CHAMPS_FILTRE: ChampFiltre[] = [...IDENTITE, ...MESURES]
export const CHAMP_PAR_CLE = new Map(CHAMPS_FILTRE.map((c) => [c.cle, c]))

export const GROUPES_CHAMPS = [...new Set(CHAMPS_FILTRE.map((c) => c.groupe))]

export type Operateur = { cle: string; label: string; sansValeur?: boolean }

const VIDE: Operateur[] = [
  { cle: 'vide', label: 'est vide', sansValeur: true },
  { cle: 'non_vide', label: "n'est pas vide", sansValeur: true },
]

export const OPERATEURS: Record<TypeChamp, Operateur[]> = {
  texte: [
    { cle: 'est', label: 'est' },
    { cle: 'nest_pas', label: "n'est pas" },
    { cle: 'contient', label: 'contient' },
    { cle: 'ne_contient_pas', label: 'ne contient pas' },
    { cle: 'commence', label: 'commence par' },
    { cle: 'finit', label: 'finit par' },
    ...VIDE,
  ],
  nombre: [
    { cle: 'sup', label: '>' },
    { cle: 'sup_egal', label: '≥' },
    { cle: 'inf', label: '<' },
    { cle: 'inf_egal', label: '≤' },
    { cle: 'egal', label: '=' },
    { cle: 'different', label: '≠' },
    ...VIDE,
  ],
  date: [
    { cle: 'apres', label: 'après le' },
    { cle: 'avant', label: 'avant le' },
    { cle: 'egal', label: 'le' },
    ...VIDE,
  ],
}

export type Condition = { champ: string; op: string; valeur: string }

const estVide = (v: unknown) => v === null || v === undefined || String(v).trim() === ''

/**
 * Une condition, sur une ligne.
 *
 * Un champ inconnu laisse passer la ligne plutôt que de la rejeter : une
 * condition qu'on ne sait pas évaluer ne doit pas vider silencieusement le
 * tableau.
 */
export function evalueCondition(row: Record<string, unknown>, c: Condition): boolean {
  const champ = CHAMP_PAR_CLE.get(c.champ)
  if (!champ) return true

  const brut = champ.lire(row)
  if (c.op === 'vide') return estVide(brut)
  if (c.op === 'non_vide') return !estVide(brut)

  if (champ.type === 'nombre') {
    // Une case vide n'est pas un zéro : elle ne satisfait aucune comparaison.
    // `Number(null)` vaut 0 et passe `isFinite` — le test d'absence doit donc
    // venir avant la conversion, sinon « CPL ≤ 14 » remonte les publicités
    // sans aucun lead.
    if (estVide(brut)) return false
    const a = Number(brut)
    const b = Number(String(c.valeur).replace(',', '.'))
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false
    switch (c.op) {
      case 'sup': return a > b
      case 'sup_egal': return a >= b
      case 'inf': return a < b
      case 'inf_egal': return a <= b
      case 'egal': return a === b
      case 'different': return a !== b
      default: return true
    }
  }

  if (champ.type === 'date') {
    const a = String(brut || '')
    const b = String(c.valeur || '')
    if (!a || !b) return false
    switch (c.op) {
      case 'apres': return a > b
      case 'avant': return a < b
      case 'egal': return a === b
      default: return true
    }
  }

  const a = String(brut ?? '').toLowerCase()
  const b = String(c.valeur ?? '').toLowerCase()
  switch (c.op) {
    case 'est': return a === b
    case 'nest_pas': return a !== b
    case 'contient': return a.includes(b)
    case 'ne_contient_pas': return !a.includes(b)
    case 'commence': return a.startsWith(b)
    case 'finit': return a.endsWith(b)
    default: return true
  }
}

/** Les conditions se cumulent en ET, comme dans Scalr. */
export function appliqueConditions<T extends Record<string, unknown>>(rows: T[], conditions: Condition[]): T[] {
  if (!conditions.length) return rows
  return rows.filter((r) => conditions.every((c) => evalueCondition(r, c)))
}

/** Le texte d'une pastille de condition, lisible d'un coup d'œil. */
export function libelleCondition(c: Condition): string {
  const champ = CHAMP_PAR_CLE.get(c.champ)
  const op = OPERATEURS[champ?.type || 'texte'].find((o) => o.cle === c.op)
  return `${champ?.label || c.champ} ${op?.label || c.op}${op?.sansValeur ? '' : ` ${c.valeur}`}`
}

/**
 * Les valeurs déjà présentes pour un champ, proposées en autocomplétion.
 *
 * Suggérer ce qui existe évite la condition qui ne renvoie rien parce que le
 * nom a été tapé de travers.
 */
export function valeursConnues(rows: Record<string, unknown>[], cleChamp: string): string[] {
  const champ = CHAMP_PAR_CLE.get(cleChamp)
  if (!champ || champ.type !== 'texte') return []
  const vues = new Set<string>()
  for (const r of rows) {
    const v = champ.lire(r)
    if (!estVide(v)) vues.add(String(v))
    if (vues.size >= 200) break
  }
  return [...vues].sort((a, b) => a.localeCompare(b, 'fr'))
}
