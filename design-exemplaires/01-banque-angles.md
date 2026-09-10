# Exemplaire 01 — Banque d'angles

**Livrable** : banque d'angles créatifs (angle bank).
**Demande d'origine** : `SYSTEM IDENTITY … building an angle bank … Produce one entry per angle: ANGLE NAME / SOURCE / CORE IDEA / TARGET PERSONA / AWARENESS LEVEL / EMOTIONAL TRIGGER / BEST-FIT FORMATS / HOOK DIRECTION / CREATIVE PRIORITY / STATUS. End with ANGLE BANK SUMMARY.`
La demande ne dit **rien** de la forme. Tout ce qui suit est le jugement de mise
en page du modèle.

**Cadre** : `<iframe srcdoc="…" sandbox="allow-scripts">`, document complet avec
son `<style>`, script de hauteur en fin de `<body>`.

---

## Ce qui fait que ça marche pour CE livrable

Douze entrées qui portent chacune dix champs. Le problème de mise en page n'est
pas « comment afficher un angle », c'est **« comment en parcourir douze sans les
lire tous »**. D'où les trois choix structurants :

1. **Accordéon.** Chaque angle est replié : on voit le titre, le sous-titre et
   les trois pastilles. On déplie ce qu'on veut lire. Une liste déroulante de
   douze fiches ouvertes serait illisible.
2. **Trois taxonomies visibles sans dépliage** — priorité, niveau de conscience,
   statut. Elles répondent à « lequel je briefe en premier » avant même d'ouvrir.
3. **Un bloc de synthèse en fin de document** : compteurs, distribution,
   top 3, et le manque identifié. C'est le « et alors ? » du livrable.

## Palette — GitHub dark

| Rôle | Valeur |
|---|---|
| Fond | `#0d1117` |
| Surface (carte) | `#161b22` |
| Surface au survol | `#1c2128` |
| Bordure | `#30363d` · `#21262d` (interne) |
| Encre | `#e6edf3` · `#cdd9e5` (secondaire) |
| Encre faible | `#8b949e` |
| Accent | `#58a6ff` (bleu), `#1f6feb` (plein) |

## La méthode de couleur sémantique — le point le plus réutilisable

Chaque dimension de taxonomie reçoit sa famille de teinte, toujours construite de
la même façon : **fond à ~13 % d'alpha, bordure à ~27 %, texte en pleine
saturation**.

```
.badge-awareness-unaware  { background: #8957e522; color: #bc8cff; border: 1px solid #8957e544; }
.badge-awareness-problem  { background: #da363322; color: #ff7b72; border: 1px solid #da363344; }
.badge-awareness-solution { background: #388bfd22; color: #58a6ff; border: 1px solid #388bfd44; }
.badge-awareness-product  { background: #3fb95022; color: #56d364; border: 1px solid #3fb95044; }
.badge-awareness-most     { background: #db6d2822; color: #ffa657; border: 1px solid #db6d2844; }
```

Trois familles cohabitent sans se confondre : `priority-*` (bleu / jaune / gris),
`awareness-*` (violet → rouge → bleu → vert → orange, dans l'ordre du spectre),
`status-*` et `emotion-*` (huit émotions, huit teintes).

**Le statut porte aussi un emoji** — 🟢 Fresh / 🟡 Active / 🔴 Fatigué : la forme
double la couleur.

## Typographie

Dense, jamais aérée. `'Segoe UI', system-ui, sans-serif`.

- Titre de document 26 px / 700 / `letter-spacing: -0.5px`
- Nom d'angle 15 px / 600 · sous-titre 11 px en encre faible
- Micro-libellé de champ **9 px, majuscules, `letter-spacing: 0.8px`, 600** —
  c'est la signature du document, présent au-dessus de chaque valeur
- Corps 12–13 px, `line-height: 1.5`
- Chiffre de statistique 28 px / 700

## Structure

```
.header            bandeau centré, dégradé (#1e3a5f → #0d2137), rayon 16px
  h1 + p
  .meta-tags       pilules de contexte (12 angles · sources · objectif · zone)

.angles-grid       colonne d'accordéons, gap 16px
  .angle-card
    .card-header   [numéro] [nom + sous-titre] [3 pastilles] [chevron]
    .card-body     replié par défaut
      .source-quote   citation source, barre à gauche, italique
      .fields-grid    2 colonnes : idée centrale / persona / conscience / formats
      .hook-box       encadré accentué, la direction de hook
      .emotion-chip   pastille d'émotion

.summary-section   dégradé, en fin de document
  .summary-grid    3 colonnes de compteurs
  distribution     pastilles de conscience avec effectifs
  .top3-section    3 entrées numérotées avec justification
  .gap-box         encadré rouge : ce qui manque
```

## Interaction

Accordéon en JS simple, chevron qui pivote de 180°.

```js
function toggleCard(i) {
  const body = document.getElementById(`body-${i}`);
  const header = body.previousElementSibling;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  header.classList.toggle('open', !isOpen);
}
```

## Le patron de génération — à retenir

Le contenu vit dans **un tableau JS**, le balisage est produit par une fonction
de gabarit :

```js
const angles = [ { id, name, subtitle, priority, awareness, awarenessLabel,
                   status, emotion, emotionLabel, source, quote, coreIdea,
                   persona, awarenessRationale, formats, formatsWhy,
                   hookDirection }, … ];
angles.forEach((a, i) => { … grid.appendChild(card) });
```

Deux effets : douze entrées rigoureusement homogènes, et un document plus court
à écrire que douze blocs de balisage recopiés.

---

## Feuille de style complète

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: #0d1117;
  color: #e6edf3;
  padding: 24px;
  min-height: 100vh;
}
.header {
  text-align: center;
  margin-bottom: 32px;
  padding: 28px;
  background: linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%);
  border-radius: 16px;
  border: 1px solid #30363d;
}
.header h1 { font-size: 26px; font-weight: 700; color: #58a6ff; letter-spacing: -0.5px; }
.header p { color: #8b949e; font-size: 13px; margin-top: 6px; }
.meta-tags { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 12px; }
.meta-tag { background: #21262d; border: 1px solid #30363d; border-radius: 20px; padding: 4px 12px; font-size: 11px; color: #8b949e; }

.section-nav { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; justify-content: center; }
.nav-btn {
  padding: 6px 14px; border-radius: 20px; border: 1px solid #30363d;
  background: #161b22; color: #8b949e; font-size: 11px; cursor: pointer;
  transition: all 0.2s;
}
.nav-btn:hover, .nav-btn.active { background: #1f6feb; color: #fff; border-color: #1f6feb; }

.angles-grid { display: flex; flex-direction: column; gap: 16px; }

.angle-card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.2s;
}
.angle-card:hover { border-color: #58a6ff; }

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  cursor: pointer;
  user-select: none;
}
.card-header:hover { background: #1c2128; }

.angle-number {
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px; flex-shrink: 0;
}
.priority-HIGH .angle-number { background: #388bfd22; color: #58a6ff; border: 1px solid #388bfd55; }
.priority-MEDIUM .angle-number { background: #d2992222; color: #e3b341; border: 1px solid #d2992244; }
.priority-LOW .angle-number { background: #30363d; color: #8b949e; border: 1px solid #30363d; }

.card-title-block { flex: 1; }
.angle-name { font-size: 15px; font-weight: 600; color: #e6edf3; }
.angle-subtitle { font-size: 11px; color: #8b949e; margin-top: 2px; }

.card-badges { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }

.badge {
  padding: 3px 9px; border-radius: 20px; font-size: 10px; font-weight: 600;
  letter-spacing: 0.3px; white-space: nowrap;
}
.badge-priority-HIGH { background: #1f6feb33; color: #58a6ff; border: 1px solid #1f6feb55; }
.badge-priority-MEDIUM { background: #d2992233; color: #e3b341; border: 1px solid #d2992244; }
.badge-priority-LOW { background: #30363d; color: #8b949e; border: 1px solid #30363d; }

.badge-awareness-unaware { background: #8957e522; color: #bc8cff; border: 1px solid #8957e544; }
.badge-awareness-problem { background: #da363322; color: #ff7b72; border: 1px solid #da363344; }
.badge-awareness-solution { background: #388bfd22; color: #58a6ff; border: 1px solid #388bfd44; }
.badge-awareness-product { background: #3fb95022; color: #56d364; border: 1px solid #3fb95044; }
.badge-awareness-most { background: #db6d2822; color: #ffa657; border: 1px solid #db6d2844; }

.badge-status-fresh { background: #3fb95022; color: #56d364; border: 1px solid #3fb95044; }
.badge-status-active { background: #d2992222; color: #e3b341; border: 1px solid #d2992244; }
.badge-status-fatigued { background: #da363322; color: #ff7b72; border: 1px solid #da363344; }

.chevron { color: #8b949e; font-size: 12px; transition: transform 0.2s; margin-left: 4px; flex-shrink: 0; }
.open .chevron { transform: rotate(180deg); }

.card-body { display: none; padding: 0 20px 20px; border-top: 1px solid #21262d; }
.card-body.open { display: block; }

.source-quote {
  background: #0d1117;
  border-left: 3px solid #30363d;
  padding: 10px 14px;
  margin: 14px 0;
  border-radius: 0 6px 6px 0;
  font-size: 12px;
  color: #8b949e;
  font-style: italic;
  line-height: 1.5;
}
.source-quote .source-label { font-style: normal; font-weight: 600; color: #58a6ff; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }

.fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
@media (max-width: 600px) { .fields-grid { grid-template-columns: 1fr; } }

.field-block { background: #0d1117; border-radius: 8px; padding: 10px 12px; border: 1px solid #21262d; }
.field-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; color: #8b949e; font-weight: 600; margin-bottom: 4px; }
.field-value { font-size: 12px; color: #e6edf3; line-height: 1.5; }

.hook-box {
  background: linear-gradient(135deg, #1f3a5f22 0%, #0d211733 100%);
  border: 1px solid #1f6feb33;
  border-radius: 8px;
  padding: 12px 14px;
  margin-top: 12px;
}
.hook-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; color: #58a6ff; font-weight: 600; margin-bottom: 6px; }
.hook-text { font-size: 13px; color: #cdd9e5; font-weight: 500; line-height: 1.5; }

.emotion-chip {
  display: inline-block;
  padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;
  margin-top: 8px;
}
.emotion-fear { background: #da363322; color: #ff7b72; border: 1px solid #da363344; }
.emotion-frustration { background: #8957e522; color: #bc8cff; border: 1px solid #8957e544; }
.emotion-relief { background: #3fb95022; color: #56d364; border: 1px solid #3fb95044; }
.emotion-pride { background: #388bfd22; color: #58a6ff; border: 1px solid #388bfd44; }
.emotion-aspiration { background: #db6d2822; color: #ffa657; border: 1px solid #db6d2844; }
.emotion-guilt { background: #d2992222; color: #e3b341; border: 1px solid #d2992244; }
.emotion-embarrassment { background: #da363322; color: #ffa198; border: 1px solid #da363344; }
.emotion-urgency { background: #ff000022; color: #ff6e6e; border: 1px solid #ff000044; }

.summary-section {
  margin-top: 28px;
  background: linear-gradient(135deg, #1e2d3d 0%, #161b22 100%);
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 24px;
}
.summary-title { font-size: 18px; font-weight: 700; color: #58a6ff; margin-bottom: 20px; }
.summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 20px; }
@media (max-width: 700px) { .summary-grid { grid-template-columns: 1fr 1fr; } }

.summary-stat {
  background: #0d1117;
  border-radius: 8px;
  padding: 14px;
  border: 1px solid #21262d;
  text-align: center;
}
.stat-value { font-size: 28px; font-weight: 700; color: #e6edf3; }
.stat-label { font-size: 11px; color: #8b949e; margin-top: 4px; }

.top3-section { margin-top: 16px; }
.top3-title { font-size: 13px; font-weight: 600; color: #e3b341; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
.top3-item {
  background: #0d1117;
  border-radius: 8px;
  padding: 12px 14px;
  border: 1px solid #21262d;
  margin-bottom: 8px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.top3-num { font-weight: 700; color: #e3b341; font-size: 16px; flex-shrink: 0; line-height: 1.3; }
.top3-text { font-size: 12px; color: #cdd9e5; line-height: 1.5; }
.top3-text strong { color: #58a6ff; }

.gap-box {
  background: #da363311;
  border: 1px solid #da363333;
  border-radius: 8px;
  padding: 12px 14px;
  margin-top: 14px;
  font-size: 12px;
  color: #ff7b72;
  line-height: 1.5;
}
.gap-label { font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; margin-bottom: 4px; }
```

## Squelette de balisage (contenu retiré)

```html
<div class="header">
  <h1>🏊 SB PISCINE — ANGLE BANK</h1>
  <p>Piscine coque polyester · Hérault (34) · Lead Gen Local · Sept. 2026</p>
  <div class="meta-tags">
    <span class="meta-tag">📊 12 angles</span>
    <span class="meta-tag">🔵 Sources : Forums · Avis clients · Reddit · Ad Library</span>
    <span class="meta-tag">🎯 Objectif : +30% leads · CPL cible &lt;15€</span>
    <span class="meta-tag">🗺️ Zone 34/30/13</span>
  </div>
</div>

<div class="angles-grid" id="anglesGrid"><!-- rempli en JS --></div>

<div class="summary-section">
  <div class="summary-title">📊 ANGLE BANK SUMMARY</div>
  <div class="summary-grid">
    <div class="summary-stat"><div class="stat-value">12</div><div class="stat-label">Angles total</div></div>
    <!-- … 6 compteurs … -->
  </div>
  <div>
    <div style="font-size:12px; color:#8b949e; text-transform:uppercase; letter-spacing:0.5px;">Distribution par niveau de conscience</div>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <span class="badge badge-awareness-unaware">Unaware × 2</span>
      <!-- … une pastille par niveau, avec effectif … -->
    </div>
  </div>
  <div class="top3-section">
    <div class="top3-title">🏆 Top 3 à briefer en priorité</div>
    <div class="top3-item"><div class="top3-num">#1</div><div class="top3-text"><strong>NOM</strong> — pourquoi.</div></div>
  </div>
  <div class="gap-box">
    <div class="gap-label">⚠️ Biggest Gap identifié</div>
    Ce qui manque totalement dans la catégorie.
  </div>
</div>
```

Carte d'angle produite par le gabarit JS :

```html
<div class="angle-card priority-HIGH">
  <div class="card-header" onclick="toggleCard(0)">
    <div class="angle-number">1</div>
    <div class="card-title-block">
      <div class="angle-name">CAUCHEMAR DE CHANTIER → SÉCURITÉ LOCALE</div>
      <div class="angle-subtitle">L'anti-récit du pisciniste fantôme</div>
    </div>
    <div class="card-badges">
      <span class="badge badge-priority-HIGH">HIGH</span>
      <span class="badge badge-awareness-problem">Problem Aware</span>
      <span class="badge badge-status-fresh">🟢 Fresh</span>
    </div>
    <span class="chevron">▼</span>
  </div>
  <div class="card-body" id="body-0">
    <div class="source-quote">
      <div class="source-label">📌 Source — ForumPiscine.com &amp; Que Choisir</div>
      "citation verbatim"
    </div>
    <div class="fields-grid">
      <div class="field-block"><div class="field-label">💡 Idée centrale</div><div class="field-value">…</div></div>
      <div class="field-block"><div class="field-label">🎯 Persona cible</div><div class="field-value">…</div></div>
      <div class="field-block"><div class="field-label">🧠 Conscience — Rationale</div><div class="field-value">…</div></div>
      <div class="field-block"><div class="field-label">🎬 Formats recommandés</div><div class="field-value">…<br><span style="color:#8b949e; font-size:11px;">pourquoi</span></div></div>
    </div>
    <div class="hook-box">
      <div class="hook-label">🪝 Direction de hook</div>
      <div class="hook-text">"…"</div>
    </div>
    <div style="margin-top:10px;">
      <span class="emotion-chip emotion-fear">⚡ Peur + Soulagement</span>
    </div>
  </div>
</div>
```

## Script de fin

```js
(function(){
  var ro = new ResizeObserver(function(entries){
    var h = Math.round(entries[0].contentRect.height);
    parent.postMessage({type:'artifact-resize',height:h},'*');
  });
  ro.observe(document.body);
})();
document.documentElement.style.overflowY='auto';
document.body.style.margin='0';
```

> Note Apogee : ce script mesure `contentRect` de `body`. Avec le
> `min-height: 100vh` posé sur `body` ci-dessus, la mesure suit la taille du
> cadre — donc boucle si le cadre prend la hauteur annoncée. Côté Apogee c'est
> le script de l'application qui fait foi (il mesure le bas du contenu) ; celui
> du document est ignoré.
