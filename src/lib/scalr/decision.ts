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

export type DecisionKind = 'cut' | 'scale' | 'watch' | 'iterate' | 'objective' | 'test' | 'paused'
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
  /** Vues 3 s ÷ impressions. Sert au seuil de hook, quand il est réglé. */
  hookRate?: number | null
  /** `ACTIVE` ou non. Sert à distinguer une ligne arrêtée d'un test en cours. */
  status?: string | null
  /** Date de création, pour la même distinction. */
  createdTime?: string | Date | null
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
/**
 * Les seuils du moteur, réglables par compte.
 *
 * Chacun remplaçait une constante écrite en dur — choisie par moi, pas par le
 * media buyer qui connaît son marché. Un compte à 8 € de CPL cible et un
 * compte à 80 € n'ont aucune raison de partager le même volume minimal ni la
 * même fréquence de saturation.
 *
 * Toutes les valeurs sont facultatives : absentes, ce sont les constantes
 * d'origine qui s'appliquent, et un compte non réglé se comporte exactement
 * comme avant.
 */
export type Seuils = {
  /** Une ligne passe si son coût reste sous cible × ce facteur. */
  toleranceWinner?: number | null
  /** Dépense minimale avant de juger, puis dépense qui confirme, en
   *  multiples de la cible. */
  facteurRegardable?: number | null
  facteurConfirme?: number | null
  volumeMinWinner?: number | null
  volumeMinEntite?: number | null
  /** Hook rate minimal exigé d'une vidéo pour être winner. */
  hookMinWinner?: number | null
  freqFatigue?: number | null
  linkCtrFaible?: number | null
  ctrFaible?: number | null
  joursNouveauTest?: number | null
}

export const SEUILS_DEFAUT = {
  toleranceWinner: 1, facteurRegardable: 2, facteurConfirme: 5,
  volumeMinWinner: 3, volumeMinEntite: 10, hookMinWinner: 0,
  freqFatigue: 2.6, linkCtrFaible: 1, ctrFaible: 0.8, joursNouveauTest: 14,
} as const

export type DecisionContext = {
  goals?: Goals
  seuils?: Seuils
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

/** Meta rend `ACTIVE` pour une ligne qui diffuse ; tout le reste est un arrêt
 *  — en pause, archivée, ou bloquée par sa campagne parente. */
const estActive = (statut: string | null | undefined) => statut == null || statut === 'ACTIVE'

/**
 * Lancée assez récemment pour qu'on lui laisse le bénéfice du doute.
 *
 * Quatorze jours : au-delà, une ligne active qui n'a toujours pas de signal
 * n'est plus un test, c'est un problème de diffusion. Une date absente vaut
 * « ancienne » — supposer la jeunesse ferait passer tout un compte non
 * synchronisé pour un ensemble de tests.
 */
const jeune = (date: string | Date | null | undefined, jours = 14) => {
  if (!date) return false
  const t = new Date(date).getTime()
  return Number.isFinite(t) && Date.now() - t < jours * 86_400_000
}

const eur = (v: number) =>
  `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

export function rowDecision(row: DecisionRow, level: Level, ctx: DecisionContext): Decision {
  /** Un seuil réglé, ou celui d'origine. Zéro reste une valeur choisie. */
  const seuil = <K extends keyof typeof SEUILS_DEFAUT>(cle: K): number => {
    const v = ctx.seuils?.[cle]
    return v == null || !Number.isFinite(v) ? SEUILS_DEFAUT[cle] : v
  }

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
  // Zéros conservés ici : une ligne à 0 € a réellement dépensé zéro, c'est
  // une mesure. Les écarter relèverait le seuil de coupe et épargnerait des
  // publicités qui brûlent du budget sans produire un seul lead.
  const cutSpend = target ? target * seuil('facteurRegardable') : Math.max(25, median(ctx.levelSpends) * 0.9)

  const isEntity = level === 'campaign' || level === 'adset'
  const isCreative = level === 'ad' || level === 'crea'

  // Strict ici, à la différence de Scalr : un zéro dans cette population
  // n'est pas un CPL de 0 €, c'est une publicité sans lead — donc sans CPL.
  // Les compter écrase la médiane jusqu'à 0 dès que la moitié des pubs n'ont
  // rien produit, et `cpl <= médiane || !médiane` devient toujours vrai : le
  // coût cesse alors de départager quoi que ce soit, et une créa à 41 € de
  // CPL passe pour un winner confirmé.
  const medianCpl = medianeNonNulle(ctx.adCpls)
  // La tolérance élargit la cible sans la déplacer : la cible reste
  // l'objectif annoncé, le facteur dit jusqu'où on accepte d'aller.
  const cibleLarge = target * seuil('toleranceWinner')
  const underTarget = leads > 0 && cpl > 0 && (target ? cpl <= cibleLarge : cpl <= medianCpl || !medianCpl)
  const nearTarget = leads > 0 && cpl > 0 && (target ? cpl <= cibleLarge * 1.25 : max ? cpl <= max : true)
  const enoughVolume = isEntity
    ? leads >= seuil('volumeMinEntite')
    : leads >= seuil('volumeMinWinner') || spent >= (target ? target * seuil('facteurConfirme') : 120)

  /**
   * Le hook départage deux créas de même coût.
   *
   * Une vidéo dont personne ne passe la troisième seconde peut afficher un bon
   * CPL par accident de diffusion ; la déclarer winner enverrait décliner un
   * concept que le public n'a pas regardé. Le seuil ne s'applique qu'aux
   * vidéos — un statique n'a pas de hook — et vaut zéro par défaut, donc il ne
   * change rien tant qu'il n'est pas réglé.
   */
  const hookMin = seuil('hookMinWinner')
  const hook = n(row.hookRate)
  const hookSuffisant = hookMin <= 0 || hook <= 0 || hook >= hookMin

  const highFreq = freq >= seuil('freqFatigue')
  const weakCtr = (linkCtr > 0 && linkCtr < seuil('linkCtrFaible')) || (ctr > 0 && ctr < seuil('ctrFaible'))
  const goodTraffic = linkCtr >= 2.5 || ctr >= 1.5

  if (spent >= cutSpend && leads === 0)
    return { kind: 'cut', label: 'Couper', reason: `Dépense ${eur(spent)} sans lead exploitable.` }

  if (max && cpl > max)
    return { kind: 'cut', label: 'Hors cible', reason: `CPL ${eur(cpl)} au-dessus du plafond ${eur(max)}.` }

  /**
   * Winner : le CPL tient sous la cible **et** le volume suffit à le croire.
   *
   * Le geste qui suit dépend du grain, pas du verdict : on décline une créa en
   * variantes, on monte le budget d'un ad set. Le libellé est donc le même
   * partout et c'est la raison qui porte l'action — auparavant, « À décliner »
   * était réservé aux publicités et « À scaler » aux campagnes et ad sets, si
   * bien qu'aucune publicité ne pouvait jamais s'afficher « à scaler ».
   */
  if (underTarget && enoughVolume && hookSuffisant)
    return {
      kind: 'scale', label: 'Winner',
      reason: isCreative
        ? 'Volume atteint et CPL sous cible : décliner en variantes avant la fatigue.'
        : 'Volume atteint et CPL sous cible : monter le budget graduellement, une variable à la fois.',
    }

  /**
   * Scaler : le coût est bon, le volume ne suffit pas encore à conclure.
   *
   * C'est la ligne qui mérite du budget — pas parce qu'elle a fait ses preuves,
   * mais parce qu'elle est la mieux placée pour les faire. Sans cette étape,
   * elle tombait dans « à surveiller », ce qui ne dit pas quoi faire.
   */
  if (underTarget && spent > 0)
    return {
      kind: 'scale', label: 'Scaler',
      reason: 'CPL sous cible mais volume encore léger : augmenter l’exposition pour confirmer.',
    }

  if (highFreq && weakCtr)
    return { kind: 'watch', label: 'Fatigue', reason: 'Fréquence en hausse et clic en baisse: injecter une variation.' }

  if (goodTraffic && !leads && spent > 0)
    return { kind: 'iterate', label: 'Itérer', reason: 'Trafic présent mais pas encore de lead: retravailler offre, formulaire ou promesse.' }

  if (nearTarget)
    return { kind: 'objective', label: 'Dans la cible', reason: 'Performance proche des seuils client: conserver et surveiller la stabilité.' }

  if (spent > 0 && leads > 0)
    return { kind: 'watch', label: 'Surveiller', reason: 'Signal utile mais pas encore assez solide pour scaler.' }

  /**
   * Trois situations se ressemblaient sous « Nouveau test » : une ligne
   * fraîchement lancée, une ligne arrêtée, et une ligne active que Meta ne
   * diffuse pas. Les confondre gonflait la colonne des tests avec des
   * publicités en pause depuis des mois — et masquait le seul cas qui appelle
   * une vérification immédiate, celui de la ligne active qui ne dépense rien.
   *
   * L'arrêt ne s'applique qu'ici : une publicité en pause qui a fait ses
   * preuves reste un winner, et savoir qu'on a mis un winner en pause vaut
   * mieux que de le voir disparaître derrière son statut.
   */
  if (!estActive(row.status))
    return { kind: 'paused', label: 'En pause', reason: 'Diffusion arrêtée : aucun verdict à porter sur la période.' }

  if (jeune(row.createdTime, seuil('joursNouveauTest')))
    return { kind: 'test', label: 'Nouveau test', reason: 'Lancée récemment : laisser le temps de produire un signal.' }

  if (spent === 0)
    return { kind: 'paused', label: 'Sans diffusion', reason: 'Active mais aucune dépense : vérifier budget, audience ou rejet créatif.' }

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
