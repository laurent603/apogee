import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * Ranger une pub dans la bibliothèque, la déplacer, l'en retirer.
 * Une pub n'apparaît qu'une fois par dossier.
 */

async function connecte() {
  return !!(await getServerSession(authOptions))
}
const refus = () => NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })
const dossierDe = (v: unknown) => (typeof v === 'string' && v ? v : null)

export async function POST(req: NextRequest) {
  if (!(await connecte())) return refus()
  const corps = await req.json().catch(() => null)
  if (typeof corps?.pubId !== 'string') return NextResponse.json({ erreur: 'pubId manquant' }, { status: 400 })
  const dossierId = dossierDe(corps.dossierId)

  const deja = await prisma.veilleSauvegarde.findFirst({ where: { pubId: corps.pubId, dossierId } })
  if (deja) return NextResponse.json({ ...deja, deja: true })
  const sauvegarde = await prisma.veilleSauvegarde.create({ data: { pubId: corps.pubId, dossierId } })
  return NextResponse.json(sauvegarde)
}

export async function PATCH(req: NextRequest) {
  if (!(await connecte())) return refus()
  const corps = await req.json().catch(() => null)
  if (typeof corps?.id !== 'string') return NextResponse.json({ erreur: 'id manquant' }, { status: 400 })
  const dossierId = dossierDe(corps.dossierId)

  const actuelle = await prisma.veilleSauvegarde.findUnique({ where: { id: corps.id } })
  if (!actuelle) return NextResponse.json({ erreur: 'Introuvable' }, { status: 404 })
  const doublon = await prisma.veilleSauvegarde.findFirst({
    where: { pubId: actuelle.pubId, dossierId, NOT: { id: actuelle.id } },
  })
  // Déjà rangée là-bas : on retire seulement l'exemplaire déplacé.
  if (doublon) await prisma.veilleSauvegarde.delete({ where: { id: actuelle.id } })
  else await prisma.veilleSauvegarde.update({ where: { id: actuelle.id }, data: { dossierId } })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!(await connecte())) return refus()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ erreur: 'id manquant' }, { status: 400 })
  await prisma.veilleSauvegarde.deleteMany({ where: { id } })
  return NextResponse.json({ ok: true })
}
