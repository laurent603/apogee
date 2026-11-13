import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deposer, urlPublique } from '@/lib/veille/stockage'
import { consigne, FORMATS_CREA, genererImage, jointe, jointePhoto, versStory, type FormatCrea } from '@/lib/veille/recreer'

/**
 * « Recréer pour ce client » : génère, à partir d'une pub concurrente, des
 * images au kit visuel et à l'offre du client sélectionné. Chaque image est
 * gardée (CreaGeneree) pour ne pas la repayer.
 */

export const maxDuration = 120
const VARIANTES_MAX = 4
// Deux photos par image : assez pour un visuel réel, sans alourdir la requête.
const PHOTOS_PAR_IMAGE = 2

async function compteDe(dbAccountId: unknown) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || typeof dbAccountId !== 'string') return null
  return prisma.adAccount.findFirst({ where: { id: dbAccountId, userId: session.user.id }, select: { id: true, name: true } })
}

const enClair = (c: { id: string; format: string; chemin: string; consigne: string | null; createdAt: Date }) => ({
  id: c.id, format: c.format, url: urlPublique(c.chemin), consigne: c.consigne, createdAt: c.createdAt,
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
  if (!formats.length) return NextResponse.json({ erreur: 'Choisissez au moins un format' }, { status: 400 })

  const pub = await prisma.veillePub.findFirst({ where: { id: String(corps.pubId), masquee: false }, select: { id: true, medias: true } })
  if (!pub) return NextResponse.json({ erreur: 'Pub introuvable' }, { status: 404 })
  // Le modèle : la première image, ou l'aperçu d'une vidéo.
  const medias = pub.medias as { type: string; chemin: string; apercu?: string }[]
  const source = medias.find((m) => m.type === 'image')?.chemin ?? medias.find((m) => m.apercu)?.apercu
  const reference = source ? await jointe(urlPublique(source)) : null
  if (!reference) return NextResponse.json({ erreur: 'Cette pub n’a pas d’image à reprendre' }, { status: 400 })

  const reglages = await prisma.brandSettings.findUnique({ where: { adAccountId: compte.id } })
  const marque = {
    nom: reglages?.companyName || compte.name,
    site: reglages?.websiteUrl ?? null,
    secteur: reglages?.industry ?? null,
    description: reglages?.productDescription ?? null,
    proposition: reglages?.uniqueValueProp ?? null,
    couleurs: reglages?.couleurs ?? [],
  }
  const logo = reglages?.logoChemin ? await jointe(urlPublique(reglages.logoChemin)) : null
  const photos = (await Promise.all((reglages?.photos ?? []).map((c) => jointePhoto(urlPublique(c))))).filter((x) => x !== null)

  // Une génération par variante : le carré, et la Story tirée du même carré (une pub Meta, deux placements).
  // Chaque variante prend d'autres photos du kit : les images ne se ressemblent pas toutes.
  const resultats = await Promise.allSettled(
    Array.from({ length: variantes }, async (_, i) => {
      const choisies = photos.length ? Array.from({ length: Math.min(PHOTOS_PAR_IMAGE, photos.length) }, (_, k) => photos[(i * PHOTOS_PAR_IMAGE + k) % photos.length]) : []
      const image = await genererImage([reference, ...(logo ? [logo] : []), ...choisies], consigne(marque, !!logo, choisies.length, precision))
      const fichiers: Record<FormatCrea, () => Promise<[string, Buffer]>> = {
        '1:1': async () => [image.mimeType, image.octets],
        '9:16': async () => ['image/jpeg', await versStory(image.octets)],
      }
      return Promise.all(formats.map(async (format: FormatCrea) => {
        const [type, octets] = await fichiers[format]()
        const chemin = await deposer(`creas/${compte.id}/${randomUUID()}`, type, octets)
        return prisma.creaGeneree.create({ data: { adAccountId: compte.id, pubId: pub.id, format, chemin, modele: image.modele, consigne: precision || null } })
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
