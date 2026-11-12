import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decortiquer } from '@/lib/veille/gemini'
import { urlPublique } from '@/lib/veille/stockage'

/**
 * « Décortiquer cette pub » : lance l'analyse Gemini du premier média (la
 * vidéo de préférence) et la garde sur la pub. Un second appel renvoie
 * l'analyse gardée, sauf `refaire: true`.
 */

// Deux modèles à 50 s au plus, plus le téléchargement du média.
export const maxDuration = 120

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })
  const corps = await req.json().catch(() => null)
  if (typeof corps?.pubId !== 'string') return NextResponse.json({ erreur: 'pubId manquant' }, { status: 400 })

  const pub = await prisma.veillePub.findUnique({ where: { id: corps.pubId } })
  if (!pub) return NextResponse.json({ erreur: 'Pub introuvable' }, { status: 404 })
  if (pub.analyse && corps.refaire !== true) return NextResponse.json(pub.analyse)

  const medias = pub.medias as { type: string; chemin: string }[]
  const media = medias.find((m) => m.type === 'video') ?? medias[0]
  if (!media) return NextResponse.json({ erreur: 'Cette pub n’a pas de média à analyser' }, { status: 422 })

  try {
    const analyse = await decortiquer(urlPublique(media.chemin), { titre: pub.titre, texte: pub.texte })
    await prisma.veillePub.update({ where: { id: pub.id }, data: { analyse } })
    return NextResponse.json(analyse)
  } catch (e) {
    console.error('[veille/decortiquer]', pub.adArchiveId, (e as Error).message)
    return NextResponse.json({ erreur: (e as Error).message }, { status: 502 })
  }
}
