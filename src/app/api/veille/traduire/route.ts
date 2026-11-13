import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { traduire, type Decorticage } from '@/lib/veille/gemini'

export const maxDuration = 120

/** Traduit en français la transcription d'une pub décortiquée ; gardée sur la pub pour ne pas repayer. */
export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })
  const corps = await req.json().catch(() => null)
  if (typeof corps?.pubId !== 'string') return NextResponse.json({ erreur: 'pubId manquant' }, { status: 400 })
  const pub = await prisma.veillePub.findUnique({ where: { id: corps.pubId }, select: { analyse: true } })
  const analyse = pub?.analyse as Decorticage | null
  if (!analyse?.transcription?.length) return NextResponse.json({ erreur: 'Pas de transcription : décortiquez la pub d’abord' }, { status: 422 })
  if (analyse.traductionFr?.length === analyse.transcription.length) return NextResponse.json({ traduction: analyse.traductionFr })
  try {
    const traduction = await traduire(analyse.transcription.map((g) => g.texte))
    await prisma.veillePub.update({ where: { id: corps.pubId }, data: { analyse: { ...analyse, traductionFr: traduction } as unknown as Prisma.InputJsonValue } })
    return NextResponse.json({ traduction })
  } catch (e) {
    return NextResponse.json({ erreur: (e as Error).message }, { status: 502 })
  }
}
