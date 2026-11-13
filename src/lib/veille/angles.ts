/* Sans import : lu aussi par l'interface (Recréer), qui ne doit pas tirer sharp. */

/**
 * Les angles visuels des nouveaux concepts. Andromeda range ensemble les pubs
 * trop proches : chaque concept prend un angle différent, avec sa propre accroche.
 * `gabarit` (et `style`) : la mise en page HTML qui l'habille (gabarits.tsx).
 */
export const ANGLES_VISUELS = [
  { cle: 'situation', gabarit: 'photo', libelle: 'Mise en situation', consigne: 'une scène de vie réelle chez un client (maison, toiture, jardin, famille), photo pleine image' },
  { cle: 'ugc', gabarit: 'photo', libelle: 'UGC / amateur', consigne: 'une photo prise au smartphone par un client, cadrage spontané, lumière naturelle, look non publicitaire' },
  { cle: 'gros-plan', gabarit: 'photo', libelle: 'Gros plan', consigne: 'un gros plan détaillé sur le produit, la matière ou le geste de pose' },
  { cle: 'produit', gabarit: 'produit', libelle: 'Produit seul', consigne: 'le produit seul, bien éclairé, sur un fond simple aux couleurs de la marque' },
  { cle: 'avant-apres', gabarit: 'split', libelle: 'Avant / après', consigne: 'deux moitiés, la situation avant et après, nettement séparées et légendées' },
  { cle: 'ecran-partage', gabarit: 'split', libelle: 'Écran partagé', consigne: 'deux visuels côte à côte qui s’opposent (problème / solution), sans nommer de concurrent' },
  { cle: 'collage', gabarit: 'photo', libelle: 'Collage', consigne: 'un collage de 3 ou 4 photos, le titre posé au centre' },
  { cle: 'polaroid', gabarit: 'photo', style: 'polaroid', libelle: 'Polaroïd', consigne: 'une photo façon polaroïd posée sur une table, avec une légende manuscrite' },
  { cle: 'editorial', gabarit: 'editorial', libelle: 'Éditorial', consigne: 'comme un article de presse locale ou une publication de réseau social : titre, photo, texte court' },
  { cle: 'infographie', gabarit: 'liste', style: 'numeros', libelle: 'Infographie', consigne: 'des étapes ou des chiffres de la marque mis en forme avec des pictos, clair et lisible' },
  { cle: 'checklist', gabarit: 'liste', libelle: 'Check-list', consigne: 'une liste de 3 à 5 points cochés' },
  { cle: 'typo', gabarit: 'typo', libelle: 'Typographique', consigne: 'le texte seul, en très grand, sur un fond aux couleurs de la marque, sans photo' },
  { cle: 'promo', gabarit: 'typo', libelle: 'Offre promo', consigne: 'l’offre mise en avant comme une étiquette ou un macaron, très visible' },
  { cle: 'comparatif', gabarit: 'comparatif', libelle: 'Comparatif', consigne: 'deux colonnes : la marque face à la solution habituelle, sans nommer de concurrent' },
  { cle: 'minimaliste', gabarit: 'typo', style: 'minimaliste', libelle: 'Minimaliste', consigne: 'beaucoup d’espace vide, un seul élément visuel, un titre court' },
  { cle: 'temoignage', gabarit: 'editorial', style: 'citation', libelle: 'Témoignage', consigne: 'un avis client mis en avant, seulement s’il est donné dans l’offre ; sinon un bénéfice à la place' },
] as const
