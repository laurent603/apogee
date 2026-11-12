import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cleExtensionValide } from '@/lib/veille/cle'
import { notifyVeille } from '@/lib/notify'

/**
 * Fin de la vérification d'une marque suivie, envoyée par l'extension.
 * `vus` : toutes les pubs actives lues dans la Ad Library ; `nouvelles` :
 * celles qu'elle vient d'envoyer à la capture ; `complet` : la liste a été
 * lue jusqu'au bout. Seule une liste complète permet de dire qu'une pub
 * absente est arrêtée.
 */
export async function POST(req: NextRequest) {
  if (!cleExtensionValide(req)) return NextResponse.json({ erreur: 'Clé de l’extension refusée' }, { status: 401 })
  const corps = await req.json().catch(() => null)
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^\d+$/.test(x)) : [])
  const vus = ids(corps?.vus)
  const nouvelles = ids(corps?.nouvelles)
  if (typeof corps?.pageId !== 'string') return NextResponse.json({ erreur: 'pageId manquant' }, { status: 400 })

  const marque = await prisma.veilleMarque.findUnique({ where: { pageId: corps.pageId } })
  if (!marque) return NextResponse.json({ erreur: 'Marque inconnue' }, { status: 404 })

  const maintenant = new Date()
  // Une lecture vide (page indisponible, scan raté) n'arrête rien.
  const arreter = corps.complet === true && vus.length > 0
  const resultats = await prisma.$transaction([
    prisma.veillePub.updateMany({ where: { marqueId: marque.id, adArchiveId: { in: vus } }, data: { active: true, derniereVue: maintenant } }),
    prisma.veilleMarque.update({ where: { id: marque.id }, data: { derniereVerif: maintenant } }),
    ...(arreter
      ? [prisma.veillePub.updateMany({ where: { marqueId: marque.id, active: true, adArchiveId: { notIn: vus } }, data: { active: false, fin: maintenant } })]
      : []),
  ])
  const arretees = arreter ? (resultats[2] as { count: number }).count : 0

  if (nouvelles.length) {
    const pubs = await prisma.veillePub.findMany({ where: { adArchiveId: { in: nouvelles } }, select: { titre: true, texte: true, adArchiveId: true } })
    await notifyVeille({ marque: marque.nom, nouvelles: pubs, arretees })
  }
  return NextResponse.json({ nouvelles: nouvelles.length, arretees })
}
