import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { estCategorie } from '@/lib/veille/categories'

/**
 * Le secteur d'un client (compte Meta) et les marques cachées pour lui :
 * lus (GET), secteur choisi (PUT, null pour l'effacer), marque cachée ou
 * réaffichée (PATCH).
 */
const refus = () => NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })

export async function GET(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return refus()
  const compte = req.nextUrl.searchParams.get('compte')
  if (!compte) return NextResponse.json({ categorie: null, cachees: [] })
  const [ligne, cachees] = await Promise.all([
    prisma.veilleSecteurClient.findUnique({ where: { metaAccountId: compte } }),
    prisma.veilleMarqueCachee.findMany({ where: { metaAccountId: compte }, select: { marqueId: true } }),
  ])
  return NextResponse.json({ categorie: ligne?.categorie ?? null, cachees: cachees.map((c) => c.marqueId) })
}

export async function PATCH(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return refus()
  const corps = await req.json().catch(() => null)
  if (typeof corps?.compte !== 'string' || !corps.compte || typeof corps.marqueId !== 'string' || typeof corps.cachee !== 'boolean') {
    return NextResponse.json({ erreur: 'Requête invalide' }, { status: 400 })
  }
  const cle = { metaAccountId: corps.compte, marqueId: corps.marqueId }
  if (corps.cachee) await prisma.veilleMarqueCachee.upsert({ where: { metaAccountId_marqueId: cle }, create: cle, update: {} })
  else await prisma.veilleMarqueCachee.deleteMany({ where: cle })
  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return refus()
  const corps = await req.json().catch(() => null)
  if (typeof corps?.compte !== 'string' || !corps.compte) return NextResponse.json({ erreur: 'Compte manquant' }, { status: 400 })
  if (corps.categorie === null) {
    await prisma.veilleSecteurClient.deleteMany({ where: { metaAccountId: corps.compte } })
    return NextResponse.json({ categorie: null })
  }
  if (!estCategorie(corps.categorie)) return NextResponse.json({ erreur: 'Secteur inconnu' }, { status: 400 })
  const ligne = await prisma.veilleSecteurClient.upsert({
    where: { metaAccountId: corps.compte },
    create: { metaAccountId: corps.compte, categorie: corps.categorie },
    update: { categorie: corps.categorie },
  })
  return NextResponse.json({ categorie: ligne.categorie })
}
