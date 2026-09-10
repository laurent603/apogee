# Exemplaire 03 — Livrable opérationnel (formulaire Meta + brief client)

**Livrable** : les textes exacts d'un formulaire Meta Lead Ads, plus le brief à
envoyer au client. Deux onglets, **deux destinataires**.

**Cadre** : `<iframe srcdoc="…" sandbox="allow-scripts">`, document complet,
script de hauteur en fin de `<body>`.

---

## Ce qui est nouveau : le document est un outil

Les exemplaires 01 et 02 se **lisent**. Celui-ci s'**utilise**. Chaque texte
destiné à être collé ailleurs porte un bouton *Copier*.

```js
function copyBlock(btn) {
  const content = btn.previousElementSibling.textContent;
  navigator.clipboard.writeText(content).then(() => {
    btn.textContent = '✓ Copié';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copier'; btn.classList.remove('copied'); }, 2000);
  });
}
```

Le bouton confirme puis revient à son état initial après deux secondes. Le
contenu à copier est en `white-space: pre-wrap` : les sauts de ligne et la
syntaxe WhatsApp (`*gras*`) survivent au collage.

### ⚠️ Deuxième question technique pour Apogee

`navigator.clipboard.writeText` dans un cadre `sandbox="allow-scripts"` **sans**
`allow-same-origin` : l'origine est opaque, et l'API du presse-papiers exige un
contexte sécurisé, une activation par l'utilisateur, et souvent une permission
`clipboard-write` déclarée sur l'iframe.

**À tester au même titre que Chart.js.** Si ça ne passe pas, il faudra soit
ajouter `allow="clipboard-write"` sur le cadre, soit se rabattre sur un
`document.execCommand('copy')` avec un `<textarea>` temporaire, soit renoncer
aux boutons de copie et rendre le texte sélectionnable proprement.

## Deux onglets pour deux destinataires

C'est la différence avec les onglets d'un rapport : ils ne découpent pas un
raisonnement, ils **séparent des publics**.

| Onglet | Pour qui | Contenu |
|---|---|---|
| 📋 Formulaire Meta | L'opérateur | Textes à coller dans le Leads Center |
| 📨 Brief Client | Le client | KPI, 3 actions, seuils de surveillance, message WhatsApp |

## Palette — ardoise / violet

| Rôle | Valeur |
|---|---|
| Fond | `#0f1117` (identique à l'exemplaire 02) |
| Surface | `#1a1d2e` · `#1e2235` |
| Bordure | `#2d3154` |
| Accent | **`#7c6af7`** (violet — différent de l'indigo `#6366f1` du 02) |
| Bon / Alerte / Mauvais | `#10b981` `#f59e0b` `#ef4444` |

Troisième exemplaire, troisième accent. Le fond peut se répéter, l'accent non.

## Les dispositifs

### 1. L'échelle de qualification appliquée aux options

Chaque réponse possible du formulaire est colorée selon ce qu'elle vaut comme
signal commercial — chaud, tiède, froid, neutre — et porte un badge A/B/C.

```css
.option.hot     { background: rgba(16,185,129,.12); border: 1px solid rgba(16,185,129,.25); color: #6ee7b7; }
.option.warm    { background: rgba(245,158,11,.10); border: 1px solid rgba(245,158,11,.20); color: #fcd34d; }
.option.cold    { background: rgba(239,68,68,.10);  border: 1px solid rgba(239,68,68,.20);  color: #fca5a5; }
.option.neutral { background: rgba(148,163,184,.08); border: 1px solid rgba(148,163,184,.15); color: #cbd5e1; }
```

Même méthode qu'à l'exemplaire 01 — alpha faible sur le fond, bordure un peu
plus marquée, texte saturé — appliquée à une autre taxonomie. **La méthode se
transporte, les valeurs non.**

Le badge est poussé à droite par `margin-left: auto`. Une ligne d'option se lit
donc : puce, libellé, verdict.

### 2. Le « pourquoi » sous chaque élément

```html
<div class="q-number">Question 1 — Filtre géographique</div>
<div class="q-title">Votre projet est situé dans quel département ?</div>
<div class="q-why">Objectif : éliminer les hors-zone immédiatement. Liste
  déroulante avec "Autre" comme signal d'alerte.</div>
```

`.q-why` est en italique, 12 px, encre faible. **C'est ce qui fait la différence
entre un formulaire et un brief** : chaque élément dit pourquoi il existe.

Sur la question budget, le « pourquoi » est même un avertissement de méthode :
« ⚠️ Ne jamais demander *Quel est votre budget ?* — les gens sous-estiment ou ne
savent pas. Cette formulation est moins intrusive. »

### 3. L'avertissement attaché à ce qu'il concerne

```html
<div class="alert-box"><strong>⚠️ Réponse "Autre" :</strong> ne pas rappeler en
  priorité. Envoyer un email de redirection ou simplement ne pas traiter.</div>
```

L'alerte est **dans** le bloc de la question, juste sous l'option qu'elle vise.
Pas rassemblée en fin de document. Contraste avec l'exemplaire 02, où les
alertes sont regroupées en section 5 — parce qu'elles y portent sur le compte,
pas sur un élément précis.

### 4. Le tableau de seuils — une table de référence, pas de mesure

| Métrique | ✅ Normal | ⚠️ À surveiller | 🚨 Alarme |
|---|---|---|---|
| Coût par lead (CPL) | < 15€ | 15€ – 25€ | > 25€ |
| Nb de leads / semaine | 8 – 15 | 5 – 7 | < 5 |
| % leads Score A | > 30% | 20 – 30% | < 20% |
| Taux de RDV | > 35% | 25 – 35% | < 25% |

Aucune valeur mesurée là-dedans : **ce sont les règles**, données au client pour
qu'il se surveille lui-même. Les en-têtes portent l'emoji de gravité, les
cellules la couleur correspondante (`.ok` / `.warn` / `.danger`).

Une deuxième ligne en `<small>` précise le calcul quand il est ambigu :
« Taux de RDV » + *(leads → RDV confirmés)*.

### 5. Les KPI en « où on en est → où on va »

```html
<div class="kpi-label">Taux de RDV actuel</div>
<div class="kpi-now">~17%</div>
<div class="kpi-target kpi-arrow">→ Objectif : 40-50% avec le nouveau formulaire</div>
```

Différent de l'exemplaire 02, qui compare à la période précédente. Ici la
comparaison est à l'objectif — parce que le livrable est un plan, pas un bilan.

### 6. Le bloc WhatsApp

Traitement visuel à part : fond vert sombre `#1a2e1a`, bordure `#2d4a2d`, texte
`#d1fae5`. Il ne ressemble à rien d'autre dans le document, parce qu'il n'a pas
la même fonction — c'est un message à envoyer, pas une information à lire.

Le texte est écrit **dans le ton du destinataire** : tutoiement, emoji, syntaxe
WhatsApp `*gras*`, et une question pour finir. Le bouton de copie est déplacé
sous le bloc (`position: relative; display: block`) au lieu de flotter en haut à
droite comme sur les `.copy-block`.

---

## Structure

```
.tabs                    2 onglets, bordure basse 3px sur l'actif
  .tab.active

.panel#tab-formulaire    max-width 860px, centré
  h1 + .subtitle
  h2  « 🏷️ En-tête du formulaire »
    .copy-block × 2      [libellé] [contenu] [bouton Copier]
    .tip-box             conseil de paramétrage
  h2  « ❓ Les 4 questions »
    .question-block × 4
      .q-number          pilule violette
      .q-title
      .q-why             italique, encre faible
      .option × n        colorées hot/warm/cold/neutral + badge A/B/C
      .alert-box         l'avertissement attaché à cette question
  h2  « ✅ Message de confirmation »
    .copy-block × 3
    .tip-box

.panel#tab-brief
  h1 + .subtitle
  h2  « 📊 Là où on en est »
    .kpi-grid 2×2        [libellé] [valeur] [→ objectif]
  h2  « ✅ 3 actions à faire cette semaine »
    .action-item × 3     [pastille ronde numérotée] [titre] [description]
  h2  « 👁️ Tableau de bord »
    .watch-table         seuils normal / surveiller / alarme
  .divider
  h2  « 📱 Message WhatsApp »
    .whatsapp-block      fond vert, texte pre-wrap, bouton de copie
```

Noter la pastille d'action : **ronde** ici (`border-radius: 50%`, 28 px, fond
violet plein), alors que l'exemplaire 02 utilisait un gros chiffre nu de 22 px.

---

## Feuille de style complète

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; }

.tabs { display: flex; background: #1a1d2e; border-bottom: 1px solid #2d3154; }
.tab { padding: 14px 28px; cursor: pointer; font-weight: 600; font-size: 14px; color: #94a3b8; border-bottom: 3px solid transparent; transition: all .2s; }
.tab.active { color: #7c6af7; border-bottom-color: #7c6af7; background: #1e2235; }
.tab:hover:not(.active) { color: #cbd5e1; background: #1c1f30; }

.panel { display: none; padding: 32px; max-width: 860px; margin: 0 auto; }
.panel.active { display: block; }

h1 { font-size: 22px; font-weight: 700; color: #f1f5f9; margin-bottom: 6px; }
h2 { font-size: 16px; font-weight: 700; color: #7c6af7; margin: 28px 0 12px; text-transform: uppercase; letter-spacing: .5px; }
h3 { font-size: 14px; font-weight: 600; color: #cbd5e1; margin: 18px 0 8px; }
.subtitle { font-size: 13px; color: #64748b; margin-bottom: 24px; }

.copy-block { background: #1e2235; border: 1px solid #2d3154; border-radius: 10px; padding: 18px 20px; margin-bottom: 16px; position: relative; }
.copy-block .label { font-size: 11px; font-weight: 700; color: #7c6af7; text-transform: uppercase; letter-spacing: .8px; margin-bottom: 8px; }
.copy-block .content { font-size: 14px; color: #e2e8f0; line-height: 1.7; white-space: pre-wrap; }
.copy-btn { position: absolute; top: 14px; right: 14px; background: #7c6af7; color: #fff; border: none; border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer; font-weight: 600; transition: background .2s; }
.copy-btn:hover { background: #6355d4; }
.copy-btn.copied { background: #10b981; }

.question-block { background: #1a1d2e; border: 1px solid #2d3154; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.question-block .q-number { display: inline-block; background: #7c6af7; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; margin-bottom: 10px; }
.question-block .q-title { font-size: 15px; font-weight: 700; color: #f1f5f9; margin-bottom: 6px; }
.question-block .q-why { font-size: 12px; color: #64748b; margin-bottom: 12px; font-style: italic; }
.option { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 6px; margin-bottom: 6px; font-size: 13px; }
.option.hot { background: rgba(16,185,129,.12); border: 1px solid rgba(16,185,129,.25); color: #6ee7b7; }
.option.warm { background: rgba(245,158,11,.1); border: 1px solid rgba(245,158,11,.2); color: #fcd34d; }
.option.cold { background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.2); color: #fca5a5; }
.option.neutral { background: rgba(148,163,184,.08); border: 1px solid rgba(148,163,184,.15); color: #cbd5e1; }
.badge { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; margin-left: auto; }
.badge.a { background: #10b981; color: #fff; }
.badge.b { background: #f59e0b; color: #000; }
.badge.c { background: #ef4444; color: #fff; }

.alert-box { background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.25); border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #fca5a5; margin: 10px 0; }
.alert-box strong { color: #ef4444; }
.tip-box { background: rgba(124,106,247,.1); border: 1px solid rgba(124,106,247,.25); border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #c4b5fd; margin: 10px 0; }

/* BRIEF CLIENT */
.kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
.kpi-card { background: #1e2235; border: 1px solid #2d3154; border-radius: 10px; padding: 16px; }
.kpi-card .kpi-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
.kpi-card .kpi-now { font-size: 22px; font-weight: 700; color: #e2e8f0; }
.kpi-card .kpi-target { font-size: 13px; color: #10b981; margin-top: 2px; }
.kpi-card .kpi-arrow { color: #10b981; }

.action-item { display: flex; gap: 14px; align-items: flex-start; background: #1a1d2e; border: 1px solid #2d3154; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
.action-num { background: #7c6af7; color: #fff; font-weight: 700; font-size: 13px; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
.action-content .action-title { font-size: 14px; font-weight: 700; color: #f1f5f9; margin-bottom: 4px; }
.action-content .action-desc { font-size: 13px; color: #94a3b8; line-height: 1.5; }

.watch-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.watch-table th { background: #1e2235; color: #7c6af7; font-weight: 700; text-align: left; padding: 10px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
.watch-table td { padding: 10px 14px; border-bottom: 1px solid #1e2235; color: #cbd5e1; }
.watch-table tr:hover td { background: rgba(124,106,247,.05); }
.ok { color: #10b981; font-weight: 600; }
.warn { color: #f59e0b; font-weight: 600; }
.danger { color: #ef4444; font-weight: 600; }

.whatsapp-block { background: #1a2e1a; border: 1px solid #2d4a2d; border-radius: 10px; padding: 20px; margin-top: 16px; position: relative; }
.whatsapp-block .label { font-size: 11px; font-weight: 700; color: #4ade80; text-transform: uppercase; letter-spacing: .8px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
.whatsapp-block .content { font-size: 13px; color: #d1fae5; line-height: 1.8; white-space: pre-wrap; }

.divider { height: 1px; background: #2d3154; margin: 24px 0; }
```

## Squelette de balisage

```html
<div class="tabs">
  <div class="tab active" onclick="showTab('formulaire')">📋 Formulaire Meta</div>
  <div class="tab" onclick="showTab('brief')">📨 Brief Client</div>
</div>

<div class="panel active" id="tab-formulaire">
  <h1>Formulaire Meta Lead Ads</h1>
  <p class="subtitle">Textes prêts à copier-coller dans le Leads Center Meta</p>

  <h2>🏷️ En-tête du formulaire</h2>
  <div class="copy-block">
    <div class="label">Titre du formulaire</div>
    <div class="content">Étude gratuite — Piscine coque sur mesure</div>
    <button class="copy-btn" onclick="copyBlock(this)">Copier</button>
  </div>

  <div class="tip-box">⚙️ Paramètre critique dans Meta : choisir <strong>"Haute intention"</strong>…</div>

  <h2>❓ Les 4 questions</h2>
  <div class="question-block">
    <div class="q-number">Question 1 — Filtre géographique</div>
    <div class="q-title">Votre projet est situé dans quel département ?</div>
    <div class="q-why">Objectif : éliminer les hors-zone immédiatement.</div>
    <div class="option hot">○ Hérault (34) <span class="badge a">Score A</span></div>
    <div class="option warm">○ Aude (11) <span class="badge b">Score B</span></div>
    <div class="option cold">○ Autre département → champ texte <span class="badge c">Alerte</span></div>
    <div class="alert-box"><strong>⚠️ Réponse "Autre" :</strong> ne pas rappeler en priorité.</div>
  </div>
</div>

<div class="panel" id="tab-brief">
  <h2>📊 Là où on en est</h2>
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Taux de RDV actuel</div>
      <div class="kpi-now">~17%</div>
      <div class="kpi-target kpi-arrow">→ Objectif : 40-50% avec le nouveau formulaire</div>
    </div>
  </div>

  <h2>✅ 3 actions à faire cette semaine</h2>
  <div class="action-item">
    <div class="action-num">1</div>
    <div class="action-content">
      <div class="action-title">Créer le nouveau formulaire Meta</div>
      <div class="action-desc">Où, comment, et le paramètre à ne pas rater.</div>
    </div>
  </div>

  <h2>👁️ Tableau de bord</h2>
  <table class="watch-table">
    <thead><tr><th>Métrique</th><th>✅ Normal</th><th>⚠️ À surveiller</th><th>🚨 Alarme</th></tr></thead>
    <tbody>
      <tr>
        <td><strong>Taux de RDV</strong><br><small>(leads → RDV confirmés)</small></td>
        <td class="ok">&gt; 35%</td><td class="warn">25 – 35%</td><td class="danger">&lt; 25%</td>
      </tr>
    </tbody>
  </table>

  <div class="divider"></div>

  <h2>📱 Message WhatsApp à envoyer au client</h2>
  <div class="whatsapp-block">
    <div class="label">💬 WhatsApp — À copier</div>
    <div class="content" id="whatsapp-text">Bonjour [Prénom] 👋 …</div>
    <button class="copy-btn" style="position:relative; top:0; right:0; margin-top:14px; display:block;"
            onclick="copyWhatsapp(this)">Copier le message</button>
  </div>
</div>
```

## Script

```js
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  event.target.classList.add('active');   // ⚠️ dépend du `event` implicite
}
```

> Note Apogee : `event.target` sans paramètre d'événement ne marche que dans les
> navigateurs qui exposent `window.event`. À remplacer par une recherche du
> bouton dont l'`onclick` cite le nom de l'onglet, comme je l'avais fait dans
> `SCRIPT_CADRE`.
