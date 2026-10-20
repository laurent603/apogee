/**
 * La matrice de diversité créative, adaptée à la génération de prospects.
 *
 * Source : Curtis Howland, 67 000 publicités actives chez 106 marques D2C,
 * reprise par DHS Digital (édition #113, 20/10/2026). Douze concepts statiques
 * qui reviennent chez les marques qui scalent, et six axes à croiser.
 *
 * **Pourquoi cette grille existe.** Depuis Andromeda, Meta passe les visuels en
 * reconnaissance d'image pour juger la diversité créative d'un compte : plus les
 * créas se ressemblent, plus l'algorithme les traite comme une seule publicité.
 * Un compte sain maintient six à huit formats actifs en permanence ; les comptes
 * repris en audit en font tourner deux ou trois.
 *
 * **Pourquoi elle est réécrite ici.** La liste d'origine vend des objets.
 * « Product Hero », « Offre / Promo » et « Grille produit » n'ont pas le même
 * sens quand on vend un devis, une étude ou une installation : il n'y a pas de
 * produit à poser sur fond neutre, pas de code promo, et le panier se négocie.
 * Les douze concepts sont donc transposés — l'objet exposé devient le résultat,
 * la preuve ou le chiffrage. La mécanique cognitive de chacun est conservée,
 * c'est elle qui fait le travail.
 *
 * Les étages sont donnés en TOFU/MOFU/BOFU parce que la source les donne ainsi.
 * Le niveau de conscience de Schwartz reste l'axe qui décide, et c'est celui que
 * `PROMPTS.creativeStrategy.awareness` audite déjà.
 */

export const MATRICE_CREAS = `
## Les 12 formats de statiques — version génération de prospects

Un compte sain a des publicités actives dans **au moins 6 de ces 12 formats** à
tout moment. Le statique est la diversité la moins chère à produire : c'est là
qu'on la fabrique, pas en vidéo.

| # | Format | Étage | Ce qu'il fait | La variable à tester |
|---|---|---|---|---|
| 01 | **Résultat livré** | BOFU | Le chantier fini, l'installation en place, l'avant-après d'un cas réel. Sur une audience qui sait déjà ce qu'on vend, on enlève tout ce qui se met entre elle et la preuve que ça existe. | photo de chantier brute vs mise en scène léchée |
| 02 | **Preuve sociale / témoignage** | MOFU, BOFU | Verbatim client, note, nombre d'installations, caution d'expert ou de certification. Quand le prospect voit que d'autres comme lui ont signé, il arrête d'évaluer. | avis client vs caution technique vs mention presse |
| 03 | **Avant / après** | MOFU | L'état problème face au résultat. L'avant déclenche la reconnaissance du problème, l'après déclenche l'envie, l'offre relie les deux. Facture avant/après, installation avant/après, courbe de consommation. | découpe horizontale vs verticale vs deux factures côte à côte |
| 04 | **Schéma annoté** | MOFU | Le dispositif légendé, des bulles qui pointent un bénéfice précis. Indispensable sur un produit technique que personne ne sait décrire. | 3 annotations vs 5 vs éclaté complet |
| 05 | **Nous vs eux / comparatif** | TOFU, MOFU | Comparaison avec la situation actuelle, l'ancienne méthode ou le standard du métier. Le lecteur n'a pas à juger dans l'absolu, juste à être d'accord que c'est mieux que ce qu'il subit. | situation actuelle vs concurrent implicite vs concurrent nommé |
| 06 | **Capture / format natif** | TOFU | Conçu pour ressembler à de l'organique : capture de SMS, de devis, de relevé, réponse à un commentaire, photo prise au téléphone. Contourne le filtre à publicité et gagne la demi-seconde entre le scroll et le clic. | capture de SMS vs capture de facture vs réponse à un commentaire |
| 07 | **Grille / collage** | TOFU, MOFU | Plusieurs images en grille. Le cerveau veut balayer chaque case, ce qui augmente le temps passé, et chaque case traite une objection différente. | 4 chantiers vs chantier + équipe vs 4 objections |
| 08 | **Dispositif d'aide / échéance** | BOFU | Ce qui rend la décision urgente sans promotion : aide d'État, taux, quota, fin de dispositif, fenêtre d'installation avant la saison. L'équivalent du format promo, en lead gen. | échéance réglementaire vs quota vs contrainte de calendrier |
| 09 | **Moche / lo-fi** | TOFU | Texte manuscrit, annotation grossière, capture de l'app Notes, polices qui jurent. Dans un fil de créas léchées, ça crée une rupture et le cerveau ne l'enregistre pas comme une publicité. À écarter si la marque tient à sa charte. | note manuscrite vs annotation sur photo vs capture de Notes |
| 10 | **Chiffre clé** | MOFU | Un chiffre fort en héros de l'image : la statistique EST la créa. La précision inspire plus confiance qu'une affirmation qualitative. | chiffre de preuve sociale vs spécification technique vs économie annuelle |
| 11 | **Mème / culture** | TOFU | Format du moment, référence métier, humour de la profession. Le cerveau le traite comme du divertissement avant de le traiter comme de la publicité, et l'engagement fait baisser le coût de diffusion. | référence du moment vs blague de métier vs image de réaction |
| 12 | **Listicle « X raisons de »** | MOFU | Trois à cinq bénéfices listés, une mini page de vente en une image. La structure numérotée promet une quantité précise d'information et empile plusieurs preuves dans une seule impression. | 3 raisons vs 5 raisons |

## Les 6 axes de diversité

Varier le format sans varier le reste ne produit pas de diversité : l'algorithme
lit quand même de la répétition. Chaque créa se situe sur six axes.

- **Format** — les 12 ci-dessus. La plupart des comptes s'arrêtent à 2 ou 3.
- **Univers visuel** — créa léchée, lo-fi terrain, photo éditoriale, schéma technique
- **Angle** — douleur, aspiration, preuve, curiosité, humour, éducation
- **Persona** — même offre, autre interlocuteur, autre moment de décision
- **Offre** — étude gratuite, simulation, devis, audit, rappel, aucune offre
- **Niveau de conscience** — unaware, problem aware, solution aware, product aware

Un même produit décliné sur ces six axes donne vingt publicités réellement
distinctes. **Le niveau de conscience est celui qui décide** : on peut cocher
huit formats sur douze en ne parlant qu'à des gens déjà convaincus, et c'est le
défaut le plus courant. Sur un marché à éduquer, la majorité du volume doit
viser le haut de funnel — unaware et problem aware.

## Diversifier n'est pas répartir le budget

Tester large, et mettre l'argent sur ce qui gagne. Sur un compte sain, le haut du
classement prend 40 à 50 % du budget. Un budget partagé à parts égales entre
douze formats ne donne à aucun assez de conversions pour que Meta sache lequel
pousser.
`
