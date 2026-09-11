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
    etat: 'aAdapter',
    note: 'Se termine sur panier → checkout → achat ; à refaire sur clic → vue LP → prospect',
    prompt: `Analyse complète du funnel Meta Ads de ce compte.

Construis le funnel : Impressions → Clics → LPV → ATC → Checkout → Achat

Pour chaque étape : volume absolu, taux de passage vers l'étape suivante,
coût par action, benchmark industrie.

1. Funnel visuel avec barres décroissantes + taux de conversion inter-étapes
2. Identification du GOULOT principal
3. Diagnostic par goulot :
   - Impressions→Clics faible = problème créatif (Hook Rate, CTR)
   - Clics→LPV faible = landing page ou vitesse
   - LPV→ATC faible = offre, prix, page produit
   - ATC→Achat faible = checkout (frais, confiance, friction)
4. Recommandations concrètes par goulot`,
  },
  {
    id: 'perf-rentabilite',
    label: 'Rentabilité réelle',
    etat: 'aAdapter',
    note: 'Bâti sur ROAS et marge produit ; à refaire sur CPL contre cible et valeur du prospect',
    prompt: `Analyse la vraie rentabilité au-delà du ROAS Meta.

Le ROAS Meta est une métrique de PLATEFORME, pas de business. Analyse :
1. ROAS actuel vs ROAS breakeven (= 1 / marge brute). Si marge non renseignée : DEMANDE-LA.
2. ROAS réel vs ROAS Meta (estimation MER = Revenue total / Dépense totale)
3. Rentabilité par campagne
4. New vs Returning : % revenue de nouveaux clients vs retargeting
5. LTV : si repeat purchase rate dispo, CPA acceptable = LTV × marge%
6. VERDICT : rentable / breakeven / en perte + recommandations.

Ne jamais dire "votre ROAS est bon" sans connaître la marge.`,
  },
  {
    id: 'perf-attribution',
    label: 'Qualité de l’attribution',
    etat: 'aAdapter',
    note: 'S’arrête au point 4 ; il manque les questions à poser à l’annonceur',
    prompt: `Évalue la qualité de l'attribution Meta Ads.

1. Configuration fenêtre d'attribution actuelle. Flag si non revue depuis
   janvier 2026 (fenêtres 7-day et 28-day view-through retirées).
2. Signaux de sur-attribution : retargeting > 30% du budget, ROAS retargeting
   >> prospecting, purchases Meta vs conversions réelles.
3. Analyse par campagne.
4. Recommandations, MER comme source de vérité.`,
  },
  {
    id: 'perf-mensuel',
    label: 'Bilan stratégique mensuel',
    etat: 'aAdapter',
    note: 'Manque le plan d’action chiffré et les 3 questions business',
    prompt: `Génère un bilan stratégique mensuel complet, présentable à un client.

1. EXECUTIVE SUMMARY (KPIs clés + tendance vs mois précédent + grade de santé)
2. PERFORMANCE PAR SEMAINE (semaines fortes/faibles et pourquoi)
3. TOP 5 ADS DU MOIS — hook rate, angle, framework reproductible
4. ANALYSE CRÉATIVE — formats, angles dominants, créas en fatigue
5. ANALYSE AUDIENCE — âge, genre, placements, fréquence
6. IMPACT BUSINESS
7. PLAN D'ACTION MOIS PROCHAIN (5 priorités)`,
  },
  {
    id: 'perf-placement',
    label: 'Performance par placement',
    etat: 'aEcrire',
    note: 'La ventilation par placement n’est pas transmise au modèle',
    prompt: '',
  },
  {
    id: 'perf-age-genre',
    label: 'Performance âge × genre',
    etat: 'aEcrire',
    note: 'La ventilation âge/genre n’est pas transmise au modèle',
    prompt: '',
  },
  {
    id: 'perf-top-flop',
    label: 'Top / Flop des publicités',
    etat: 'aAdapter',
    note: 'Demande le ROAS, vide en génération de prospects',
    prompt: 'Liste le top 5 et flop 5 de mes publicités actives sur 14 jours. Pour chaque ad, donne : CPM, CTR, CPC, ROAS et une recommandation.',
  },
]

const MEDIA_BUYING: EntreeBanque[] = [
  {
    id: 'mb-trafic',
    label: 'Qualité du trafic',
    etat: 'aAdapter',
    note: 'Quatre lignes ; il manque les seuils, le tableau par adset et le diagnostic en quadrants',
    prompt: `Vérifie la qualité du trafic sur chaque adset actif.

Focus sur Cost per ATC (e-commerce) ou CPL (lead gen).
Flag chaque adset où le coût dépasse le seuil cible.

Format compact : tableau avec KPIs + 3 actions max.`,
  },
  {
    id: 'mb-kill',
    label: 'Ads / adsets à couper',
    etat: 'aAdapter',
    note: 'Premier critère = ROAS < 1.0, jamais atteint sur un compte leadform',
    prompt: `Identifie les ads et adsets à couper immédiatement.

Critères de kill :
- ROAS < 1.0 avec spend > 3× CPA cible
- CPA > 2× CPA cible du profil
- CTR < 0.5% (créa morte)
- Fréquence > 5 en prospecting
- Hook Rate < 15% sur vidéos
- Learning Limited depuis > 7 jours sans amélioration
- Zéro conversion après spend > 5× CPA cible

Pour chaque élément : | Élément | Spend | ROAS | CPA | Raison du kill | Action |
Puis : actions concrètes, budget libéré et où le réallouer, flag "zone grise".`,
  },
  {
    id: 'mb-budget',
    label: 'Réallocation de budget',
    etat: 'aAdapter',
    note: 'Repère les fuites au ROAS ; à basculer sur le coût par prospect',
    prompt: `Analyse la répartition du budget et propose un plan de réallocation optimisé.

1. Répartition actuelle : % budget en prospecting vs retargeting vs scaling
2. Fuites : adsets qui dépensent sans performer
3. Sous-investis : adsets performants au budget trop bas
4. Ratio prospecting/retargeting (recommandé 70/30 ou 80/20)

Tableau : | Campagne | Budget actuel | % total | ROAS | Recommandation | Nouveau budget |
Même enveloppe. Impact estimé. Actions concrètes.`,
  },
  {
    id: 'mb-cbo-abo',
    label: 'CBO vs ABO',
    etat: 'aEcrire',
    note: 'Le sujet est éclaté en une puce de l’audit de structure',
    prompt: '',
  },
  {
    id: 'mb-overlap',
    label: 'Chevauchement d’audiences',
    etat: 'aEcrire',
    note: 'Le sujet est une puce de l’audit de structure ; `targeting` est pourtant récupéré',
    prompt: '',
  },
  {
    id: 'mb-review-7j',
    label: 'Revue des 7 derniers jours',
    etat: 'pret',
    prompt: `Résumé hebdomadaire des 7 derniers jours, comparé aux 7 précédents.

Établis d'abord le type de compte depuis les actions présentes, puis retiens
les métriques correspondantes — lead : Dépenses, Leads, CPL, taux de
conversion ; ecom : Dépenses, Achats, ROAS, CPA ; traffic : Dépenses, Clics,
CPC, CTR ; video, engagement, messagerie, notoriété selon le cas.

1. En un coup d'œil — 3 ou 4 lignes : ce qui a progressé, ce qui a reculé, ce
   qui demande une décision aujourd'hui.
2. Semaine contre semaine — tableau des métriques du type, variation en %.
3. Jour par jour — tableau des 7 jours sur les mêmes métriques.
4. Ce qui marche — les 3 meilleures publicités, et pourquoi.
5. Ce qui ne marche pas — les 3 moins bonnes, avec l'action : couper, itérer,
   ou attendre.
6. Priorités de la semaine — 3 actions, la plus coûteuse à ne pas faire en
   premier.

Écris comme un briefing du lundi matin. Quand une variation dépasse 20 %, dis
ce qui l'explique plutôt que de la constater.`,
  },
  {
    id: 'mb-strategie-audience',
    label: 'Stratégie d’audience',
    etat: 'aEcrire',
    note: 'Classer chaque adset en Broad / Intérêts / LAL / Retargeting / Advantage+',
    prompt: '',
  },
  {
    id: 'mb-cpm',
    label: 'Tendance du CPM',
    etat: 'aEcrire',
    note: 'CPM par jour et par campagne disponibles ; par placement, non transmis',
    prompt: '',
  },
  {
    id: 'mb-distribution',
    label: 'Distribution du spend entre créas',
    etat: 'aEcrire',
    note: 'Le seuil « jugeable » existe déjà en réglage de compte (facteurRegardable)',
    prompt: '',
  },
  {
    id: 'mb-learning',
    label: 'Phase d’apprentissage',
    etat: 'aEcrire',
    note: '`learning_stage_info` est récupéré mais n’a pas de prompt dédié',
    prompt: '',
  },
  {
    id: 'mb-pacing',
    label: 'Pacing du mois',
    etat: 'aEcrire',
    note: 'monthlyAdBudget et monthlyConvTarget sont déjà dans les réglages de marque',
    prompt: '',
  },
  {
    id: 'mb-scaling',
    label: 'Scaling',
    etat: 'aAdapter',
    note: 'Critère d’entrée « ROAS > 2.0 » : ne se déclenche jamais en lead gen',
    prompt: `Analyse le compte et identifie les campagnes/adsets à scaler.

Critères : ROAS > target du profil (ou > 2.0 si non renseigné), CPA < cible,
spend > 50€ sur 14j, fréquence < 3.0, pas en Learning Limited, CTR stable ou
en hausse sur 14j.

Pour chaque candidat : | Campaign/Adset | Spend 14j | ROAS | CPA | Fréquence | CTR trend | Verdict |

Recommande : % de scaling (20-30% par palier de 48h), budget actuel → cible,
risques, timing.`,
  },
  {
    id: 'mb-encheres',
    label: 'Optimisation des enchères',
    etat: 'aEcrire',
    note: 'Aucun prompt ne parle de bid strategy',
    prompt: '',
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
    etat: 'aEcrire',
    note: 'Ne demande que le profil de marque — faisable sans nouvelle donnée',
    prompt: '',
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
    etat: 'aEcrire',
    note: 'Le hook n’existe qu’à l’intérieur d’un brief complet',
    prompt: '',
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
    prompt: `Audite les créas actives selon le framework Eugene Schwartz.

Niveaux : Unaware / Problem Aware / Solution Aware / Product Aware / Most Aware

Pour chaque ad : identifier, hook d'ouverture, niveau de conscience, preuve
(citation du hook), stade funnel.

Puis :
- % créas par niveau + % budget par niveau
- Diagnostic : top-heavy / bottom-heavy / équilibré
- Gaps : niveaux sous-représentés → implications pour le scaling
- Top 3 briefs à écrire en priorité`,
  },
  {
    id: 'cs-gagnant',
    label: 'Rétro-ingénierie d’un gagnant',
    etat: 'aEcrire',
    note: 'Documenter pourquoi une créa marche, et ce que les prochains briefs doivent en tirer',
    prompt: '',
  },
  {
    id: 'cs-exhaustive',
    label: 'Analyse exhaustive, pub par pub',
    etat: 'aAdapter',
    note: 'Manque mémoire négative, lois transversales, 5 itérations, auto-vérification',
    prompt: `Analyse détaillée de toutes les publicités actives (14 derniers jours).

ÉTAPE 1 — Tableau récapitulatif, trié par ROAS décroissant, code couleur.

ÉTAPE 2 — Pour CHAQUE publicité, sans exception :
- Métriques complètes
- COPY COMPLÈTE (primary text, headline, description, CTA) — aucun résumé
- Diagnostic vidéo : Hook / Hold / Completion
- Ce qui fonctionne / Ce qui freine
- 1 action concrète

ÉTAPE 3 — Framework gagnant à reproduire`,
  },
  {
    id: 'cs-formats',
    label: 'Comparaison de formats',
    etat: 'aEcrire',
    note: 'Vidéo vs statique vs carrousel, et les ratios 1:1 / 4:5 / 9:16',
    prompt: '',
  },
]

const CREA_STRATEGY: EntreeBanque[] = [
  {
    id: 'cs-angles',
    label: 'Banque d’angles',
    etat: 'pret',
    prompt: `Construis une banque d'angles créatifs pour ce compte.

Pour chaque angle :
- NOM (label interne, pas un hook)
- SOURCE (citation directe)
- IDÉE CENTRALE (une phrase)
- PERSONA CIBLE (une personne précise dans une situation)
- NIVEAU DE CONSCIENCE + justification
- DÉCLENCHEUR ÉMOTIONNEL (frustration / culpabilité / soulagement /
  embarras / fierté / aspiration / peur)
- FORMATS ADAPTÉS + pourquoi
- DIRECTION DE HOOK
- PRIORITÉ CRÉATIVE : HIGH / MEDIUM / LOW + justification
- STATUT : Frais / Actif / Fatigué

Termine par une SYNTHÈSE : total, distribution par niveau de conscience,
top 3 à briefer immédiatement, et le manque le plus criant.`,
  },
  {
    id: 'cs-full-funnel',
    label: 'Stratégie full-funnel',
    etat: 'pret',
    prompt: `Construis une stratégie créative full-funnel pour ce compte.

SECTION 1 — DIAGNOSTIC : distribution de conscience actuelle, gaps, fréquence,
bottleneck créatif principal.
SECTION 2 — PERSONAS : 3 à 5. Par persona : nom + description située, position
sur le spectre de conscience, douleur/désir principal, direction de hook.
SECTION 3 — CARTE FULL FUNNEL : TOFU / MOFU / BOFU. Par étage : objectif,
formats, directions d'angles, exemple de hook.
SECTION 4 — ROADMAP 90 JOURS : Fondation (sem. 1-4), Validation (5-8),
Composition (9-12). Par phase : angles prioritaires, volume minimum, signal de
succès.
SECTION 5 — CONVENTION DE NOMMAGE, triable par persona, angle, format, niveau
de conscience et type de hook.
SECTION 6 — LES 3 PREMIERS BRIEFS, dans l'ordre, avec pourquoi celui-là d'abord.`,
  },
  {
    id: 'cs-plan-test',
    label: 'Plan de test créatif',
    etat: 'aEcrire',
    note: 'La suite logique de la banque d’angles : quoi tester, dans quel ordre, sur quel volume',
    prompt: '',
  },
]

const AUDIT: EntreeBanque[] = [
  {
    id: 'audit-complet',
    label: 'Audit complet Andromeda',
    etat: 'aAdapter',
    note: 'Les 50 points ne sont pas énumérés : le dénominateur change à chaque exécution',
    prompt: `Lance un audit complet Meta Ads (framework Andromeda) sur ce compte.

Évalue 50 points de contrôle répartis en 4 catégories pondérées :
- Pixel / CAPI Health (30%)
- Creative Diversity & Fatigue (30%)
- Structure du compte (20%)
- Audience & Targeting (20%)

Pour chaque point : PASS / WARNING / FAIL avec le benchmark Meta.

1. Health Score (0-100) + Grade (A-F) avec barres par catégorie
2. Top 5 Quick Wins
3. Rapport complet par catégorie
4. Plan d'action priorisé avec temps estimé de correction`,
  },
  {
    id: 'audit-pixel',
    label: 'Pixel & CAPI',
    etat: 'aAdapter',
    note: 'Demande EMQ, déduplication et AEM : invisibles depuis les permissions de l’outil',
    prompt: `Audite la configuration Pixel et CAPI de ce compte.

Vérifie : pixel actif, CAPI et envoi server-side, déduplication (event_id, taux),
Event Match Quality (seuil > 8.0), événements standards, vérification de domaine,
AEM iOS, fenêtres d'attribution.

Score chaque point PASS / WARNING / FAIL avec benchmark.`,
  },
  {
    id: 'audit-fatigue',
    label: 'Scan de fatigue créative',
    etat: 'pret',
    prompt: `Lance un scan de fatigue créative complet sur ce compte.

Pour chaque adset actif :
- Fréquence 7j : prospecting > 3 = warning, > 5 = fail ; retargeting > 8 / > 12
- Tendance CTR sur 14j : baisse > 20% = fatigue confirmée
- Hook Rate vidéo : > 25% = fort, < 15% = faible
- Fraîcheur créative : dernière créa > 21j = warning, > 45j = fail
- Diversité de formats : ≥ 3 nécessaires
- Similarité créative : flag si toutes les ads se ressemblent

Tableau : Ad Set | Fréquence | Tendance CTR | Hook Rate | Statut Fatigue
Puis : top 3 adsets à renouveler + direction de brief pour chacun.`,
  },
  {
    id: 'audit-structure',
    label: 'Structure du compte',
    etat: 'aAdapter',
    note: 'Budget par adset : ≥ 5× le CPA cible ici, ≥ 10× dans l’audit de référence',
    prompt: `Évalue la structure du compte Meta Ads.

- Nombre de campagnes (1-3 recommandé)
- CBO vs ABO : stratégie adaptée au niveau de dépense ?
- Learning phase : % adsets en Learning Limited (> 50% = critique)
- Budget par adset : ≥ 5× CPA cible ?
- Overlap d'audiences entre adsets
- Advantage+ Sales, Advantage+ Placements
- Réglages d'attribution vérifiés post-janvier 2026

Score chaque point et génère un Structure Health Score.`,
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
