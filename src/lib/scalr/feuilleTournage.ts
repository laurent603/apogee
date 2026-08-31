import { markdownToHtml } from '@/lib/markdown'

/**
 * Les deux documents qu'un brief produit.
 *
 * **La feuille de tournage** est celle qu'on tend au fondateur ou au
 * comédien. Il n'apprend pas son texte, il le lit — souvent sur un téléphone
 * tenu à côté de l'objectif. Elle ne contient donc que les répliques, en gros
 * corps, avec le visuel et le texte à l'écran en second plan. Ni diagnostic,
 * ni justification, ni copy : c'est ce qu'on découpait à la main en captures
 * d'écran.
 *
 * **Le brief complet** est l'autre document, celui qu'on classe. Le PDF sert à
 * le ranger dans un Drive ; le Markdown reste pour Notion, qui convertit un
 * collage Markdown nativement.
 *
 * Les deux ne sortent pas par le même chemin, et c'est délibéré. La feuille
 * est un vrai fichier PDF : elle se lit sur le tournage, souvent depuis un
 * téléphone, et l'impression du navigateur n'existe pas sur Chrome iOS. Le
 * brief reste une page imprimable — sa mise en page vient du Markdown et
 * change à chaque analyse, la redessiner en PDF coûterait bien plus que ce
 * qu'elle rapporterait.
 */

export type Segment = { temps?: string; dit?: string; ecran?: string; visuel?: string }

/**
 * Le brief entier, sous forme exploitable.
 *
 * Ce bloc ne portait que les répliques : le reste — angle, accroches,
 * preuves, appel à l'action, copy — restait prisonnier de la prose, donc
 * illisible par l'application et absent des exports. Il porte désormais tout
 * ce qui sert à produire ; seuls le diagnostic et les justifications
 * demeurent dans le texte.
 */
export type Feuille = {
  titre?: string
  format?: string
  ratios?: string[]
  duree?: string
  angle?: string
  conscience?: string
  ton?: string
  promesse?: string

  hook?: Segment
  variantes_hook?: string[]
  segments?: Segment[]

  /** Créas statiques : ce qui est écrit sur l'image. */
  textes_incrustes?: {
    accroche?: string
    sous_accroche?: string
    mention?: string
    variantes_accroche?: string[]
    positions?: string
  }

  bullets?: string[]
  preuves?: string[]
  cta?: Segment & { bouton_meta?: string }

  copy?: {
    texte_principal?: string
    titre?: string
    description?: string
    variante?: { texte_principal?: string; titre?: string; description?: string }
  }

  /** Un prompt d'image prêt à coller, par ratio. */
  visuels?: { ratio: string; prompt: string }[]
  materiel?: string
}

/**
 * Extrait la feuille du bloc JSON que le brief termine.
 *
 * Chercher les répliques dans la prose serait fragile — un titre reformulé et
 * l'extraction casse en silence. Le bloc délimité est explicite : s'il manque,
 * on rend `null` et l'écran le dit, plutôt que de livrer une feuille amputée
 * dont personne ne verrait qu'il manque la moitié des répliques.
 */
export function extraireFeuille(markdown: string): Feuille | null {
  if (!markdown) return null
  const blocs = [...markdown.matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1])
  // Le dernier bloc : le prompt le demande en fin de document.
  for (const brut of blocs.reverse()) {
    try {
      const o = JSON.parse(brut) as Feuille
      if (o && (o.hook || o.segments?.length || o.visuels?.length || o.textes_incrustes)) return o
    } catch { /* bloc non exploitable : on essaie le précédent */ }
  }
  return null
}

const echappe = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/** Le brief débarrassé de son bloc technique : il n'a rien à faire à l'écran. */
const sansBlocJson = (md: string) => md.replace(/```json\s*[\s\S]*?```/g, '').trim()

const STYLE = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  /* À l'écran, la marge vient du corps : sur un téléphone, le texte touchait
     les bords. À l'impression, c'est la règle @page qui la donne. */
  body { margin: 0; padding: 0 16px 24px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         color: #0d0d12; line-height: 1.5; }
  @media print { body { padding: 0; } }
  .entete { border-bottom: 2px solid #3434ef; padding-bottom: 10px; margin-bottom: 18px; }
  .entete h1 { font-size: 20px; margin: 0 0 4px; }
  .entete p { font-size: 12px; color: #74778a; margin: 0; }
  .bloc { border: 1px solid #e4e7ef; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px;
          page-break-inside: avoid; }
  .bloc.hook { border-color: #3434ef; background: #f5f5ff; }
  .temps { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
           color: #3434ef; margin-bottom: 6px; }
  /* La réplique se lit à bout de bras : c'est la seule chose qui doit
     ressortir sur la page. */
  .dit { font-size: 19px; font-weight: 600; line-height: 1.45; margin: 0 0 8px; }
  .annexe { font-size: 12px; color: #52514e; margin: 2px 0; }
  .annexe b { color: #74778a; font-weight: 600; }
  .pied { margin-top: 18px; font-size: 11px; color: #74778a; border-top: 1px solid #e4e7ef; padding-top: 8px; }
  h1, h2, h3 { page-break-after: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 10px 0; }
  th { background: #3434ef; color: #fff; text-align: left; padding: 6px 8px; font-weight: 600; }
  td { border-bottom: 1px solid #e4e7ef; padding: 6px 8px; vertical-align: top; }
  code { background: #f1f2f6; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
  .barre { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #e4e7ef;
           padding: 10px 0 12px; margin-bottom: 14px; display: flex; align-items: center;
           gap: 10px; flex-wrap: wrap; }
  .barre button { background: #3434ef; color: #fff; border: 0; border-radius: 8px;
                  padding: 10px 16px; font: inherit; font-weight: 600; font-size: 15px; }
  .barre span { font-size: 12px; color: #74778a; }
  @media print { .noprint { display: none; } }
`

function segmentHtml(s: Segment, etiquette?: string, hook = false) {
  const annexes = [
    s.ecran ? `<p class="annexe"><b>À l'écran :</b> ${echappe(s.ecran)}</p>` : '',
    s.visuel ? `<p class="annexe"><b>Image :</b> ${echappe(s.visuel)}</p>` : '',
  ].join('')
  return `<div class="bloc${hook ? ' hook' : ''}">
    <div class="temps">${echappe(etiquette || s.temps || '')}</div>
    <p class="dit">${echappe(s.dit)}</p>
    ${annexes}
  </div>`
}

/**
 * Imprime le document depuis un cadre caché.
 *
 * La première version ouvrait une fenêtre, y écrivait le document, puis
 * attendait son `onload` pour appeler `print()`. L'événement avait déjà eu
 * lieu au moment où l'on s'y abonnait : la boîte d'impression ne s'ouvrait
 * jamais et la fenêtre restait blanche, sans rien pour la refermer — il
 * fallait fermer l'onglet. Un bloqueur de fenêtres produisait le même silence.
 *
 * Un cadre caché n'a ni l'un ni l'autre de ces défauts : il vit dans la page,
 * son chargement est observable, et rien ne peut le bloquer.
 *
 * Le cadre est unique et réutilisé d'une impression à l'autre. Le retirer
 * serait plus propre en apparence, mais on ne sait pas quand l'utilisateur
 * ferme la boîte de dialogue : le retrait tomberait pendant l'aperçu et
 * imprimerait une page blanche. Un cadre invisible qui reste coûte moins.
 */
const ID_CADRE = 'apogee-impression'

/**
 * Safari iOS n'imprime pas depuis un cadre.
 *
 * `contentWindow.print()` y est sans effet : ni erreur, ni boîte de dialogue,
 * rien — le bouton paraissait simplement mort sur iPhone alors qu'il
 * fonctionnait sur ordinateur. Le document doit y être un vrai document, dans
 * son propre onglet, d'où l'utilisateur peut l'imprimer ou l'enregistrer.
 *
 * iPadOS se présente comme un Mac depuis 2019 ; seul le nombre de points de
 * contact le distingue.
 */
function estIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iP(hone|od|ad)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * Les navigateurs iOS qui n'impriment pas du tout.
 *
 * Chrome, Firefox et Edge sur iOS sont des habillages de WebKit auxquels il
 * manque l'impression : `window.print()` y existe, ne fait rien, et ne
 * signale rien. Leur proposer un bouton « Imprimer » est une promesse qu'on
 * ne peut pas tenir — il faut nommer le chemin qui, lui, fonctionne.
 */
function sansImpression(): boolean {
  if (typeof navigator === 'undefined') return false
  return /CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)
}

/**
 * Ouvre le document dans un onglet, à partir d'un objet blob.
 *
 * Un blob plutôt qu'un `document.write` : sur iOS, écrire dans une fenêtre
 * ouverte à la volée est peu fiable, alors qu'une URL se charge comme
 * n'importe quelle page. L'URL est révoquée après une minute — la révoquer
 * tout de suite viderait l'onglet avant qu'il n'ait fini de charger.
 */
function ouvrirDansUnOnglet(doc: string): boolean {
  const url = URL.createObjectURL(new Blob([doc], { type: 'text/html;charset=utf-8' }))
  const w = window.open(url, '_blank')
  if (!w) { URL.revokeObjectURL(url); return false }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}

function imprimer(titre: string, corps: string) {
  // Sur iOS, le document s'ouvre dans un onglet : il lui faut de quoi lancer
  // l'impression, puisque le clic d'origine n'est plus là.
  const barre = !estIOS()
    ? ''
    : sansImpression()
      // Ce navigateur n'imprime pas : un bouton mentirait. On donne le geste.
      ? `<div class="noprint barre">
           <span><b>Pour l'enregistrer en PDF</b> : menu ··· en bas à droite →
           Partager → Imprimer → Enregistrer en PDF.<br>
           Ou ouvrez cette page dans Safari.</span>
         </div>`
      : `<div class="noprint barre">
           <button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
           <span>ou Partager → Imprimer</span>
         </div>`
  const doc = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${echappe(titre)}</title><style>${STYLE}</style></head><body>${barre}${corps}</body></html>`

  if (estIOS()) return ouvrirDansUnOnglet(doc)

  const existant = document.getElementById(ID_CADRE)
  if (existant) existant.remove()

  const cadre = document.createElement('iframe')
  cadre.id = ID_CADRE
  cadre.setAttribute('aria-hidden', 'true')
  cadre.setAttribute('tabindex', '-1')
  cadre.style.cssText =
    'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none'

  // `onload` avant l'insertion : avec `srcdoc`, le chargement peut être
  // immédiat, et c'est précisément l'écueil qui a produit la fenêtre blanche.
  cadre.onload = () => {
    const f = cadre.contentWindow
    if (!f) return
    try {
      f.focus()
      f.print()
    } catch {
      // Impression refusée par le navigateur : le cadre reste, sans effet.
    }
  }

  cadre.srcdoc = doc
  document.body.appendChild(cadre)
  return true
}

/**
 * La feuille part en PDF, pas par l'impression du navigateur.
 *
 * Elle passait par la boîte d'impression, qui n'existe pas sur Chrome iOS :
 * le bouton y restait sans effet. Un fichier lève la question partout, et
 * c'est ce que son libellé promet depuis le début.
 *
 * Sur téléphone il s'ouvre dans un onglet — la visionneuse offre le partage
 * et l'enregistrement, alors qu'un téléchargement direct y finit souvent
 * nulle part. Ailleurs, il s'enregistre.
 */
export async function imprimerFeuille(feuille: Feuille, nomCrea: string): Promise<boolean> {
  /**
   * L'onglet s'ouvre **avant** toute attente.
   *
   * Sur iOS, l'autorisation d'ouvrir une fenêtre ne vaut que pendant le geste
   * de l'utilisateur : elle ne survit pas à une promesse. En ouvrant après la
   * génération du PDF, le premier clic était refusé — et le second passait,
   * la bibliothèque étant alors en cache et la promesse résolue assez vite
   * pour rester dans le geste. D'où un bouton qui échouait une fois sur deux
   * sans raison apparente.
   *
   * L'onglet est donc réservé tout de suite, avec un mot d'attente, et reçoit
   * le document dès qu'il est prêt.
   */
  const onglet = estIOS() ? window.open('', '_blank') : null
  if (estIOS() && !onglet) return false
  if (onglet) {
    onglet.document.write(`<!doctype html><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Feuille de tournage</title>
      <body style="margin:0;display:grid;place-items:center;height:100vh;font-family:-apple-system,system-ui,sans-serif;color:#74778a">
      <p>Préparation du document…</p>`)
    onglet.document.close()
  }

  try {
    const { pdfFeuille } = await import('./pdfFeuille')
    const blob = await pdfFeuille(feuille, nomCrea)
    const nom = `Feuille de tournage - ${nomCrea}`.replace(/[^\w\sÀ-ÿ-]/g, '').slice(0, 70).trim()
    return remettre(blob, `${nom || 'feuille'}.pdf`, onglet)
  } catch {
    // Laisser un onglet bloqué sur « Préparation » serait pire que rien.
    onglet?.close()
    return false
  }
}

function remettre(blob: Blob, nomFichier: string, onglet: Window | null): boolean {
  const url = URL.createObjectURL(blob)
  // Révoquer trop tôt viderait l'onglet avant qu'il ait fini de charger.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)

  if (onglet) {
    onglet.location.href = url
    return true
  }

  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  return true
}

export function imprimerBrief(markdown: string, nomCrea: string, date: string): boolean {
  const corps = `
    <div class="entete">
      <h1>${echappe(nomCrea)}</h1>
      <p>Brief créa — ${echappe(date)}</p>
    </div>
    ${markdownToHtml(sansBlocJson(markdown))}
  `
  return imprimer(`Brief — ${nomCrea}`, corps)
}
