# Exemplaire 04 — Audit de compte (Andromeda)

**Livrable** : audit noté d'un compte Meta Ads. 50 points de contrôle, un score
sur 100, une note en lettre, un plan d'action priorisé.

**Cadre** : `<iframe srcdoc="…" sandbox="allow-scripts">`, Chart.js en CDN,
script de hauteur en fin de `<body>`.

---

## Ce qui fait que ça marche pour CE livrable

Un audit doit répondre à trois questions dans cet ordre, et la mise en page suit
exactement cet ordre :

1. **« Ça vaut combien ? »** → le score hero. Un anneau, un chiffre, une lettre.
   Lisible en une seconde, avant toute lecture.
2. **« Où ça pèche ? »** → quatre cartes de catégorie, chacune avec son **poids**
   dans la note. Le poids est ce qui rend le score vérifiable au lieu d'être
   arbitraire.
3. **« Je fais quoi ? »** → les quick wins triés par impact × effort, puis le
   plan d'action.

Le détail des 50 checks vient **après**, en onglets. C'est de la matière de
preuve, pas de lecture.

## Le score hero — la structure

```css
.score-hero { display: grid; grid-template-columns: auto 1fr auto; gap: 32px; align-items: center; }
.score-ring { position: relative; width: 160px; height: 160px; }
.score-ring canvas { position: absolute; top: 0; left: 0; }
.score-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }
```

Trois colonnes : **l'anneau · l'explication · la note**.

L'anneau est un `doughnut` Chart.js à `cutout: '78%'`, deux segments seulement —
le score et son complément — et le chiffre est posé par-dessus en absolu :

```js
new Chart(ctx, {
  type: 'doughnut',
  data: { datasets: [{ data: [47, 53], backgroundColor: ['#f59e0b', '#21262d'],
                       borderWidth: 0, cutout: '78%' }] },
  options: { plugins: { legend: { display: false }, tooltip: { enabled: false } },
             animation: { animateRotate: true, duration: 1200 } }
});
```

Ni légende ni infobulle : ce n'est pas un graphique, c'est une jauge.

À droite, la **lettre** dans un encadré teinté de la même couleur que l'anneau :
`D` en 56 px / 900, plus « Action immédiate requise ». La couleur de l'anneau,
celle de la lettre et celle du cadre sont la même — l'ambre `#f59e0b`.

Sous l'explication, une ligne de comptage : `3 Critiques · 11 Warnings ·
14 Pass — sur 28 checks applicables`.

## Le double badge — le dispositif le plus fin du document

Chaque ligne de check porte **deux badges qui ne disent pas la même chose** :

| | Ce que ça dit | Traitement |
|---|---|---|
| **Sévérité** | L'importance de la *règle*, dans l'absolu | 9 px, fond à 10 % d'alpha, discret |
| **Résultat** | Ce que vaut *ce compte* sur cette règle | 10 px, fond à 15 %, plus vif |

```css
.badge-crit { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); font-size: 9px; }
.badge-fail { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
```

Même teinte, poids visuel différent. Un check **Critical** qui **PASS** se lit
d'un coup d'œil sans confusion possible avec un check **Low** qui **FAIL**.
C'est exactement le genre de distinction qu'un gabarit unique ne sait pas faire.

## Les cartes de catégorie — le poids rend le score vérifiable

```html
<div class="cat-card">
  <div class="cat-header">
    <div>
      <div class="cat-name">📡 Pixel & CAPI Health</div>
      <div class="cat-weight">Poids : 30%</div>
    </div>
    <div class="cat-score-badge" style="color:#ef4444;">38<span style="font-size:13px;color:#8b949e;">/100</span></div>
  </div>
  <div class="progress-bar"><div class="progress-fill" style="width:38%;background:linear-gradient(90deg,#ef4444,#f97316);"></div></div>
  <div class="cat-findings">
    ⚠️ <span>0 achat enregistré</span> — le pixel ne remonte aucun événement Purchase<br>
    ✅ Pixel + CAPI configurés selon le profil<br>
    ❌ Événements mid-funnel (ATC, IC) non tracés
  </div>
</div>
```

Trois choses à retenir :

- **Le poids est affiché** sous le nom. 30 % + 30 % + 20 % + 20 % = 100. Le
  lecteur peut refaire le calcul, donc il fait confiance au score.
- **La barre est un dégradé** dont les deux teintes suivent le niveau :
  rouge→orange sous 40, ambre→jaune autour de 50, vert→vert foncé au-dessus.
- **Les constats mélangent bon et mauvais** dans la même carte, préfixés
  ✅ / ⚠️ / ❌. Le fragment important est en encre pleine (`.cat-findings span`),
  le reste en encre faible : la valeur ressort, le commentaire recule.

## Les quick wins — impact × effort

```css
.qw-item { display: grid; grid-template-columns: 32px 1fr auto; gap: 16px; align-items: start; }
```

Trois colonnes : **numéro coloré par gravité · contenu · méta**. La colonne de
droite empile deux choses qui décident de l'ordre de traitement :

```html
<div class="qw-meta">
  <span class="qw-impact" style="background:rgba(239,68,68,0.15);color:#ef4444;">🔴 Critique</span>
  <span class="qw-time">⏱ 10-15 min</span>
</div>
```

**L'estimation de temps est ce qui rend l'audit actionnable.** « Critique,
2-5 min » se fait tout de suite ; « Medium, 30 min edit » attend. Sans le temps,
tout se vaut et rien ne se fait.

Chaque titre de quick win cite **les identifiants des checks concernés** —
« (M07, M04) », « (M14, M36) ». Le lien entre la recommandation et sa preuve est
explicite.

## Le titre de section à filet

```css
.section-title { display: flex; align-items: center; gap: 8px; }
.section-title::after { content: ''; flex: 1; height: 1px; background: #21262d; }
```

Le titre est suivi d'un trait qui court jusqu'au bord. Sépare sans peser.

## Le plan d'action — la couleur passe dans la bordure

```html
<div class="action-item" style="border-left:3px solid #ef4444;">
  <div class="action-num">1</div>
  <div class="action-text">Ouvrir Events Manager → vérifier que…<small>Impact : débloquer l'optimisation algorithmique</small></div>
  <div class="action-time">&lt; 15 min</div>
</div>
```

Contrairement aux quick wins, ici la priorité est portée par une **bordure
gauche** et le numéro reste neutre. Deux listes d'actions dans le même document,
deux traitements — elles ne se confondent pas.

## Deux choses éditoriales qui font la différence

### 1. Le document sort de son sujet

```html
<div class="alert-box">
  <div class="alert-icon">🔍</div>
  <div class="alert-content">
    <strong>3 questions business à poser au-delà de Meta :</strong><br>
    1. <strong>Taux de closing RDV → Vente :</strong> … votre cible CPA de 15€ implique
       que vous générez 1 client pour 15€, ce qui n'est pas réaliste.<br>
    2. <strong>Saisonnalité :</strong> Septembre = fin de saison piscine…<br>
    3. <strong>Qualité des leads :</strong> Le vrai KPI n'est pas le CPL mais le CPR.
  </div>
</div>
```

L'audit remet en cause **l'objectif du client lui-même** — « votre CPL cible de
15 € n'est pas réaliste ». Un audit qui ne fait que noter ce qu'on lui donne
n'est pas un audit.

### 2. Le document déclare ses propres limites

```html
<div class="footer">
  <p><strong>Audit Andromeda v1.5</strong> — Score : 47/100 · Grade D · Généré le 10 septembre 2026<br>
  Basé sur 30 jours de données réelles (11 août – 10 sept 2026) · <strong>28 checks
  évalués sur 50</strong> (22 N/A ou non vérifiables sans accès Events Manager direct)<br>
  <strong>Prochain audit recommandé :</strong> Dans 30 jours après implémentation des
  actions 1-4 — objectif cible : Score &gt; 65 / Grade C+</p>
</div>
```

Trois informations : d'où viennent les données, **ce qui n'a pas pu être
vérifié**, et quand refaire l'exercice avec quelle cible. Le « 28 sur 50 » est
ce qui rend le score honnête.

---

## Palette

| Rôle | Valeur |
|---|---|
| Fond | `#0d1117` (identique à l'exemplaire 01) |
| Surface | `#161b27` |
| Bordure | `#21262d` |
| Encre | `#e6edf3` · faible `#8b949e` |
| Accent | dégradé `#6366f1 → #a855f7` (tuile de marque, badge de version) |
| Pass / Warn / Fail | `#22c55e` · `#f59e0b` · `#ef4444` |

Méthode de couleur : **alpha sur le fond**, comme l'exemplaire 01 — 10 % pour la
sévérité, 15 % pour le résultat, 20 % pour les pastilles de quick win.

---

## Feuille de style complète

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0d1117; color: #e6edf3; min-height: 100vh; }

.header { background: linear-gradient(135deg, #1a1f35 0%, #0d1117 100%); border-bottom: 1px solid #21262d; padding: 28px 32px; display: flex; align-items: center; justify-content: space-between; }
.brand { display: flex; align-items: center; gap: 12px; }
.brand-icon { width: 40px; height: 40px; background: linear-gradient(135deg, #6366f1, #a855f7); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; }
.brand-text h1 { font-size: 18px; font-weight: 700; color: #fff; }
.brand-text p { font-size: 12px; color: #8b949e; margin-top: 2px; }
.audit-date { font-size: 12px; color: #8b949e; text-align: right; }

.score-hero { background: linear-gradient(135deg, #161b27 0%, #1a1f35 100%); border: 1px solid #21262d; margin: 24px 32px; border-radius: 16px; padding: 32px; display: grid; grid-template-columns: auto 1fr auto; gap: 32px; align-items: center; }
.score-ring { position: relative; width: 160px; height: 160px; }
.score-ring canvas { position: absolute; top: 0; left: 0; }
.score-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }
.score-number { font-size: 42px; font-weight: 800; color: #fff; line-height: 1; }
.score-denom { font-size: 14px; color: #8b949e; }
.score-info h2 { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 6px; }
.score-info p { font-size: 14px; color: #8b949e; line-height: 1.6; max-width: 480px; }

.grade-badge { background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.4); border-radius: 12px; padding: 16px 24px; text-align: center; }
.grade-letter { font-size: 56px; font-weight: 900; color: #f59e0b; line-height: 1; }
.grade-desc { font-size: 12px; color: #8b949e; margin-top: 4px; }

.section { margin: 0 32px 24px; }
.section-title { font-size: 14px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.section-title::after { content: ''; flex: 1; height: 1px; background: #21262d; }

.categories-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.cat-card { background: #161b27; border: 1px solid #21262d; border-radius: 12px; padding: 20px; }
.cat-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.cat-name { font-size: 14px; font-weight: 600; color: #e6edf3; }
.cat-score-badge { font-size: 20px; font-weight: 800; }
.cat-weight { font-size: 11px; color: #8b949e; margin-top: 2px; }
.progress-bar { height: 8px; background: #21262d; border-radius: 4px; overflow: hidden; margin-bottom: 8px; }
.progress-fill { height: 100%; border-radius: 4px; transition: width 1s ease; }
.cat-findings { font-size: 12px; color: #8b949e; line-height: 1.5; }
.cat-findings span { color: #e6edf3; }

.quick-wins { display: flex; flex-direction: column; gap: 12px; }
.qw-item { background: #161b27; border: 1px solid #21262d; border-radius: 12px; padding: 16px 20px; display: grid; grid-template-columns: 32px 1fr auto; gap: 16px; align-items: start; }
.qw-num { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
.qw-content h4 { font-size: 14px; font-weight: 600; color: #e6edf3; margin-bottom: 4px; }
.qw-content p { font-size: 12px; color: #8b949e; line-height: 1.5; }
.qw-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
.qw-impact { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 20px; white-space: nowrap; }
.qw-time { font-size: 11px; color: #8b949e; white-space: nowrap; }

.checks-table { width: 100%; border-collapse: collapse; }
.checks-table th { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; padding: 8px 12px; border-bottom: 1px solid #21262d; }
.checks-table td { font-size: 12px; color: #e6edf3; padding: 10px 12px; border-bottom: 1px solid #161b27; vertical-align: top; }
.checks-table tr:last-child td { border-bottom: none; }
.checks-table tr:hover td { background: rgba(255,255,255,0.02); }

.badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; letter-spacing: 0.3px; white-space: nowrap; }
.badge-pass { background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); }
.badge-warn { background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); }
.badge-fail { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
.badge-crit { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); font-size: 9px; }
.badge-high { background: rgba(245,158,11,0.1); color: #f59e0b; border: 1px solid rgba(245,158,11,0.2); font-size: 9px; }
.badge-med { background: rgba(99,102,241,0.1); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.2); font-size: 9px; }
.badge-low { background: rgba(100,116,139,0.1); color: #94a3b8; border: 1px solid rgba(100,116,139,0.2); font-size: 9px; }

.check-id { font-family: monospace; font-size: 11px; color: #6366f1; font-weight: 600; }
.finding-note { font-size: 11px; color: #8b949e; margin-top: 3px; }

.video-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.vm-card { background: #161b27; border: 1px solid #21262d; border-radius: 10px; padding: 16px; text-align: center; }
.vm-value { font-size: 28px; font-weight: 800; margin-bottom: 4px; }
.vm-label { font-size: 11px; color: #8b949e; }
.vm-bench { font-size: 10px; margin-top: 6px; padding: 2px 8px; border-radius: 20px; display: inline-block; }

.action-plan { display: flex; flex-direction: column; gap: 10px; }
.action-item { background: #161b27; border: 1px solid #21262d; border-radius: 10px; padding: 14px 18px; display: grid; grid-template-columns: 24px 1fr auto; gap: 12px; align-items: center; }
.action-num { font-size: 12px; font-weight: 700; color: #6366f1; }
.action-text { font-size: 13px; color: #e6edf3; }
.action-text small { display: block; font-size: 11px; color: #8b949e; margin-top: 2px; }
.action-time { font-size: 11px; color: #8b949e; white-space: nowrap; background: #21262d; padding: 3px 10px; border-radius: 20px; }

.alert-box { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); border-radius: 10px; padding: 14px 18px; margin-bottom: 12px; display: flex; gap: 12px; }
.alert-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
.alert-content { font-size: 13px; color: #fca5a5; line-height: 1.6; }
.alert-content strong { color: #ef4444; }

.info-box { background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.25); border-radius: 10px; padding: 14px 18px; margin-bottom: 12px; display: flex; gap: 12px; }
.info-content { font-size: 13px; color: #a5b4fc; line-height: 1.6; }

.tabs { display: flex; gap: 4px; margin-bottom: 16px; background: #161b27; border-radius: 10px; padding: 4px; border: 1px solid #21262d; width: fit-content; }
.tab { font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 7px; cursor: pointer; color: #8b949e; transition: all 0.2s; border: none; background: none; }
.tab.active { background: #21262d; color: #e6edf3; }
.tab-panel { display: none; }
.tab-panel.active { display: block; }

.footer { margin: 24px 32px; padding: 20px; background: #161b27; border: 1px solid #21262d; border-radius: 12px; }
.footer p { font-size: 12px; color: #8b949e; line-height: 1.7; }
.footer strong { color: #e6edf3; }

.andromeda-badge { display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2)); border: 1px solid rgba(99,102,241,0.4); border-radius: 20px; padding: 4px 12px; font-size: 11px; font-weight: 600; color: #a5b4fc; }
```

**Noter les onglets** : ici ce sont des pilules dans un conteneur à fond
(`.tabs { background:#161b27; border-radius:10px; padding:4px; width:fit-content }`),
pas des onglets à bordure basse comme l'exemplaire 03. Troisième traitement
d'onglet sur quatre exemplaires.

## Squelette de balisage

```html
<div class="header">
  <div class="brand">
    <div class="brand-icon">🔱</div>
    <div class="brand-text">
      <h1>Andromeda Meta Ads Audit</h1>
      <p>SB Piscine · Lead Gen · Région Occitanie / PACA</p>
    </div>
  </div>
  <div class="audit-date">
    <div style="font-size:13px;color:#e6edf3;font-weight:600;">10 Septembre 2026</div>
    <div>Données : 30 derniers jours</div>
    <div style="margin-top:4px;"><span class="andromeda-badge">⚡ Andromeda v1.5</span></div>
  </div>
</div>

<div class="score-hero">
  <div class="score-ring">
    <canvas id="scoreDonut" width="160" height="160"></canvas>
    <div class="score-center"><div class="score-number">47</div><div class="score-denom">/100</div></div>
  </div>
  <div class="score-info">
    <h2>Health Score : 47 / 100</h2>
    <p>Le compte présente des lacunes structurelles significatives — en particulier sur le
       <strong style="color:#ef4444;">tracking</strong>…</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <span class="badge badge-fail">3 Critiques</span>
      <span class="badge badge-warn">11 Warnings</span>
      <span class="badge badge-pass">14 Pass</span>
      <span style="font-size:12px;color:#8b949e;">sur 28 checks applicables</span>
    </div>
  </div>
  <div class="grade-badge">
    <div class="grade-letter">D</div>
    <div class="grade-desc">Action immédiate requise</div>
  </div>
</div>

<!-- Tuiles de métrique avec leur seuil -->
<div class="vm-card">
  <div class="vm-value" style="color:#ef4444;">32.9%</div>
  <div class="vm-label">Hold Rate (P25)</div>
  <div class="vm-bench" style="background:rgba(239,68,68,0.15);color:#ef4444;">❌ FAIBLE · Seuil : 70%</div>
</div>

<!-- Ligne de check : ID · nom · sévérité · résultat · observation + action -->
<tr>
  <td class="check-id">M04</td>
  <td>Event Match Quality (EMQ)</td>
  <td><span class="badge badge-crit">Critical</span></td>
  <td><span class="badge badge-fail">FAIL</span></td>
  <td>Aucun événement de conversion visible sur 30j → EMQ indéterminable
    <div class="finding-note">Objectif : EMQ ≥ 8.0 sur l'événement Lead</div>
  </td>
</tr>
```

---

# La partie texte

## Sa structure

```markdown
---
## 🔱 Andromeda Audit — SB Piscine · Synthèse Exécutive
### 🎯 Health Score : **47/100 — Grade D**
Voici le verdict complet basé sur les données réelles de votre compte.

---
## 📊 Breakdown par Catégorie

| Catégorie | Score | Poids | Verdict |
|---|---|---|---|
| 📡 Pixel & CAPI Health | **38/100** | 30% | 🔴 Critique — 0 conversion tracée |
| 🎨 Creative & Fatigue | **52/100** | 30% | 🟡 Moyen — Hook fort, rétention effondrée |
| 🏗️ Account Structure | **55/100** | 20% | 🟡 Moyen — Budget sous-dimensionné |
| 🎯 Audience & Targeting | **68/100** | 20% | 🟢 Correct — Adv+ activé, pas de first-party |

---
## 🚨 Les 3 Signaux d'Alarme Majeurs

**1. Zéro conversion trackée — 1 044€ dépensés à l'aveugle**
Sur 30 jours : 0 achat, 0 ATC, 0 IC remontés…

---
## ✅ Ce qui fonctionne bien
- **Hook Rate 32.8%** → excellent (seuil fort : 25%)
- **CPM 4.86€** → très efficace pour du local en France (benchmark immobilier : 22€)
…

---
## ⚡ Andromeda v1.5 — Point Spécifique
…

---
## 💡 3 Questions Business au-delà de Meta
1. **Votre CPL cible de 15€ est-il cohérent avec votre économie ?** …
```

## Ce que ça m'apprend

**« Ce qui fonctionne bien » est une section à part entière.** Cinq points, avec
leurs chiffres et leurs repères. Un audit qui n'énumère que les problèmes est
lu comme un procès et n'est pas appliqué. Aucun de mes prompts ne demande ça
aujourd'hui.

**Le verdict de catégorie tient en cinq mots** : « Hook fort, rétention
effondrée ». Pas une phrase, une formule.

**La fin varie d'un livrable à l'autre.** L'exemplaire 02 termine par « Veux-tu
que j'exécute l'une de ces actions ? ». Celui-ci termine sur les trois questions
business, sans rien proposer. Ma consigne actuelle — « termine par
`Prochaines étapes :` + trois puces » — est donc fausse dans les deux sens :
trop rigide, et pas toujours pertinente.
