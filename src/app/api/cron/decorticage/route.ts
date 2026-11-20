import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { decortiquer } from '@/lib/veille/gemini'
import { urlPublique } from '@/lib/veille/stockage'
import { cronAutorise } from '@/lib/cron-auth'

/**
 * Rattrapage nocturne du décorticage sur les marques en veille.
 *
 * Sans transcription, l'analyse d'une marque ne lit que le texte publicitaire
 * — alors que quatre créas sur cinq sont des vidéos dont tout le message est
 * dans la bande son. Ce passage comble le retard, un lot par nuit.
 *
 * Borné et reprenable, comme le scan : on traite les plus anciennement vues
 * d'abord, on s'arrête avant l'échéance, le passage suivant reprend. Trois
 * créneaux par nuit dans vercel.json, le temps que le retard se résorbe.
 */

export const maxDuration = 300

/** Un décorticage peut prendre près d'une minute : il faut cette marge. */
const MARGE_MS = 70_000

const visees: Prisma.VeillePubWhereInput = {
  masquee: false,
  analyse: { equals: Prisma.DbNull },
  marque: { suivie: true, masquee: false },
  OR: [{ active: true }, { fin: { gte: new Date(Date.now() - 30 * 86_400_000) } }],
}

export async function GET(req: NextRequest) {
  if (!cronAutorise(req)) return NextResponse.json({ erreur: 'Refusé' }, { status: 401 })
  const echeance = Date.now() + (maxDuration - 30) * 1000

  const aFaire = await prisma.veillePub.findMany({
    where: visees,
    orderBy: { premiereVue: 'asc' },
    select: { id: true, adArchiveId: true, titre: true, texte: true, medias: true },
    take: 8,
  })

  let faites = 0
  let echecs = 0
  for (const pub of aFaire) {
    if (Date.now() + MARGE_MS > echeance) break
    const medias = pub.medias as { type: string; chemin: string }[]
    const media = medias.find((m) => m.type === 'video') ?? medias[0]
    if (!media) continue
    try {
      const analyse = await decortiquer(urlPublique(media.chemin), { titre: pub.titre, texte: pub.texte })
      await prisma.veillePub.update({ where: { id: pub.id }, data: { analyse } })
      faites++
    } catch (e) {
      // Marqué en échec pour ne pas revenir en tête du lot suivant : un seul
      // média cassé bloquerait toute la file.
      echecs++
      const message = (e as Error).message
      console.error('[cron/decorticage]', pub.adArchiveId, message)
      await prisma.veillePub.update({
        where: { id: pub.id },
        data: { analyse: { accroche: '', angle: '', concept: '', structure: [], transcription: [], echec: message, date: new Date().toISOString() } },
      })
    }
  }

  const restantes = await prisma.veillePub.count({ where: visees })
  return NextResponse.json({ faites, echecs, restantes })
}
