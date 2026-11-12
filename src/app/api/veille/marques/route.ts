import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { estCategorie } from '@/lib/veille/categories'

/** Corriger à la main la catégorie d'une marque. */
export async function PATCH(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })
  const corps = await req.json().catch(() => null)
  if (typeof corps?.id !== 'string' || !estCategorie(corps.categorie)) {
    return NextResponse.json({ erreur: 'Marque ou catégorie invalide' }, { status: 400 })
  }
  const marque = await prisma.veilleMarque.update({ where: { id: corps.id }, data: { categorie: corps.categorie }, select: { id: true, categorie: true } })
  return NextResponse.json(marque)
}
