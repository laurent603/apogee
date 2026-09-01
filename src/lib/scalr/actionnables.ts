/**
 * Les créas qu'un rapport d'agent réclame, extraites de son bloc final.
 *
 * Le Creative Fatigue Scanner nomme déjà les publicités saturées et propose
 * leur remplacement ; la Banque d'Angles produit des angles à tester. Cette
 * matière restait dans la prose, à recopier à la main dans le générateur de
 * briefs. Le bloc JSON demandé en fin de rapport la rend cliquable.
 */

export type Actionnable = {
  /** Ce qu'il y a à produire, en une ligne. */
  titre: string
  /** La publicité visée, quand il y en a une. Une Banque d'Angles n'en a pas. */
  adId?: string
  adName?: string
  /** Ce que montrent les chiffres. */
  constat?: string
  /** Ce que la nouvelle créa doit faire autrement. */
  piste?: string
}

/**
 * Lit le bloc `actionnables` d'un rapport.
 *
 * Chercher les publicités dans la prose serait fragile : un titre reformulé et
 * l'extraction casse en silence. Ici, l'absence de bloc rend une liste vide et
 * l'écran n'affiche simplement rien — un rapport ancien, écrit avant cette
 * consigne, reste lisible.
 */
export function extraireActionnables(markdown: string): Actionnable[] {
  if (!markdown) return []
  const blocs = [...markdown.matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1])
  // Le dernier bloc d'abord : la consigne le demande en fin de document.
  for (const brut of blocs.reverse()) {
    try {
      const o = JSON.parse(brut) as { actionnables?: unknown }
      if (!Array.isArray(o?.actionnables)) continue
      const liste = (o.actionnables as Record<string, unknown>[])
        .filter((a) => a && typeof a.titre === 'string' && a.titre.trim())
        .map((a) => ({
          titre: String(a.titre).trim(),
          adId: typeof a.adId === 'string' && a.adId.trim() ? a.adId.trim() : undefined,
          adName: typeof a.adName === 'string' && a.adName.trim() ? a.adName.trim() : undefined,
          constat: typeof a.constat === 'string' ? a.constat : undefined,
          piste: typeof a.piste === 'string' ? a.piste : undefined,
        }))
      // Un bloc vide est une réponse valide : l'analyse n'appelle aucune créa.
      return liste.slice(0, 8)
    } catch { /* bloc non exploitable : on essaie le précédent */ }
  }
  return []
}

/**
 * Le rapport débarrassé de son bloc technique.
 *
 * Sans cela le lecteur voyait le JSON s'afficher en bloc de code sous le
 * rapport, juste au-dessus des mêmes éléments rendus proprement.
 */
export const sansBlocActionnables = (md: string) =>
  // Le `(?!```)` borne la recherche à un seul bloc : sans lui, un rapport
  // portant deux blocs JSON aurait vu le premier avalé jusqu'au second.
  (md || '')
    .replace(/```json\s*(?:(?!```)[\s\S])*?"actionnables"(?:(?!```)[\s\S])*?```/g, '')
    .trim()
