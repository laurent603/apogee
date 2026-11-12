import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/** Mettre une marque sous veille (POST) ou l'en retirer (DELETE). */
async function basculer(req: NextRequest, suivie: boolean) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })
  const corps = await req.json().catch(() => null)
  if (typeof corps?.marqueId !== 'string') return NextResponse.json({ erreur: 'marqueId manquant' }, { status: 400 })
  const marque = await prisma.veilleMarque.update({
    where: { id: corps.marqueId },
    // Le début du suivi sert de base : ce qui était déjà là n'est pas « nouveau ».
    data: suivie ? { suivie: true, suivieDepuis: new Date() } : { suivie: false, suivieDepuis: null },
    select: { id: true, suivie: true, suivieDepuis: true },
  })
  return NextResponse.json(marque)
}

export const POST = (req: NextRequest) => basculer(req, true)
export const DELETE = (req: NextRequest) => basculer(req, false)
