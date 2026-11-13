import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cleExtensionValide } from '@/lib/veille/cle'

/**
 * La collecte quotidienne (tâche du Mac, clé de l’extension) : les mots-clés à
 * lire et les pubs déjà connues (GET), puis le bilan de chaque mot-clé (POST).
 */
const refus = () => NextResponse.json({ erreur: 'Clé de l’extension refusée' }, { status: 401 })

export async function GET(req: NextRequest) {
  if (!cleExtensionValide(req)) return refus()
  const [motsCles, pubs] = await Promise.all([
    prisma.veilleMotCle.findMany({ select: { id: true, motCle: true, pays: true }, orderBy: { createdAt: 'asc' } }),
    // ponytail: toute la base en une liste ; à paginer si elle dépasse quelques dizaines de milliers de pubs.
    prisma.veillePub.findMany({ select: { adArchiveId: true } }),
  ])
  return NextResponse.json({ motsCles, connus: pubs.map((p) => p.adArchiveId) })
}

export async function POST(req: NextRequest) {
  if (!cleExtensionValide(req)) return refus()
  const corps = await req.json().catch(() => null)
  if (typeof corps?.id !== 'string' || typeof corps.bilan !== 'string') return NextResponse.json({ erreur: 'Bilan invalide' }, { status: 400 })
  await prisma.veilleMotCle.updateMany({ where: { id: corps.id }, data: { derniereCollecte: new Date(), dernierBilan: corps.bilan.slice(0, 120) } })
  return NextResponse.json({ ok: true })
}
