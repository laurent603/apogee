import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { classerMarques } from '@/lib/veille/gemini'
import { CATEGORIES, estCategorie } from '@/lib/veille/categories'

/**
 * Range dans une catégorie les marques qui n'en ont pas encore, par lots :
 * appelé après un scan Espion et à l'ouverture de Discovery. Une catégorie
 * déjà posée, par Gemini ou à la main, n'est jamais touchée.
 */

export const maxDuration = 120
const PAR_LOT = 30

export async function POST() {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })
  const marques = await prisma.veilleMarque.findMany({
    where: { categorie: null, pubs: { some: {} } },
    take: PAR_LOT,
    select: { id: true, nom: true, pubs: { take: 4, orderBy: { premiereVue: 'desc' }, select: { titre: true, texte: true } } },
  })
  if (!marques.length) return NextResponse.json({ classees: 0 })

  try {
    const categories = await classerMarques(
      marques.map((m) => ({ nom: m.nom, textes: m.pubs.map((p) => [p.titre, p.texte].filter(Boolean).join(' — ')).filter(Boolean) })),
      CATEGORIES,
    )
    await prisma.$transaction(
      marques.map((m, i) => prisma.veilleMarque.update({ where: { id: m.id }, data: { categorie: estCategorie(categories[i]) ? categories[i] : 'Autre' } })),
    )
    return NextResponse.json({ classees: marques.length })
  } catch (e) {
    console.error('[veille/marques/categoriser]', (e as Error).message)
    return NextResponse.json({ erreur: (e as Error).message }, { status: 502 })
  }
}
