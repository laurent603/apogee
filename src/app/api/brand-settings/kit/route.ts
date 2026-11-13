import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deposer, urlPublique } from '@/lib/veille/stockage'

/**
 * Le kit visuel d'un client (logo, couleurs, photos réelles), repris par
 * « Recréer pour ce client ». Écrit ici seulement : la sauvegarde de Brand
 * Settings ne le touche pas.
 */

const TYPES = ['image/png', 'image/jpeg', 'image/webp']
/** Les guidelines en texte libre, reprises par les nouveaux concepts. */
const GUIDELINES = ['typoTitre', 'typoTexte', 'tonDeVoix', 'motsAEmployer', 'motsAEviter'] as const
type Guidelines = Partial<Record<(typeof GUIDELINES)[number], string | null>>
const TAILLE_MAX = 8 * 1024 * 1024
const PHOTOS_MAX = 8
const COULEURS_MAX = 6

/** Le compte, s'il appartient à l'utilisateur connecté. */
async function compteDe(req: NextRequest, dbAccountId: unknown) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || typeof dbAccountId !== 'string') return null
  return prisma.adAccount.findFirst({ where: { id: dbAccountId, userId: session.user.id }, select: { id: true } })
}

async function kit(adAccountId: string) {
  const s = await prisma.brandSettings.findUnique({
    where: { adAccountId },
    select: { logoChemin: true, logoClairChemin: true, couleurs: true, photos: true, ...Object.fromEntries(GUIDELINES.map((g) => [g, true])) },
  })
  return {
    logo: s?.logoChemin ? urlPublique(s.logoChemin) : null,
    logoClair: s?.logoClairChemin ? urlPublique(s.logoClairChemin) : null,
    guidelines: Object.fromEntries(GUIDELINES.map((g) => [g, (s as Record<string, unknown> | null)?.[g] ?? ''])) as Record<(typeof GUIDELINES)[number], string>,
    couleurs: s?.couleurs ?? [],
    photos: (s?.photos ?? []).map((chemin) => ({ chemin, url: urlPublique(chemin) })),
  }
}

const enregistrer = (adAccountId: string, data: Guidelines & { logoChemin?: string | null; logoClairChemin?: string | null; couleurs?: string[]; photos?: string[] }) =>
  prisma.brandSettings.upsert({ where: { adAccountId }, update: data, create: { adAccountId, ...data } })

export async function GET(req: NextRequest) {
  const compte = await compteDe(req, req.nextUrl.searchParams.get('dbAccountId'))
  if (!compte) return NextResponse.json({ erreur: 'Compte introuvable' }, { status: 404 })
  return NextResponse.json(await kit(compte.id))
}

/** Dépose un logo (il remplace l'ancien : `logo`, ou `logoClair` pour fonds sombres) ou ajoute une photo. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const compte = await compteDe(req, form?.get('dbAccountId'))
  if (!compte) return NextResponse.json({ erreur: 'Compte introuvable' }, { status: 404 })
  const quoi = form!.get('quoi')
  const fichier = form!.get('fichier')
  if ((quoi !== 'logo' && quoi !== 'logoClair' && quoi !== 'photo') || !(fichier instanceof File)) return NextResponse.json({ erreur: 'Fichier manquant' }, { status: 400 })
  if (!TYPES.includes(fichier.type)) return NextResponse.json({ erreur: 'Image PNG, JPEG ou WebP seulement' }, { status: 400 })
  if (fichier.size > TAILLE_MAX) return NextResponse.json({ erreur: 'Image trop lourde (8 Mo au plus)' }, { status: 400 })

  const actuel = await kit(compte.id)
  if (quoi === 'photo' && actuel.photos.length >= PHOTOS_MAX) return NextResponse.json({ erreur: `${PHOTOS_MAX} photos au plus` }, { status: 400 })
  // Un nom neuf à chaque dépôt : l'ancien logo resterait sinon en cache chez le navigateur.
  const chemin = await deposer(`marques/${compte.id}/${quoi}-${Date.now()}`, fichier.type, Buffer.from(await fichier.arrayBuffer()))
  await enregistrer(compte.id, quoi === 'logo' ? { logoChemin: chemin } : quoi === 'logoClair' ? { logoClairChemin: chemin } : { photos: [...actuel.photos.map((p) => p.chemin), chemin] })
  return NextResponse.json(await kit(compte.id))
}

/** Couleurs, guidelines, ou retrait d'un logo ou d'une photo. */
export async function PATCH(req: NextRequest) {
  const corps = await req.json().catch(() => null)
  const compte = await compteDe(req, corps?.dbAccountId)
  if (!compte) return NextResponse.json({ erreur: 'Compte introuvable' }, { status: 404 })

  if (Array.isArray(corps.couleurs)) {
    const couleurs = corps.couleurs.filter((c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)).slice(0, COULEURS_MAX)
    await enregistrer(compte.id, { couleurs })
  }
  const guidelines = Object.fromEntries(
    GUIDELINES.filter((g) => typeof corps[g] === 'string').map((g) => [g, corps[g].trim().slice(0, 400) || null]),
  ) as Guidelines
  if (Object.keys(guidelines).length) await enregistrer(compte.id, guidelines)
  if (corps.retirerLogo === true) await enregistrer(compte.id, { logoChemin: null })
  if (corps.retirerLogoClair === true) await enregistrer(compte.id, { logoClairChemin: null })
  if (typeof corps.retirerPhoto === 'string') {
    const actuel = await kit(compte.id)
    await enregistrer(compte.id, { photos: actuel.photos.map((p) => p.chemin).filter((c) => c !== corps.retirerPhoto) })
  }
  return NextResponse.json(await kit(compte.id))
}
