/**
 * Les deux cartes de référence, montrées au générateur d'images.
 *
 * Décrire une marque en texte à un générateur ne fonctionne pas : « bleu
 * foncé » et « typographie moderne » ne veulent rien dire pour lui. Une image
 * où la couleur est visible, où la typographie est posée, où le bouton est
 * dessiné, oui — c'est ce qui sépare une créa générique d'une créa qui
 * ressemble au compte.
 *
 * Le modèle fournit les données, l'application les met en page. Un modèle qui
 * écrit lui-même le SVG produit une carte différente à chaque appel, parfois
 * illisible ; un gabarit codé produit toujours la même grille propre. La
 * créativité appartient au contenu, pas à la grille.
 */

export type AdnMarque = {
  identite?: {
    nom?: string; promesse?: string; ton?: string[]
    mots_bannis?: string[]; a_qui?: string
  }
  systeme_visuel?: {
    couleur_principale?: string; couleur_secondaire?: string; couleur_accent?: string
    regle_accent?: string; fond?: string
    police_titre?: string; police_texte?: string
    formes?: string; style_image?: string
  }
  bouton?: { libelle?: string; forme?: string; fond?: string; texte?: string }
  regles?: { toujours?: string[]; jamais?: string[] }
  essence?: {
    adjectifs?: { mot?: string; explication?: string }[]
    spectre?: Record<string, number>
  }
  direction_photo?: { produit?: string; personnes?: string; contexte?: string; fonds?: string }
  preuves?: {
    chiffres?: { valeur?: string; source?: string }[]
    avis?: { citation?: string; auteur?: string }[]
    certifications?: string[]; anciennete?: string
  }
  angles?: { angle?: string; accroches?: string[] }[]
  incertitudes?: string[]
}

const L = 1080
const H = 1350

const ech = (v: unknown) =>
  String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/** Une couleur exploitable, ou un gris neutre plutôt qu'un SVG cassé. */
const col = (v: unknown, repli = '#8b8f9e') =>
  /^#[0-9a-f]{6}$/i.test(String(v ?? '')) ? String(v) : repli

/** Découpe grossière : le SVG n'a pas de retour à la ligne automatique. */
function couper(texte: string, parLigne: number, maxLignes = 3): string[] {
  const mots = String(texte ?? '').split(/\s+/).filter(Boolean)
  const out: string[] = []
  let courante = ''
  for (const m of mots) {
    if ((courante + ' ' + m).trim().length <= parLigne) courante = (courante + ' ' + m).trim()
    else { out.push(courante); courante = m; if (out.length >= maxLignes) break }
  }
  if (courante && out.length < maxLignes) out.push(courante)
  return out
}

const texte = (x: number, y: number, s: string, o: {
  taille?: number; gras?: number; couleur?: string; espace?: number; ancre?: string
} = {}) =>
  `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${o.taille ?? 22}"` +
  ` font-weight="${o.gras ?? 400}" fill="${o.couleur ?? '#0d0d12'}"` +
  (o.espace ? ` letter-spacing="${o.espace}"` : '') +
  (o.ancre ? ` text-anchor="${o.ancre}"` : '') +
  `>${ech(s)}</text>`

const titreSection = (x: number, y: number, s: string) =>
  texte(x, y, s.toUpperCase(), { taille: 19, gras: 700, couleur: '#74778a', espace: 2.4 })

/**
 * Carte 1 — le système : couleurs, typographies, bouton, règles.
 *
 * C'est celle qui porte l'information que le générateur rate le plus : la
 * palette exacte et la discipline de l'accent.
 */
export function carteMarque(adn: AdnMarque): string {
  const v = adn.systeme_visuel ?? {}
  const b = adn.bouton ?? {}
  const principale = col(v.couleur_principale, '#0d0d12')
  const secondaire = col(v.couleur_secondaire, '#52514e')
  const accent = col(v.couleur_accent, '#3434ef')

  const nuance = (x: number, c: string, nom: string) => `
    <rect x="${x}" y="330" width="220" height="150" rx="14" fill="${c}"/>
    ${texte(x, 512, nom, { taille: 20, gras: 700 })}
    ${texte(x, 540, c.toUpperCase(), { taille: 19, couleur: '#74778a' })}`

  const listeRegles = (x: number, y: number, titre: string, items: string[], couleur: string) => `
    ${titreSection(x, y, titre)}
    ${items.slice(0, 4).map((r, i) => `
      <circle cx="${x + 8}" cy="${y + 34 + i * 44}" r="6" fill="${couleur}"/>
      ${couper(r, 42, 1).map((l) => texte(x + 26, y + 40 + i * 44, l, { taille: 20, couleur: '#2c2f3a' })).join('')}
    `).join('')}`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}">
  <rect width="${L}" height="${H}" fill="#ffffff"/>
  <rect x="0" y="0" width="${L}" height="10" fill="${accent}"/>

  ${texte(64, 108, adn.identite?.nom ?? 'Marque', { taille: 54, gras: 700 })}
  ${texte(64, 150, 'Carte de marque — référence de génération', { taille: 21, couleur: '#74778a' })}
  ${couper(adn.identite?.promesse ?? '', 62, 2).map((l, i) => texte(64, 200 + i * 30, l, { taille: 23, couleur: '#2c2f3a' })).join('')}

  ${titreSection(64, 296, 'Palette')}
  ${nuance(64, principale, 'Principale')}
  ${nuance(304, secondaire, 'Secondaire')}
  ${nuance(544, accent, 'Accent')}

  <rect x="784" y="330" width="232" height="150" rx="14" fill="#f8f9fc" stroke="#e4e7ef"/>
  ${texte(800, 372, 'RÈGLE D’ACCENT', { taille: 16, gras: 700, couleur: accent, espace: 1.6 })}
  ${couper(v.regle_accent ?? 'Uniquement sur les mots qui portent la promesse.', 26, 5)
    .map((l, i) => texte(800, 402 + i * 24, l, { taille: 17, couleur: '#2c2f3a' })).join('')}

  ${titreSection(64, 610, 'Typographie')}
  ${texte(64, 668, 'Titre — ' + (v.police_titre ?? 'sans empattement, gras'), { taille: 20, couleur: '#74778a' })}
  ${texte(64, 730, 'ACCROCHE EN CAPITALES', { taille: 52, gras: 700 })}
  ${texte(64, 788, 'Sous-accroche en gras', { taille: 34, gras: 600, couleur: accent })}
  ${texte(64, 836, 'Texte courant — ' + (v.police_texte ?? 'sans empattement, normal'), { taille: 22, couleur: '#2c2f3a' })}

  ${titreSection(64, 916, 'Bouton')}
  <rect x="64" y="944" width="420" height="88" rx="${(b.forme ?? '').includes('pilule') ? 44 : 16}"
        fill="${col(b.fond, accent)}"/>
  ${texte(274, 998, b.libelle ?? 'Demander une étude', { taille: 28, gras: 700, couleur: col(b.texte, '#ffffff'), ancre: 'middle' })}
  ${texte(520, 980, 'Fond ' + (v.fond ?? 'clair') + ' · formes ' + (v.formes ?? 'arrondies'), { taille: 20, couleur: '#74778a' })}
  ${texte(520, 1012, 'Image ' + (v.style_image ?? 'reportage'), { taille: 20, couleur: '#74778a' })}

  ${listeRegles(64, 1090, 'Toujours', adn.regles?.toujours ?? [], '#16a34a')}
  ${listeRegles(568, 1090, 'Jamais', adn.regles?.jamais ?? [], '#dc2626')}
</svg>`
}

/**
 * Carte 2 — l'atmosphère : essence, direction photo, mood.
 *
 * Elle répond à une question que la palette ne couvre pas : à quoi
 * ressemblent les gens, les lieux et la lumière chez cette marque.
 */
export function carteStyle(adn: AdnMarque): string {
  const v = adn.systeme_visuel ?? {}
  const accent = col(v.couleur_accent, '#3434ef')
  const d = adn.direction_photo ?? {}
  const sp = adn.essence?.spectre ?? {}

  const bloc = (x: number, y: number, titre: string, contenu: string) => `
    <rect x="${x}" y="${y}" width="452" height="196" rx="14" fill="#f8f9fc" stroke="#e4e7ef"/>
    ${texte(x + 24, y + 44, titre.toUpperCase(), { taille: 17, gras: 700, couleur: accent, espace: 1.8 })}
    ${couper(contenu || '—', 44, 5).map((l, i) => texte(x + 24, y + 82 + i * 26, l, { taille: 20, couleur: '#2c2f3a' })).join('')}`

  const curseur = (y: number, gauche: string, droite: string, valeur: number) => {
    const p = Math.max(0, Math.min(100, Number(valeur) || 50))
    return `
      ${texte(64, y - 14, gauche, { taille: 19, couleur: '#74778a' })}
      ${texte(1016, y - 14, droite, { taille: 19, couleur: '#74778a', ancre: 'end' })}
      <rect x="64" y="${y}" width="952" height="8" rx="4" fill="#e4e7ef"/>
      <circle cx="${64 + (952 * p) / 100}" cy="${y + 4}" r="14" fill="${accent}"/>`
  }

  /**
   * La colonne s'adapte au nombre d'adjectifs.
   *
   * Trois étaient demandés, le modèle en produit parfois quatre — et une
   * largeur figée poussait le dernier hors de la carte. Mieux vaut resserrer
   * que perdre une information que le modèle a jugée utile.
   */
  const adjectifs = (adn.essence?.adjectifs ?? []).slice(0, 4)
  const pas = adjectifs.length > 1 ? Math.floor(952 / adjectifs.length) : 952
  const parLigne = adjectifs.length >= 4 ? 22 : 30

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}">
  <rect width="${L}" height="${H}" fill="#ffffff"/>
  <rect x="0" y="0" width="${L}" height="10" fill="${accent}"/>

  ${texte(64, 108, 'Style visuel', { taille: 54, gras: 700 })}
  ${texte(64, 150, (adn.identite?.nom ?? '') + ' — direction photographique', { taille: 21, couleur: '#74778a' })}

  ${titreSection(64, 224, 'Essence')}
  ${adjectifs.map((a, i) => `
    ${texte(64 + i * pas, 288, (a.mot ?? '').toUpperCase(), { taille: adjectifs.length >= 4 ? 28 : 34, gras: 700, couleur: accent })}
    ${couper(a.explication ?? '', parLigne, 4).map((l, j) => texte(64 + i * pas, 326 + j * 24, l, { taille: 18, couleur: '#2c2f3a' })).join('')}
  `).join('')}

  ${titreSection(64, 452, 'Direction photographique')}
  ${bloc(64, 476, 'Produit', d.produit ?? '')}
  ${bloc(564, 476, 'Personnes', d.personnes ?? '')}
  ${bloc(64, 696, 'Contexte', d.contexte ?? '')}
  ${bloc(564, 696, 'Fonds et matières', d.fonds ?? '')}

  ${titreSection(64, 962, 'Positionnement')}
  ${curseur(1010, 'bruyant', 'calme', sp.bruyant_calme)}
  ${curseur(1080, 'jeune', 'intemporel', sp.jeune_intemporel)}
  ${curseur(1150, 'clinique', 'chaleureux', sp.clinique_chaleureux)}
  ${curseur(1220, 'ornemental', 'fonctionnel', sp.ornemental_fonctionnel)}

  ${texte(64, 1300, 'Ton : ' + (adn.identite?.ton ?? []).join(' · '), { taille: 21, couleur: '#74778a' })}
</svg>`
}

/**
 * Le SVG devient un PNG dans le navigateur, sans bibliothèque.
 *
 * Un SVG en `data:` se dessine nativement sur un canevas ; le canevas rend un
 * PNG. Rien à installer, et le rendu est celui du navigateur — donc conforme
 * à ce qu'on voit à l'écran.
 */
export async function svgVersPng(svg: string, largeur = L, hauteur = H): Promise<string> {
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  const img = new Image()
  await new Promise<void>((ok, ko) => {
    img.onload = () => ok()
    img.onerror = () => ko(new Error('SVG illisible'))
    img.src = url
  })
  const c = document.createElement('canvas')
  c.width = largeur
  c.height = hauteur
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('canevas indisponible')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, largeur, hauteur)
  ctx.drawImage(img, 0, 0, largeur, hauteur)
  return c.toDataURL('image/png').split(',')[1]
}
