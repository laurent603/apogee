/**
 * « Décortiquer cette pub » : Gemini regarde la vidéo (image et son) ou
 * l'image, et rend l'accroche, l'angle, le concept, la structure et la
 * transcription horodatée. Claude ne lit pas l'audio d'une vidéo ; Gemini le
 * fait en un seul appel.
 */

import type { Jointe, TexteImpose } from './recreer'

// Mesuré le 13/11/2026 : 3.5-flash, 3.6-flash et 3.5-flash-lite répondent en
// 1 à 3 s quand 3.7 et 3.8 sont saturés ; l'alias gemini-flash-latest ne
// répondait pas en 40 s. gemini-2.5-flash n'est plus ouvert aux nouveaux comptes.
const MODELES = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite']
const DELAI_PAR_MODELE = 40_000
// Sous les 120 s accordées aux routes : deux passages sur les modèles au plus.
const BUDGET = 95_000
// La requête inline plafonne à 20 Mo, base64 compris.
const TAILLE_MAX = 14 * 1024 * 1024

export type Decorticage = {
  accroche: string
  angle: string
  concept: string
  promesse: string
  appelAction: string
  structure: { type: string; resume: string }[]
  transcription: { debut: number; source: 'voix' | 'ecran'; texte: string }[]
  /** Transcription traduite en français, ligne à ligne (demandée depuis la fiche). */
  traductionFr?: string[]
  modele: string
  date: string
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    accroche: { type: 'STRING' },
    angle: { type: 'STRING' },
    concept: { type: 'STRING' },
    promesse: { type: 'STRING' },
    appelAction: { type: 'STRING' },
    structure: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { type: { type: 'STRING' }, resume: { type: 'STRING' } }, required: ['type', 'resume'] },
    },
    transcription: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { debut: { type: 'NUMBER' }, source: { type: 'STRING', enum: ['voix', 'ecran'] }, texte: { type: 'STRING' } },
        required: ['debut', 'source', 'texte'],
      },
    },
  },
  required: ['accroche', 'angle', 'concept', 'promesse', 'appelAction', 'structure', 'transcription'],
}

const CONSIGNE = `Tu es stratège créatif en publicité Meta à réponse directe. Décortique cette publicité : le média joint et le texte de l'annonce ci-dessous. Réponds en français.
- accroche : la première phrase qui arrête le scroll, citée telle qu'elle est dite ou écrite.
- angle : en 2 à 4 mots, ce que la pub met en avant (ex. « Fonctionnement produit », « Peur de l'arnaque », « Économies chiffrées », « Preuve sociale »).
- concept : en 2 à 4 mots, la forme créative (ex. « Listicle / chiffres clés », « Témoignage client », « Face caméra fondateur », « Avant / après »).
- promesse : le bénéfice promis, en une phrase.
- appelAction : ce que la pub demande de faire, en une phrase.
- structure : les étapes du message dans l'ordre ; type parmi Accroche, Problème, Agitation, Solution, Preuve, Offre, Objection, Appel à l'action ; résumé d'une phrase.
- transcription : pour une vidéo, chaque phrase de voix off (source « voix ») et chaque texte affiché à l'écran (source « ecran »), avec son instant de début en secondes ; pour une image, chaque bloc de texte visible (source « ecran », debut 0). Recopie les textes tels quels, sans les corriger ni les traduire.`

const TYPES: Record<string, string> = { mp4: 'video/mp4', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }

/** Un appel à Gemini en JSON contraint, avec repli sur le second modèle. */
export async function appeler(parts: unknown[], schema: object): Promise<{ resultat: any; modele: string }> {
  const cle = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '')
  if (!cle) throw new Error('GEMINI_API_KEY manquant')
  const corps = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
  })
  let r: Response | null = null
  let j: any = null
  const debut = Date.now()
  // Saturé (503, 429) ou muet : modèle suivant, puis un second passage trois secondes après.
  essais: for (let passage = 0; passage < 2; passage++) {
    if (passage) await new Promise((ok) => setTimeout(ok, 3000))
    for (const modele of MODELES) {
      const reste = BUDGET - (Date.now() - debut)
      if (reste < 5000) break essais
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': cle },
          body: corps,
          signal: AbortSignal.timeout(Math.min(DELAI_PAR_MODELE, reste)),
        })
      } catch {
        r = null
        console.warn(`[gemini] ${modele} sans réponse`)
        continue
      }
      j = await r.json().catch(() => null)
      if (r.status !== 503 && r.status !== 429) break essais
      console.warn(`[gemini] ${modele} saturé (${r.status})`)
    }
  }
  if (!r || r.status === 503 || r.status === 429) throw new Error('Gemini est saturé en ce moment : réessayez dans quelques minutes.')
  if (!r.ok) throw new Error(`Gemini a refusé l’analyse : ${r.status} ${j?.error?.message ?? ''}`)
  const texte = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
  if (!texte) throw new Error('Gemini n’a rien renvoyé')
  return { resultat: JSON.parse(texte), modele: j.modelVersion ?? MODELES[0] }
}

export async function decortiquer(mediaUrl: string, annonce: { titre: string | null; texte: string | null }): Promise<Decorticage> {
  const mimeType = TYPES[mediaUrl.split('?')[0].split('.').pop()?.toLowerCase() ?? '']
  if (!mimeType) throw new Error('Format de média non pris en charge')

  const media = await fetch(mediaUrl)
  if (!media.ok) throw new Error(`Média introuvable (${media.status})`)
  const octets = Buffer.from(await media.arrayBuffer())
  if (octets.length > TAILLE_MAX) throw new Error('Média trop lourd pour l’analyse (plus de 14 Mo)')

  const contexte = `\n\nTitre de l'annonce : ${annonce.titre ?? '—'}\nTexte de l'annonce : ${annonce.texte ?? '—'}`
  const { resultat, modele } = await appeler([{ inlineData: { mimeType, data: octets.toString('base64') } }, { text: CONSIGNE + contexte }], SCHEMA)
  return {
    ...resultat,
    transcription: [...(resultat.transcription ?? [])].sort((a, b) => a.debut - b.debut),
    modele,
    date: new Date().toISOString(),
  }
}

// ─── Analyse d'une marque ─────────────────────────────────────────────────

/** L'argument : comment la marque tourne son message. */
export const ANGLES = [
  'La marque', 'Bénéfices', 'Arguments & caractéristiques', 'Preuves', 'Fonctionnement produit', 'Problème cible',
  'Pricing / offre', 'Comparaison', 'Urgence / rareté', 'Nouveauté', 'Autre',
] as const

/** Le format d'exécution : comment la marque présente son message. */
export const CONCEPTS = [
  'Mise en situation / lifestyle', 'Listicle / chiffres clés', 'Tagline / accroche', 'Points bénéfices',
  'Avis client (capture / note)', 'Témoignage client', 'Face caméra / fondateur', 'Démonstration produit',
  'Avant / après', 'Comparatif', 'Format éditorial / article', 'Capture d’écran produit / interface',
  'Packshot produit', 'Mème / tendance', 'Autre',
] as const

export type AnalyseMarque = {
  /** Une ligne par pub analysée : son angle et son concept, pris dans les listes ci-dessus. */
  classement: { pubId: string; angle: string; concept: string }[]
  personas: { nom: string; description: string }[]
  nbPubs: number
  modele: string
  date: string
}

const SCHEMA_MARQUE = {
  type: 'OBJECT',
  properties: {
    pubs: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { numero: { type: 'INTEGER' }, angle: { type: 'STRING', enum: [...ANGLES] }, concept: { type: 'STRING', enum: [...CONCEPTS] } },
        required: ['numero', 'angle', 'concept'],
      },
    },
    personas: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { nom: { type: 'STRING' }, description: { type: 'STRING' } }, required: ['nom', 'description'] },
    },
  },
  required: ['pubs', 'personas'],
}

export type PubPourAnalyse = {
  id: string
  format: string
  jours: number | null
  reachUe: number | null
  titre: string | null
  texte: string | null
  cta: string | null
  lienUrl: string | null
  analyse: { accroche: string; angle: string; concept: string; transcription: { texte: string }[] } | null
}

const CONSIGNE_MARQUE = (nom: string) => `Tu es stratège créatif en publicité Meta à réponse directe. Voici les pubs actives de la marque « ${nom} », numérotées. Pour chacune : format, jours de diffusion, personnes touchées dans l'UE quand on le sait, titre, texte, bouton, lien, et pour certaines l'accroche et la transcription déjà relevées.
Réponds en français :
- pubs : pour CHAQUE pub, son numéro, son angle (l'argument principal : comment la marque tourne son message) et son concept (le format d'exécution : comment elle présente ce message), chacun pris dans la liste imposée. « Autre » seulement si rien ne convient.
- personas : 2 à 4 personas que ces messages visent ; nom court et parlant (ex. « Propriétaire résidentiel préoccupé par les coûts »), description de deux phrases : qui il est, ce qui le déclenche.`

/** Classe chaque pub active (angle, concept) et déduit les personas visés — sur le texte seul. */
export async function analyserMarque(nom: string, pubs: PubPourAnalyse[]): Promise<AnalyseMarque> {
  const lignes = pubs.map((p, i) => {
    const champs = [
      `#${i + 1} · ${p.format}${p.jours !== null ? ` · ${p.jours} j de diffusion` : ''}${p.reachUe ? ` · ${p.reachUe} personnes touchées` : ''}`,
      p.titre && `Titre : ${p.titre}`,
      p.texte && `Texte : ${p.texte.slice(0, 600)}`,
      p.cta && `Bouton : ${p.cta}`,
      p.lienUrl && `Lien : ${p.lienUrl}`,
      p.analyse && `Accroche relevée : ${p.analyse.accroche}`,
      p.analyse?.transcription.length && `Transcription : ${p.analyse.transcription.map((t) => t.texte).join(' / ').slice(0, 600)}`,
    ]
    return champs.filter(Boolean).join('\n')
  })
  const { resultat, modele } = await appeler([{ text: `${CONSIGNE_MARQUE(nom)}\n\n${lignes.join('\n\n')}` }], SCHEMA_MARQUE)
  // Les numéros (#1…) redeviennent des identifiants ; un numéro inventé ou répété tombe.
  const vus = new Set<string>()
  const classement = (resultat.pubs ?? [])
    .map((c: { numero: number; angle: string; concept: string }) => ({ pubId: pubs[c.numero - 1]?.id, angle: c.angle, concept: c.concept }))
    .filter((c: { pubId?: string }) => c.pubId && !vus.has(c.pubId) && vus.add(c.pubId))
  return { classement, personas: resultat.personas ?? [], nbPubs: pubs.length, modele, date: new Date().toISOString() }
}

// ─── Catégorie d'une marque ───────────────────────────────────────────────

/**
 * Range des marques dans une catégorie de Discovery, en un seul appel :
 * nom de la marque et quelques textes de ses pubs suffisent.
 */
export async function classerMarques(marques: { nom: string; textes: string[] }[], categories: readonly string[]): Promise<string[]> {
  if (!marques.length) return []
  const schema = {
    type: 'OBJECT',
    properties: {
      marques: {
        type: 'ARRAY',
        items: { type: 'OBJECT', properties: { numero: { type: 'INTEGER' }, categorie: { type: 'STRING', enum: [...categories] } }, required: ['numero', 'categorie'] },
      },
    },
    required: ['marques'],
  }
  const liste = marques
    .map((m, i) => `#${i + 1} · ${m.nom}\n${m.textes.map((t) => `- ${t.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')}`)
    .join('\n\n')
  const consigne = `Range chaque annonceur Meta ci-dessous dans UNE catégorie de la liste imposée, d'après son nom et les textes de ses pubs. « Énergie & rénovation » couvre le solaire, les pompes à chaleur, l'isolation, les fenêtres, la rénovation énergétique et les aides associées. « Autre » seulement si rien ne convient.\n\n${liste}`
  const { resultat } = await appeler([{ text: consigne }], schema)
  const parNumero = new Map<number, string>((resultat.marques ?? []).map((m: { numero: number; categorie: string }) => [m.numero, m.categorie]))
  return marques.map((_, i) => parNumero.get(i + 1) ?? 'Autre')
}

/**
 * Des expressions de recherche qui ramèneraient, dans la Ad Library, les
 * concurrents de cette marque : ce qu'elle vend, avec les mots du marché.
 */
export async function proposerMotsCles(nom: string, textes: string[], existants: string[]): Promise<string[]> {
  const schema = {
    type: 'OBJECT',
    properties: { motsCles: { type: 'ARRAY', items: { type: 'STRING' }, maxItems: 5 } },
    required: ['motsCles'],
  }
  const consigne = `Une agence surveille dans la Meta Ad Library les pubs des concurrents de ses clients (artisans, installateurs, services aux particuliers). Voici des pubs de l'annonceur « ${nom} ».

Propose 3 à 5 expressions de recherche, en français, de 2 à 4 mots, que d'autres annonceurs du même marché écriraient mot pour mot dans leurs pubs : le produit ou le service précis (par exemple « pompe à chaleur air-eau », « batterie solaire », « isolation des combles »). Jamais le nom d'une marque, jamais un mot générique seul (« offre », « devis gratuit », « maison »).

Déjà surveillées, à ne pas reproposer : ${existants.length ? existants.join(', ') : 'aucune'}.

Pubs :
${textes.map((t) => `- ${t.replace(/\s+/g, ' ').slice(0, 400)}`).join('\n')}`
  const { resultat } = await appeler([{ text: consigne }], schema)
  return (resultat.motsCles ?? []).filter((m: unknown): m is string => typeof m === 'string')
}

/** La transcription traduite en français, ligne pour ligne (une ligne déjà en français reste telle quelle). */
export async function traduire(lignes: string[]): Promise<string[]> {
  const schema = { type: 'OBJECT', properties: { traductions: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['traductions'] }
  const consigne = `Traduis chaque ligne en français, dans le même ordre, une traduction par ligne : exactement ${lignes.length} traductions. Une ligne déjà en français est recopiée telle quelle. Garde le ton publicitaire, sans rien ajouter.

${lignes.map((l, i) => `${i + 1}. ${l}`).join('\n')}`
  const { resultat } = await appeler([{ text: consigne }], schema)
  const traductions = (resultat.traductions ?? []).filter((t: unknown): t is string => typeof t === 'string')
  if (traductions.length !== lignes.length) throw new Error('Traduction incomplète, réessayez')
  return traductions
}

// ─── Recréer une pub pour un client ───────────────────────────────────────

const SCHEMA_TEXTES = {
  type: 'OBJECT',
  properties: {
    textes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { role: { type: 'STRING' }, original: { type: 'STRING' }, remplacement: { type: 'STRING' } },
        required: ['role', 'original', 'remplacement'],
      },
    },
  },
  required: ['textes'],
}

/** Ce qu'aucun texte écrit pour la marque ne doit faire : partagé par la copie et les concepts. */
const reglesVerite = (nom: string) => [
  `- aucune affirmation propre au concurrent (ancienneté, partenariat, chiffre, label, prix, promotion, garantie, « zéro sous-traitance »…) : un fait de ${nom} donné ici, sinon un bénéfice général ; n'ajoute toi-même aucune promesse de ce genre ;`,
  `- avis client : jamais de prénom, de note ni de citation du concurrent, jamais d'avis inventé ; reprends un avis donné dans l'offre ou la précision s'il y en a, sinon écris un bénéfice de ${nom}, sans guillemets ;`,
]

/**
 * Les textes de la reproduction, écrits avant l'image : laissé libre, le
 * modèle d'image inventait des avis clients et gardait les affirmations du
 * concurrent, malgré la consigne. Il reçoit ces textes mot pour mot.
 */
export async function textesPour(reference: Jointe, nom: string, faits: string, precision?: string, guidelines: string[] = []): Promise<TexteImpose[]> {
  const texte = [
    `Voici une publicité d'un concurrent. Relève chaque texte visible, dans l'ordre de lecture, avec son rôle (titre, sous-titre, encart, avis client, bouton, mention, autre ; ignore le logo). Pour chacun, écris le texte qui le remplacera dans une reproduction de cette publicité pour « ${nom} » (${faits}).`,
    'Règles :',
    '- même longueur, même ton, même ponctuation, en français et sans faute ;',
    `- le nom du concurrent devient « ${nom} » ;`,
    ...reglesVerite(nom),
    `- une phrase sur un partenariat, un rachat ou une fusion du concurrent devient une phrase sur ${nom} lui-même (ex. « Votre expert local en solaire, c'est ${nom}. ») ;`,
    ...guidelines,
    precision?.trim() && `Précision : ${precision.trim()}`,
    'Avant de répondre, relis chaque remplacement : il doit être vrai pour cette marque et avoir un sens tel quel.',
  ].filter(Boolean).join('\n')
  const { resultat } = await appeler([{ inlineData: reference }, { text: texte }], SCHEMA_TEXTES)
  return (resultat.textes ?? []).filter((t: TexteImpose) => t.remplacement?.trim())
}

/** Un concept hybride : l'angle, le visuel à poser (vraie photo, image IA sans texte, ou rien) et les textes par emplacement. */
export type PlanConcept = {
  angle: string
  idee: string
  visuel: { source: 'photo' | 'ia' | 'aucun'; photo: number; description: string }
  textes: { surtitre: string; titre: string; accent: string; sousTitre: string; points: string[]; offre: string; bouton: string; mention: string; gauche: string; droite: string }
}

/**
 * Les nouveaux concepts (2 variantes et plus), en rendu hybride : Gemini écrit
 * les textes emplacement par emplacement et choisit le visuel ; Apogee les pose
 * en HTML. La pub du concurrent donne le message ; chaque concept change
 * d'angle ET d'accroche, sinon Meta (Andromeda) les range ensemble.
 */
export async function planHybride(
  reference: Jointe, photos: Jointe[], modeles: Jointe[], nom: string, faits: string, n: number,
  angles: { libelle: string; consigne: string; gabarit: string }[], imposes: string[], offre?: string, guidelines: string[] = [],
): Promise<PlanConcept[]> {
  const libelles = angles.map((a) => a.libelle)
  const texte = [
    `Image 1 : une publicité d'un concurrent, qui marche : elle donne le message et le produit.${photos.length ? ` Images 2 à ${photos.length + 1} : les vraies photos de « ${nom} » (photo n° 0 = image 2, etc.).` : ''}${modeles.length ? ` Les ${modeles.length} dernières images : des publicités de « ${nom} » qui marchent ; inspire-toi de leur ton et de leurs accroches, sans les recopier.` : ''}`,
    `Imagine ${n} nouvelles publicités pour « ${nom} » (${faits}), chacune sur un concept vraiment différent : Meta range ensemble les publicités trop proches. Chaque concept change donc à la fois d'angle et d'accroche (bénéfice, émotion ou personne visée différents). Ne recopie pas la mise en page du concurrent.`,
    imposes.length
      ? `Angles imposés, un par concept : ${imposes.join(', ')}.${imposes.length < n ? ' Choisis les autres dans la liste.' : ''}`
      : 'Choisis dans la liste les angles qui servent le mieux ce message, tous différents.',
    `Angles possibles :\n${angles.map((a) => `- ${a.libelle} : ${a.consigne}`).join('\n')}`,
    'Les textes sont posés par un graphiste dans une mise en page fixe : respecte les longueurs.',
    '- surtitre : 2 à 4 mots en capitales d’usage (vide si inutile) ; titre : l’accroche, 60 caractères au plus ; accent : 1 ou 2 mots du titre, recopiés exactement, à mettre en couleur ;',
    '- sousTitre : une phrase de 110 caractères au plus ; points : 3 ou 4 arguments de 40 caractères au plus (pour « Comparatif », chaque point s’écrit « notre avantage | la solution habituelle ») ;',
    '- offre : 30 caractères au plus ; bouton : 22 caractères au plus, à l’impératif ; mention : courte ou vide ; gauche et droite : les légendes des deux moitiés (« Avant », « Après ») ou des deux colonnes d’un comparatif, vides sinon.',
    `- visuel : source « photo » avec son numéro quand une vraie photo de ${nom} convient à l'angle (toujours préférable) ; sinon « ia » avec la description précise d'une photo réaliste SANS aucun texte (pour Avant / après ou Écran partagé : une seule image coupée en deux moitiés, décris la gauche puis la droite) ; « aucun » pour les angles typographiques.`,
    offre?.trim() && `Offre commune, présente dans chaque concept : ${offre.trim()}`,
    'Règles :',
    ...reglesVerite(nom),
    '- aucun texte ne reprend les mots d’un autre texte du même concept ;',
    ...guidelines,
    'Avant de répondre, relis chaque texte : il doit être vrai pour cette marque, avoir un sens tel quel et tenir dans sa longueur.',
  ].filter(Boolean).join('\n')
  const chaine = { type: 'STRING' }
  const schema = {
    type: 'OBJECT',
    properties: {
      concepts: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            angle: { type: 'STRING', enum: libelles },
            idee: chaine,
            visuel: {
              type: 'OBJECT',
              properties: { source: { type: 'STRING', enum: ['photo', 'ia', 'aucun'] }, photo: { type: 'INTEGER' }, description: chaine },
              required: ['source', 'photo', 'description'],
            },
            textes: {
              type: 'OBJECT',
              properties: {
                surtitre: chaine, titre: chaine, accent: chaine, sousTitre: chaine, points: { type: 'ARRAY', items: chaine },
                offre: chaine, bouton: chaine, mention: chaine, gauche: chaine, droite: chaine,
              },
              required: ['surtitre', 'titre', 'accent', 'sousTitre', 'points', 'offre', 'bouton', 'mention', 'gauche', 'droite'],
            },
          },
          required: ['angle', 'idee', 'visuel', 'textes'],
        },
      },
    },
    required: ['concepts'],
  }
  const { resultat } = await appeler([{ inlineData: reference }, ...[...photos, ...modeles].map((inlineData) => ({ inlineData })), { text: texte }], schema)
  // Un angle par concept : un doublon serait la même pub pour Andromeda.
  const vus = new Set<string>()
  return (resultat.concepts ?? [])
    .filter((c: PlanConcept) => c.textes?.titre && !vus.has(c.angle) && vus.add(c.angle))
    .map((c: PlanConcept) => ({
      ...c,
      visuel: { ...c.visuel, photo: Number.isInteger(c.visuel.photo) && c.visuel.photo >= 0 && c.visuel.photo < photos.length ? c.visuel.photo : -1 },
    }))
    .slice(0, n)
}
