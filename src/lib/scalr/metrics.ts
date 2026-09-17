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
  /**
   * Sens de lecture d'une hausse.
   *
   * `neutre` existe pour les métriques qui n'en ont pas : DEP× monte parce que
   * la dépense monte, ce qui n'est ni bon ni mauvais tant qu'on ne l'a pas lu
   * à côté du nombre de conversions. La colorer commettrait, à l'envers, le
   * travers que ce fichier corrige plus haut.
   */
  good: 'high' | 'low' | 'neutre'
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
  /**
   * Ce que la répétition coûte : l'écart entre le prix de mille impressions et
   * celui de mille *personnes*. Les deux partent identiques et divergent à
   * mesure que la fréquence monte — et l'écart se creuse avant que le CTR ne
   * chute, ce qui en fait l'alerte de fatigue la plus précoce.
   */
  { key: 'coutRepetition', group: 'SPEND & REACH', label: 'Coût répétition', format: 'eur', good: 'low', dec: 2 },

  // CONVERSION
  { key: 'resultValue', group: 'CONVERSION', label: 'Résultat', format: 'int', good: 'high', defaut: true },
  { key: 'leads', group: 'CONVERSION', label: 'Leads', format: 'int', good: 'high', defaut: true },
  { key: 'convRate', group: 'CONVERSION', label: 'CVR', format: 'pct', good: 'high', defaut: true, dec: 1 },
  /**
   * Ce que la page convertit, une fois qu'on y est arrivé.
   *
   * Il y avait un « clic → arrivée » à côté, retiré : sous l'attribution par
   * défaut, une vue de page peut naître d'un affichage sans clic, si bien que
   * le rapport dépasse 100 % — 158,8 % sur un compte réel. Ce n'est pas un
   * taux, c'est le quotient de deux mesures qui ne se contiennent pas. Le
   * rétablir demanderait de synchroniser une fenêtre clic-seul.
   */
  { key: 'leadRate', group: 'CONVERSION', label: 'Arrivée → lead', format: 'pct', good: 'high', dec: 1 },

  // COST — une hausse est toujours une mauvaise nouvelle
  { key: 'costPerResult', group: 'COST', label: 'Coût/rés.', format: 'eur', good: 'low', defaut: true, dec: 2 },
  /**
   * La dépense exprimée en multiples du CPL cible.
   *
   * Lue à côté du nombre de prospects, elle applique la règle de fermeture
   * sans calcul mental : DEP× ≥ 2 sans conversion, on ferme. C'est déjà la
   * règle du moteur de verdicts (`facteurRegardable`), mais elle s'y applique
   * en coulisse — affichée, elle rend le verdict vérifiable.
   *
   * Ailleurs la formule oblige à taper le coût cible en dur, et elle périme
   * au premier changement de marge. Ici la cible est déduite, donc vivante.
   */
  { key: 'depX', group: 'COST', label: 'DEP×', format: 'x', good: 'neutre', dec: 2 },
  { key: 'cpl', group: 'COST', label: 'CPL', format: 'eur', good: 'low', defaut: true, dec: 2 },
  { key: 'cpm', group: 'COST', label: 'CPM', format: 'eur', good: 'low', defaut: true, dec: 2 },
  { key: 'cpc', group: 'COST', label: 'CPC', format: 'eur', good: 'low', defaut: true, dec: 2 },

  // ENGAGEMENT
  { key: 'ctr', group: 'ENGAGEMENT', label: 'CTR', format: 'pct', good: 'high', defaut: true, dec: 2 },
  { key: 'linkCtr', group: 'ENGAGEMENT', label: 'Link CTR', format: 'pct', good: 'high', defaut: true, dec: 2 },
  { key: 'clicks', group: 'ENGAGEMENT', label: 'Clicks', format: 'int', good: 'high' },
  { key: 'linkClicks', group: 'ENGAGEMENT', label: 'Clics lien', format: 'int', good: 'high' },
  { key: 'outboundClicks', group: 'ENGAGEMENT', label: 'Clics sortants', format: 'int', good: 'high' },
  { key: 'outboundCtr', group: 'ENGAGEMENT', label: 'Outbound CTR', format: 'pct', good: 'high', dec: 2 },

  // VIDEO
  { key: 'hookRate', group: 'VIDEO', label: 'Hook rate', format: 'pct', good: 'high', dec: 2 },
  { key: 'holdRate', group: 'VIDEO', label: 'Hold rate', format: 'pct', good: 'high', dec: 2 },
  { key: 'thruplays', group: 'VIDEO', label: 'Thruplays', format: 'int', good: 'high' },
  { key: 'video25', group: 'VIDEO', label: 'Vidéo 25%', format: 'int', good: 'high' },
  { key: 'video50', group: 'VIDEO', label: 'Vidéo 50%', format: 'int', good: 'high' },
  { key: 'video75', group: 'VIDEO', label: 'Vidéo 75%', format: 'int', good: 'high' },
  { key: 'video95', group: 'VIDEO', label: 'Vidéo 95%', format: 'int', good: 'high' },
  { key: 'video100', group: 'VIDEO', label: 'Vidéo 100%', format: 'int', good: 'high' },
  { key: 'completionRate', group: 'VIDEO', label: 'Taux de complétion', format: 'pct', good: 'high', dec: 2 },
]

export const METRIC_BY_KEY = new Map(METRICS.map((m) => [m.key, m]))

/**
 * Trois jeux de colonnes, pas neuf.
 *
 * Neuf préréglages, c'est un système de papier : trois s'utilisent, les six
 * autres pourrissent dans le menu. Chacun répond à une question distincte et
 * se lit à un moment distinct — le matin, la semaine, le cycle de test.
 *
 * L'ordre des colonnes n'est pas décoratif dans « Décomposition » : chaque
 * colonne est un terme de l'identité `CPA = (CPM ÷ 1000) ÷ (CTR × arrivée ×
 * conversion)`. Lue de gauche à droite, la première qui décroche désigne le
 * correctif — l'enchère, le montage, la page, ou l'offre.
 */
export type Preset = { id: string; label: string; quand: string; colonnes: string[] }

export const PRESETS: Preset[] = [
  {
    id: 'pilotage',
    label: 'Pilotage',
    quand: 'Tous les matins, au niveau ad set',
    colonnes: ['spend', 'depX', 'frequency', 'cpm', 'linkCtr', 'leads', 'cpl'],
  },
  {
    id: 'decomposition',
    label: 'Décomposition',
    quand: 'Une fois par semaine, au niveau publicité',
    colonnes: ['spend', 'cpm', 'hookRate', 'holdRate', 'linkCtr', 'leadRate', 'cpl'],
  },
  {
    id: 'crea',
    label: 'Créa',
    quand: 'À chaque cycle de test, au niveau publicité',
    colonnes: ['spend', 'impressions', 'cpm', 'hookRate', 'holdRate',
      'video25', 'video50', 'video75', 'video95', 'completionRate', 'linkCtr', 'cpl'],
  },
]

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
  if (def.good === 'neutre') return 'neutre'
  if (Math.abs(variation) < 1) return 'neutre'
  const hausse = variation > 0
  return (def.good === 'high') === hausse ? 'bon' : 'mauvais'
}
