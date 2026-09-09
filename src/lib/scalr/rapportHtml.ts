/**
 * Les rapports qui arrivent sous forme de document HTML.
 *
 * Un livrable stratégique — personas, entonnoir, feuille de route, briefs —
 * ne se met pas en page en Markdown : ni bandeau de chiffres, ni pastille
 * d'état, ni carte. Ces rapports-là sont donc écrits en HTML par le modèle et
 * affichés dans un cadre isolé.
 *
 * Le modèle ne rend que **le corps** : la feuille de style et le script vivent
 * ici. Les lui faire recopier coûtait trois mille jetons de sortie à chaque
 * génération — une minute de calcul pour du style identique d'une fois sur
 * l'autre — et laissait la mise en page dériver au gré des humeurs.
 *
 * Une réponse arrive donc en deux morceaux — une synthèse en Markdown, qui se
 * lit dans le fil, puis le document — que `separerRapport` distingue.
 *
 * Tout le reste de l'application continue de recevoir du Markdown, et l'envoi
 * par courriel bascule sur un lien pour ceux-ci : un document HTML collé dans
 * un e-mail s'affiche en code source.
 */

/** La marque qu'un rapport pose en tête, et qui le distingue d'un Markdown. */
const MARQUE = '<!--rapport-->'

/**
 * La feuille de style du document, tenue par l'application.
 *
 * Les onglets sont des `.nav-btn`, les volets des `.section` dont une seule
 * porte `.active`. La bascule se fait en JavaScript : le cadre autorise les
 * scripts, ce qui permet aussi au document d'annoncer sa hauteur et donc de
 * s'afficher en entier au lieu de défiler dans une fenêtre fixe.
 */
export const FEUILLE_STYLE = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0d0d1a; color: #e0e0f0; font-family: 'Segoe UI', system-ui, sans-serif; }

.hero { background: linear-gradient(135deg, #1a1a3e 0%, #0d2040 50%, #0d1a0d 100%); border-bottom: 1px solid #2a2a5a; padding: 36px 40px 28px; position: relative; overflow: hidden; }
.hero::before { content: ''; position: absolute; top: -60px; right: -60px; width: 300px; height: 300px; background: radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%); border-radius: 50%; }
.hero-badge { display: inline-block; background: rgba(99,102,241,0.2); border: 1px solid rgba(99,102,241,0.4); color: #a5b4fc; padding: 4px 12px; border-radius: 20px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; }
.hero h1 { font-size: 26px; font-weight: 700; color: #fff; margin-bottom: 6px; }
.hero p { color: #8888aa; font-size: 13px; }
.hero-meta { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 20px; }
.hero-stat { text-align: left; }
.hero-stat .val { font-size: 22px; font-weight: 700; color: #6366f1; }
.hero-stat .lbl { font-size: 11px; color: #6666aa; margin-top: 2px; }

.nav { display: flex; gap: 0; background: #12122a; border-bottom: 1px solid #2a2a4a; overflow-x: auto; }
.nav-btn { padding: 12px 20px; font-size: 12px; color: #6666aa; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; transition: all 0.2s; background: none; border-left: none; border-right: none; border-top: none; font-family: inherit; }
.nav-btn:hover { color: #a5b4fc; }
.nav-btn.active { color: #a5b4fc; border-bottom-color: #6366f1; }

.content { padding: 0; }
.section { display: none; padding: 32px 40px; }
.section.active { display: block; }

h2 { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 6px; }
h3 { font-size: 14px; font-weight: 600; color: #c4c4e8; margin-bottom: 8px; }
p, li { font-size: 13px; color: #9999bb; line-height: 1.7; }
ul { padding-left: 18px; }
.section-label { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #6366f1; margin-bottom: 16px; font-weight: 600; }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 16px; }

.card { background: #16162e; border: 1px solid #2a2a4a; border-radius: 12px; padding: 20px; transition: border-color 0.2s; }
.card:hover { border-color: #4444aa; }
.card.highlight { border-color: rgba(99,102,241,0.4); background: linear-gradient(135deg, #1a1a3e, #16162e); }
.card.warn { border-color: rgba(245,158,11,0.3); background: linear-gradient(135deg, #1a1400, #16162e); }
.card.danger { border-color: rgba(239,68,68,0.3); background: linear-gradient(135deg, #1a0000, #16162e); }
.card.success { border-color: rgba(16,185,129,0.3); background: linear-gradient(135deg, #001a10, #16162e); }

.badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; letter-spacing: 0.5px; }
.badge-tofu { background: rgba(99,102,241,0.2); color: #818cf8; }
.badge-mofu { background: rgba(245,158,11,0.2); color: #fbbf24; }
.badge-bofu { background: rgba(16,185,129,0.2); color: #34d399; }
.badge-alert { background: rgba(239,68,68,0.2); color: #f87171; }
.badge-ok { background: rgba(16,185,129,0.2); color: #34d399; }
.badge-info { background: rgba(99,102,241,0.15); color: #a5b4fc; }

.metric-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid #1e1e3a; }
.metric-row:last-child { border-bottom: none; }
.metric-label { font-size: 12px; color: #7777aa; }
.metric-value { font-size: 13px; font-weight: 600; color: #c4c4e8; white-space: nowrap; }

.tag { display: inline-block; background: #1e1e3e; border: 1px solid #3a3a5a; border-radius: 6px; padding: 2px 8px; font-size: 11px; color: #8888cc; margin: 2px; }

.funnel-stage { position: relative; margin-bottom: 12px; }
.funnel-bar { height: 56px; border-radius: 10px; display: flex; align-items: center; padding: 0 20px; margin-bottom: 4px; }
.funnel-tofu { background: linear-gradient(90deg, rgba(99,102,241,0.35), rgba(99,102,241,0.1)); border: 1px solid rgba(99,102,241,0.3); width: 100%; }
.funnel-mofu { background: linear-gradient(90deg, rgba(245,158,11,0.35), rgba(245,158,11,0.1)); border: 1px solid rgba(245,158,11,0.3); width: 72%; margin-left: auto; margin-right: auto; }
.funnel-bofu { background: linear-gradient(90deg, rgba(16,185,129,0.35), rgba(16,185,129,0.1)); border: 1px solid rgba(16,185,129,0.3); width: 44%; margin-left: auto; margin-right: auto; }
.funnel-label { font-size: 13px; font-weight: 600; color: #fff; }
.funnel-sub { font-size: 11px; color: #8888aa; margin-top: 2px; }

.persona-card { background: #16162e; border: 1px solid #2a2a4a; border-radius: 12px; padding: 20px; margin-bottom: 12px; }
.persona-name { font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 2px; }
.persona-desc { font-size: 12px; color: #7777aa; margin-bottom: 12px; }
.persona-hook { background: #0d0d1a; border-left: 3px solid #6366f1; padding: 10px 14px; border-radius: 0 8px 8px 0; font-size: 12px; color: #c4c4e8; font-style: italic; margin-top: 8px; }

.phase-card { background: #16162e; border: 1px solid #2a2a4a; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
.phase-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
.phase-title { font-size: 16px; font-weight: 700; color: #fff; }
.phase-weeks { font-size: 11px; color: #6366f1; margin-top: 4px; }
.phase-items { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
.phase-item-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6666aa; margin-bottom: 6px; }
.phase-item-content { font-size: 12px; color: #c4c4e8; line-height: 1.5; }

.brief-card { background: #16162e; border: 1px solid #2a2a4a; border-radius: 12px; padding: 24px; margin-bottom: 16px; position: relative; overflow: hidden; }
.brief-num { position: absolute; top: -10px; right: 16px; font-size: 72px; font-weight: 900; color: rgba(99,102,241,0.06); line-height: 1; }
.brief-title { font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 4px; }
.brief-why { background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.2); border-radius: 8px; padding: 10px 14px; margin-top: 12px; }
.brief-why-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6366f1; margin-bottom: 4px; }
.brief-why-text { font-size: 12px; color: #a5b4fc; }

.tracker-example { background: #0d0d1a; border: 1px solid #2a2a4a; border-radius: 8px; padding: 12px 16px; font-family: monospace; font-size: 12px; color: #10b981; margin-top: 8px; overflow-x: auto; }

.bottleneck { background: linear-gradient(135deg, #1a0a0a, #16162e); border: 1px solid rgba(239,68,68,0.4); border-radius: 12px; padding: 20px; margin-top: 16px; }
.bottleneck-title { font-size: 14px; font-weight: 700; color: #f87171; margin-bottom: 8px; }

.signal-row { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; }
.signal-dot { width: 6px; height: 6px; border-radius: 50%; background: #6366f1; margin-top: 6px; flex-shrink: 0; }

table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12.5px; }
th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6666aa; font-weight: 600; padding: 8px 10px; border-bottom: 1px solid #2a2a4a; }
td { padding: 9px 10px; border-bottom: 1px solid #1e1e3a; color: #c4c4e8; }
tr:last-child td { border-bottom: none; }

@media (max-width: 780px) {
  .hero, .section { padding-left: 20px; padding-right: 20px; }
  .grid-2, .grid-3, .phase-items { grid-template-columns: 1fr; }
  .funnel-mofu, .funnel-bofu { width: 100%; }
}`

/**
 * La feuille de style d'avant, pour les rapports déjà en base.
 *
 * Ils sont écrits dans l'ancien vocabulaire — `.wrap`, `.panel`, `.kpi-row`,
 * onglets en boutons radio. Les servir avec la nouvelle feuille les rendrait
 * sans mise en page du jour au lendemain. Les deux ne peuvent pas cohabiter
 * dans un même document : `body`, `.card`, `.badge`, `.tag` et `table` portent
 * des règles différentes. On choisit donc l'une ou l'autre à l'affichage.
 */
const FEUILLE_STYLE_ANCIENNE = ":root{--bg:#0A0C16;--panel:#12152A;--panel-2:#161A33;--border:#262b4a;--ink:#E7E9F6;--dim:#9297B8;--dimmer:#666c94;--violet:#7C7FF0;--violet-soft:#3B3D74;--good:#3ED598;--good-bg:#0F2A22;--warn:#F2B84B;--warn-bg:#2E260F;--bad:#F0637A;--bad-bg:#2E1620;--mono:\"JetBrains Mono\",monospace}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,\"Segoe UI\",sans-serif;font-size:15px;line-height:1.6}.wrap{max-width:1120px;margin:0 auto;padding:0 28px 80px}a{color:inherit}h1,h2,h3{margin:0;font-weight:700}.tag{font-family:var(--mono);font-size:11px;letter-spacing:.02em;padding:3px 9px;border-radius:5px;display:inline-block}.tag-tofu{background:var(--violet-soft);color:#C7C9FA}.tag-mofu{background:#3a2e0f;color:#F2C56B}.tag-bofu{background:#123024;color:#5FE0A8}.tag-retarg{background:#301622;color:#F58AA6}header{padding:44px 0 0}.badge{font-family:var(--mono);font-size:12px;color:var(--violet);background:var(--violet-soft);display:inline-block;padding:5px 12px;border-radius:20px;margin-bottom:16px}header h1{font-size:32px;letter-spacing:-.01em}header .sub{color:var(--dim);margin-top:8px;font-size:14.5px}.kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin:28px 0 0}.kpi{background:var(--panel);padding:18px 16px}.kpi .v{font-size:24px;font-weight:700;color:var(--violet)}.kpi .l{font-size:12px;color:var(--dim);margin-top:4px}@media (max-width:800px){.kpi-row{grid-template-columns:repeat(2,1fr)}}.tabs{display:flex;gap:4px;margin:28px 0 0;border-bottom:1px solid var(--border);overflow-x:auto}.tab-btn{font-family:\"Inter\";font-size:14px;color:var(--dim);background:none;border:none;padding:12px 16px;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent}.tab-btn .num{font-family:var(--mono);color:var(--dimmer);margin-right:6px}.panel{display:none;padding-top:36px}.eyebrow{font-family:var(--mono);font-size:12px;color:var(--violet);letter-spacing:.03em}h2{font-size:24px;margin-top:6px}.lede{color:var(--dim);font-size:14.5px;margin-top:8px;max-width:70ch}.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:24px}@media (max-width:800px){.grid-2{grid-template-columns:1fr}}.card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:22px}.card h3{font-size:15px;margin-bottom:14px}.kv{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border);font-size:13.5px;gap:12px}.kv:last-child{border-bottom:none}.kv .status{font-family:var(--mono);font-size:11px;padding:2px 8px;border-radius:4px;white-space:nowrap}.status-bad{background:var(--bad-bg);color:var(--bad)}.status-warn{background:var(--warn-bg);color:var(--warn)}.status-good{background:var(--good-bg);color:var(--good)}.callout{border-radius:12px;padding:18px 20px;margin-top:18px;font-size:13.5px;border:1px solid}.callout.bad{background:var(--bad-bg);border-color:#4a2130;color:#f5c3cd}.callout.warn{background:var(--warn-bg);border-color:#4a3a15;color:#f4dba6}.callout.good{background:var(--good-bg);border-color:#15412f;color:#a9ecce}.callout strong{color:inherit}table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}th{text-align:left;font-family:var(--mono);font-size:10.5px;color:var(--dimmer);font-weight:500;padding:8px 10px;border-bottom:1px solid var(--border)}td{padding:9px 10px;border-bottom:1px solid var(--border);color:var(--ink)}tr:last-child td{border-bottom:none}.num-cell{font-family:var(--mono)}.note{font-size:12px;color:var(--dimmer);font-style:italic;margin-top:8px}.persona{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:22px;margin-top:16px}.persona-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.persona-head h3{font-size:17px}.persona .role{color:var(--dim);font-size:13px;margin-top:2px}.persona-body{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px}@media (max-width:700px){.persona-body{grid-template-columns:1fr}}.persona-body .k{font-family:var(--mono);font-size:10.5px;color:var(--dimmer)}.persona-body .v{font-size:13.5px;margin-top:4px}.persona .hook{margin-top:16px;padding:12px 14px;background:var(--panel-2);border-radius:8px;font-size:13.5px;font-style:italic;color:#C7C9FA;border-left:2px solid var(--violet)}.funnel-flow{display:flex;flex-direction:column;gap:0;margin-top:24px}.funnel-stage{border-radius:10px;padding:16px 20px;margin-bottom:8px}.funnel-stage.t{background:var(--violet-soft)}.funnel-stage.m{background:#332a10}.funnel-stage.b{background:#123024}.funnel-stage .stitle{font-weight:700;font-size:14.5px}.funnel-stage .sdesc{font-size:12.5px;color:var(--dim);margin-top:3px}.arrow-down{text-align:center;color:var(--dimmer);font-size:14px;margin:2px 0}.funnel-cols{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;margin-top:22px}@media (max-width:800px){.funnel-cols{grid-template-columns:1fr}}.fcol{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:20px}.fcol .k{font-family:var(--mono);font-size:10.5px;color:var(--dimmer);margin-top:14px}.fcol .v{font-size:13px;margin-top:4px}.fcol ul{margin:4px 0 0;padding-left:16px;font-size:13px}.fcol li{margin-bottom:3px}.fcol .hook-box{margin-top:14px;padding:10px 12px;background:var(--panel-2);border-radius:8px;font-size:12.5px;font-style:italic;color:#C7C9FA}.phase{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:22px;margin-top:16px}.phase-head{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px}.phase-head h3{font-size:17px}.phase-head .when{color:var(--violet);font-family:var(--mono);font-size:12.5px}.phase-cols{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:16px}@media (max-width:800px){.phase-cols{grid-template-columns:1fr}}.phase-cols .k{font-family:var(--mono);font-size:10.5px;color:var(--dimmer)}.phase-cols ul{margin:6px 0 0;padding-left:16px;font-size:13px}.phase-cols li{margin-bottom:3px}.naming-box{font-family:var(--mono);font-size:14.5px;background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:16px 18px;margin-top:18px;overflow-x:auto;color:#C7C9FA}.tag-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-top:20px}.tag-group .k{font-family:var(--mono);font-size:10.5px;color:var(--dimmer);margin-bottom:6px}.chip{display:inline-block;font-family:var(--mono);font-size:11.5px;background:var(--panel-2);border:1px solid var(--border);padding:3px 8px;border-radius:6px;margin:0 4px 4px 0}.example-name{font-family:var(--mono);font-size:13px;background:var(--panel-2);border:1px solid var(--border);padding:8px 12px;border-radius:6px;display:inline-block;margin:4px 8px 2px 0;color:var(--good)}.brief-tabs{display:flex;gap:8px;margin-top:24px;flex-wrap:wrap}.brief-btn{font-family:var(--mono);font-size:12.5px;background:var(--panel);border:1px solid var(--border);color:var(--dim);padding:8px 14px;border-radius:8px;cursor:pointer}.brief-panel{display:none;margin-top:20px}.brief-title{font-size:19px;font-weight:700;font-family:var(--mono);color:var(--ink)}.brief-tagrow{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap}.why-box{margin-top:18px;background:var(--warn-bg);border:1px solid #4a3a15;border-radius:10px;padding:16px 18px;font-size:13.5px;color:#f4dba6}.fiche{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:22px}@media (max-width:700px){.fiche{grid-template-columns:1fr}}.fiche .k{font-family:var(--mono);font-size:10.5px;color:var(--dimmer);margin-top:14px}.fiche .k:first-child{margin-top:0}.fiche .v{font-size:13.5px;margin-top:4px}.script-block{margin-top:20px;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:22px}.script-block h4{font-size:14px;margin-bottom:12px;color:var(--violet)}.timecode{font-family:var(--mono);color:var(--violet);font-size:12.5px}.script-line{margin-bottom:14px;padding-bottom:14px;border-bottom:1px dashed var(--border)}.script-line:last-child{border-bottom:none}.script-line .dir{color:var(--dim);font-size:12.5px;font-style:italic;margin-top:3px}.script-line .txt{font-size:14px;margin-top:4px}footer{margin-top:56px;padding-top:24px;border-top:1px solid var(--border);font-size:12.5px;color:var(--dimmer)}.retention-row{margin-top:14px}.retention-row .rlabel{display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px}.retention-row .rlabel .pct{font-family:var(--mono)}.rbar-track{height:10px;background:var(--panel-2);border-radius:5px;overflow:hidden}.rbar-fill{height:100%;border-radius:5px}.rbar-fill.good{background:var(--good)}.rbar-fill.warn{background:var(--warn)}.rbar-fill.bad{background:var(--bad)}.timeline{margin-top:18px}.tl-item{display:flex;gap:16px;padding:14px 0;border-bottom:1px solid var(--border)}.tl-item:last-child{border-bottom:none}.tl-dot{width:26px;height:26px;border-radius:50%;flex:0 0 26px;display:flex;align-items:center;justify-content:center;font-size:13px;margin-top:2px}.tl-dot.good{background:var(--good-bg);color:var(--good);border:1px solid #15412f}.tl-dot.warn{background:var(--warn-bg);color:var(--warn);border:1px solid #4a3a15}.tl-dot.bad{background:var(--bad-bg);color:var(--bad);border:1px solid #4a2130}.tl-item h4{font-size:14px;margin:0 0 4px}.tl-item p{font-size:13px;color:var(--dim);margin:0;max-width:65ch}.voscript{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:0;margin-top:20px;overflow:hidden}.voscript .row{display:grid;grid-template-columns:90px 1fr;gap:0;border-bottom:1px solid var(--border)}.voscript .row:last-child{border-bottom:none}.voscript .tc{padding:16px 14px;font-family:var(--mono);color:var(--violet);font-size:12px;background:var(--panel-2)}.voscript .content{padding:16px 18px}.voscript .vo{font-size:14.5px;color:var(--ink)}.voscript .vo .label{font-family:var(--mono);font-size:10px;color:var(--dimmer);display:block;margin-bottom:4px}.voscript .onscreen{margin-top:8px;font-size:12.5px;color:#F2C56B;background:#2a2410;display:inline-block;padding:3px 9px;border-radius:5px}.voscript .dir2{margin-top:8px;font-size:12.5px;color:var(--dim);font-style:italic}input.onglet{display:none}.tab-btn{display:inline-block}#o1:checked~.wrap #t1,#o2:checked~.wrap #t2,#o3:checked~.wrap #t3,#o4:checked~.wrap #t4,#o5:checked~.wrap #t5,#o6:checked~.wrap #t6,#o7:checked~.wrap #t7{display:block}#o1:checked~.wrap label[for=o1],#o2:checked~.wrap label[for=o2],#o3:checked~.wrap label[for=o3],#o4:checked~.wrap label[for=o4],#o5:checked~.wrap label[for=o5],#o6:checked~.wrap label[for=o6],#o7:checked~.wrap label[for=o7]{color:var(--ink);border-bottom-color:var(--violet)}#b1:checked~.brief-panels #p1,#b2:checked~.brief-panels #p2,#b3:checked~.brief-panels #p3{display:block}#b1:checked~.brief-tabs label[for=b1],#b2:checked~.brief-tabs label[for=b2],#b3:checked~.brief-tabs label[for=b3]{color:var(--ink);border-color:var(--violet);background:var(--violet-soft)}"

/**
 * Le script du document.
 *
 * Deux choses, et rien d'autre : la bascule d'onglet, et la hauteur annoncée au
 * parent. Sans cette hauteur, le rapport défilait dans une fenêtre fixe alors
 * qu'il doit couler dans la page.
 *
 * `showSection` retrouve l'onglet à activer sans dépendre de `event`, qui
 * n'existe pas partout : le bouton est celui dont l'appel cite l'identifiant.
 */
const SCRIPT_CADRE = `
function showSection(id){
  document.querySelectorAll('.section').forEach(function(s){ s.classList.toggle('active', s.id === id) });
  document.querySelectorAll('.nav-btn').forEach(function(b){
    var vise = b.dataset.section === id || (b.getAttribute('onclick') || '').indexOf("'" + id + "'") >= 0;
    b.classList.toggle('active', vise);
  });
  annoncerHauteur();
}
function annoncerHauteur(){
  var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
  parent.postMessage({ type: 'rapport-hauteur', hauteur: h }, '*');
}
new ResizeObserver(annoncerHauteur).observe(document.body);
addEventListener('load', annoncerHauteur);
annoncerHauteur();`

/**
 * Ce qui se lit dans le fil, et ce qui s'affiche en dessous.
 *
 * Une réponse arrive en deux morceaux : d'abord une synthèse en Markdown — les
 * verdicts, les chiffres qui tranchent, les prochaines étapes — puis la marque,
 * puis le document mis en page. La synthèse est ce que l'utilisateur lit
 * pendant que le reste s'écrit : elle sort en premier du flux, elle s'affiche
 * en premier.
 *
 * La marque est le seul signal fiable pour la frontière : un fragment de
 * balisage commence par n'importe quelle balise, et un rapport Markdown peut
 * légitimement contenir du HTML dans un bloc de code. Un document entier en
 * tête reste accepté, pour les rapports produits avant ce changement.
 */
export function separerRapport(contenu: string | null | undefined): {
  synthese: string
  document: string | null
} {
  const brut = (contenu || '').trim().replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/, '')

  const i = brut.indexOf(MARQUE)
  if (i >= 0) return { synthese: brut.slice(0, i).trim(), document: brut.slice(i) }

  // Un document ancien porte sa propre feuille de style et n'a pas de synthèse.
  if (/^(<!doctype html|<html[\s>])/i.test(brut)) return { synthese: '', document: brut }

  /**
   * Le filet, quand la marque manque.
   *
   * Sans elle, un document part au rendu Markdown : le lecteur reçoit son
   * balisage en texte brut, ce qui donne exactement « aucune mise en page, que
   * du texte ». Le vocabulaire de classes est le nôtre et ne se rencontre pas
   * dans un rapport Markdown : il suffit à reconnaître le début du document.
   */
  const repli = /<div[^>]+class="(?:hero|nav|content)"/i.exec(brut)
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
 * Un corps marqué est habillé de la feuille de style et du script ; un document
 * ancien, qui porte déjà les siens, est rendu tel quel.
 */
export function extraireRapportHtml(contenu: string): string {
  const brut = separerRapport(contenu).document || ''

  const complet = brut.search(/<!doctype html|<html[\s>]/i)
  if (complet >= 0) {
    const fin = brut.toLowerCase().lastIndexOf('</html>')
    return fin > complet ? brut.slice(complet, fin + 7) : brut.slice(complet)
  }

  const corps = brut.startsWith(MARQUE) ? brut.slice(MARQUE.length).trim() : brut
  // `.wrap` n'existe que dans l'ancien vocabulaire : il suffit à trancher.
  const style = /class="wrap"/.test(corps) ? FEUILLE_STYLE_ANCIENNE : FEUILLE_STYLE
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<style>${style}</style></head><body>${corps}`
    + `<script>${SCRIPT_CADRE}</script></body></html>`
}
