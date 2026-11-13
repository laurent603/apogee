import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { normaliserTransparence } from '@/lib/veille/adLibrary'
import { cleExtensionValide } from '@/lib/veille/cle'

/**
 * Le relevé quotidien de la couverture : la tâche du Mac envoie la fiche de
 * chaque pub des marques suivies (POST, clé de l'extension) ; le rapport
 * Espion lit les relevés d'une marque sur 90 jours (GET, session).
 */
export async function POST(req: NextRequest) {
  if (!cleExtensionValide(req)) return NextResponse.json({ erreur: 'Clé de l’extension refusée' }, { status: 401 })
  const corps = await req.json().catch(() => null)
  const lues = (Array.isArray(corps?.pubs) ? corps.pubs : [])
    .map((p: { adArchiveId?: unknown; transparence?: unknown }) => ({ adArchiveId: String(p?.adArchiveId ?? ''), t: normaliserTransparence(p?.transparence) }))
    .filter((p: { adArchiveId: string; t: ReturnType<typeof normaliserTransparence> }) => p.adArchiveId && p.t?.reachUe)
  if (!lues.length) return NextResponse.json({ relevees: 0 })

  const connues = await prisma.veillePub.findMany({ where: { adArchiveId: { in: lues.map((l: { adArchiveId: string }) => l.adArchiveId) } }, select: { id: true, adArchiveId: true } })
  const idDe = new Map(connues.map((c) => [c.adArchiveId, c.id]))
  const jour = new Date(new Date().toISOString().slice(0, 10))
  const operations: Prisma.PrismaPromise<unknown>[] = []
  for (const { adArchiveId, t } of lues) {
    const pubId = idDe.get(adArchiveId)
    if (!pubId || !t?.reachUe) continue
    operations.push(
      prisma.veilleMesure.upsert({ where: { pubId_jour: { pubId, jour } }, create: { pubId, jour, reachUe: t.reachUe }, update: { reachUe: t.reachUe } }),
      prisma.veillePub.update({ where: { id: pubId }, data: { reachUe: t.reachUe, transparence: t } }),
    )
  }
  await prisma.$transaction(operations)
  return NextResponse.json({ relevees: operations.length / 2 })
}

export async function GET(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })
  const marque = req.nextUrl.searchParams.get('marque')
  if (!marque) return NextResponse.json({ mesures: [] })
  const lignes = await prisma.veilleMesure.findMany({
    where: { pub: { marqueId: marque, masquee: false }, jour: { gte: new Date(Date.now() - 90 * 86_400_000) } },
    select: { pubId: true, jour: true, reachUe: true },
    orderBy: { jour: 'asc' },
  })
  return NextResponse.json({ mesures: lignes.map((l) => ({ ...l, jour: l.jour.toISOString().slice(0, 10) })) })
}
