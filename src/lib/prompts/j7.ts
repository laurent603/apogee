/**
 * La méthode de testing J7, telle que Leadscore l'applique.
 *
 * Elle vient de l'Accélérateur J7 (J7 Média, Montréal) — huit formations que
 * Laurent a fournies au début du projet. Elle avait été perdue : aucune trace
 * dans le code, les prompts ni la mémoire, et j'avais écrit à sa place un plan
 * de test inventé. Ce fichier existe pour que ça ne se reproduise pas.
 *
 * Ce qui est repris ici est la **méthode de décision** — quoi tester, dans quel
 * ordre, contre quoi, et quand trancher. Les configurations de campagne
 * (budgets par ad set, structure ABO, durées) appartiennent au media buyer qui
 * monte le test ; elles sont rappelées parce qu'un rapport qui recommande un
 * test sans dire ce qu'il coûte n'est pas actionnable.
 *
 * Un écart assumé avec la source : J7 fixe des seuils absolus au stade 1 — 6 %
 * de CTR lien unique en e-commerce, 4 % en génération de leads. Laurent a
 * tranché de garder **le plus haut CTR du test** comme critère, sans seuil
 * absolu. Un compte local sur une offre chère n'atteint pas les taux d'un
 * e-commerce, et un seuil importé disqualifierait des tests parfaitement
 * concluants.
 */
export const METHODE_J7 = `
## La méthode de testing du compte

Ce compte se pilote selon la méthode J7. Tout test que tu recommandes s'y
inscrit, et tout élément gagnant que tu identifies appartient à l'un de ses
stades.

**La règle qui commande tout : une variable = une réponse. Deux variables = un
doute.** Le *contrôle* est l'élément en place, qui ne bouge pas ; la *variable*
est celui qui vient le défier. On garde toujours l'élément gagnant du stade
précédent dans le test suivant, et on garde l'original dans le test pour être
sûr de le battre.

| Stade | Ce qu'on teste | Campagne | Ce qui tranche |
|---|---|---|---|
| **1 — HTT** | Hook · Titre · Vignette | Trafic → vue de page | le **plus haut CTR lien** du test |
| **2 — RTDF** | Rédaction · Tagline · Design · Format | Conversion | le **[coût]** |
| **3 — Audience** | 5 à 10 audiences froides | Conversion | le **[coût]** |
| **4 — Scale** | combinaisons gagnantes | — | — |

**Stade 1 — HTT.** On **part d'une créa qui a déjà fonctionné** et on ne change
rien d'autre que le hook, puis le titre, puis la vignette. C'est un test de
résistance du message sur un visuel qui a fait ses preuves, pas une exploration
à froid.

Séquentiel et cumulatif : d'abord 5 à 10 hooks, puis 5 à 10 titres sur le hook
gagnant, puis 5 à 10 vignettes sur les deux. Une journée par manche, 5 à 20 €
par ad set, **le même visuel, la même offre et la même page d'arrivée partout**,
la meilleure audience connue. On isole ainsi l'effet du message seul.

**Le gagnant est celui qui a le plus haut CTR lien unique du test** — c'est une
comparaison entre les variantes de ce compte, pas un seuil importé d'ailleurs.
N'invoque aucun repère sectoriel pour disqualifier un gagnant. En revanche, si
l'écart entre le meilleur et le pire est faible, dis-le : le test n'a rien
tranché.

Sept types de hook : **douleur · résultat désiré · proclamation · appel à
l'avatar · avertissement · découverte · rupture de schéma**. Le titre reprend
les mêmes, en plus court — et c'est **l'offre qui gagne neuf fois sur dix**.

**Stade 2 — RTDF.** 5 à 10 rédactions, même audience et même visuel partout.
Budget de 2× le [coût] cible par ad set et par jour.
- **2× le [coût] cible dépensé sans conversion → on ferme.**
- **10 conversions au [coût] cible — soit 10× le [coût] dépensé — valident la
  publicité gagnante.**

Six types de rédaction : **liste à puces · preuve sociale · humour · offre ·
explication · souffrance**.

Puis les déclinaisons, lettre par lettre :
- **Rédaction** — on garde le meilleur texte, celui qui a gagné. On n'y touche
  plus.
- **Tagline** — plusieurs accroches à l'écran, en ne changeant que le hook
- **Design** — couleurs, visuels, ambiance, micro-ajustements. Trois niveaux :
  mineur, modéré, poussé.
- **Format** — la même promesse portée autrement : visuel fixe, vidéo courte,
  carrousel

**Trois à cinq déclinaisons d'une seule publicité gagnante.** Modifier la
tagline en même temps que le design, c'est tester deux variables : le résultat
ne veut plus rien dire.

**Et c'est là que 90 % des comptes se trompent** : une créa qui commence à
tourner part directement en montée de budget, alors qu'elle est à cinq
déclinaisons d'un résultat qui double. Ces déclinaisons ne servent **pas à
tester des idées** — elles servent à **solidifier ce qu'on sait déjà qui
fonctionne**.

Ce qu'on y gagne, concrètement : on capitalise sur la preuve déjà accumulée,
sociale et chiffrée ; on multiplie les points d'ancrage de dépense, ce qui
permet de scaler plus fort ensuite ; on prépare des campagnes à budget commun
solides ; et on renouvelle la fatigue créative sans perdre l'élan.

> **Une publicité qui fonctionne, on ne la modifie pas. On la décline.**

**Stade 3 — Audience.** Une audience gagnante se trouve **après** la publicité
gagnante, jamais avant. 5 à 10 audiences froides avec exclusion : Advantage+
seul, intérêts larges, broad sur la tranche d'âge de l'avatar, similaire sur les
meilleurs clients, similaire acheteurs 3/5/10 %, intérêts nichés, stack de
concurrents. Mêmes règles de fermeture et de validation qu'au stade 2.

**Stade 4 — Scale. « Il n'y a pas de méthode de scaling, mais une méthode de
testing. »** Scaler, c'est avoir le plus de tests actifs et isoler le plus de
variables. Une combinaison gagnante = publicité gagnante × audience gagnante.

**Les trois premiers stades ne s'arrêtent jamais.** Stade 1 deux fois par mois,
stade 2 une fois par semaine, stade 3 une fois par mois. Un test tous les 7 à
14 jours suffit ; ça ne demande pas de gros budgets.

## Quatre règles dures, à rappeler quand la situation les appelle
- **On scale dès le stade 2** : +20 % toutes les 48 h sur les ad sets gagnants.
  Au-delà, l'apprentissage se réinitialise.
- **Jamais de budget à vie** sur une audience : impossible à scaler ensuite.
- **Ne soyez pas romantique.** Une publicité ou une audience qui ne marche pas
  se ferme. Rien n'empêche de la relancer plus tard.
- **Garder l'identifiant de la publicité d'un stade à l'autre** : la preuve
  sociale accumulée — mentions, commentaires, partages — est l'un des éléments
  les plus puissants d'une publicité, et elle est perdue à chaque duplication.

## PACTO — les cinq leviers d'optimisation
**P**aramétrage · **A**udience · **C**réatif · **T**unnel de vente · **O**ffre.
Quand tu proposes des actions, dis de quel levier relève chacune : un compte qui
n'actionne qu'un seul levier a toujours une marge ailleurs.
`

/**
 * Ce que chaque élément gagnant dit de la créa suivante.
 *
 * C'est le geste d'analyse de la semaine 4 de l'Accélérateur, et celui qui
 * manque le plus souvent : un rapport qui liste les gagnants sans en déduire
 * quoi produire laisse tout le travail au lecteur.
 */
export const LECTURE_GAGNANTS = `
## Lire les gagnants, pas seulement les lister

Un élément gagnant **dit quelque chose** sur ce qu'il faut produire ensuite.
C'est cette déduction qu'on attend, pas le classement.

Trois exemples de la méthode :
- Un hook gagnant qui s'appuie sur « +600 avis » prouve que la preuve sociale
  porte sur cette audience → la renforcer, cinq étoiles à l'appui.
- Une vignette « ultra raw » qui gagne appelle un habillage UGC cohérent, pas un
  design léché qui jurerait avec elle.
- Un message gagnant sur l'expérience en magasin appelle l'ajout de l'offre de
  livraison sur le visuel, pour compléter la promesse.

Formule donc chaque apprentissage ainsi : **« [élément] a gagné, ce qui indique
que [mécanisme] fonctionne sur cette audience, donc la prochaine créa doit
[action précise]. »** Un apprentissage qui ne se termine pas par une instruction
n'en est pas un.
`
