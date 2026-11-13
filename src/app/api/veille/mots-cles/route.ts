import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * Les mots-clés de la collecte quotidienne : liste des actifs et des
 * suggestions (GET), ajout à la main (POST), validation ou refus (PATCH).
 * Un mot-clé retiré est gardé « refuse » : l'IA ne le reproposera pas.
 */
const refus = () => NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })

export async function GET() {
  if (!(await getServerSession(authOptions))) return refus()
  const motsCles = await prisma.veilleMotCle.findMany({ where: { statut: { not: 'refuse' } }, orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ motsCles })
}

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return refus()
  const corps = await req.json().catch(() => null)
  const motCle = typeof corps?.motCle === 'string' ? corps.motCle.trim().replace(/\s+/g, ' ') : ''
  if (motCle.length < 2 || motCle.length > 80) return NextResponse.json({ erreur: 'Mot-clé invalide' }, { status: 400 })
  const deja = await prisma.veilleMotCle.findFirst({ where: { motCle: { equals: motCle, mode: 'insensitive' } } })
  if (deja) return NextResponse.json(await prisma.veilleMotCle.update({ where: { id: deja.id }, data: { statut: 'actif' } }))
  return NextResponse.json(await prisma.veilleMotCle.create({ data: { motCle } }))
}

export async function PATCH(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return refus()
  const corps = await req.json().catch(() => null)
  if (typeof corps?.id !== 'string' || !['actif', 'refuse'].includes(corps.statut)) return NextResponse.json({ erreur: 'Requête invalide' }, { status: 400 })
  await prisma.veilleMotCle.updateMany({ where: { id: corps.id }, data: { statut: corps.statut } })
  return NextResponse.json({ ok: true })
}
