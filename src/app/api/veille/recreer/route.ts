import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { compteDe } from '@/lib/veille/compte'
import { deposer, urlPublique } from '@/lib/veille/stockage'
import { consigne, consigneVariation, faits, FORMATS_CREA, genererImage, guidelines, jointe, jointePhoto, versStory, type FormatCrea, type Jointe, type TextesCourts } from '@/lib/veille/recreer'
import { ANGLES_VISUELS } from '@/lib/veille/angles'
import { textesCourts, textesPour } from '@/lib/veille/gemini'
import { genererOpenAI } from '@/lib/veille/openai'

/**
 * « Recréer pour ce client » : à partir d'une pub concurrente, des images au
 * kit visuel et à l'offre du client sélectionné. 1 variante : la copie de la
 * pub ; 2 et plus : autant de variations de cette copie (même message, mêmes
 * textes condensés, offre commune), chacune dans un traitement visuel à elle.
 * Chaque image est gardée (CreaGeneree) pour ne pas la repayer.
 */

export const maxDuration = 120
const VARIANTES_MAX = 6
// Deux photos par image : assez pour un visuel réel, sans alourdir la requête.
const PHOTOS_PAR_IMAGE = 2


const enClair = (c: { id: string; format: string; chemin: string; consigne: string | null; concept: string | null; modele: string; createdAt: Date }) => ({
  id: c.id, format: c.format, url: urlPublique(c.chemin), consigne: c.consigne, concept: c.concept, modele: c.modele, createdAt: c.createdAt,
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
  // Deux moteurs au choix : ChatGPT (mise en page plus « pub ») ou Gemini (logo et photos plus fidèles).
  const generer = corps.moteur === 'gemini' ? (images: Jointe[], texte: string) => genererImage(images, texte) : genererOpenAI
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

  const [reglages, produit] = await Promise.all([
    prisma.brandSettings.findUnique({ where: { adAccountId: compte.id } }),
    typeof corps.produitId === 'string' ? prisma.produitMarque.findFirst({ where: { id: corps.produitId, adAccountId: compte.id } }) : null,
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
  const lesFaits = `${faits(marque)}${marque.site ? `, ${marque.site}` : ''}`

  // Les textes avant les images : ceux de la copie (mot pour mot), condensés pour les variations.
  let textes: Awaited<ReturnType<typeof textesPour>> = []
  let courts: (TextesCourts & { traitements: string[] }) | null = null
  try {
    textes = await textesPour(reference, marque.nom, lesFaits, precision, guidelines(marque))
    if (variantes > 1) {
      courts = await textesCourts(reference, textes, marque.nom, precision, guidelines(marque), [...ANGLES_VISUELS], variantes - anglesImposes.length, anglesImposes)
    }
  } catch (e) {
    return NextResponse.json({ erreur: (e as Error).message }, { status: 502 })
  }
  // Un traitement par variation : ceux choisis par l'utilisateur, puis ceux choisis par Gemini pour cette pub.
  const traitements = [...new Set([...anglesImposes, ...(courts?.traitements ?? [])])]
    .slice(0, variantes)
    .map((libelle) => ANGLES_VISUELS.find((a) => a.libelle === libelle)!)
    .filter(Boolean)
  if (variantes > 1 && traitements.length < 2) return NextResponse.json({ erreur: 'Gemini n’a pas choisi de traitements : réessayez ou choisissez-les.' }, { status: 502 })

  // Une génération par créa : le carré, et la Story tirée du même carré (une pub Meta, deux placements).
  // Chaque créa prend d'autres photos du kit : les images ne se ressemblent pas toutes.
  const resultats = await Promise.allSettled(
    Array.from({ length: variantes === 1 ? 1 : traitements.length }, async (_, i) => {
      const choisies = photos.length ? Array.from({ length: Math.min(PHOTOS_PAR_IMAGE, photos.length) }, (_, k) => photos[(i * PHOTOS_PAR_IMAGE + k) % photos.length]) : []
      const kit = { logo: !!logo, logoClair: !!logoClair, photos: choisies.length }
      const logos = [logo, logoClair].filter((x) => x !== null)
      const traitement = variantes === 1 ? null : traitements[i]
      const image = await generer(
        [reference, ...logos, ...choisies],
        traitement && courts ? consigneVariation(marque, kit, courts, traitement) : consigne(marque, kit, precision, textes),
      )
      const fichiers: Record<FormatCrea, () => Promise<[string, Buffer]>> = {
        '1:1': async () => [image.mimeType, image.octets],
        '9:16': async () => ['image/jpeg', await versStory(image.octets)],
      }
      return Promise.all(formats.map(async (format: FormatCrea) => {
        const [type, octets] = await fichiers[format]()
        const chemin = await deposer(`creas/${compte.id}/${randomUUID()}`, type, octets)
        return prisma.creaGeneree.create({
          data: { adAccountId: compte.id, pubId: pub.id, format, chemin, modele: image.modele, consigne: precision || null, concept: traitement?.libelle ?? null },
        })
      }))
    }),
  )

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
