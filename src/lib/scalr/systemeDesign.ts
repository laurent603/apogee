/**
 * Le système de design des documents, tenu par l'application.
 *
 * Quatre documents de référence, produits sans aucune consigne de forme, ont
 * tranché une question sur laquelle j'avais tort : ils ne diffèrent pas. Même
 * police, même fond à un point près, mêmes bordures d'un pixel, même échelle
 * typographique, mêmes trois couleurs sémantiques, mêmes rayons. Ce qui change
 * d'un livrable à l'autre, ce n'est pas l'habillage — c'est **quels blocs on
 * assemble et dans quel ordre**.
 *
 * D'où le partage : l'application fige les jetons et les primitives, le modèle
 * compose et ajoute ce qui est propre à son livrable. Sa feuille arrive après
 * celle-ci, donc elle l'emporte quand il veut nuancer.
 *
 * C'est la synthèse de trois échecs : sept gabarits en prose fabriquaient des
 * sections que personne n'avait demandées ; un vocabulaire de classes imposé
 * faisait ressembler tous les livrables au vocabulaire ; ne rien imposer du
 * tout rendait la qualité imprévisible.
 */
export const BASE_DESIGN = `
:root{
  --fond:#0d1117; --surface:#161b27; --surface-2:#1e2235; --surface-3:#21262d;
  --bordure:#21262d; --bordure-forte:#2d3148;
  --encre:#e6edf3; --encre-2:#cbd5e1; --encre-3:#94a3b8; --encre-4:#8b949e;
  --accent:#6366f1; --accent-clair:#a5b4fc; --accent-2:#a855f7;
  --bon:#22c55e; --bon-clair:#34d399;
  --alerte:#f59e0b; --alerte-clair:#fbbf24;
  --mauvais:#ef4444; --mauvais-clair:#f87171;
  --rayon:12px; --rayon-sm:8px; --pilule:20px;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:var(--fond);color:var(--encre);font-size:13px;line-height:1.6}
h1{font-size:22px;font-weight:700;color:#fff}
h2{font-size:18px;font-weight:700;color:#fff}
h3{font-size:14px;font-weight:600;color:var(--encre)}
h4{font-size:14px;font-weight:600;color:var(--encre)}
p,li{font-size:13px;color:var(--encre-3);line-height:1.6}
strong{color:var(--encre)}
ul{padding-left:18px}
small{font-size:11px;color:var(--encre-4)}
a{color:var(--accent-clair)}

/* Titre de section : le filet court jusqu'au bord */
.section-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin:32px 0 16px;display:flex;align-items:center;gap:10px}
.section-title::after{content:'';flex:1;height:1px;background:var(--bordure)}
.subtitle{font-size:13px;color:var(--encre-4);margin-bottom:24px}
/* Le micro-libellé au-dessus d'une valeur — la signature de ces documents */
.label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--encre-4);margin-bottom:4px}

.card{background:var(--surface);border:1px solid var(--bordure);border-radius:var(--rayon);padding:20px}
.card.highlight{border-color:rgba(99,102,241,.4)}
.card.good{border-color:rgba(34,197,94,.3)}
.card.warn{border-color:rgba(245,158,11,.3)}
.card.bad{border-color:rgba(239,68,68,.3)}

.grid-2{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
@media(max-width:820px){.grid-3,.grid-4{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.grid-2,.grid-3,.grid-4{grid-template-columns:1fr}}

/* Pastilles — fond à 15 %, bordure à 30 %, texte saturé */
.badge{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:var(--pilule);letter-spacing:.3px;white-space:nowrap}
.badge-good{background:rgba(34,197,94,.15);color:var(--bon);border:1px solid rgba(34,197,94,.3)}
.badge-warn{background:rgba(245,158,11,.15);color:var(--alerte);border:1px solid rgba(245,158,11,.3)}
.badge-bad{background:rgba(239,68,68,.15);color:var(--mauvais);border:1px solid rgba(239,68,68,.3)}
.badge-info{background:rgba(99,102,241,.15);color:var(--accent-clair);border:1px solid rgba(99,102,241,.3)}
.badge-mute{background:rgba(100,116,139,.12);color:var(--encre-3);border:1px solid rgba(100,116,139,.2)}
/* Le second badge d'une même ligne : même teinte, moitié moins de présence */
.badge-sm{font-size:9px;padding:2px 7px}
.badge-sm.badge-good{background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.2)}
.badge-sm.badge-warn{background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.2)}
.badge-sm.badge-bad{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.2)}
.badge-sm.badge-info{background:rgba(99,102,241,.08);border-color:rgba(99,102,241,.2)}

.tag{display:inline-block;background:var(--surface-2);border:1px solid var(--bordure-forte);border-radius:6px;padding:2px 8px;font-size:11px;color:var(--encre-3);margin:2px}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--accent);font-weight:600}

/* Tuile de chiffre */
.kpi{background:var(--surface);border:1px solid var(--bordure);border-radius:var(--rayon);padding:18px 20px}
.kpi .v{font-size:26px;font-weight:800;color:#fff;line-height:1.1}
.kpi .l{font-size:11px;color:var(--encre-4);margin-top:4px}
.kpi .s{font-size:11px;margin-top:6px}
.up{color:var(--bon-clair)} .down{color:var(--mauvais-clair)} .flat{color:var(--alerte-clair)}

/* Ligne libellé/valeur — six d'affilée se lisent comme un tableau */
.metric-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--bordure)}
.metric-row:last-child{border-bottom:none}
.metric-row .k{font-size:12px;color:var(--encre-4)}
.metric-row .v{font-size:13px;font-weight:600;color:var(--encre-2);white-space:nowrap}

.progress-bar{height:8px;background:var(--surface-3);border-radius:4px;overflow:hidden;margin:8px 0}
.progress-fill{height:100%;border-radius:4px}

table{width:100%;border-collapse:collapse;font-size:12.5px}
thead th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--encre-4);text-align:left;padding:9px 12px;border-bottom:1px solid var(--bordure)}
tbody td{padding:10px 12px;border-bottom:1px solid var(--surface);color:var(--encre-2);vertical-align:top}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover td{background:rgba(255,255,255,.02)}
.table-wrap{overflow-x:auto;border:1px solid var(--bordure);border-radius:var(--rayon)}
.cell-good{color:var(--bon-clair);font-weight:600}
.cell-warn{color:var(--alerte-clair);font-weight:600}
.cell-bad{color:var(--mauvais-clair);font-weight:600}
.note{font-size:11px;color:var(--encre-4);margin-top:3px}

/* Encadrés — la bordure gauche pour un avis, le fond teinté pour un état */
/* L'encadré coule comme du texte. Il était en display:flex pour poser une
   icône à côté du texte — mais le modèle y écrit naturellement un titre puis
   un paragraphe, et chaque noeud devenait une colonne qui s'écrasait : des
   encadrés rendus en trois bandes d'un mot de large. Une icône en tête de
   ligne se place très bien en flux normal. */
.box{border-radius:var(--rayon-sm);padding:14px 18px;margin:14px 0;font-size:13px;line-height:1.6}
.box > * + *{margin-top:6px}
.box-bad{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);color:#fca5a5}
.box-warn{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);color:#fcd34d}
.box-good{background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25);color:#86efac}
.box-info{background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.25);color:var(--accent-clair)}
.box strong{color:inherit;font-weight:700}
.box-title{font-weight:700;margin-bottom:4px}

/* Action : numéro, contenu, durée */
.action{background:var(--surface);border:1px solid var(--bordure);border-radius:var(--rayon-sm);padding:14px 18px;margin-bottom:10px;display:grid;grid-template-columns:28px 1fr auto;gap:14px;align-items:start}
.action .n{width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.action .t{font-size:14px;font-weight:700;color:var(--encre);margin-bottom:4px}
.action .d{font-size:12px;color:var(--encre-3);line-height:1.5}
.action .impact{font-size:11px;color:var(--alerte-clair);font-weight:600;margin-top:6px}
.action .duree{font-size:11px;color:var(--encre-4);white-space:nowrap;background:var(--surface-3);padding:3px 10px;border-radius:var(--pilule)}

/* Onglets en pilules dans un conteneur à fond */
/* Les onglets reviennent à la ligne plutôt que de défiler. Sans retour à la ligne, six
   onglets faisaient 1 118 px dans 556 px de cadre : les trois derniers
   n'étaient atteignables que par un défilement horizontal sans barre visible,
   donc invisibles. Un onglet qu'on ne voit pas est un onglet qui n'existe pas. */
.tabs{display:flex;flex-wrap:wrap;gap:4px;background:var(--surface);border:1px solid var(--bordure);border-radius:10px;padding:4px;width:fit-content;max-width:100%;margin-bottom:16px}
.tab{font-size:12px;font-weight:600;padding:6px 14px;border-radius:7px;cursor:pointer;color:var(--encre-4);background:none;border:none;white-space:nowrap;font-family:inherit;transition:all .2s}
.tab:hover{color:var(--encre-2)}
.tab.active{background:var(--surface-3);color:var(--encre)}
.panel{display:none}
.panel.active{display:block}

/* Bloc à copier */
.copy{background:var(--surface-2);border:1px solid var(--bordure-forte);border-radius:var(--rayon-sm);padding:18px 20px;margin-bottom:14px;position:relative}
.copy .content{font-size:14px;color:var(--encre);line-height:1.7;white-space:pre-wrap}
.copy-btn{position:absolute;top:14px;right:14px;background:var(--accent);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
.copy-btn.ok{background:var(--bon)}

footer{margin-top:32px;padding:20px;background:var(--surface);border:1px solid var(--bordure);border-radius:var(--rayon);font-size:12px;color:var(--encre-4);line-height:1.7}
footer strong{color:var(--encre-2)}

.wrap{max-width:1120px;margin:0 auto;padding:28px 32px 40px}
@media(max-width:560px){.wrap{padding:20px 16px 32px}}
`

/**
 * Ce que l'application fournit au document en plus du style.
 *
 * Trois aides, chacune parce que le modèle ne peut pas la deviner ni la faire
 * correctement seul :
 *
 * — `showTab` : la bascule d'onglet sans dépendre de `window.event`, que les
 *   quatre documents de référence utilisent et qui n'existe pas partout.
 *
 * — `copier` : `navigator.clipboard` est refusé dans ce cadre. Vérifié :
 *   `NotAllowedError`, y compris avec `allow="clipboard-write"` sur l'iframe —
 *   une origine opaque ne peut pas recevoir la permission. Le repli
 *   `execCommand` avec un textarea temporaire, lui, fonctionne.
 *
 * — la hauteur : mesurée sur le bas du contenu, jamais sur `documentElement`
 *   ni `body`, qui s'étirent à la taille du cadre et font boucler la mesure.
 */
export const SCRIPT_CADRE = `
function showTab(id){
  var p = document.getElementById(id) || document.getElementById('tab-' + id);
  if (!p) return;
  var groupe = p.parentElement;
  [].forEach.call(groupe.children, function(x){ if (x.classList.contains('panel')) x.classList.remove('active') });
  p.classList.add('active');
  [].forEach.call(document.querySelectorAll('.tab'), function(b){
    var vise = b.dataset.tab === id || (b.getAttribute('onclick') || '').indexOf("'" + id + "'") >= 0;
    b.classList.toggle('active', vise);
  });
  hauteur();
}
function copier(btn, cible){
  var el = cible ? (typeof cible === 'string' ? document.querySelector(cible) : cible)
                 : btn.parentElement.querySelector('.content');
  if (!el) return;
  var t = document.createElement('textarea');
  t.value = el.innerText; t.setAttribute('readonly', '');
  t.style.position = 'fixed'; t.style.top = '0'; t.style.opacity = '0';
  document.body.appendChild(t); t.select(); t.setSelectionRange(0, t.value.length);
  var ok = false;
  try { ok = document.execCommand('copy') } catch (e) { ok = false }
  document.body.removeChild(t);
  var avant = btn.textContent;
  btn.textContent = ok ? '\\u2713 Copié' : 'Échec';
  btn.classList.toggle('ok', ok);
  setTimeout(function(){ btn.textContent = avant; btn.classList.remove('ok') }, 2000);
}
var __derniere = 0;
function hauteur(){
  var bas = 0;
  for (var i = 0; i < document.body.children.length; i++) {
    var el = document.body.children[i];
    if (el.tagName === 'SCRIPT') continue;
    var r = el.getBoundingClientRect();
    if (r.bottom > bas) bas = r.bottom;
  }
  var h = Math.ceil(bas + window.scrollY);
  if (!h || Math.abs(h - __derniere) < 2) return;
  __derniere = h;
  parent.postMessage({ type: 'rapport-hauteur', hauteur: h }, '*');
}
new ResizeObserver(hauteur).observe(document.body);
addEventListener('load', hauteur);
setTimeout(hauteur, 80);
hauteur();
`
