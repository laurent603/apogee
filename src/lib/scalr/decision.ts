/**
 * Le verdict porté par chaque ligne — portage fidèle de `rowDecision`.
 *
 * C'est la colonne vertébrale de Scalr : campagne, adset, publicité et créa
 * reçoivent tous leur décision de cette fonction, avec la phrase qui la
 * justifie. Les chiffres ne sont pas la finalité, ils sont la pièce
 * justificative.
 *
 * Deux subtilités métier qu'il ne faut surtout pas « simplifier » :
 *
 * - **Le même constat ne dicte pas le même geste selon le niveau.** Sous
 *   cible avec du volume, une campagne est « à scaler » (monter le budget),
 *   une créa est « à décliner » (en produire des variantes).
 * - **Sans objectif renseigné, le compte se compare à lui-même.** Les seuils
 *   retombent sur la médiane du compte plutôt que sur un barème universel qui
 *   n'aurait aucun sens d'un secteur à l'autre.
 *
 * L'ordre des tests porte la hiérarchie des priorités : le premier qui répond
 * gagne. Déplacer une règle change le sens de l'outil.
 */

export type DecisionKind = 'cut' | 'scale' | 'watch' | 'iterate' | 'objective' | 'test'
export type Level = 'campaign' | 'adset' | 'ad' | 'crea'

export type Decision = { kind: DecisionKind; label: string; reason: string }

/** Ligne à juger. Les noms doublés reprennent ceux de Scalr : `result_value`
 *  prend le relais de `leads` sur les objectifs qui ne comptent pas de
 *  prospects — engagements, itinéraires, personnes touchées. */
export type DecisionRow = {
  spend?: number | null
  leads?: number | null
  resultValue?: number | null
  cpl?: number | null
  costPerResult?: number | null
  ctr?: number | null
  linkCtr?: number | null
  frequency?: number | null
}

export type Goals = {
  /** `target_cpl` des Brand Settings du compte. */
  targetCpl?: number | null
  /** `max_cpl`. À défaut, Scalr retient cible × 2,5. */
  maxCpl?: number | null
}

/** Contexte du compte : les médianes servent de repli quand aucun objectif
 *  n'est renseigné. `adCpls` est volontairement celle des publicités même
 *  pour juger une campagne — c'est le comportement de Scalr. */
export type DecisionContext = {
  goals?: Goals
  /** Dépenses des lignes du même niveau, pour le seuil de coupe. */
  levelSpends: number[]
  /** CPL de toutes les publicités du compte. */
  adCpls: number[]
}

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/**
 * Médiane **zéros compris**, sur l'ensemble des lignes du niveau.
 *
 * Scalr déclare deux `median` dans le même fichier : celle de la ligne 4307
 * écarte les zéros, celle de la ligne 5496 les garde. La seconde écrase la
 * première, c'est donc elle qui s'applique — y compris dans `rowDecision`.
 * Le comportement observé en découle directement, et il faut le reproduire
 * pour que les verdicts correspondent à ce que l'outil affiche aujourd'hui.
 *
 * Conséquence à connaître : sur un compte où plus de la moitié des publicités
 * n'ont produit aucun lead, la médiane des CPL tombe à 0 et le test
 * `cpl <= médiane || !médiane` devient toujours vrai — la comparaison de CPL
 * cesse alors de discriminer. Voir `medianeNonNulle` pour la variante stricte.
 */
export function median(values: (number | null | undefined)[]): number {
  const xs = values.map(n).filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!xs.length) return 0
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2
}

/** Variante qui ignore les lignes sans activité. Non utilisée par
 *  `rowDecision` aujourd'hui : conservée pour pouvoir comparer les deux
 *  lectures avant de décider de resserrer les verdicts. */
export function medianeNonNulle(values: (number | null | undefined)[]): number {
  return median(values.map(n).filter((v) => v > 0))
}

const eur = (v: number) =>
  `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

export function rowDecision(row: DecisionRow, level: Level, ctx: DecisionContext): Decision {
  const spent = n(row.spend)
  // `result_value` prend le relais : une campagne Messenger compte des
  // engagements, pas des prospects, et mérite quand même un verdict.
  const leads = n(row.leads) || n(row.resultValue)
  const cpl = n(row.cpl) || n(row.costPerResult)
  const ctr = n(row.ctr)
  const linkCtr = n(row.linkCtr)
  const freq = n(row.frequency)

  const target = n(ctx.goals?.targetCpl)
  const max = n(ctx.goals?.maxCpl) || (target ? target * 2.5 : 0)

  // Sans objectif, le seuil de coupe se cale sur la médiane du niveau, avec
  // un plancher à 25 € : en dessous, aucune conclusion n'est solide.
  const cutSpend = target ? target * 2 : Math.max(25, median(ctx.levelSpends) * 0.9)

  const isEntity = level === 'campaign' || level === 'adset'
  const isCreative = level === 'ad' || level === 'crea'

  const medianCpl = median(ctx.adCpls)
  const underTarget = leads > 0 && cpl > 0 && (target ? cpl <= target : cpl <= medianCpl || !medianCpl)
  const nearTarget = leads > 0 && cpl > 0 && (target ? cpl <= target * 1.25 : max ? cpl <= max : true)
  const enoughVolume = isEntity ? leads >= 10 : leads >= 3 || spent >= (target ? target * 5 : 120)
  const highFreq = freq >= 2.6
  const weakCtr = (linkCtr > 0 && linkCtr < 1) || (ctr > 0 && ctr < 0.8)
  const goodTraffic = linkCtr >= 2.5 || ctr >= 1.5

  if (spent >= cutSpend && leads === 0)
    return { kind: 'cut', label: 'À couper', reason: `Dépense ${eur(spent)} sans lead exploitable.` }

  if (max && cpl > max)
    return { kind: 'cut', label: 'Hors objectif', reason: `CPL ${eur(cpl)} au-dessus du plafond ${eur(max)}.` }

  if (isCreative && underTarget && enoughVolume)
    return { kind: 'scale', label: 'À décliner', reason: 'Winner confirmé: volume, CPL sous cible et signal créatif exploitable.' }

  if (isEntity && underTarget && enoughVolume)
    return { kind: 'scale', label: 'À scaler', reason: 'Volume sous objectif: augmenter graduellement sans changer plusieurs variables.' }

  if (highFreq && weakCtr)
    return { kind: 'watch', label: 'Fatigue', reason: 'Fréquence en hausse et clic en baisse: injecter une variation.' }

  if (goodTraffic && !leads && spent > 0)
    return { kind: 'iterate', label: 'À itérer', reason: 'Trafic présent mais pas encore de lead: retravailler offre, formulaire ou promesse.' }

  if (nearTarget)
    return { kind: 'objective', label: 'Dans l’objectif', reason: 'Performance proche des seuils client: conserver et surveiller la stabilité.' }

  if (spent > 0 && leads > 0)
    return { kind: 'watch', label: 'À surveiller', reason: 'Signal utile mais pas encore assez solide pour scaler.' }

  return { kind: 'test', label: 'Nouveau test', reason: 'Pas assez de dépense ou de volume pour conclure proprement.' }
}

/* ─── Couleurs, tenues à part du verdict ───────────────────────────────── */

export type Feu = 'green' | 'yellow' | 'red' | 'none'

/** Sans objectif, Scalr retient 20 € / 28 € comme repères par défaut. */
export function cplColor(v: number | null | undefined, goals?: Goals): Feu {
  const value = n(v)
  const target = n(goals?.targetCpl)
  const max = n(goals?.maxCpl)
  if (target || max) {
    if (target && value <= target) return 'green'
    if (max && value > max) return 'red'
    return 'yellow'
  }
  if (!value) return 'none'
  return value < 20 ? 'green' : value > 28 ? 'red' : 'yellow'
}

export function freqColor(v: number | null | undefined): Feu {
  const value = n(v)
  if (!value) return 'none'
  return value > 3 ? 'red' : value > 2.5 ? 'yellow' : 'green'
}
