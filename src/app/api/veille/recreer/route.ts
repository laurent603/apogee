import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { compteDe } from '@/lib/veille/compte'
import { deposer, urlPublique } from '@/lib/veille/stockage'
import sharp from 'sharp'
import { consigne, consigneVisuel, faits, FORMATS_CREA, genererImage, guidelines, jointe, jointePhoto, versStory, type FormatCrea, type Jointe } from '@/lib/veille/recreer'
import { ANGLES_VISUELS } from '@/lib/veille/angles'
import { planHybride, textesPour, type PlanConcept } from '@/lib/veille/gemini'
import { palette, rendre, type Gabarit } from '@/lib/veille/gabarits'
import { polices } from '@/lib/veille/polices'

/**
 * « Recréer pour ce client » : à partir d'une pub concurrente, des images au
 * kit visuel et à l'offre du client sélectionné. 1 variante : la copie de la
 * pub, entièrement générée. 2 et plus : autant de concepts nouveaux en rendu
 * hybride : l'IA ne fournit que le visuel (ou une vraie photo du kit est
 * reprise), titres, logo et couleurs sont posés en HTML par les gabarits.
 * Chaque image est gardée (CreaGeneree) pour ne pas la repayer.
 */

export const maxDuration = 120
const VARIANTES_MAX = 6
// Deux photos par image : assez pour un visuel réel, sans alourdir la requête.
const PHOTOS_PAR_IMAGE = 2
// Deux créas modèles suffisent à donner le ton sans noyer la consigne.
const MODELES_PAR_IMAGE = 2
// Six photos au plus montrées au plan : assez de choix, une requête légère.
const PHOTOS_AU_PLAN = 6

/** Une image en data URL pour les gabarits : PNG pour un logo (transparence), JPEG sinon ; le moteur ne lit ni WebP ni SVG. */
async function enData(j: Jointe | null, logo = false) {
  if (!j) return null
  const image = sharp(Buffer.from(j.data, 'base64')).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
  const octets = await (logo ? image.png() : image.jpeg({ quality: 88 })).toBuffer()
  return `data:image/${logo ? 'png' : 'jpeg'};base64,${octets.toString('base64')}`
}


const enClair = (c: { id: string; format: string; chemin: string; consigne: string | null; concept: string | null; createdAt: Date }) => ({
  id: c.id, format: c.format, url: urlPublique(c.chemin), consigne: c.consigne, concept: c.concept, createdAt: c.createdAt,
})

/** Les images déjà générées pour cette pub et ce client. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const compte = await compteDe(p.get('dbAccountId'))
  if (!compte) return NextResponse.json({ erreur: 'Compte introuvable' }, { status: 404 })
  const creas = await prisma.creaGeneree.findMany({ where: { adAccountId: compte.id, pubId: p.get('pubId') ?? '' }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ creas: creas.map(enClair) })
}

export async function POST(req: NextRequest) {
  const corps = await req.json().catch(() => null)
  const compte = await compteDe(corps?.dbAccountId)
  if (!compte) return NextResponse.json({ erreur: 'Compte introuvable' }, { status: 404 })
  const formats = (Array.isArray(corps.formats) ? corps.formats : []).filter((f: unknown): f is FormatCrea => FORMATS_CREA.includes(f as FormatCrea))
  const variantes = Math.min(Math.max(Math.round(Number(corps.variantes)) || 1, 1), VARIANTES_MAX)
  const precision = typeof corps.consigne === 'string' ? corps.consigne.slice(0, 600) : ''
  const anglesImposes = (Array.isArray(corps.angles) ? corps.angles : [])
    .map((cle: unknown) => ANGLES_VISUELS.find((a) => a.cle === cle)?.libelle)
    .filter((l: string | undefined): l is string => !!l)
    .slice(0, variantes)
  if (!formats.length) return NextResponse.json({ erreur: 'Choisissez au moins un format' }, { status: 400 })

  const pub = await prisma.veillePub.findFirst({ where: { id: String(corps.pubId), masquee: false }, select: { id: true, medias: true } })
  if (!pub) return NextResponse.json({ erreur: 'Pub introuvable' }, { status: 404 })
  // Le modèle : la première image, ou l'aperçu d'une vidéo.
  const medias = pub.medias as { type: string; chemin: string; apercu?: string }[]
  const source = medias.find((m) => m.type === 'image')?.chemin ?? medias.find((m) => m.apercu)?.apercu
  const reference = source ? await jointe(urlPublique(source)) : null
  if (!reference) return NextResponse.json({ erreur: 'Cette pub n’a pas d’image à reprendre' }, { status: 400 })

  const [reglages, produit, modelesKit] = await Promise.all([
    prisma.brandSettings.findUnique({ where: { adAccountId: compte.id } }),
    typeof corps.produitId === 'string' ? prisma.produitMarque.findFirst({ where: { id: corps.produitId, adAccountId: compte.id } }) : null,
    prisma.creaModele.findMany({ where: { adAccountId: compte.id }, orderBy: { createdAt: 'desc' }, take: MODELES_PAR_IMAGE }),
  ])
  const marque = {
    nom: reglages?.companyName || compte.name,
    site: reglages?.websiteUrl ?? null,
    secteur: reglages?.industry ?? null,
    description: reglages?.productDescription ?? null,
    proposition: reglages?.uniqueValueProp ?? null,
    couleurs: reglages?.couleurs ?? [],
    couleursRoles: reglages?.couleursRoles ?? [],
    produit: produit && { nom: produit.nom, description: produit.description, prix: produit.prix },
    typoTitre: reglages?.typoTitre, typoTexte: reglages?.typoTexte, tonDeVoix: reglages?.tonDeVoix,
    motsAEmployer: reglages?.motsAEmployer, motsAEviter: reglages?.motsAEviter,
  }
  const [logo, logoClair] = await Promise.all([reglages?.logoChemin, reglages?.logoClairChemin].map((c) => (c ? jointe(urlPublique(c)) : null)))
  // Les photos du produit mis en avant passent devant celles du kit.
  const photos = (await Promise.all([...(produit?.photos ?? []), ...(reglages?.photos ?? [])].map((c) => jointePhoto(urlPublique(c))))).filter((x) => x !== null)
  const modeles = (await Promise.all(modelesKit.map((m) => jointePhoto(urlPublique(m.chemin))))).filter((x) => x !== null)
  const lesFaits = `${faits(marque)}${marque.site ? `, ${marque.site}` : ''}`

  // Les textes avant les images : ceux de la copie (mot pour mot), ou le plan des concepts.
  let textes: Awaited<ReturnType<typeof textesPour>> = []
  let concepts: PlanConcept[] = []
  const auPlan = photos.slice(0, PHOTOS_AU_PLAN)
  try {
    if (variantes === 1) textes = await textesPour(reference, marque.nom, lesFaits, precision, guidelines(marque))
    else concepts = await planHybride(reference, auPlan, modeles, marque.nom, lesFaits, variantes, [...ANGLES_VISUELS], anglesImposes, precision, guidelines(marque))
  } catch (e) {
    return NextResponse.json({ erreur: (e as Error).message }, { status: 502 })
  }
  if (variantes > 1 && !concepts.length) return NextResponse.json({ erreur: 'Gemini n’a proposé aucun concept : réessayez.' }, { status: 502 })

  const enregistrer = (format: FormatCrea, type: string, octets: Buffer, modele: string, concept: string | null) =>
    deposer(`creas/${compte.id}/${randomUUID()}`, type, octets).then((chemin) =>
      prisma.creaGeneree.create({ data: { adAccountId: compte.id, pubId: pub.id, format, chemin, modele, consigne: precision || null, concept } }),
    )

  // Copie : une image générée en entier, et sa Story tirée du même carré.
  const copier = async () => {
    const choisies = photos.slice(0, PHOTOS_PAR_IMAGE)
    const image = await genererImage([reference, ...[logo, logoClair].filter((x) => x !== null), ...choisies], consigne(marque, { logo: !!logo, logoClair: !!logoClair, photos: choisies.length }, precision, textes))
    return Promise.all(formats.map(async (format: FormatCrea) =>
      format === '1:1' ? enregistrer(format, image.mimeType, image.octets, image.modele, null) : enregistrer(format, 'image/jpeg', await versStory(image.octets), image.modele, null),
    ))
  }

  // Concept : le visuel (vraie photo, image IA sans texte, ou rien), habillé par son gabarit en 1:1 et en 9:16 natifs.
  const [fonts, logoData, logoClairData] = variantes === 1 ? [null, null, null] : await Promise.all([polices(marque.typoTitre, marque.typoTexte), enData(logo, true), enData(logoClair, true)])
  const habiller = async (c: PlanConcept, i: number) => {
    const angle = ANGLES_VISUELS.find((a) => a.libelle === c.angle)
    let visuel: Jointe | null = null
    let modele = 'html'
    if (c.visuel.source === 'photo' && c.visuel.photo >= 0) visuel = auPlan[c.visuel.photo]
    else if (c.visuel.source === 'ia' || (c.visuel.source === 'photo' && c.visuel.description)) {
      const refs = photos.length ? [photos[i % photos.length]] : []
      const image = await genererImage(refs, consigneVisuel(marque, c.visuel.description || c.idee, refs.length), '3:4')
      visuel = { mimeType: image.mimeType, data: image.octets.toString('base64') }
      modele = `html + ${image.modele}`
    }
    const habillage = {
      gabarit: (angle?.gabarit ?? 'photo') as Gabarit,
      style: angle && 'style' in angle ? angle.style : undefined,
      textes: c.textes, visuel: await enData(visuel), logo: logoData, logoClair: logoClairData, nom: marque.nom,
      palette: palette(marque.couleurs, marque.couleursRoles), polices: fonts!,
    }
    return Promise.all(formats.map(async (format: FormatCrea) => enregistrer(format, 'image/png', await rendre(habillage, format), modele, c.angle)))
  }

  const resultats = await Promise.allSettled(variantes === 1 ? [copier()] : concepts.map(habiller))

  const creas = resultats.flatMap((r) => (r.status === 'fulfilled' ? r.value.map(enClair) : []))
  const echecs = resultats.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (!creas.length) return NextResponse.json({ erreur: (echecs[0]?.reason as Error)?.message ?? 'Génération impossible' }, { status: 502 })
  return NextResponse.json({ creas, echecs: echecs.length, erreur: echecs.length ? (echecs[0].reason as Error).message : null })
}

/** Retire une image générée de la liste. ponytail: le fichier reste dans le stockage (quelques centaines de Ko) ; à purger si les volumes grossissent. */
export async function DELETE(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const compte = await compteDe(p.get('dbAccountId'))
  if (!compte) return NextResponse.json({ erreur: 'Compte introuvable' }, { status: 404 })
  await prisma.creaGeneree.deleteMany({ where: { id: p.get('id') ?? '', adAccountId: compte.id } })
  return NextResponse.json({ ok: true })
}
