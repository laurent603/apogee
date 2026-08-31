import type { Feuille, Segment } from './feuilleTournage'

/**
 * La feuille de tournage, en vrai PDF.
 *
 * On passait par l'impression du navigateur. Ça marche sur ordinateur, mais
 * **Chrome pour iOS n'implémente pas `window.print()`** : la fonction existe,
 * ne fait rien, et ne signale rien. Aucun garde-fou ne pouvait rattraper ça —
 * le bouton restait mort. Firefox iOS a le même trou.
 *
 * Un fichier PDF supprime la question : le téléphone sait l'afficher et le
 * partager, l'ordinateur l'enregistre. C'est aussi ce que le bouton promet
 * depuis le début.
 *
 * La bibliothèque est chargée à la demande, au clic. Personne ne paie ses
 * quelques centaines de kilo-octets pour ouvrir un écran qu'il ne
 * téléchargera pas.
 */

/* A4 en points typographiques. */
const LARGEUR = 595.28
const HAUTEUR = 841.89
const MARGE = 42

const BLEU = { r: 0.204, g: 0.204, b: 0.937 } // #3434ef
const NOIR = { r: 0.051, g: 0.051, b: 0.071 }
const GRIS = { r: 0.455, g: 0.467, b: 0.541 }
const TRAIT = { r: 0.894, g: 0.906, b: 0.937 }

/**
 * Ramène le texte à ce que les polices standard savent écrire.
 *
 * Les polices intégrées d'un PDF utilisent l'encodage WinAnsi. Il couvre le
 * français et l'euro, mais pas les emoji ni les guillemets exotiques — et
 * `pdf-lib` lève une erreur sur le premier caractère inconnu. Mieux vaut une
 * apostrophe droite qu'un document qui refuse de se fabriquer.
 */
function lisible(v: unknown): string {
  const s = String(v ?? '').normalize('NFC')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ')
  // Tout ce qui sort du latin-1 étendu est écarté plutôt que de faire échouer
  // la génération : un emoji perdu vaut mieux qu'une feuille absente.
  return [...s].filter((c) => {
    const n = c.codePointAt(0) ?? 0
    return n === 10 || (n >= 32 && n <= 126) || (n >= 160 && n <= 255) || n === 0x20ac
  }).join('')
}

type Police = { widthOfTextAtSize: (t: string, s: number) => number }

/** Découpe un texte pour qu'aucune ligne ne dépasse la largeur donnée. */
function lignes(texte: string, police: Police, taille: number, largeur: number): string[] {
  const out: string[] = []
  for (const paragraphe of texte.split('\n')) {
    let courante = ''
    for (const mot of paragraphe.split(/\s+/).filter(Boolean)) {
      const essai = courante ? `${courante} ${mot}` : mot
      if (police.widthOfTextAtSize(essai, taille) <= largeur) { courante = essai; continue }
      if (courante) out.push(courante)
      // Un mot seul plus large que la colonne — une URL, en général — est
      // coupé au caractère plutôt que de déborder de la page.
      if (police.widthOfTextAtSize(mot, taille) > largeur) {
        let bout = ''
        for (const c of mot) {
          if (police.widthOfTextAtSize(bout + c, taille) > largeur) { out.push(bout); bout = c }
          else bout += c
        }
        courante = bout
      } else courante = mot
    }
    out.push(courante)
  }
  return out.length ? out : ['']
}

export async function pdfFeuille(feuille: Feuille, nomCrea: string): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

  const doc = await PDFDocument.create()
  const normale = await doc.embedFont(StandardFonts.Helvetica)
  const grasse = await doc.embedFont(StandardFonts.HelveticaBold)

  doc.setTitle(lisible(`Feuille de tournage - ${feuille.titre || nomCrea}`))
  doc.setCreator('Leadscore')

  const utile = LARGEUR - MARGE * 2
  let page = doc.addPage([LARGEUR, HAUTEUR])
  let y = HAUTEUR - MARGE

  const couleur = (c: typeof NOIR) => rgb(c.r, c.g, c.b)

  /** Réserve la hauteur demandée, en changeant de page si elle ne tient pas. */
  const place = (hauteur: number) => {
    if (y - hauteur >= MARGE) return
    page = doc.addPage([LARGEUR, HAUTEUR])
    y = HAUTEUR - MARGE
  }

  const ecrire = (
    texte: string,
    o: { taille: number; gras?: boolean; couleur?: typeof NOIR; interligne?: number; x?: number; largeur?: number },
  ) => {
    const police = o.gras ? grasse : normale
    const inter = o.interligne ?? o.taille * 1.32
    const x = o.x ?? MARGE
    for (const ligne of lignes(lisible(texte), police, o.taille, o.largeur ?? utile)) {
      place(inter)
      y -= inter
      page.drawText(ligne, { x, y, size: o.taille, font: police, color: couleur(o.couleur ?? NOIR) })
    }
  }

  /* ── En-tête ── */
  ecrire(feuille.titre || nomCrea, { taille: 19, gras: true, interligne: 24 })
  const meta = [feuille.format, feuille.duree].filter(Boolean).join('  ·  ')
  ecrire(`Feuille de tournage${meta ? `  —  ${meta}` : ''}`, { taille: 10, couleur: GRIS, interligne: 15 })
  y -= 8
  place(2)
  page.drawRectangle({ x: MARGE, y, width: utile, height: 1.6, color: couleur(BLEU) })
  y -= 16

  /**
   * Un bloc par réplique.
   *
   * La hauteur est mesurée avant d'être dessinée : un bloc coupé en deux par
   * un saut de page se lit mal quand on tient le téléphone à côté de
   * l'objectif, et c'est le seul usage de ce document.
   */
  const bloc = (s: Segment, etiquette?: string, accent = false) => {
    const dit = lisible(s.dit || '')
    const annexes = [
      s.ecran ? `A l'ecran : ${s.ecran}` : '',
      s.visuel ? `Image : ${s.visuel}` : '',
    ].filter(Boolean)

    const largeurInterne = utile - 28
    const lignesDit = lignes(dit, grasse, 15, largeurInterne)
    const lignesAnnexes = annexes.flatMap((a) => lignes(lisible(a), normale, 9.5, largeurInterne))
    const hauteur = 16 + 13 + lignesDit.length * 20 + (lignesAnnexes.length ? 6 + lignesAnnexes.length * 13 : 0) + 14

    place(hauteur + 10)
    const haut = y
    page.drawRectangle({
      x: MARGE, y: haut - hauteur, width: utile, height: hauteur,
      color: accent ? rgb(0.961, 0.961, 1) : rgb(1, 1, 1),
      borderColor: couleur(accent ? BLEU : TRAIT), borderWidth: accent ? 1.2 : 0.8,
    })

    let yb = haut - 16
    page.drawText(lisible((etiquette || s.temps || '').toUpperCase()), {
      x: MARGE + 14, y: yb - 8, size: 8.5, font: grasse, color: couleur(BLEU),
    })
    yb -= 13 + 8
    for (const l of lignesDit) {
      yb -= 20
      page.drawText(l, { x: MARGE + 14, y: yb, size: 15, font: grasse, color: couleur(NOIR) })
    }
    if (lignesAnnexes.length) yb -= 6
    for (const l of lignesAnnexes) {
      yb -= 13
      page.drawText(l, { x: MARGE + 14, y: yb, size: 9.5, font: normale, color: couleur(GRIS) })
    }

    y = haut - hauteur - 10
  }

  if (feuille.hook) bloc(feuille.hook, 'Hook — 0 a 3 s', true)
  for (const s of feuille.segments || []) bloc(s)
  if (feuille.cta) bloc(feuille.cta, 'Call to action')

  if (feuille.materiel) {
    y -= 6
    place(2)
    page.drawRectangle({ x: MARGE, y, width: utile, height: 0.8, color: couleur(TRAIT) })
    y -= 6
    ecrire(`A prevoir : ${feuille.materiel}`, { taille: 9.5, couleur: GRIS, interligne: 13 })
  }

  const octets = await doc.save()
  // `Uint8Array` plutôt que le tampon sous-jacent : `pdf-lib` peut rendre une
  // vue sur un tampon plus grand, dont la fin ne fait pas partie du document.
  return new Blob([octets.slice()], { type: 'application/pdf' })
}
