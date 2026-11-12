import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { analyserMarque, type PubPourAnalyse } from '@/lib/veille/gemini'

/**
 * L'analyse IA d'une marque : GET la renvoie si elle existe, POST la lance
 * (ou la relance avec `refaire: true`) sur ses pubs actives et la garde.
 */

export const maxDuration = 120
// Au-delà, le texte envoyé grossit sans changer les conclusions.
const PUBS_MAX = 80

const refus = () => NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })

export async function GET(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return refus()
  const id = req.nextUrl.searchParams.get('marqueId')
  if (!id) return NextResponse.json({ erreur: 'marqueId manquant' }, { status: 400 })
  const marque = await prisma.veilleMarque.findUnique({ where: { id }, select: { analyse: true } })
  return NextResponse.json(marque?.analyse ?? null)
}

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return refus()
  const corps = await req.json().catch(() => null)
  if (typeof corps?.marqueId !== 'string') return NextResponse.json({ erreur: 'marqueId manquant' }, { status: 400 })

  const marque = await prisma.veilleMarque.findUnique({ where: { id: corps.marqueId } })
  if (!marque) return NextResponse.json({ erreur: 'Marque introuvable' }, { status: 404 })
  if (marque.analyse && corps.refaire !== true) return NextResponse.json(marque.analyse)

  const pubs = await prisma.veillePub.findMany({
    where: { marqueId: marque.id, active: true },
    orderBy: [{ reachUe: { sort: 'desc', nulls: 'last' } }, { debut: 'asc' }],
    take: PUBS_MAX,
  })
  if (!pubs.length) return NextResponse.json({ erreur: 'Aucune pub active à analyser' }, { status: 422 })

  try {
    const analyse = await analyserMarque(
      marque.nom,
      pubs.map((p) => ({
        id: p.id,
        format: p.format,
        jours: p.debut ? Math.round((Date.now() - p.debut.getTime()) / 86_400_000) : null,
        reachUe: p.reachUe,
        titre: p.titre,
        texte: p.texte,
        cta: p.cta,
        lienUrl: p.lienUrl,
        analyse: p.analyse as PubPourAnalyse['analyse'],
      })),
    )
    await prisma.veilleMarque.update({ where: { id: marque.id }, data: { analyse } })
    return NextResponse.json(analyse)
  } catch (e) {
    console.error('[veille/marques/analyse]', marque.nom, (e as Error).message)
    return NextResponse.json({ erreur: (e as Error).message }, { status: 502 })
  }
}
