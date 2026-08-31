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
 * Les deux passent par l'impression du navigateur plutôt que par une
 * bibliothèque PDF : la boîte de dialogue système propose « Enregistrer en
 * PDF », le rendu est celui du navigateur, et l'application ne grossit pas
 * d'un mégaoctet pour deux boutons.
 */

export type Segment = { temps?: string; dit?: string; ecran?: string; visuel?: string }
export type Feuille = {
  titre?: string
  format?: string
  duree?: string
  hook?: Segment
  segments?: Segment[]
  cta?: Segment
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
      if (o && (o.hook || o.segments?.length)) return o
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
  const barre = estIOS()
    ? `<div class="noprint barre">
         <button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
         <span>ou Partager → Imprimer</span>
       </div>`
    : ''
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

export function imprimerFeuille(feuille: Feuille, nomCrea: string): boolean {
  const meta = [feuille.format, feuille.duree].filter(Boolean).join(' · ')
  const corps = `
    <div class="entete">
      <h1>${echappe(feuille.titre || nomCrea)}</h1>
      <p>Feuille de tournage${meta ? ` — ${echappe(meta)}` : ''}</p>
    </div>
    ${feuille.hook ? segmentHtml(feuille.hook, 'Hook — 0 à 3 s', true) : ''}
    ${(feuille.segments || []).map((s) => segmentHtml(s)).join('')}
    ${feuille.cta ? segmentHtml(feuille.cta, 'Call to action') : ''}
    ${feuille.materiel ? `<p class="pied"><b>À prévoir :</b> ${echappe(feuille.materiel)}</p>` : ''}
  `
  return imprimer(`Feuille — ${nomCrea}`, corps)
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
