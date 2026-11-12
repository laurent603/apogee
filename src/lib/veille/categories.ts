/**
 * Les catégories de Discovery : celles de Créabase, plus « Énergie &
 * rénovation » — le métier des clients Leadscore, que Créabase range dans
 * « Maison & Jardin ». Une catégorie se porte par marque.
 */
export const CATEGORIES = [
  'Énergie & rénovation',
  'Maison & Jardin',
  'Électroménager',
  'Immobilier',
  'Services financiers',
  'Services aux entreprises',
  'Santé & Médical',
  'Beauté & Soins',
  'Mode & Accessoires',
  'Alimentation & Boissons',
  'Bébé, Enfants & Maternité',
  'Fitness, Sport & Plein air',
  'Animaux',
  'Automobile & Transport',
  'Voyage & Hôtellerie',
  'Éducation',
  'Tech & Électronique',
  'Jeux vidéo',
  'E-commerce',
  'Autre',
] as const

export type Categorie = (typeof CATEGORIES)[number]
export const estCategorie = (v: unknown): v is Categorie => typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v)
