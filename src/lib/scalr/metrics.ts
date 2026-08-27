/**
 * Registre des métriques — la source unique des colonnes.
 *
 * Reprend `AD_METRIC_DEFS` de Scalr : 23 métriques en 5 groupes. Tout passe
 * par ici — l'ordre des colonnes, leur format, et surtout le sens de leur
 * variation.
 *
 * `good` est la pièce importante : une hausse du CTR est une bonne nouvelle,
 * une hausse du CPL une mauvaise. Sans cette déclaration, un tableau colore
 * toutes les hausses en vert et félicite l'utilisateur pour l'envolée de son
 * coût par lead.
 */

export type MetricGroup = 'SPEND & REACH' | 'CONVERSION' | 'COST' | 'ENGAGEMENT' | 'VIDEO'
export type MetricFormat = 'eur' | 'int' | 'pct' | 'ratio' | 'x'

export type MetricDef = {
  key: string
  group: MetricGroup
  label: string
  format: MetricFormat
  /** Sens de lecture d'une hausse. */
  good: 'high' | 'low'
  /** Colonnes affichées par défaut, dans l'ordre des captures Scalr. */
  defaut?: boolean
  /** Décimales à l'affichage. */
  dec?: number
}

export const METRICS: MetricDef[] = [
  // SPEND & REACH
  { key: 'spend', group: 'SPEND & REACH', label: 'Dépense', format: 'eur', good: 'high', defaut: true, dec: 2 },
  { key: 'impressions', group: 'SPEND & REACH', label: 'Impr.', format: 'int', good: 'high' },
  { key: 'reachSum', group: 'SPEND & REACH', label: 'Reach', format: 'int', good: 'high' },
  { key: 'frequency', group: 'SPEND & REACH', label: 'Fréq.', format: 'ratio', good: 'low', defaut: true, dec: 2 },

  // CONVERSION
  { key: 'resultValue', group: 'CONVERSION', label: 'Résultat', format: 'int', good: 'high', defaut: true },
  { key: 'leads', group: 'CONVERSION', label: 'Leads', format: 'int', good: 'high', defaut: true },
  { key: 'convRate', group: 'CONVERSION', label: 'CVR', format: 'pct', good: 'high', defaut: true, dec: 1 },

  // COST — une hausse est toujours une mauvaise nouvelle
  { key: 'costPerResult', group: 'COST', label: 'Coût/rés.', format: 'eur', good: 'low', defaut: true, dec: 2 },
  { key: 'cpl', group: 'COST', label: 'CPL', format: 'eur', good: 'low', defaut: true, dec: 2 },
  { key: 'cpm', group: 'COST', label: 'CPM', format: 'eur', good: 'low', defaut: true, dec: 2 },
  { key: 'cpc', group: 'COST', label: 'CPC', format: 'eur', good: 'low', defaut: true, dec: 2 },

  // ENGAGEMENT
  { key: 'ctr', group: 'ENGAGEMENT', label: 'CTR', format: 'pct', good: 'high', defaut: true, dec: 2 },
  { key: 'linkCtr', group: 'ENGAGEMENT', label: 'Link CTR', format: 'pct', good: 'high', defaut: true, dec: 2 },
  { key: 'clicks', group: 'ENGAGEMENT', label: 'Clicks', format: 'int', good: 'high' },
  { key: 'linkClicks', group: 'ENGAGEMENT', label: 'Clics lien', format: 'int', good: 'high' },
  { key: 'outboundClicks', group: 'ENGAGEMENT', label: 'Clics sortants', format: 'int', good: 'high' },

  // VIDEO
  { key: 'hookRate', group: 'VIDEO', label: 'Hook rate', format: 'pct', good: 'high', dec: 2 },
  { key: 'holdRate', group: 'VIDEO', label: 'Hold rate', format: 'pct', good: 'high', dec: 2 },
  { key: 'thruplays', group: 'VIDEO', label: 'Thruplays', format: 'int', good: 'high' },
  { key: 'video25', group: 'VIDEO', label: 'Vidéo 25%', format: 'int', good: 'high' },
  { key: 'video50', group: 'VIDEO', label: 'Vidéo 50%', format: 'int', good: 'high' },
  { key: 'video75', group: 'VIDEO', label: 'Vidéo 75%', format: 'int', good: 'high' },
  { key: 'video95', group: 'VIDEO', label: 'Vidéo 95%', format: 'int', good: 'high' },
]

export const METRIC_BY_KEY = new Map(METRICS.map((m) => [m.key, m]))

export const GROUPES: MetricGroup[] = ['SPEND & REACH', 'CONVERSION', 'COST', 'ENGAGEMENT', 'VIDEO']

/** Colonnes affichées par défaut, dans l'ordre du registre. */
export const COLONNES_DEFAUT = METRICS.filter((m) => m.defaut).map((m) => m.key)

/* ─── Format ────────────────────────────────────────────────────────────── */

/** `null` reste `—` : une métrique sans dénominateur n'est pas nulle, elle
 *  n'existe pas. L'afficher à 0 la ferait mal classer. */
export function formatMetric(value: number | null | undefined, def: MetricDef): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const d = def.dec ?? 0
  switch (def.format) {
    case 'eur':
      return `${value.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`
    case 'pct':
      return `${value.toFixed(d)}%`
    case 'x':
      return `${value.toFixed(d || 2)}×`
    case 'ratio':
      return value.toFixed(d || 2)
    default:
      return Math.round(value).toLocaleString('fr-FR')
  }
}

/**
 * Sens à donner à une variation, selon la métrique.
 * Renvoie `null` quand la variation n'est pas calculable — on n'invente pas
 * un jugement sur une comparaison qui n'existe pas.
 */
export function senseVariation(
  variation: number | null | undefined,
  def: MetricDef,
): 'bon' | 'mauvais' | 'neutre' | null {
  if (variation == null || !Number.isFinite(variation)) return null
  if (Math.abs(variation) < 1) return 'neutre'
  const hausse = variation > 0
  return (def.good === 'high') === hausse ? 'bon' : 'mauvais'
}
