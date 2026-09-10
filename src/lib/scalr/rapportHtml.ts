/**
 * Les rapports qui arrivent sous forme de document HTML.
 *
 * Un livrable stratégique — personas, banque d'angles, feuille de route,
 * briefs — ne se met pas en page en Markdown : ni bandeau de chiffres, ni
 * pastille d'état, ni carte dépliable. Ces rapports-là sont donc écrits en HTML
 * par le modèle et affichés dans un cadre isolé.
 *
 * **Le modèle rend un document entier, feuille de style comprise.**
 *
 * L'application en a tenu une pendant un temps, pour épargner au modèle trois
 * mille jetons de CSS à chaque génération. C'était la mauvaise économie : une
 * feuille unique force une banque d'angles à entrer dans la peau d'un rapport
 * d'entonnoir. Une banque d'angles veut des cartes qui se déplient, des
 * pastilles d'émotion et de niveau de conscience ; une stratégie full-funnel
 * veut un bandeau, des onglets et des barres qui se resserrent. Ce qui se
 * réutilise d'un livrable à l'autre, ce n'est pas l'habillage — c'est le cadre.
 *
 * Ne restent donc ici que trois choses : la marque qui sépare la synthèse du
 * document, le script de hauteur quand le document ne le porte pas lui-même, et
 * la feuille d'avant, pour les rapports déjà en base.
 */

/** La marque qu'un rapport pose en tête, et qui le distingue d'un Markdown. */
const MARQUE = '<!--rapport-->'

/**
 * Le script de hauteur, que l'application ajoute toujours.
 *
 * Il mesure **le bas du dernier enfant de `body`**, jamais `documentElement` ni
 * `body` eux-mêmes. Ces deux-là s'étirent à la taille du cadre — et comme le
 * cadre prend la hauteur qu'on lui annonce, mesurer l'un des deux crée une
 * boucle : le cadre grandit, la mesure grandit, le cadre grandit encore.
 * Constaté en vrai : 24 000 pixels, le plafond, sur un document de 7 000.
 *
 * Un `body { min-height: 100vh }` — que le modèle écrit spontanément — suffit à
 * déclencher la boucle. Le bas du contenu, lui, ne dépend que du contenu.
 *
 * Il est ajouté même quand le document en porte déjà un : le sien annonce
 * \`artifact-resize\`, que le parent ignore, et n'a donc aucun effet.
 */
const SCRIPT_HAUTEUR = `
(function(){
  function basDuContenu(){
    var bas = 0;
    for (var i = 0; i < document.body.children.length; i++) {
      var el = document.body.children[i];
      if (el.tagName === 'SCRIPT') continue;
      var r = el.getBoundingClientRect();
      if (r.bottom > bas) bas = r.bottom;
    }
    return Math.ceil(bas + window.scrollY);
  }
  var dernier = 0;
  function annoncer(){
    var h = basDuContenu();
    if (!h || Math.abs(h - dernier) < 2) return;
    dernier = h;
    parent.postMessage({ type: 'rapport-hauteur', hauteur: h }, '*');
  }
  new ResizeObserver(annoncer).observe(document.body);
  addEventListener('load', annoncer);
  setTimeout(annoncer, 60);
  annoncer();
})();`

/**
 * La feuille de style d'avant, pour les rapports déjà en base.
 *
 * Ils sont écrits dans l'ancien vocabulaire — `.wrap`, `.panel`, `.kpi-row`,
 * onglets en boutons radio — et ne portent pas de `<style>` à eux. Les servir
 * nus les afficherait sans aucune mise en page.
 */
const FEUILLE_STYLE_ANCIENNE = ":root{--bg:#0A0C16;--panel:#12152A;--panel-2:#161A33;--border:#262b4a;--ink:#E7E9F6;--dim:#9297B8;--dimmer:#666c94;--violet:#7C7FF0;--violet-soft:#3B3D74;--good:#3ED598;--good-bg:#0F2A22;--warn:#F2B84B;--warn-bg:#2E260F;--bad:#F0637A;--bad-bg:#2E1620;--mono:\"JetBrains Mono\",monospace}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,\"Segoe UI\",sans-serif;font-size:15px;line-height:1.6}.wrap{max-width:1120px;margin:0 auto;padding:0 28px 80px}a{color:inherit}h1,h2,h3{margin:0;font-weight:700}.tag{font-family:var(--mono);font-size:11px;letter-spacing:.02em;padding:3px 9px;border-radius:5px;display:inline-block}.tag-tofu{background:var(--violet-soft);color:#C7C9FA}.tag-mofu{background:#3a2e0f;color:#F2C56B}.tag-bofu{background:#123024;color:#5FE0A8}.tag-retarg{background:#301622;color:#F58AA6}header{padding:44px 0 0}.badge{font-family:var(--mono);font-size:12px;color:var(--violet);background:var(--violet-soft);display:inline-block;padding:5px 12px;border-radius:20px;margin-bottom:16px}header h1{font-size:32px;letter-spacing:-.01em}header .sub{color:var(--dim);margin-top:8px;font-size:14.5px}.kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin:28px 0 0}.kpi{background:var(--panel);padding:18px 16px}.kpi .v{font-size:24px;font-weight:700;color:var(--violet)}.kpi .l{font-size:12px;color:var(--dim);margin-top:4px}@media (max-width:800px){.kpi-row{grid-template-columns:repeat(2,1fr)}}.tabs{display:flex;gap:4px;margin:28px 0 0;border-bottom:1px solid var(--border);overflow-x:auto}.tab-btn{font-family:\"Inter\";font-size:14px;color:var(--dim);background:none;border:none;padding:12px 16px;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent}.tab-btn .num{font-family:var(--mono);color:var(--dimmer);margin-right:6px}.panel{display:none;padding-top:36px}.eyebrow{font-family:var(--mono);font-size:12px;color:var(--violet);letter-spacing:.03em}h2{font-size:24px;margin-top:6px}.lede{color:var(--dim);font-size:14.5px;margin-top:8px;max-width:70ch}.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:24px}@media (max-width:800px){.grid-2{grid-template-columns:1fr}}.card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:22px}.card h3{font-size:15px;margin-bottom:14px}.kv{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border);font-size:13.5px;gap:12px}.kv:last-child{border-bottom:none}.kv .status{font-family:var(--mono);font-size:11px;padding:2px 8px;border-radius:4px;white-space:nowrap}.status-bad{background:var(--bad-bg);color:var(--bad)}.status-warn{background:var(--warn-bg);color:var(--warn)}.status-good{background:var(--good-bg);color:var(--good)}.callout{border-radius:12px;padding:18px 20px;margin-top:18px;font-size:13.5px;border:1px solid}.callout.bad{background:var(--bad-bg);border-color:#4a2130;color:#f5c3cd}.callout.warn{background:var(--warn-bg);border-color:#4a3a15;color:#f4dba6}.callout.good{background:var(--good-bg);border-color:#15412f;color:#a9ecce}.callout strong{color:inherit}table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}th{text-align:left;font-family:var(--mono);font-size:10.5px;color:var(--dimmer);font-weight:500;padding:8px 10px;border-bottom:1px solid var(--border)}td{padding:9px 10px;border-bottom:1px solid var(--border);color:var(--ink)}tr:last-child td{border-bottom:none}.num-cell{font-family:var(--mono)}.note{font-size:12px;color:var(--dimmer);font-style:italic;margin-top:8px}.persona{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:22px;margin-top:16px}.persona-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.persona-head h3{font-size:17px}.persona .role{color:var(--dim);font-size:13px;margin-top:2px}.persona-body{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px}@media (max-width:700px){.persona-body{grid-template-columns:1fr}}.persona-body .k{font-family:var(--mono);font-size:10.5px;color:var(--dimmer)}.persona-body .v{font-size:13.5px;margin-top:4px}.persona .hook{margin-top:16px;padding:12px 14px;background:var(--panel-2);border-radius:8px;font-size:13.5px;font-style:italic;color:#C7C9FA;border-left:2px solid var(--violet)}.funnel-flow{display:flex;flex-direction:column;gap:0;margin-top:24px}.funnel-stage{border-radius:10px;padding:16px 20px;margin-bottom:8px}.funnel-stage.t{background:var(--violet-soft)}.funnel-stage.m{background:#332a10}.funnel-stage.b{background:#123024}.funnel-stage .stitle{font-weight:700;font-size:14.5px}.funnel-stage .sdesc{font-size:12.5px;color:var(--dim);margin-top:3px}.arrow-down{text-align:center;color:var(--dimmer);font-size:14px;margin:2px 0}.funnel-cols{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;margin-top:22px}@media (max-width:800px){.funnel-cols{grid-template-columns:1fr}}.fcol{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:20px}.fcol .k{font-family:var(--mono);font-size:10.5px;color:var(--dimmer);margin-top:14px}.fcol .v{font-size:13px;margin-top:4px}.fcol ul{margin:4px 0 0;padding-left:16px;font-size:13px}.fcol li{margin-bottom:3px}.fcol .hook-box{margin-top:14px;padding:10px 12px;background:var(--panel-2);border-radius:8px;font-size:12.5px;font-style:italic;color:#C7C9FA}.phase{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:22px;margin-top:16px}.phase-head{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px}.phase-head h3{font-size:17px}.phase-head .when{color:var(--violet);font-family:var(--mono);font-size:12.5px}.phase-cols{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:16px}@media (max-width:800px){.phase-cols{grid-template-columns:1fr}}.phase-cols .k{font-family:var(--mono);font-size:10.5px;color:var(--dimmer)}.phase-cols ul{margin:6px 0 0;padding-left:16px;font-size:13px}.phase-cols li{margin-bottom:3px}.naming-box{font-family:var(--mono);font-size:14.5px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:16px 18px;margin-top:18px;overflow-x:auto;color:#C7C9FA}.tag-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-top:20px}.tag-group .k{font-family:var(--mono);font-size:10.5px;color:var(--dimmer);margin-bottom:6px}.chip{display:inline-block;font-family:var(--mono);font-size:11.5px;background:var(--panel-2);border:1px solid var(--border);padding:3px 8px;border-radius:6px;margin:0 4px 4px 0}.example-name{font-family:var(--mono);font-size:13px;background:var(--panel-2);border:1px solid var(--border);padding:8px 12px;border-radius:6px;display:inline-block;margin:4px 8px 2px 0;color:var(--good)}.brief-tabs{display:flex;gap:8px;margin-top:24px;flex-wrap:wrap}.brief-btn{font-family:var(--mono);font-size:12.5px;background:var(--panel);border:1px solid var(--border);color:var(--dim);padding:8px 14px;border-radius:8px;cursor:pointer}.brief-panel{display:none;margin-top:20px}.brief-title{font-size:19px;font-weight:700;font-family:var(--mono);color:var(--ink)}.brief-tagrow{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap}.why-box{margin-top:18px;background:var(--warn-bg);border:1px solid #4a3a15;border-radius:10px;padding:16px 18px;font-size:13.5px;color:#f4dba6}.fiche{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:22px}@media (max-width:700px){.fiche{grid-template-columns:1fr}}.fiche .k{font-family:var(--mono);font-size:10.5px;color:var(--dimmer);margin-top:14px}.fiche .k:first-child{margin-top:0}.fiche .v{font-size:13.5px;margin-top:4px}.script-block{margin-top:20px;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:22px}.script-block h4{font-size:14px;margin-bottom:12px;color:var(--violet)}.timecode{font-family:var(--mono);color:var(--violet);font-size:12.5px}.script-line{margin-bottom:14px;padding-bottom:14px;border-bottom:1px dashed var(--border)}.script-line:last-child{border-bottom:none}.script-line .dir{color:var(--dim);font-size:12.5px;font-style:italic;margin-top:3px}.script-line .txt{font-size:14px;margin-top:4px}footer{margin-top:56px;padding-top:24px;border-top:1px solid var(--border);font-size:12.5px;color:var(--dimmer)}.retention-row{margin-top:14px}.retention-row .rlabel{display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px}.retention-row .rlabel .pct{font-family:var(--mono)}.rbar-track{height:10px;background:var(--panel-2);border-radius:5px;overflow:hidden}.rbar-fill{height:100%;border-radius:5px}.rbar-fill.good{background:var(--good)}.rbar-fill.warn{background:var(--warn)}.rbar-fill.bad{background:var(--bad)}.timeline{margin-top:18px}.tl-item{display:flex;gap:16px;padding:14px 0;border-bottom:1px solid var(--border)}.tl-item:last-child{border-bottom:none}.tl-dot{width:26px;height:26px;border-radius:50%;flex:0 0 26px;display:flex;align-items:center;justify-content:center;font-size:13px;margin-top:2px}.tl-dot.good{background:var(--good-bg);color:var(--good);border:1px solid #15412f}.tl-dot.warn{background:var(--warn-bg);color:var(--warn);border:1px solid #4a3a15}.tl-dot.bad{background:var(--bad-bg);color:var(--bad);border:1px solid #4a2130}.tl-item h4{font-size:14px;margin:0 0 4px}.tl-item p{font-size:13px;color:var(--dim);margin:0;max-width:65ch}.voscript{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:0;margin-top:20px;overflow:hidden}.voscript .row{display:grid;grid-template-columns:90px 1fr;gap:0;border-bottom:1px solid var(--border)}.voscript .row:last-child{border-bottom:none}.voscript .tc{padding:16px 14px;font-family:var(--mono);color:var(--violet);font-size:12px;background:var(--panel-2)}.voscript .content{padding:16px 18px}.voscript .vo{font-size:14.5px;color:var(--ink)}.voscript .vo .label{font-family:var(--mono);font-size:10px;color:var(--dimmer);display:block;margin-bottom:4px}.voscript .onscreen{margin-top:8px;font-size:12.5px;color:#F2C56B;background:#2a2410;display:inline-block;padding:3px 9px;border-radius:5px}.voscript .dir2{margin-top:8px;font-size:12.5px;color:var(--dim);font-style:italic}input.onglet{display:none}.tab-btn{display:inline-block}#o1:checked~.wrap #t1,#o2:checked~.wrap #t2,#o3:checked~.wrap #t3,#o4:checked~.wrap #t4,#o5:checked~.wrap #t5,#o6:checked~.wrap #t6,#o7:checked~.wrap #t7{display:block}#o1:checked~.wrap label[for=o1],#o2:checked~.wrap label[for=o2],#o3:checked~.wrap label[for=o3],#o4:checked~.wrap label[for=o4],#o5:checked~.wrap label[for=o5],#o6:checked~.wrap label[for=o6],#o7:checked~.wrap label[for=o7]{color:var(--ink);border-bottom-color:var(--violet)}#b1:checked~.brief-panels #p1,#b2:checked~.brief-panels #p2,#b3:checked~.brief-panels #p3{display:block}#b1:checked~.brief-tabs label[for=b1],#b2:checked~.brief-tabs label[for=b2],#b3:checked~.brief-tabs label[for=b3]{color:var(--ink);border-color:var(--violet);background:var(--violet-soft)}"

/**
 * Ce qui se lit dans le fil, et ce qui s'affiche en dessous.
 *
 * Une réponse arrive en deux morceaux : d'abord une synthèse en Markdown — les
 * verdicts, les chiffres qui tranchent, les prochaines étapes — puis la marque,
 * puis le document. La synthèse est ce que l'utilisateur lit pendant que le
 * reste s'écrit : elle sort en premier du flux, elle s'affiche en premier.
 */
export function separerRapport(contenu: string | null | undefined): {
  synthese: string
  document: string | null
} {
  const brut = (contenu || '').trim().replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/, '')

  const i = brut.indexOf(MARQUE)
  if (i >= 0) return { synthese: brut.slice(0, i).trim(), document: brut.slice(i) }

  /**
   * Le filet, quand la marque manque.
   *
   * Sans elle, le document part au rendu Markdown et le lecteur reçoit son
   * balisage en texte brut — « aucune mise en page, que du texte ». Un
   * `<!DOCTYPE html>` ne se rencontre pas au milieu d'un rapport Markdown, à
   * moins d'être cité dans un bloc de code : la clôture a été retirée plus
   * haut, on cherche donc la déclaration elle-même.
   */
  const repli = /<!doctype html|<html[\s>]/i.exec(brut)
  if (repli) return { synthese: brut.slice(0, repli.index).trim(), document: brut.slice(repli.index) }

  return { synthese: brut, document: null }
}

/** Reconnaît une réponse qui porte un document mis en page. */
export function estRapportHtml(contenu: string | null | undefined): boolean {
  return separerRapport(contenu).document !== null
}

/**
 * Le document complet, prêt à être affiché.
 *
 * Trois cas : un document entier passe presque tel quel ; un corps écrit dans
 * l'ancien vocabulaire reçoit l'ancienne feuille ; et dans les deux cas le
 * script de hauteur est ajouté s'il manque.
 */
export function extraireRapportHtml(contenu: string): string {
  const brut = separerRapport(contenu).document || ''

  const debut = brut.search(/<!doctype html|<html[\s>]/i)
  if (debut >= 0) {
    const fin = brut.toLowerCase().lastIndexOf('</html>')
    const doc = fin > debut ? brut.slice(debut, fin + 7) : brut.slice(debut)
    return /<\/body>/i.test(doc)
      ? doc.replace(/<\/body>/i, `<script>${SCRIPT_HAUTEUR}</script></body>`)
      : doc.replace(/<\/html>/i, `<script>${SCRIPT_HAUTEUR}</script></html>`)
  }

  const corps = brut.startsWith(MARQUE) ? brut.slice(MARQUE.length).trim() : brut
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<style>${FEUILLE_STYLE_ANCIENNE}</style></head><body>${corps}`
    + `<script>${SCRIPT_HAUTEUR}</script></body></html>`
}
