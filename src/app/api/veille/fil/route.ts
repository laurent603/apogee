import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { urlPublique } from '@/lib/veille/stockage'

/**
 * La page Veille : les marques suivies avec leurs chiffres, et les pubs
 * apparues depuis le début du suivi (nouvelles, installées, arrêtées).
 */

const JOUR = 86_400_000
// Une nouveauté qui tourne encore après une semaine « s'installe ».
const INSTALLEE_APRES = 7

export async function GET() {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })
  const marques = await prisma.veilleMarque.findMany({ where: { suivie: true }, orderBy: { nom: 'asc' } })
  const maintenant = Date.now()

  const pubs = (
    await Promise.all(
      marques.map((m) =>
        prisma.veillePub.findMany({
          where: { marqueId: m.id, premiereVue: { gt: m.suivieDepuis ?? new Date() } },
          orderBy: { premiereVue: 'desc' },
          take: 100,
          include: { marque: { select: { id: true, nom: true } }, sauvegardes: { select: { id: true, dossierId: true } } },
        }),
      ),
    )
  ).flat()

  const actives = await prisma.veillePub.groupBy({ by: ['marqueId'], where: { marqueId: { in: marques.map((m) => m.id) }, active: true }, _count: true })
  const nbActives = new Map(actives.map((a) => [a.marqueId, a._count]))

  const lignes = marques.map((m) => {
    const siennes = pubs.filter((p) => p.marqueId === m.id)
    const recentes = siennes.filter((p) => maintenant - p.premiereVue.getTime() <= 30 * JOUR)
    const jugeables = siennes.filter((p) => maintenant - p.premiereVue.getTime() >= INSTALLEE_APRES * JOUR)
    return {
      id: m.id,
      nom: m.nom,
      pageId: m.pageId,
      suivieDepuis: m.suivieDepuis,
      derniereVerif: m.derniereVerif,
      actives: nbActives.get(m.id) ?? 0,
      nouvelles30: recentes.length,
      arretees30: siennes.filter((p) => !p.active && p.fin && maintenant - p.fin.getTime() <= 30 * JOUR).length,
      // Part des nouveautés d'au moins une semaine qui tournent encore.
      survie: jugeables.length ? Math.round((100 * jugeables.filter((p) => p.active).length) / jugeables.length) : null,
    }
  })

  return NextResponse.json({
    marques: lignes,
    installeeApres: INSTALLEE_APRES,
    pubs: pubs.map((l) => ({
      ...l,
      medias: (l.medias as { type: string; chemin: string; apercu?: string }[]).map((m) => ({
        type: m.type,
        url: urlPublique(m.chemin),
        apercu: m.apercu ? urlPublique(m.apercu) : null,
      })),
    })),
  })
}
