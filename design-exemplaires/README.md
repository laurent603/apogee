# Bibliothèque de mise en page

Des documents réels, fournis par Laurent, produits par Claude **sans aucune
consigne de forme** dans la demande d'origine. Ils servent de référence pour ce
qu'Apogee doit rendre.

Rien ici n'est importé par l'application. C'est de la matière de référence, pas
du code.

## Pourquoi cette bibliothèque

Trois tentatives ont échoué avant elle :

| Tentative | Résultat |
|---|---|
| Sept gabarits décrits en prose | Le modèle fabriquait des sections que personne n'avait demandées |
| Un vocabulaire de classes imposé | Tout se mettait à ressembler au vocabulaire |
| Une feuille de style unique tenue par l'app | Une banque d'angles entrait dans une peau de rapport d'entonnoir |
| Rien du tout | La qualité varie d'une génération à l'autre, imprévisible |

Ce qui manque entre « un moule » et « rien » : **l'amplitude**. Plusieurs
exemplaires complets et franchement différents montrent qu'un livrable se
dessine pour ce qu'il montre — ce qu'un gabarit unique ne peut pas dire.

## Index

| # | Livrable | Structure | Interaction | Palette |
|---|---|---|---|---|
| [01](01-banque-angles.md) | Banque d'angles | Accordéons + synthèse finale | Dépliage | GitHub dark `#0d1117` · accent `#58a6ff` |
| [02](02-revue-hebdo.md) | Revue hebdomadaire | 6 sections numérotées, de haut en bas | Aucune (survol seulement) | Ardoise `#0f1117` · accent `#6366f1` |
| [03](03-livrable-operationnel.md) | Livrable opérationnel | 2 onglets = 2 destinataires | Onglets + **boutons de copie** | Ardoise `#0f1117` · accent `#7c6af7` |
| [04](04-audit-andromeda.md) | Audit noté | Score → catégories → actions → preuves | Onglets en pilules | GitHub dark `#0d1117` · dégradé `#6366f1→#a855f7` |

Les exemplaires **02 et 04** ont aussi leur partie texte — voir la fin de leur
fiche. Ce sont elles qui définissent le contrat de sortie ci-dessous.

*(en attente des exemplaires suivants)*

---

## Ce qui est constant — 4 exemplaires sur 4

**Le cadre.** Document HTML complet et autonome — `<!DOCTYPE>`, `<head>`, son
propre `<style>`, ses scripts — dans un `<iframe sandbox="allow-scripts">`, avec
un script de hauteur en fin de `<body>`.

**Les données dans un tableau JS**, rendues par une fonction de gabarit. Jamais
de balisage recopié n entrées de suite. Dans l'exemplaire 02, le même tableau
alimente le tableau HTML **et** le graphique : une source, deux rendus.

**Fond sombre, typographie dense** (corps 11–13 px), micro-libellés en
majuscules espacées au-dessus de chaque valeur.

**Les états se lisent par la couleur *et* par la forme** — pastille, emoji,
bordure gauche, barre. Jamais par le mot seul.

**Un bloc « et alors ? » en fin de document.** Exemplaire 01 : compteurs, top 3,
manque identifié. Exemplaire 02 : alertes puis actions avec impact attendu.
Le document ne s'arrête jamais sur un relevé.

**Le jugement est écrit, pas laissé au lecteur.** Chaque carte de créa finit par
un verdict en prose coloré selon la conclusion ; chaque action porte son impact
attendu.

## Ce qui change à chaque fois

Palette, structure, interaction, vocabulaire de classes, densité — et jusqu'à la
méthode de couleur elle-même :

- **01** construit ses teintes en alpha sur le fond : `background: #8957e522;
  color: #bc8cff; border: 1px solid #8957e544` — fond 13 %, bordure 27 %, texte
  saturé.
- **02** utilise des fonds pleins très sombres : `#064e3b`, `#4c1d1d`,
  `#451a03`, `#1e3a5f`.

Les deux marchent. **Ne pas mélanger les deux méthodes dans un même document.**

La structure suit l'usage :

- On parcourt douze angles sans les lire tous → **accordéons**.
- On descend un bilan hebdomadaire une fois par semaine → **tout déplié**, dans
  l'ordre du raisonnement.
- On a deux destinataires différents → **deux onglets**, un par public.

Et le traitement d'onglet change à chaque fois qu'il apparaît : bordure basse
épaisse (03), pilules dans un conteneur à fond (04), sous-onglets de briefs.
Trois traitements pour un même besoin.

L'accent aussi : `#58a6ff` bleu, `#6366f1` indigo, `#7c6af7` violet, dégradé
`#6366f1→#a855f7`. Le fond se répète (01 et 04 partagent `#0d1117`, 02 et 03
`#0f1117`), l'accent jamais.

## Trois natures de livrable, trois postures

| | Le document… | Exemplaire |
|---|---|---|
| **Bibliothèque** | se parcourt et se filtre | 01 — banque d'angles |
| **Bilan** | se descend une fois, de haut en bas | 02 — revue hebdo |
| **Outil** | s'utilise : on y copie des textes pour les coller ailleurs | 03 — formulaire + brief |
| **Verdict** | se lit en une seconde, puis se creuse | 04 — audit noté |

C'est la nature du livrable qui commande la mise en page, pas une préférence
esthétique. Le savoir avant d'écrire une ligne de CSS est ce qui distingue un
document dessiné d'un gabarit rempli.

## Deux règles de placement, opposées et toutes deux justes

- **Exemplaire 02** rassemble les alertes en une section, parce qu'elles portent
  sur le compte entier.
- **Exemplaire 03** attache chaque avertissement au bloc qu'il vise — « ⚠️
  Réponse "Autre" : ne pas rappeler en priorité » vit dans la question 1.

La règle : **une alerte se place là où se trouve ce qu'elle concerne.**

## Ce que j'ai vu seulement dans le 04, et qui manque à mes prompts

**Une section « ce qui fonctionne bien ».** Cinq points, avec chiffres et
repères. Un rapport qui n'énumère que les problèmes est lu comme un procès et
n'est pas appliqué.

**Une estimation de temps sur chaque action** — « ⏱ 2-5 min », « ⏱ 30 min edit ».
C'est ce qui rend un plan actionnable : sans le temps, tout se vaut et rien ne
se fait.

**Le poids de chaque catégorie dans la note.** 30 + 30 + 20 + 20 = 100. Le
lecteur peut refaire le calcul, donc il fait confiance au score.

**Le document déclare ses propres limites.** « 28 checks évalués sur 50 (22 N/A
ou non vérifiables sans accès Events Manager) ». C'est ce qui rend le score
honnête.

**Le document sort de son sujet.** « Votre CPL cible de 15 € n'est pas
réaliste » — l'audit remet en cause l'objectif du client, pas seulement son
exécution.

**Deux badges de sens différent sur la même ligne** : la sévérité de la règle
(9 px, alpha 10 %) et le résultat pour ce compte (10 px, alpha 15 %). Même
teinte, poids visuel différent — un check *Critical* qui *PASS* ne se confond
pas avec un *Low* qui *FAIL*.

## La fin du texte n'est pas fixe

| Exemplaire | Comment ça finit |
|---|---|
| 02 | « Veux-tu que j'exécute directement l'une de ces actions ? » |
| 04 | Trois questions business, sans rien proposer |

Ma consigne actuelle — « termine par `Prochaines étapes :` + trois puces » — est
donc fausse dans les deux sens : trop rigide, et pas toujours pertinente. La fin
dépend de ce que le livrable appelle : une exécution, ou une décision du client.

---

## Le contrat de sortie — révisé par la partie texte de l'exemplaire 02

Une réponse, c'est **deux rendus du même rapport**, pas un résumé puis un
détail :

| | Contenu |
|---|---|
| **Le texte, dans le fil** | Ce qui se lit comme du texte : verdicts, tableaux courts, alertes, actions |
| **Le document, en dessous** | Ce qui a besoin d'une mise en page : tableau dense, graphique, cartes, couleurs par seuil |

La preuve : dans l'exemplaire 02, le texte reprend les sections 1, 3, 4, 5, 6 et
**saute la 2** — le tableau journalier de sept lignes sur huit colonnes avec ses
mini-barres. Elle n'existe que dans le document. Le graphique non plus n'a pas
d'équivalent texte.

Le texte n'est donc **pas un résumé de cinq cents mots**. C'est un rapport
complet, avec ses tableaux Markdown, ses `---` entre sections, ses titres à
emoji, et une citation en bloc réservée à ce qui est grave.

**Il finit par une offre d'exécution, pas par un sommaire** : « Veux-tu que
j'exécute directement l'une de ces actions (scale du MOFU, réactivation TOFU) ? »

À trancher au « go » : mes trois puces « Prochaines étapes » cliquables gardent
leur intérêt dans Apogee (un clic relance la demande). Mais leur forme doit
peut-être devenir cette question-là, avec les actions en propositions.

## L'habillage du cadre dans le fil

```html
<div class="ap-artifact-wrapper">
  <div class="ap-artifact-header">
    <span class="ap-artifact-title">SB Piscine — Weekly Performance Review (03–09 Sept. 2026)</span>
    <button class="ap-artifact-expand"><!-- lucide maximize2 --></button>
  </div>
  <iframe … style="border-radius: 0 0 var(--radius-xl) var(--radius-xl);"></iframe>
</div>
```

Une **barre de titre au-dessus du cadre**, qui porte le nom du document et le
bouton d'agrandissement. Le cadre n'est arrondi qu'en bas.

Dans Apogee j'ai fait autrement, et moins bien : le titre n'apparaît nulle part,
et le bouton flotte par-dessus le coin du document. À corriger.

---

## Question ouverte — à trancher au « go »

L'exemplaire 02 charge **Chart.js depuis un CDN**. La consigne actuelle
d'Apogee affirme « aucune ressource externe, le cadre n'a pas de réseau » —
**cette affirmation n'a jamais été vérifiée.**

À tester en premier : un `<script src="https://cdn.jsdelivr.net/npm/chart.js">`
se charge-t-il dans notre cadre (adresse `blob:`, `sandbox="allow-scripts"`,
sans `allow-same-origin`) ?

- **Si oui** : les graphiques deviennent possibles, et la consigne doit changer.
- **Si non** : l'interdire explicitement, et exiger les graphiques en CSS ou en
  SVG écrits à la main — ce que l'exemplaire 02 fait déjà pour ses mini-barres
  de tableau, sans aucune bibliothèque.


## Seconde question ouverte — le presse-papiers

L'exemplaire 03 met un bouton *Copier* sur chaque texte destiné à être collé
ailleurs, via `navigator.clipboard.writeText`.

Dans notre cadre, l'origine est opaque et l'API du presse-papiers exige un
contexte sécurisé, une activation par l'utilisateur, et souvent une permission
`clipboard-write` déclarée sur l'iframe.

À tester avec Chart.js. Trois issues possibles :

1. Ça marche tel quel → rien à faire.
2. Il faut ajouter `allow="clipboard-write"` sur le cadre → une ligne.
3. Ça ne passe pas → repli sur `document.execCommand('copy')` avec un
   `<textarea>` temporaire, ou renoncer aux boutons.

L'enjeu n'est pas cosmétique : sans copie, un livrable dont la raison d'être est
de fournir des textes à coller perd l'essentiel de son utilité.

---

## Les deux questions techniques — TRANCHÉES

Testé le 10/09/2026 dans le cadre exact d'Apogee : adresse `blob:`,
`sandbox="allow-scripts"`, sans `allow-same-origin`.

| | Résultat |
|---|---|
| `<script src="https://cdn.jsdelivr.net/npm/chart.js">` | ✅ **se charge et dessine** |
| `navigator.clipboard.writeText()` | ❌ `NotAllowedError` |
| idem + `allow="clipboard-write"` sur l'iframe | ❌ `NotAllowedError` — l'origine opaque ne peut pas recevoir la permission |
| `document.execCommand('copy')` + `<textarea>` temporaire | ✅ **fonctionne** |

**Conséquences :**

1. Ma consigne « aucune ressource externe, le cadre n'a pas de réseau » était
   **fausse**. Les graphiques Chart.js sont possibles.
2. Les boutons de copie sont possibles, mais **pas** avec l'API moderne. Le
   repli `execCommand` marche — l'application fournit donc l'aide, le modèle
   n'a qu'à l'appeler.
