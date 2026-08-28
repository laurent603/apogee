import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const dbAccountId = searchParams.get('dbAccountId')
  const type = searchParams.get('type')
  const adId = searchParams.get('adId')
  const id = searchParams.get('id')

  // Un rapport demandé par son identifiant est rendu entier : c'est le seul
  // cas où l'on veut son texte.
  if (id) {
    const report = await prisma.report.findUnique({ where: { id } })
    if (!report) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    return NextResponse.json({ report })
  }

  /**
   * La liste ne porte pas les contenus.
   *
   * Un rapport d'agent fait plusieurs milliers de caractères ; cinquante
   * d'entre eux rendraient la liste lourde pour un texte qu'on n'affiche pas
   * avant d'avoir cliqué.
   */
  const reports = await prisma.report.findMany({
    where: {
      adAccountId: dbAccountId || undefined,
      type: type && type !== 'all' ? type : undefined,
      adId: adId || undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, title: true, type: true, adId: true, adName: true, createdAt: true, downloadedAt: true },
  })

  // Les types réellement présents, pour ne proposer que des filtres qui
  // rendent quelque chose.
  const types = await prisma.report.groupBy({
    by: ['type'],
    where: { adAccountId: dbAccountId || undefined },
    _count: true,
  })

  return NextResponse.json({
    reports,
    types: types.map((t) => ({ type: t.type, nombre: t._count })).sort((a, b) => b.nombre - a.nombre),
  })
}

/** Marque un rapport comme téléchargé. */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const r = await prisma.report.update({
    where: { id },
    data: { downloadedAt: new Date() },
    select: { downloadedAt: true },
  })
  return NextResponse.json({ downloadedAt: r.downloadedAt })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  await prisma.report.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
