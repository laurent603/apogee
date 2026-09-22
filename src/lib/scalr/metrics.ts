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
  /** Prospects ÷ clics sur un lien : le taux de transformation du formulaire,
   *  bout en bout depuis le clic. Portait l'étiquette « CVR », qui ne disait
   *  pas de quelle conversion il s'agissait. */
  { key: 'convRate', group: 'CONVERSION', label: 'Taux de transfo', format: 'pct', good: 'high', defaut: true, dec: 1 },
  /**
   * Deux questions, deux colonnes, **un même dénominateur**.
   *
   * LPVR dit si les gens arrivent, le taux de transfo s'ils transforment. Les
   * rapporter tous deux aux clics sur un lien les rend directement comparables
   * et fait de la paire une décomposition propre : un taux de transfo qui
   * baisse à LPVR constant accuse la page ou le formulaire, à LPVR qui baisse
   * il accuse le chargement.
   *
   * Il y a eu un troisième ratio entre les deux, prospects ÷ vues de page. Il
   * affichait 147,1 % sur un ad set : 25 prospects pour 17 vues de page. Les
   * vues ne sont mesurées que par le navigateur, les prospects arrivent aussi
   * par la CAPI — bloqueur ou onglet fermé, et le prospect existe sans sa vue.
   * Numérateur et dénominateur venaient de deux canaux différents ; aucune
   * formule ne rattrape ça.
   */
  { key: 'lpvRate', group: 'CONVERSION', label: 'LPVR', format: 'pct', good: 'high', dec: 1 },
  /** Le compte brut derrière LPVR. Une publicité qui n'envoie pas sur le web
   *  reste à zéro, ce qui se lit plus vite qu'un taux vide. */
  { key: 'landingPageViews', group: 'CONVERSION', label: 'Vues LP', format: 'int', good: 'high' },

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
    colonnes: ['spend', 'frequency', 'cpm', 'linkCtr', 'leads', 'cpl'],
  },
  {
    id: 'diagnostic',
    label: 'Diagnostic',
    quand: 'Une fois par semaine, au niveau publicité — pourquoi le CPL a bougé',
    colonnes: ['spend', 'cpm', 'hookRate', 'holdRate', 'linkCtr', 'lpvRate', 'convRate', 'cpl'],
  },
  {
    id: 'crea',
    label: 'Créa',
    quand: 'À chaque cycle de test, au niveau publicité',
    colonnes: ['spend', 'impressions', 'cpm', 'hookRate', 'holdRate',
      'video25', 'video50', 'video75', 'video95', 'completionRate', 'linkCtr', 'cpl'],
  },

  /**
   * Les trois stades de test de la méthode J7, à part des trois vues du haut.
   *
   * Celles-là servent à piloter un compte qui tourne ; celles-ci à conduire un
   * cycle de test, où **une seule variable bouge** et où tout le reste est
   * gelé — c'est ce qui rend la réponse attribuable à quelque chose.
   *
   * Stade 1, HTT : hook, titre, vignette. La question est « mérite-t-elle le
   * clic », la décision se prend au CTR lien, seuil 4 % en génération de
   * prospects. Stade 2, RTDF : rédaction, tagline, design, format — ce qui se
   * passe après le clic, décision au coût par prospect. Stade 3 : la créa est
   * figée et l'audience varie, donc tout écart vient du ciblage.
   */
  {
    id: 'stade1',
    label: 'Stade 1',
    quand: 'HTT — la créa mérite-t-elle le clic ? · décision au CTR lien, seuil 4 %',
    colonnes: ['spend', 'impressions', 'frequency', 'cpm', 'hookRate',
      'linkCtr', 'linkClicks', 'cpc', 'landingPageViews', 'lpvRate'],
  },
  {
    id: 'stade2',
    label: 'Stade 2',
    quand: 'RTDF — la rédaction convertit-elle ? · décision au coût par prospect',
    colonnes: ['spend', 'cpm', 'frequency', 'linkCtr', 'linkClicks',
      'landingPageViews', 'lpvRate', 'convRate', 'leads', 'cpl'],
  },
  /**
   * La vue J7 du stade 3 s'appuie sur les trois classements d'enchères —
   * qualité, engagement, conversion. Apogee ne les stocke pas : la synchro ne
   * les demande pas à Meta. Restent la couverture, la fréquence et le CPM, qui
   * disent déjà si l'audience s'use ou coûte cher, mais la lecture « la créa
   * dérange, l'offre tient » n'est pas reproductible ici.
   */
  {
    id: 'stade3',
    label: 'Stade 3',
    quand: 'Audience — est-ce le ciblage ou la créa ? · ventiler par âge et sexe',
    colonnes: ['spend', 'reachSum', 'frequency', 'cpm', 'linkCtr', 'convRate', 'leads', 'cpl'],
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
  if (Math.abs(variation) < 1) return 'neutre'
  const hausse = variation > 0
  return (def.good === 'high') === hausse ? 'bon' : 'mauvais'
}
