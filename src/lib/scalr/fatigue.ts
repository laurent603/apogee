import { METRIC_BY_KEY, type MetricDef } from './metrics'

/**
 * La matrice de fatigue.
 *
 * Deux métriques, deux seuils, quatre quadrants. L'axe horizontal porte
 * l'**exposition** — combien cette créa a déjà tourné —, l'axe vertical le
 * **signal** — ce qu'elle produit. Le croisement dit quoi faire :
 *
 * |                     | Signal bon    | Signal faible     |
 * |---------------------|---------------|-------------------|
 * | Exposition forte    | Top performer | **Fatigue**       |
 * | Exposition faible   | Pépite        | Sous-performer    |
 *
 * Ce n'est pas un verdict de plus : `rowDecision` tranche sur des règles
 * fixes, la matrice laisse choisir les deux axes et déplacer les seuils. Elle
 * sert à explorer une hypothèse — « mes créas décrochent-elles quand la
 * fréquence monte ? » —, pas à décider à la place du media buyer.
 *
 * **Le sens de lecture vient du registre de métriques.** Scalr redéclare une
 * table `FATIGUE_METRICS` avec son propre `good: high|low` à côté de celle qui
 * existe déjà : deux tables qui disent la même chose divergent à la première
 * métrique ajoutée.
 */

export type Couple = { cle: string; x: string; y: string }

export const FAMILLES: { titre: string; couples: [string, string][] }[] = [
  { titre: 'Attention', couples: [
    ['hookRate', 'ctr'], ['hookRate', 'linkCtr'], ['hookRate', 'convRate'], ['spend', 'hookRate'],
  ] },
  { titre: 'Rétention', couples: [
    ['hookRate', 'holdRate'], ['spend', 'holdRate'],
  ] },
  { titre: 'Fatigue et saturation', couples: [
    ['frequency', 'ctr'], ['frequency', 'cpl'], ['frequency', 'convRate'],
    ['frequency', 'linkCtr'], ['impressions', 'ctr'], ['spend', 'ctr'],
  ] },
  { titre: 'Conversion', couples: [
    ['ctr', 'convRate'], ['hookRate', 'cpl'], ['spend', 'cpl'], ['spend', 'convRate'],
  ] },
  { titre: 'Trafic réel', couples: [
    ['frequency', 'outboundCtr'], ['spend', 'linkCtr'], ['spend', 'outboundCtr'],
  ] },
  { titre: 'Efficacité média', couples: [
    ['cpc', 'ctr'],
  ] },
]

export const COUPLES: Couple[] = FAMILLES.flatMap((f) =>
  f.couples.map(([x, y]) => ({ cle: `${x}:${y}`, x, y })))

/** La fréquence contre le CTR : la question de fatigue la plus courante. */
export const COUPLE_DEFAUT = 'frequency:ctr'

export const defsDuCouple = (cle: string): { x: MetricDef; y: MetricDef } | null => {
  const c = COUPLES.find((p) => p.cle === cle) || COUPLES.find((p) => p.cle === COUPLE_DEFAUT)
  const x = c && METRIC_BY_KEY.get(c.x)
  const y = c && METRIC_BY_KEY.get(c.y)
  return x && y ? { x, y } : null
}

export const libelleCouple = (cle: string) => {
  const d = defsDuCouple(cle)
  return d ? `${d.x.label} × ${d.y.label}` : cle
}

export type Zone = 'top' | 'pepite' | 'fatigue' | 'faible'

export const ZONES: Record<Zone, { label: string; texte: string; couleur: string }> = {
  top: { label: 'Top performers', couleur: '#22c55e',
    texte: 'Diffusion suffisante et signal fort. Le budget peut monter.' },
  pepite: { label: 'Pépites', couleur: '#3434ef',
    texte: 'Bon signal, exposition limitée. À tester avec plus de budget.' },
  fatigue: { label: 'Fatigue créa', couleur: '#f97316',
    texte: 'Exposition élevée et signal qui décroche. À rafraîchir ou décliner.' },
  faible: { label: 'Sous-performers', couleur: '#94a3b8',
    texte: 'Peu de signal exploitable. À challenger, ou à couper selon la dépense.' },
}

export const ORDRE_ZONES: Zone[] = ['top', 'pepite', 'fatigue', 'faible']

export type Point = { id: string; name: string; x: number; y: number; spend: number; zone: Zone }

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

/**
 * La médiane, zéros écartés.
 *
 * Sur un axe de coût, la moitié des publicités valent zéro faute de résultat.
 * Les garder effondre la médiane vers zéro, et comme un coût est « meilleur
 * quand il est bas », tout passerait du bon côté du seuil : le quadrant Fatigue
 * resterait vide en permanence.
 */
export function medianeNonNulle(valeurs: number[]): number {
  const v = valeurs.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b)
  if (!v.length) return 0
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/** Le quadrant d'un point, selon les deux seuils et le sens de chaque axe. */
export function zoneDuPoint(
  x: number, y: number, seuilX: number, seuilY: number, defs: { x: MetricDef; y: MetricDef },
): Zone {
  // L'axe horizontal mesure l'exposition : « au-dessus du seuil » y signifie
  // toujours « a assez tourné pour qu'on puisse conclure ».
  const expose = x >= seuilX
  const bon = defs.y.good === 'low' ? y <= seuilY : y >= seuilY
  if (expose && bon) return 'top'
  if (!expose && bon) return 'pepite'
  if (expose && !bon) return 'fatigue'
  return 'faible'
}

export type Matrice = {
  points: Point[]
  seuils: { x: number; y: number }
  bornes: { x: [number, number]; y: [number, number] }
  comptes: Record<Zone, number>
  defs: { x: MetricDef; y: MetricDef }
}

/**
 * Place les publicités dans la matrice.
 *
 * Les seuils par défaut sont les médianes des deux axes : la question posée
 * est « lesquelles décrochent par rapport aux autres », pas « lesquelles
 * dépassent une valeur absolue ». Un seuil fourni les remplace.
 */
export function construire(
  lignes: Record<string, unknown>[],
  cleCouple: string,
  seuilsChoisis?: { x: number | null; y: number | null },
): Matrice | null {
  const c = COUPLES.find((p) => p.cle === cleCouple) || COUPLES.find((p) => p.cle === COUPLE_DEFAUT)
  const defs = c && defsDuCouple(c.cle)
  if (!c || !defs) return null

  // Une publicité sans diffusion n'a ni exposition ni signal : elle n'est pas
  // au bas du nuage, elle n'y est pas.
  const brut = lignes
    .filter((l) => n(l.spend) > 0 || n(l.impressions) > 0)
    .map((l) => ({
      id: String(l.id ?? ''),
      name: String(l.name ?? ''),
      x: n(l[c.x]),
      y: n(l[c.y]),
      spend: n(l.spend),
    }))

  const seuils = {
    x: seuilsChoisis?.x ?? medianeNonNulle(brut.map((p) => p.x)),
    y: seuilsChoisis?.y ?? medianeNonNulle(brut.map((p) => p.y)),
  }

  const points: Point[] = brut.map((p) => ({ ...p, zone: zoneDuPoint(p.x, p.y, seuils.x, seuils.y, defs) }))

  /** Une marge de 8 % autour des valeurs : un point posé sur le bord se lit mal. */
  const bornes = (vals: number[], seuil: number): [number, number] => {
    const tous = [...vals, seuil].filter((v) => Number.isFinite(v))
    if (!tous.length) return [0, 1]
    const min = Math.min(0, ...tous)
    const max = Math.max(...tous)
    const marge = (max - min) * 0.08 || 1
    return [min, max + marge]
  }

  const comptes = ORDRE_ZONES.reduce((acc, z) => {
    acc[z] = points.filter((p) => p.zone === z).length
    return acc
  }, {} as Record<Zone, number>)

  return {
    points,
    seuils,
    bornes: { x: bornes(points.map((p) => p.x), seuils.x), y: bornes(points.map((p) => p.y), seuils.y) },
    comptes,
    defs,
  }
}
