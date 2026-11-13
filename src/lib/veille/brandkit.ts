import { anthropic } from '@/lib/anthropic'
import type { LectureSite } from './site'

/**
 * La charte d'un client tirée de son site par Claude : il lit les textes,
 * les couleurs et polices relevées dans le CSS, et regarde les logos et les
 * photos candidats. Il ne fait que proposer : rien n'est enregistré avant
 * validation dans le Brand kit.
 */

export const MODELE_BRANDKIT = 'claude-opus-5-5'
export const ROLES_COULEUR = ['principale', 'secondaire', 'accent', 'fond', 'texte'] as const

export type PropositionCharte = {
  nom: string
  slogan: string
  description: string
  proposition: string
  /** Index dans les logos montrés, -1 si aucun ne convient. */
  logo: number
  logoClair: number
  couleurs: { hex: string; role: (typeof ROLES_COULEUR)[number] }[]
  typoTitre: string
  typoTexte: string
  tonDeVoix: string
  motsAEmployer: string[]
  motsAEviter: string[]
  produits: { nom: string; description: string; prix: string; photo: number }[]
  /** Index des photos réelles à garder (chantiers, équipe, produit). */
  photos: number[]
  remarques: string
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['nom', 'slogan', 'description', 'proposition', 'logo', 'logoClair', 'couleurs', 'typoTitre', 'typoTexte', 'tonDeVoix', 'motsAEmployer', 'motsAEviter', 'produits', 'photos', 'remarques'],
  properties: {
    nom: { type: 'string' },
    slogan: { type: 'string' },
    description: { type: 'string' },
    proposition: { type: 'string' },
    logo: { type: 'integer' },
    logoClair: { type: 'integer' },
    couleurs: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['hex', 'role'], properties: { hex: { type: 'string' }, role: { type: 'string', enum: [...ROLES_COULEUR] } } },
    },
    typoTitre: { type: 'string' },
    typoTexte: { type: 'string' },
    tonDeVoix: { type: 'string' },
    motsAEmployer: { type: 'array', items: { type: 'string' } },
    motsAEviter: { type: 'array', items: { type: 'string' } },
    produits: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['nom', 'description', 'prix', 'photo'],
        properties: { nom: { type: 'string' }, description: { type: 'string' }, prix: { type: 'string' }, photo: { type: 'integer' } },
      },
    },
    photos: { type: 'array', items: { type: 'integer' } },
    remarques: { type: 'string' },
  },
} as const

const CONSIGNE = `Tu es directeur artistique et stratège de marque. À partir du site d'une entreprise (textes, couleurs et polices relevées dans son CSS, images), établis sa charte graphique pour produire ses publicités Meta. Réponds en français.
- nom, slogan (vide s'il n'y en a pas), description (ce qu'elle vend, deux phrases), proposition (ce qui la distingue, une phrase, tirée du site).
- logo : le numéro du logo principal parmi les logos montrés (-1 si aucun n'est le logo de l'entreprise) ; logoClair : celui fait pour les fonds sombres (blanc ou clair), -1 sinon.
- couleurs : 2 à 5 couleurs de marque en #rrggbb, chacune avec son rôle, la principale d'abord. Écarte les couleurs techniques (gris de bordure, noir et blanc des textes) sauf si elles font l'identité ; déduis-les du logo et des couleurs fréquentes du CSS.
- typoTitre et typoTexte : les polices réellement utilisées (relevées dans le CSS), vides si inconnues.
- tonDeVoix : 3 à 5 adjectifs ; motsAEmployer : le vocabulaire propre à la marque ; motsAEviter : ce qu'elle n'écrit jamais ou qui nuirait à son image.
- produits : ses produits ou offres présentés sur le site, avec le prix tel qu'affiché (vide sinon) et le numéro de la photo qui le montre (-1 sinon). N'invente rien.
- photos : les numéros des photos réelles utiles en publicité (chantiers, équipe, produit en situation) ; écarte bannières avec texte, icônes et photos génériques de banque d'images.
- remarques : ce que le site ne permet pas de savoir.`

/** Analyse par Claude. Lève une erreur lisible si Claude refuse ou ne rend rien. */
export async function chartePourSite(site: LectureSite): Promise<PropositionCharte> {
  const donnees = [
    `Site : ${site.url}`,
    `Titre : ${site.titre}`,
    site.description && `Description : ${site.description}`,
    `Couleurs du CSS (nombre d'occurrences) : ${site.couleurs.map((c) => `${c.hex} ×${c.n}`).join(', ') || 'aucune'}`,
    site.variables.length > 0 && `Variables CSS de couleur : ${site.variables.join(' ; ')}`,
    `Polices déclarées : ${site.polices.join(', ') || 'aucune'}`,
    `Textes du site :\n${site.texte}`,
  ].filter(Boolean).join('\n')
  const images = (liste: LectureSite['logos'], titre: string) =>
    liste.flatMap((img, i) => [
      { type: 'text' as const, text: `${titre} n° ${i} (${img.url})` },
      { type: 'image' as const, source: { type: 'base64' as const, media_type: img.type, data: img.octets.toString('base64') } },
    ])

  const reponse = await anthropic.beta.messages.create({
    model: MODELE_BRANDKIT,
    max_tokens: 16_000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    system: CONSIGNE,
    messages: [{ role: 'user', content: [{ type: 'text', text: donnees }, ...images(site.logos, 'Logo'), ...images(site.photos, 'Photo')] }],
  })
  if (reponse.stop_reason === 'refusal') throw new Error('Claude a refusé d’analyser ce site.')
  const texte = reponse.content.find((b) => b.type === 'text')
  if (!texte || texte.type !== 'text') throw new Error('Claude n’a rien rendu : réessayez.')
  const p = JSON.parse(texte.text) as PropositionCharte
  // Les numéros hors des listes montrées ne désignent rien.
  const dans = (i: number, n: number) => (Number.isInteger(i) && i >= 0 && i < n ? i : -1)
  return {
    ...p,
    logo: dans(p.logo, site.logos.length),
    logoClair: dans(p.logoClair, site.logos.length),
    couleurs: p.couleurs.filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex)).map((c) => ({ ...c, hex: c.hex.toLowerCase() })).slice(0, 6),
    produits: p.produits.slice(0, 12).map((x) => ({ ...x, photo: dans(x.photo, site.photos.length) })),
    photos: [...new Set(p.photos.map((i) => dans(i, site.photos.length)).filter((i) => i >= 0))],
  }
}
