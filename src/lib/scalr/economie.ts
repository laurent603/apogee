/**
 * L'économie du compte : ce qu'un prospect vaut vraiment.
 *
 * Un CPL cible saisi à l'intuition ne se vérifie jamais. Celui-ci se déduit
 * de trois choses que l'agence connaît — la valeur d'un client signé, la
 * marge dessus, et le taux de signature réel mesuré dans le CRM :
 *
 *     marge par client  = valeur client × marge %
 *     CPL au point mort = marge par client × taux de signature
 *     CPL cible         = point mort × part consacrée à l'acquisition
 *
 * Au-delà du point mort, chaque prospect coûte plus qu'il ne rapporte. En
 * dessous, l'écart est le profit.
 *
 * **Le taux de signature vient du tunnel GHL, pas d'une saisie.** C'est ce qui
 * distingue ce calcul d'une hypothèse : les taux bougent, le CPL acceptable
 * bouge avec eux, et un compte dont la signature se dégrade voit sa cible se
 * resserrer sans que personne ait à y penser.
 *
 * Rien n'est déduit sans les trois entrées. Une valeur client absente, une
 * marge à zéro ou un tunnel vide rendent `null` plutôt qu'un chiffre inventé
 * qui ferait ensuite autorité.
 */

export type Entrees = {
  /** Chiffre d'affaires moyen d'un client signé. */
  valeurClient: number | null
  /** Marge brute sur ce chiffre d'affaires, en pourcentage. */
  margePct: number | null
  /** Part de la marge qu'on accepte de dépenser en acquisition, en
   *  pourcentage. À défaut, la moitié. */
  partAcquisitionPct: number | null
  /** Mesurés sur la période, depuis le CRM. */
  leads: number
  signes: number
}

export type Economie = {
  margeParClient: number | null
  tauxSignature: number | null
  /** Coût par prospect au-delà duquel l'acquisition n'est plus rentable. */
  cplPointMort: number | null
  /** Ce qu'on vise pour dégager de la marge. */
  cplCible: number | null
  /** Ce qui manque pour que le calcul tienne. */
  manquant: string[]
}

const n = (v: number | null | undefined) => (Number.isFinite(v as number) ? (v as number) : 0)
const r2 = (v: number) => Math.round(v * 100) / 100

export const PART_ACQUISITION_DEFAUT = 50

export function economie(e: Entrees): Economie {
  const manquant: string[] = []
  if (!n(e.valeurClient)) manquant.push('la valeur moyenne d’un client signé')
  if (!n(e.margePct)) manquant.push('la marge brute')
  if (!e.leads) manquant.push('des prospects sur la période')
  // Un taux de signature nul est une mesure, pas une donnée manquante — mais
  // il rend la cible inexploitable, alors on le dit plutôt que d'afficher 0 €.
  if (e.leads > 0 && !e.signes) manquant.push('au moins une signature pour mesurer le taux')

  const margeParClient = n(e.valeurClient) && n(e.margePct)
    ? r2(n(e.valeurClient) * (n(e.margePct) / 100))
    : null
  const tauxSignature = e.leads > 0 ? r2((e.signes / e.leads) * 100) : null

  if (manquant.length || margeParClient == null || tauxSignature == null) {
    return { margeParClient, tauxSignature, cplPointMort: null, cplCible: null, manquant }
  }

  const cplPointMort = r2(margeParClient * (tauxSignature / 100))
  const part = n(e.partAcquisitionPct) || PART_ACQUISITION_DEFAUT
  return {
    margeParClient,
    tauxSignature,
    cplPointMort,
    cplCible: r2(cplPointMort * (part / 100)),
    manquant: [],
  }
}

/** Comment le CPL réel se situe face à la cible déduite. */
export function verdictCpl(reel: number | null, cible: number | null, pointMort: number | null): {
  niveau: 'bon' | 'attention' | 'mauvais'; texte: string
} | null {
  if (reel == null || cible == null || pointMort == null || !reel) return null
  if (reel > pointMort) return {
    niveau: 'mauvais',
    texte: `Chaque prospect coûte plus qu’il ne rapporte : ${reel.toFixed(2)} € pour ${pointMort.toFixed(2)} € de marge attendue.`,
  }
  if (reel > cible) return {
    niveau: 'attention',
    texte: `Rentable, mais au-dessus de la cible : la marge dégagée est plus mince que prévu.`,
  }
  return {
    niveau: 'bon',
    texte: `Sous la cible : chaque prospect laisse ${(pointMort - reel).toFixed(2)} € de marge.`,
  }
}
