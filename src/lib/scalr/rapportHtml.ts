/**
 * Les rapports qui arrivent sous forme de document HTML.
 *
 * Un livrable stratégique — personas, entonnoir, feuille de route, briefs —
 * ne se met pas en page en Markdown : ni bandeau de chiffres, ni pastille
 * d'état, ni carte. Ces rapports-là sont donc écrits en HTML par le modèle et
 * affichés dans un cadre isolé.
 *
 * Tout le reste de l'application continue de recevoir du Markdown, et l'envoi
 * par courriel bascule sur un lien pour ceux-ci : un document HTML collé dans
 * un e-mail s'affiche en code source, c'est le bug d'origine de la règle qui
 * interdisait le HTML aux agents.
 */

/**
 * Reconnaît un document HTML complet.
 *
 * On exige la balise d'ouverture d'un document entier, pas une balise isolée :
 * un rapport Markdown peut légitimement contenir un `<br>` ou citer du code, et
 * le prendre pour un document l'enverrait dans un cadre où il s'afficherait nu.
 */
export function estRapportHtml(contenu: string | null | undefined): boolean {
  // La clôture ``` est retirée avant l'examen : le modèle l'ajoute encore
  // malgré la consigne, et le détecteur, plus strict que l'extracteur, laissait
  // alors le document partir dans le rendu Markdown — où ses styles fuyaient
  // dans la page et repeignaient l'application entière.
  const t = (contenu || '').trimStart().replace(/^```(?:html)?\s*/i, '').slice(0, 400).toLowerCase()
  return t.startsWith('<!doctype html') || t.startsWith('<html')
}

/**
 * Le document, débarrassé de ce que le modèle a pu mettre autour.
 *
 * La consigne demande le document seul, mais une clôture en ```html ou une
 * phrase d'introduction arrivent encore : les retirer coûte trois lignes et
 * évite un cadre vide.
 */
export function extraireRapportHtml(contenu: string): string {
  const brut = (contenu || '').trim()
  // Une clôture peut aussi rester ouverte quand la génération a été coupée :
  // le bloc fermé est cherché d'abord, la balise ensuite.
  const enBloc = /```(?:html)?\s*(<!doctype html[\s\S]*?<\/html>)\s*```/i.exec(brut)
  if (enBloc) return enBloc[1]
  const debut = brut.search(/<!doctype html|<html[\s>]/i)
  if (debut < 0) return brut
  const fin = brut.toLowerCase().lastIndexOf('</html>')
  return fin > debut ? brut.slice(debut, fin + 7) : brut.slice(debut)
}
