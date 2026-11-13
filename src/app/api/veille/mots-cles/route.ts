import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/** Les mots-clés de la collecte de nuit : liste (GET), ajout (POST), retrait (DELETE). */
const refus = () => NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })

export async function GET() {
  if (!(await getServerSession(authOptions))) return refus()
  const motsCles = await prisma.veilleMotCle.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ motsCles })
}

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return refus()
  const corps = await req.json().catch(() => null)
  const motCle = typeof corps?.motCle === 'string' ? corps.motCle.trim().replace(/\s+/g, ' ') : ''
  if (motCle.length < 2 || motCle.length > 80) return NextResponse.json({ erreur: 'Mot-clé invalide' }, { status: 400 })
  const deja = await prisma.veilleMotCle.findFirst({ where: { motCle: { equals: motCle, mode: 'insensitive' } } })
  if (deja) return NextResponse.json(deja)
  return NextResponse.json(await prisma.veilleMotCle.create({ data: { motCle } }))
}

export async function DELETE(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return refus()
  const corps = await req.json().catch(() => null)
  if (typeof corps?.id !== 'string') return NextResponse.json({ erreur: 'id manquant' }, { status: 400 })
  await prisma.veilleMotCle.deleteMany({ where: { id: corps.id } })
  return NextResponse.json({ ok: true })
}
