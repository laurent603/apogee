import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cleExtensionValide } from '@/lib/veille/cle'

/**
 * Pour l'extension : les marques suivies et les pubs déjà connues de chacune.
 * Elle ne lira la fiche détaillée que des pubs absentes de cette liste.
 */
export async function GET(req: NextRequest) {
  if (!cleExtensionValide(req)) return NextResponse.json({ erreur: 'Clé de l’extension refusée' }, { status: 401 })
  const marques = await prisma.veilleMarque.findMany({
    where: { suivie: true },
    select: { id: true, pageId: true, nom: true, pubs: { select: { adArchiveId: true } } },
  })
  return NextResponse.json(marques.map((m) => ({ id: m.id, pageId: m.pageId, nom: m.nom, connus: m.pubs.map((p) => p.adArchiveId) })))
}
