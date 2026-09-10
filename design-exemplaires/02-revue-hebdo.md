# Exemplaire 02 — Revue de performance hebdomadaire

**Livrable** : weekly performance review — bilan chiffré d'une semaine, comparé à
la précédente, avec classement des créas, alertes et actions.

**Cadre** : `<iframe srcdoc="…" sandbox="allow-scripts">`, document complet,
script de hauteur en fin de `<body>`.

---

## ⚠️ Ce qui change tout : une ressource externe

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

Ce document **charge Chart.js depuis un CDN**. C'est la première fois qu'un
exemplaire sort du document.

Conséquence pour Apogee : ma consigne actuelle dit « aucune ressource externe,
le cadre n'a pas de réseau ». **Cette affirmation est peut-être fausse et n'a
jamais été vérifiée.** Un `sandbox="allow-scripts"` restreint l'accès à
l'origine, pas le réseau ; en revanche notre document est servi par une adresse
`blob:`, dont la politique de sécurité de contenu peut être héritée de la page
parente.

**À tester avant toute conclusion** — c'est la première chose à faire au « go ».
L'enjeu est réel : si Chart.js se charge, les graphiques deviennent possibles et
la consigne doit changer. Sinon, il faut l'interdire explicitement et exiger des
graphiques en CSS ou en SVG écrits à la main.

## Ce qui fait que ça marche pour CE livrable

Sept jours, six sections, une question : **qu'est-ce qui a bougé et que fait-on
lundi ?** D'où la progression du document, qui va du général à l'action :

1. **Résumé exécutif** — 4 tuiles de KPI, chacune avec sa comparaison à S-1
2. **Comparaison S-1 vs S** — 4 cartes qui répètent l'écart, en plus explicite
3. **Tableau journalier** — la granularité, avec couleurs par seuil
4. **Graphique** — dépense en barres, CTR et CPM en courbes, double axe
5. **Top / Bottom performers** — deux grilles de 3 cartes
6. **Alertes** puis **Actions** — ce qu'on surveille, puis ce qu'on fait

Le document ne se lit pas en diagonale : il se descend. Pas d'onglets, pas
d'accordéon — tout est visible, parce qu'un bilan hebdomadaire se parcourt en
entier une fois par semaine.

## Palette — ardoise / indigo

| Rôle | Valeur |
|---|---|
| Fond | `#0f1117` |
| Surface | `#1e2130` · en-tête de table `#1a1d2e` |
| Bordure | `#2d3148` · interne `#1e2130` |
| Encre | `#f1f5f9` → `#e2e8f0` → `#cbd5e1` → `#94a3b8` → `#64748b` |
| Accent | `#6366f1` (indigo) |
| Bon / Alerte / Mauvais | `#10b981` `#f59e0b` `#ef4444` (fond) · `#34d399` `#fbbf24` `#f87171` (texte) |

**L'échelle d'encre à cinq niveaux** est plus fine que dans l'exemplaire 01 :
titre, valeur, corps, secondaire, faible. Chaque niveau a un emploi précis.

Les fonds d'alerte sont des teintes très sombres et pleines — `#064e3b` (vert),
`#4c1d1d` (rouge), `#451a03` (ambre), `#1e3a5f` (bleu) — et non des alphas
comme dans l'exemplaire 01. Deux méthodes valides, à ne pas mélanger dans un
même document.

## Trois dispositifs à retenir

### 1. La couleur par seuil, calculée

```js
function ctrClass(v) {
  if (v >= 3.5) return 'cell-green';
  if (v < 2.85) return 'cell-red';
  return 'cell-yellow';
}
function cpmClass(v) {
  if (v <= 6.0) return 'cell-green';
  if (v >= 8.0) return 'cell-red';
  return 'cell-yellow';
}
```

La couleur d'une cellule n'est pas posée à la main : elle sort d'une règle. Deux
effets — le jugement est cohérent d'une ligne à l'autre, et **le sens de la
métrique est respecté** (un CPM bas est bon, un CTR haut est bon, les deux
fonctions sont donc inversées).

### 2. La mini-barre dans le tableau

Dernière colonne : une barre dont la hauteur est le pourcentage du maximum, et
dont la couleur signale l'extrême.

```js
const pct = (row.spend / maxSpend * 100).toFixed(0);
function spendColor(v) {
  if (v === Math.max(...)) return '#ef4444';   // le pic
  if (v === Math.min(...)) return '#34d399';   // le creux
  return '#6366f1';
}
```

```css
.sparkbar { display: flex; align-items: flex-end; gap: 2px; height: 28px; }
.sparkbar div { border-radius: 2px 2px 0 0; min-width: 6px; }
```

### 3. Le graphique combiné à double axe

Barres pour la dépense (axe gauche, en €), deux courbes pour CTR et CPM (axe
droit). Le CPM est en pointillés pour se distinguer du CTR. `interaction: {
mode: 'index', intersect: false }` : survoler un jour montre les trois valeurs.

## Structure

```
h1 + .subtitle

.section-title  « 1. Résumé Exécutif »      ← numérotée, majuscules, indigo
.kpi-grid       4 colonnes
  .kpi-card     [libellé] [valeur 26px] [comparaison colorée]

.section-title  « Comparaison S-1 vs S »
.trend-row      4 colonnes
  .trend-card   centré : [libellé] [a vs b] [écart + flèche + emoji]

.section-title  « 2. Tableau Journalier »
.table-wrap     overflow-x, bordure, rayon
  table         8 colonnes, dernière = mini-barre

.section-title  « Spend & CTR — Évolution journalière »
.chart-wrap     canvas Chart.js

.section-title  « 3. Top Performers »
.ads-grid       3 colonnes
  .ad-card      [rang] [nom] [6 lignes métrique] [verdict coloré]

.section-title  « 4. Bottom Performers »
.ads-grid       même carte, rangs rouges

.section-title  « 5. Alertes »
.alert-grid     2 colonnes
  .alert-card   bordure gauche 3px, fond teinté selon la gravité

.section-title  « 6. Actions Semaine Prochaine »
.action-list    colonne
  .action-card  [n° 22px indigo] [titre] [description] [impact attendu]

pied de page centré, discret
```

## Détails de composition

- **Les sections sont numérotées** — « 1. », « 2. »… parce que l'ordre porte du
  sens ici : on ne lit pas les actions avant le diagnostic.
- **La ligne métrique** `.ad-metric` est un `justify-content: space-between` :
  libellé à gauche en encre faible, valeur à droite en gras. Six lignes
  d'affilée se lisent comme un tableau sans en être un.
- **Chaque carte de créa finit par un verdict en prose**, coloré selon le
  jugement (vert / ambre / rouge), 11 px. C'est ce qui transforme un relevé en
  recommandation.
- **Chaque action porte son impact attendu**, en ambre, précédé de 🎯.
- Les emoji servent de repère de rubrique (💸 📞 🖱️ 💡 🥇 🥈 🥉 🔴 🟡 ⚠️ ✅ 🔁 🚀 🔧)
  et de redondance au code couleur.

---

## Feuille de style complète

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f1117; color: #e2e8f0; padding: 24px; }
h1 { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 4px; }
.subtitle { font-size: 13px; color: #64748b; margin-bottom: 28px; }
.section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6366f1; margin-bottom: 14px; margin-top: 32px; }

/* KPI Cards */
.kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 8px; }
.kpi-card { background: #1e2130; border: 1px solid #2d3148; border-radius: 12px; padding: 18px 20px; }
.kpi-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
.kpi-value { font-size: 26px; font-weight: 700; color: #f1f5f9; }
.kpi-sub { font-size: 11px; margin-top: 4px; }
.kpi-up { color: #10b981; } .kpi-down { color: #ef4444; } .kpi-flat { color: #f59e0b; }

/* Trend badges */
.badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
.badge-green { background: #064e3b; color: #6ee7b7; }
.badge-red { background: #4c1d1d; color: #fca5a5; }
.badge-yellow { background: #451a03; color: #fcd34d; }
.badge-blue { background: #1e3a5f; color: #93c5fd; }

/* Table */
.table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid #2d3148; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead tr { background: #1a1d2e; }
thead th { padding: 12px 14px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6366f1; letter-spacing: 0.6px; }
tbody tr { border-top: 1px solid #1e2130; transition: background 0.15s; }
tbody tr:hover { background: #1a1d2e; }
tbody td { padding: 11px 14px; color: #cbd5e1; }
.day-label { font-weight: 600; color: #f1f5f9; }

/* Color cells */
.cell-green { color: #34d399 !important; font-weight: 600; }
.cell-red { color: #f87171 !important; font-weight: 600; }
.cell-yellow { color: #fbbf24 !important; font-weight: 600; }
.cell-best { background: rgba(99,102,241,0.12); color: #a5b4fc !important; font-weight: 700; }

/* Sparkline container */
.sparkbar { display: flex; align-items: flex-end; gap: 2px; height: 28px; }
.sparkbar div { border-radius: 2px 2px 0 0; min-width: 6px; }

/* Ads section */
.ads-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.ad-card { background: #1e2130; border: 1px solid #2d3148; border-radius: 12px; padding: 16px; }
.ad-name { font-size: 13px; font-weight: 600; color: #f1f5f9; margin-bottom: 10px; line-height: 1.4; }
.ad-metric { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px; }
.ad-metric-label { color: #64748b; }
.ad-metric-value { font-weight: 600; color: #cbd5e1; }
.ad-rank { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 20px; margin-bottom: 10px; display: inline-block; }
.rank-top { background: #064e3b; color: #6ee7b7; }
.rank-bottom { background: #4c1d1d; color: #fca5a5; }

/* Alert cards */
.alert-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.alert-card { border-radius: 10px; padding: 14px 16px; font-size: 13px; line-height: 1.6; }
.alert-warn { background: #451a03; border-left: 3px solid #f59e0b; }
.alert-ok { background: #052e16; border-left: 3px solid #10b981; }
.alert-info { background: #1e3a5f; border-left: 3px solid #6366f1; }
.alert-danger { background: #4c1d1d; border-left: 3px solid #ef4444; }
.alert-title { font-weight: 700; margin-bottom: 4px; }

/* Actions */
.action-list { display: flex; flex-direction: column; gap: 12px; }
.action-card { background: #1e2130; border: 1px solid #2d3148; border-radius: 12px; padding: 16px 20px; display: flex; gap: 14px; align-items: flex-start; }
.action-num { font-size: 22px; font-weight: 900; color: #6366f1; min-width: 30px; }
.action-title { font-size: 14px; font-weight: 700; color: #f1f5f9; margin-bottom: 4px; }
.action-desc { font-size: 12px; color: #94a3b8; line-height: 1.5; }
.action-impact { font-size: 11px; margin-top: 6px; color: #fbbf24; font-weight: 600; }

/* Chart */
.chart-wrap { background: #1e2130; border: 1px solid #2d3148; border-radius: 12px; padding: 20px; }

/* Trend compare */
.trend-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.trend-card { background: #1e2130; border: 1px solid #2d3148; border-radius: 10px; padding: 14px; text-align: center; }
.trend-label { font-size: 11px; color: #64748b; margin-bottom: 6px; text-transform: uppercase; }
.trend-val { font-size: 18px; font-weight: 700; }
.trend-arrow { font-size: 12px; margin-top: 4px; }
```

## Squelette de balisage

```html
<h1>📊 SB Piscine — Weekly Performance Review</h1>
<p class="subtitle">03 – 09 Septembre 2026 &nbsp;|&nbsp; Lead Gen Piscine Coque &nbsp;|&nbsp; Zone 34/30/13</p>

<div class="section-title">1. Résumé Exécutif</div>
<div class="kpi-grid">
  <div class="kpi-card">
    <div class="kpi-label">💸 Spend Total</div>
    <div class="kpi-value">250,02€</div>
    <div class="kpi-sub kpi-down">↓ vs S-1 : 246,33€ (S-1 estimée)</div>
  </div>
  <!-- … 4 tuiles … -->
</div>

<div class="section-title" style="margin-top:20px;">Comparaison S-1 vs S</div>
<div class="trend-row">
  <div class="trend-card">
    <div class="trend-label">CTR</div>
    <div class="trend-val" style="color:#34d399">3,10% vs 2,85%</div>
    <div class="trend-arrow kpi-up">+8,8% ↑ ✅</div>
  </div>
  <!-- … 4 cartes … -->
</div>

<div class="section-title">2. Tableau Journalier</div>
<div class="table-wrap">
  <table>
    <thead><tr><th>Jour</th><th>Spend</th><th>Impressions</th><th>Clics</th><th>CTR</th><th>CPM</th><th>CPC</th><th>Trend Spend</th></tr></thead>
    <tbody id="dailyBody"><!-- rempli en JS --></tbody>
  </table>
</div>

<div class="section-title">Spend &amp; CTR — Évolution journalière</div>
<div class="chart-wrap"><canvas id="mainChart" height="90"></canvas></div>

<div class="section-title">3. Top Performers</div>
<div class="ads-grid">
  <div class="ad-card">
    <span class="ad-rank rank-top">🥇 #1 Winner</span>
    <div class="ad-name">Vidéo - lunel - C1B</div>
    <div class="ad-metric"><span class="ad-metric-label">Spend</span><span class="ad-metric-value">163,67€</span></div>
    <!-- … 6 lignes … -->
    <div style="margin-top:10px; font-size:11px; color:#6ee7b7; line-height:1.5">✅ verdict en prose</div>
  </div>
</div>

<div class="section-title">5. Alertes</div>
<div class="alert-grid">
  <div class="alert-card alert-danger">
    <div class="alert-title">🔴 CPM en hausse — À surveiller</div>
    CPM S actuelle : <strong>6,83€</strong> vs 6,02€ S-1. +13,4% en 7 jours.
  </div>
</div>

<div class="section-title">6. Actions Semaine Prochaine</div>
<div class="action-list">
  <div class="action-card">
    <div class="action-num">1</div>
    <div>
      <div class="action-title">🔁 Réactiver la campagne TOFU Notoriété</div>
      <div class="action-desc">Pourquoi, et comment, avec les chiffres.</div>
      <div class="action-impact">🎯 Impact attendu : …</div>
    </div>
  </div>
</div>

<div style="margin-top:24px; text-align:center; font-size:11px; color:#334155; padding-top:16px; border-top:1px solid #1e2130;">
  Généré par Autopilot — SB Piscine — 10 Sept. 2026
</div>
```

## Le patron de génération — identique à l'exemplaire 01

Les données journalières vivent dans **un tableau JS**, qui alimente à la fois
le tableau HTML et le graphique. Une seule source, deux rendus.

```js
const days = [
  { d: 'Jeu 03', spend: 29.41, imp: 5477, clicks: 184, ctr: 3.36, cpm: 5.37, cpc: 0.16 },
  …
];
days.forEach(row => { tbody.innerHTML += `…` });
new Chart(ctx, { data: { labels: days.map(d => d.d), datasets: [ … ] } });
```

C'est le deuxième exemplaire sur deux à procéder ainsi. **C'est une constante,
pas une coïncidence.**

---

# La partie texte — ce qui vit dans le fil

Le document ne vient pas seul. Il est précédé d'un texte qui est **un rapport à
part entière**, pas un résumé.

## Ce que j'avais faux

| Ma consigne actuelle | Ce que fait l'exemplaire |
|---|---|
| « Cinq cents mots au maximum » | Bien plus long, et c'est justifié |
| « Un bloc court par partie, trois à six lignes » | Des sections complètes, avec tableaux |
| « Termine par `Prochaines étapes :` + trois puces » | Termine par **une question** qui propose d'exécuter |
| Synthèse *puis* détail | **Deux rendus du même rapport** |

## La vraie division du travail

Le texte et le document **couvrent les mêmes sections** — 1, 3, 4, 5, 6. Ce
n'est pas « résumé puis détail ». C'est :

> **Le texte porte ce qui se lit comme du texte. Le document porte ce qui a
> besoin d'une mise en page.**

La preuve est dans la numérotation : le texte saute la **section 2 — Tableau
Journalier**. Sept lignes sur huit colonnes avec des mini-barres, ça ne se lit
pas en Markdown. Elle n'existe donc que dans le document. Le graphique non plus
n'a pas d'équivalent texte.

À l'inverse, les verdicts, les alertes et les actions sont dans les deux : ce
sont des phrases, elles marchent partout.

## Structure de la partie texte

```markdown
---
## 1. 🎯 Résumé Exécutif

**SB Piscine** est un compte **Lead Gen local** (piscines coque, zone 34/30/13).
Le compte est structurellement déséquilibré : **2 campagnes actives sur 6**…

| Métrique | S (03–09 sept) | S-1 (estimée) | Tendance |
|---|---|---|---|
| **Spend** | 250,02€ | ~246€ | +1,6% → |
| **CTR** | 3,10% | 2,85% | +8,8% ✅ |
| **CPM** | 6,83€ | 6,02€ | +13,4% ⚠️ |
| **CPC** | 0,22€ | 0,21€ | Stable → |
| **Leads trackés** | 0 (API) | — | 🔴 Tracking KO |

> ⚠️ **Note critique** : Le dashboard Meta remonte 0 conversions/leads. D'après
> les notes du profil, le CPL réel est ~12,73€ avec ~12 leads/7j — soit le
> tracking Pixel/CAPI n'est pas correctement configuré pour l'événement `Lead`,
> soit la remontée API est cassée. **C'est le problème #1 à corriger.**

---
## 3. 🏆 Top 3 Performers

**#1 — Vidéo lunel C1B** | CTR 2,90% | CPM 6,92€ | Spend 163,67€
→ Le cheval de bataille du compte. Absorbe 65% du budget BOFU avec un CPM
correct. **À maintenir à 100%.**

**#2 — MOFU LP Broad (Mtp/Alès/Arles)** | CTR **4,58%** | CPM **3,14€** | Spend 20,68€
→ Signal fort. Le CTR le plus élevé du compte + CPM le plus bas. Cette campagne
est **sous-exploitée** à 20€/j. Elle mérite d'être scalée.

---
## 4. 🔻 Bottom 3
… même forme …

---
## 5. ⚠️ Alertes

| Signal | Status |
|---|---|
| Fréquence | ✅ 1,61 — Pas de fatigue |
| CPM en hausse (+13% S/S) | 🔴 À surveiller |
| Funnel TOFU/MOFU à l'arrêt | 🔴 Critique long terme |
| Tracking Leads non visible | 🔴 Priorité absolue |

---
## 6. 🚀 3 Actions Semaine Prochaine

**Action 1 — Fixer le tracking Leads** *(Priorité maximale)*
Sans données de leads dans l'API, l'algo BOFU optimise à l'aveugle. Vérifier
Events Manager → événement `Lead` + CAPI.

**Action 2 — Scale +30% sur le MOFU LP** *(Opportunité immédiate)*
Le CTR 4,58% et CPM 3,14€ sont des signaux d'achat clairs. Passer de 300€/j →
390€/j sur cet adset.

**Action 3 — Réactiver TOFU + MOFU Considération à petit budget** *(Santé long terme)*
10–20€/j chacune pour alimenter le funnel et contenir la hausse du CPM BOFU.

---
Veux-tu que j'exécute directement l'une de ces actions (scale du MOFU,
réactivation TOFU) ?
```

## Les procédés de rédaction à retenir

- **Un `---` entre chaque section.** Le texte respire, les sections se
  distinguent sans avoir à les lire.
- **Les titres portent un emoji de rubrique** : 🎯 🏆 🔻 ⚠️ 🚀. Repère visuel dans
  un mur de texte.
- **La ligne de métriques en pipes** : `**#1 — Nom** | CTR 2,90% | CPM 6,92€ |
  Spend 163,67€` puis `→ ` et le verdict. Compact, alignable à l'œil, pas besoin
  d'un tableau pour trois chiffres.
- **Le `→` ouvre systématiquement le jugement.** Chiffres à gauche, sens à
  droite.
- **La citation en bloc pour ce qui est grave** — ici le tracking cassé. Une
  seule dans tout le rapport : c'est ce qui lui donne son poids.
- **Chaque action porte sa qualification entre parenthèses en italique** :
  *(Priorité maximale)*, *(Opportunité immédiate)*, *(Santé long terme)*. Trois
  natures d'urgence différentes, dites en deux mots.
- **La fin est une offre d'exécution, pas un sommaire.** « Veux-tu que
  j'exécute directement l'une de ces actions (scale du MOFU, réactivation
  TOFU) ? »

## L'habillage du document dans le fil

Le cadre n'est pas nu : il est coiffé d'une barre de titre.

```html
<div class="ap-artifact-wrapper">
  <div class="ap-artifact-header">
    <span class="ap-artifact-title">SB Piscine — Weekly Performance Review (03–09 Sept. 2026)</span>
    <button class="ap-artifact-expand">
      <svg …lucide-maximize2…>
        <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
        <line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/>
      </svg>
    </button>
  </div>
  <iframe srcdoc="…" sandbox="allow-scripts"
          style="width:100%; height:600px; border:none;
                 border-radius: 0 0 var(--radius-xl) var(--radius-xl);"></iframe>
</div>
```

Deux différences avec ce que j'ai fait dans Apogee :

1. **Le titre du document est visible** dans une barre au-dessus du cadre. Le
   mien n'apparaît nulle part.
2. **Le bouton d'agrandissement est dans cette barre**, pas flottant par-dessus
   le contenu. Le cadre n'est arrondi qu'en bas — c'est la barre qui porte
   l'arrondi du haut.

C'est mieux que ma pastille flottante : elle masque un coin du document et le
titre est perdu.
