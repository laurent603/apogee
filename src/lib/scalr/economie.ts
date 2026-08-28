/**
 * L'économie du compte : ce qu'un prospect vaut vraiment.
 *
 * Un CPL cible saisi à l'intuition ne se vérifie jamais. Celui-ci se déduit de
 * trois choses que l'agence connaît — la valeur d'un client signé, la marge
 * dessus, et le taux de signature mesuré dans le CRM.
 *
 * **Le piège est le dénominateur.** Le CRM ne voit pas tous les prospects que
 * Meta compte : doublons de la CAPI, formulaires abandonnés, attribution
 * perdue. Sur un compte réel, 225 prospects au CRM pour 626 côté Meta. Calculer
 * le taux de signature sur les 225 puis comparer le résultat à un coût par
 * prospect calculé sur les 626 revient à diviser par deux populations
 * différentes — et à surestimer le coût acceptable dans le rapport exact de
 * l'écart, ici presque trois fois.
 *
 * Le seuil qui pilote les verdicts se calcule donc **sur les prospects Meta**,
 * puisque c'est à un coût par prospect Meta qu'il sera comparé. Le taux mesuré
 * côté CRM reste affiché à part : il dit la qualité de ce qui arrive au CRM,
 * pas ce que le média produit.
 *
 * **Et le coût par signature échappe entièrement au problème** : dépense
 * divisée par signatures, comparé à la marge par client. Deux nombres, aucun
 * dénominateur discutable. C'est sur celui-là qu'on décide d'un budget.
 */

export type Entrees = {
  /** Chiffre d'affaires moyen d'un client signé. */
  valeurClient: number | null
  /** Marge brute sur ce chiffre d'affaires, en pourcentage. */
  margePct: number | null
  /** Part de la marge qu'on accepte de dépenser en acquisition. Défaut : la
   *  moitié. */
  partAcquisitionPct: number | null
  /** Prospects tels que le CRM les compte, et signatures. */
  leads: number
  signes: number
  /** Prospects tels que Meta les compte, et dépense de la même période. */
  leadsMeta?: number
  depense?: number
}

export type Economie = {
  margeParClient: number | null
  /** Signatures rapportées aux prospects du CRM. */
  tauxSignature: number | null
  /** Signatures rapportées aux prospects Meta — la base des seuils. */
  tauxSignatureMedia: number | null
  /** Part des prospects Meta qui parviennent au CRM. */
  couverture: number | null

  /** Coût par prospect au-delà duquel l'acquisition n'est plus rentable,
   *  exprimé par prospect Meta. */
  cplPointMort: number | null
  cplCible: number | null

  /** Le seul rapport sans dénominateur discutable. */
  coutParSignature: number | null
  /** Ce que chaque client signé laisse une fois l'acquisition payée. */
  margeRestante: number | null

  /** Coût par prospect, dans les deux comptages. */
  cplMeta: number | null
  cplCrm: number | null

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
  if (e.leads > 0 && !e.signes) manquant.push('au moins une signature pour mesurer le taux')

  const depense = n(e.depense)
  const leadsMeta = n(e.leadsMeta)

  const margeParClient = n(e.valeurClient) && n(e.margePct)
    ? r2(n(e.valeurClient) * (n(e.margePct) / 100))
    : null
  const tauxSignature = e.leads > 0 ? r2((e.signes / e.leads) * 100) : null
  const tauxSignatureMedia = leadsMeta > 0 ? r2((e.signes / leadsMeta) * 100) : null
  const couverture = leadsMeta > 0 && e.leads > 0 ? r2((e.leads / leadsMeta) * 100) : null

  const coutParSignature = e.signes > 0 && depense > 0 ? r2(depense / e.signes) : null
  const margeRestante = margeParClient != null && coutParSignature != null
    ? r2(margeParClient - coutParSignature) : null

  const cplMeta = leadsMeta > 0 && depense > 0 ? r2(depense / leadsMeta) : null
  const cplCrm = e.leads > 0 && depense > 0 ? r2(depense / e.leads) : null

  const base = {
    margeParClient, tauxSignature, tauxSignatureMedia, couverture,
    coutParSignature, margeRestante, cplMeta, cplCrm,
  }

  if (manquant.length || margeParClient == null) {
    return { ...base, cplPointMort: null, cplCible: null, manquant }
  }

  /**
   * Le taux retenu pour le seuil est celui mesuré sur les prospects Meta.
   * À défaut — comptage Meta absent —, on retombe sur le taux CRM en
   * l'assumant : c'est alors une borne haute, pas une mesure.
   */
  const taux = tauxSignatureMedia ?? tauxSignature
  if (taux == null) return { ...base, cplPointMort: null, cplCible: null, manquant }

  const cplPointMort = r2(margeParClient * (taux / 100))
  const part = n(e.partAcquisitionPct) || PART_ACQUISITION_DEFAUT
  return {
    ...base,
    cplPointMort,
    cplCible: r2(cplPointMort * (part / 100)),
    manquant: [],
  }
}

/**
 * Où en est le compte, jugé sur le coût par signature.
 *
 * Ce rapport ne dépend d'aucun comptage de prospects : ce que l'acquisition
 * coûte pour amener un client, contre ce que ce client rapporte.
 */
export function verdictSignature(coutParSignature: number | null, margeParClient: number | null): {
  niveau: 'bon' | 'attention' | 'mauvais'; texte: string
} | null {
  if (coutParSignature == null || margeParClient == null || !margeParClient) return null
  const part = coutParSignature / margeParClient
  const reste = margeParClient - coutParSignature

  if (part >= 1) return {
    niveau: 'mauvais',
    texte: `Acquérir un client coûte ${coutParSignature.toFixed(2)} € pour ${margeParClient.toFixed(2)} € de marge : chaque signature creuse le compte.`,
  }
  if (part >= 0.5) return {
    niveau: 'attention',
    texte: `L’acquisition absorbe ${Math.round(part * 100)}% de la marge. Il reste ${reste.toFixed(2)} € par client.`,
  }
  return {
    niveau: 'bon',
    texte: `L’acquisition absorbe ${Math.round(part * 100)}% de la marge. Il reste ${reste.toFixed(2)} € par client signé.`,
  }
}
