/**
 * La bibliothèque de prompts de la discussion.
 *
 * Elle vivait en dur dans la page Autopilot, en quatre listes plates —
 * Performance, Créa & Stratégie, Media Buying, Reporting — sans rapport avec
 * les prompts structurés de `PROMPTS`. Deux bibliothèques pour les mêmes
 * sujets : « Analyse du funnel complet » en une ligne ici, `performance.funnel`
 * en trente lignes là, et rien qui les relie.
 *
 * L'arborescence est désormais celle de Laurent, et elle est unique. Chaque
 * entrée porte son état, parce que le rangement précède l'écriture :
 *
 * - rien             → le texte est prêt
 * - `aAdapter`       → le texte existe mais raisonne en e-commerce (ROAS, ATC,
 *                      panier moyen) alors que l'outil fait de la génération de
 *                      prospects, ou bien il lui manque des sections
 * - `aEcrire`        → l'emplacement est réservé, le prompt n'existe pas
 * - `outil`          → ce n'est pas un prompt mais une page dédiée, qui fait
 *                      déjà le travail mieux qu'une consigne de discussion
 *
 * Les états ne sont pas décoratifs : ils sont affichés dans le sélecteur. Un
 * emplacement vide qu'on voit est un emplacement qu'on remplit ; un
 * emplacement vide qu'on cache redevient un oubli.
 */

import { PROMPTS, SYSTEM_BASE } from './index'

/**
 * Le corps d'un prompt, sans son socle système.
 *
 * Les entrées de la banque sont des messages tapés dans la discussion : le
 * socle y arrive par la route, pas par le texte. Citer `PROMPTS` plutôt que
 * recopier évite la dérive — une même consigne écrite à deux endroits finit
 * toujours par n'être corrigée qu'à un seul.
 */
const corps = (p: string) =>
  (p.startsWith(SYSTEM_BASE) ? p.slice(SYSTEM_BASE.length) : p).trim()

export type EtatPrompt = 'pret' | 'aAdapter' | 'aEcrire' | 'outil'

export type EntreeBanque = {
  id: string
  label: string
  /** Vide tant que l'entrée est `aEcrire` ou `outil`. */
  prompt: string
  etat: EtatPrompt
  /** Pourquoi l'entrée n'est pas prête. Affiché en légende. */
  note?: string
  /** Pour `outil` : la page qui porte le travail. */
  lien?: string
}

export type DossierBanque = {
  nom: string
  entrees: EntreeBanque[]
}

export type CategorieBanque = {
  nom: string
  /** Une catégorie porte soit des entrées, soit des sous-dossiers. */
  entrees?: EntreeBanque[]
  dossiers?: DossierBanque[]
}

/* ────────────────────────────────────────────────────────────────────────── */

const PERFORMANCE: EntreeBanque[] = [
  {
    id: 'perf-funnel',
    label: 'Funnel complet',
    etat: 'pret',
    prompt: corps(PROMPTS.performance.funnel),
  },
  {
    id: 'perf-rentabilite',
    label: 'Rentabilité réelle',
    etat: 'pret',
    prompt: corps(PROMPTS.performance.profitability),
  },
  {
    id: 'perf-attribution',
    label: 'Qualité de l’attribution',
    etat: 'pret',
    prompt: corps(PROMPTS.performance.attribution),
  },
  {
    id: 'perf-mensuel',
    label: 'Bilan stratégique mensuel',
    etat: 'pret',
    prompt: corps(PROMPTS.performance.monthly),
  },
  {
    id: 'perf-placement',
    label: 'Performance par placement',
    etat: 'pret',
    prompt: corps(PROMPTS.performance.placements),
  },
  {
    id: 'perf-age-genre',
    label: 'Performance âge × genre',
    etat: 'pret',
    prompt: corps(PROMPTS.performance.ageGenre),
  },
  {
    id: 'perf-top-flop',
    label: 'Top / Flop des publicités',
    etat: 'pret',
    prompt: corps(PROMPTS.performance.topFlop),
  },
]

const MEDIA_BUYING: EntreeBanque[] = [
  {
    id: 'mb-trafic',
    label: 'Qualité du trafic',
    etat: 'pret',
    prompt: corps(PROMPTS.autopilot.trafficQuality),
  },
  {
    id: 'mb-kill',
    label: 'Ads / adsets à couper',
    etat: 'pret',
    prompt: corps(PROMPTS.mediaBuying.kill),
  },
  {
    id: 'mb-budget',
    label: 'Réallocation de budget',
    etat: 'pret',
    prompt: corps(PROMPTS.mediaBuying.budgetReallocation),
  },
  {
    id: 'mb-cbo-abo',
    label: 'CBO vs ABO',
    etat: 'pret',
    prompt: corps(PROMPTS.mediaBuying.cboAbo),
  },
  {
    id: 'mb-overlap',
    label: 'Chevauchement d’audiences',
    etat: 'pret',
    prompt: corps(PROMPTS.mediaBuying.overlap),
  },
  {
    id: 'mb-review-7j',
    label: 'Revue des 7 derniers jours',
    etat: 'pret',
    prompt: corps(PROMPTS.mediaBuying.weeklyReview),
  },
  {
    id: 'mb-strategie-audience',
    label: 'Stratégie d’audience',
    etat: 'pret',
    prompt: corps(PROMPTS.mediaBuying.audienceStrategy),
  },
  {
    id: 'mb-cpm',
    label: 'Tendance du CPM',
    etat: 'pret',
    prompt: corps(PROMPTS.mediaBuying.cpmTrend),
  },
  {
    id: 'mb-distribution',
    label: 'Distribution du spend entre créas',
    etat: 'pret',
    prompt: corps(PROMPTS.mediaBuying.spendDistribution),
  },
  {
    id: 'mb-learning',
    label: 'Phase d’apprentissage',
    etat: 'pret',
    prompt: corps(PROMPTS.mediaBuying.learningPhase),
  },
  {
    id: 'mb-pacing',
    label: 'Pacing du mois',
    etat: 'pret',
    prompt: corps(PROMPTS.mediaBuying.pacing),
  },
  {
    id: 'mb-scaling',
    label: 'Scaling',
    etat: 'pret',
    prompt: corps(PROMPTS.mediaBuying.scaling),
  },
  {
    id: 'mb-encheres',
    label: 'Optimisation des enchères',
    etat: 'pret',
    prompt: corps(PROMPTS.mediaBuying.bidding),
  },
]

const CREA_RESEARCH: EntreeBanque[] = [
  {
    id: 'cs-avis',
    label: 'Angles depuis les avis clients',
    etat: 'aEcrire',
    note: 'trustpilotUrl est stocké dans les réglages mais jamais lu',
    prompt: '',
  },
  {
    id: 'cs-reddit',
    label: 'Écoute Reddit',
    etat: 'aEcrire',
    note: 'Aucune récupération externe dans l’outil',
    prompt: '',
  },
  {
    id: 'cs-concurrents',
    label: 'Angles des concurrents (Ad Library)',
    etat: 'aEcrire',
    note: 'competitors est stocké mais jamais lu ; couverture de l’API à vérifier',
    prompt: '',
  },
  {
    id: 'cs-questionnaire',
    label: 'Questionnaire client',
    etat: 'pret',
    prompt: corps(PROMPTS.creativeStrategy.survey),
  },
  {
    id: 'cs-commentaires',
    label: 'Objections depuis les commentaires',
    etat: 'outil',
    lien: '/comment-analysis',
    note: 'Citations littérales, comptées, regroupées par sens — la meilleure source du compte',
    prompt: '',
  },
]

const CREA_GENERATION: EntreeBanque[] = [
  {
    id: 'cs-hooks',
    label: '5 variations de hook',
    etat: 'pret',
    prompt: corps(PROMPTS.creativeStrategy.hooks),
  },
  {
    id: 'cs-brief',
    label: 'Brief créa',
    etat: 'outil',
    lien: '/creative-strategist',
    note: 'Diagnostic, déroulé minuté, guide d’entretien, KPI à J+7 calculés sur le compte',
    prompt: '',
  },
]

const CREA_ANALYSE: EntreeBanque[] = [
  {
    id: 'cs-conscience',
    label: 'Audit des niveaux de conscience',
    etat: 'pret',
    prompt: corps(PROMPTS.creativeStrategy.awareness),
  },
  {
    id: 'cs-gagnant',
    label: 'Rétro-ingénierie d’un gagnant',
    etat: 'pret',
    prompt: corps(PROMPTS.creativeStrategy.winner),
  },
  {
    id: 'cs-exhaustive',
    label: 'Analyse exhaustive, pub par pub',
    etat: 'pret',
    prompt: corps(PROMPTS.creativeStrategy.creativeAnalysis),
  },
  {
    id: 'cs-formats',
    label: 'Comparaison de formats',
    etat: 'pret',
    prompt: corps(PROMPTS.creativeStrategy.formats),
  },
]

const CREA_STRATEGY: EntreeBanque[] = [
  {
    id: 'cs-angles',
    label: 'Banque d’angles',
    etat: 'pret',
    prompt: corps(PROMPTS.creativeStrategy.angleBank),
  },
  {
    id: 'cs-full-funnel',
    label: 'Stratégie full-funnel',
    etat: 'pret',
    prompt: corps(PROMPTS.creativeStrategy.fullFunnelStrategy),
  },
  {
    id: 'cs-plan-test',
    label: 'Plan de test créatif',
    etat: 'pret',
    prompt: corps(PROMPTS.creativeStrategy.testPlan),
  },
]

const AUDIT: EntreeBanque[] = [
  {
    id: 'audit-complet',
    label: 'Audit complet Andromeda',
    etat: 'pret',
    prompt: corps(PROMPTS.audit.full),
  },
  {
    id: 'audit-pixel',
    label: 'Pixel & CAPI',
    etat: 'aAdapter',
    note: 'Demande EMQ, déduplication et AEM : invisibles depuis les permissions de l’outil',
    prompt: corps(PROMPTS.audit.pixel),
  },
  {
    id: 'audit-fatigue',
    label: 'Scan de fatigue créative',
    etat: 'pret',
    prompt: corps(PROMPTS.audit.fatigue),
  },
  {
    id: 'audit-structure',
    label: 'Structure du compte',
    etat: 'pret',
    prompt: corps(PROMPTS.audit.structure),
  },
]

export const BANQUE: CategorieBanque[] = [
  { nom: 'Performance', entrees: PERFORMANCE },
  { nom: 'Media Buying', entrees: MEDIA_BUYING },
  {
    nom: 'Creative Strategy',
    dossiers: [
      { nom: 'Research', entrees: CREA_RESEARCH },
      { nom: 'Génération', entrees: CREA_GENERATION },
      { nom: 'Analyse', entrees: CREA_ANALYSE },
      { nom: 'Strategy', entrees: CREA_STRATEGY },
    ],
  },
  { nom: 'Audit', entrees: AUDIT },
]

/** Toutes les entrées à plat, chacune sachant d'où elle vient. */
export function entreesAPlat(): (EntreeBanque & { chemin: string })[] {
  return BANQUE.flatMap((cat) =>
    cat.dossiers
      ? cat.dossiers.flatMap((d) =>
          d.entrees.map((e) => ({ ...e, chemin: `${cat.nom} › ${d.nom}` })))
      : (cat.entrees || []).map((e) => ({ ...e, chemin: cat.nom })))
}

/** Ce qu'une catégorie contient, sous-dossiers compris. */
export function compter(cat: CategorieBanque): number {
  return cat.dossiers
    ? cat.dossiers.reduce((n, d) => n + d.entrees.length, 0)
    : (cat.entrees || []).length
}
