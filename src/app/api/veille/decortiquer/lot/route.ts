import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decortiquer } from '@/lib/veille/gemini'
import { urlPublique } from '@/lib/veille/stockage'
import { Prisma } from '@prisma/client'
import { cronAutorise } from '@/lib/cron-auth'

/**
 * Décorticage par lots des créas des marques en veille.
 *
 * L'analyse d'une marque ne lisait que le texte publicitaire. Sur les marques
 * suivies, quatre créas sur cinq sont des vidéos dont tout le message est dans
 * la bande son : les parts affichées étaient calculées sur les seules créas
 * bavardes. Il faut donc une transcription avant d'analyser, et c'est un appel
 * multimodal par créa — impossible en une requête.
 *
 * Le travail est **borné dans le temps et reprenable** : on traite les plus
 * anciennement vues d'abord, on s'arrête avant l'échéance, et le passage
 * suivant reprend sur ce qui reste. Aucun état à garder — l'absence d'analyse
 * suffit à dire ce qui reste à faire.
 *
 * Réservé aux marques en veille active : sur les 362 marques connues, ce
 * serait des milliers d'appels sans que personne les lise.
 */

export const maxDuration = 300

/** Il faut de la marge : un décorticage peut prendre près d'une minute. */
const MARGE_MS = 70_000

const visees = (marqueId?: string): Prisma.VeillePubWhereInput => ({
  masquee: false,
  analyse: { equals: Prisma.DbNull },
  marque: { suivie: true, masquee: false, ...(marqueId ? { id: marqueId } : {}) },
  // Mêmes créas que l'analyse de marque : actives, ou arrêtées ce mois-ci.
  OR: [{ active: true }, { fin: { gte: new Date(Date.now() - 30 * 86_400_000) } }],
})

/** Combien reste-t-il à décortiquer, pour une marque ou pour toute la veille. */
export async function GET(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })
  const marqueId = req.nextUrl.searchParams.get('marque') ?? undefined
  return NextResponse.json({ restantes: await prisma.veillePub.count({ where: visees(marqueId) }) })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session && !cronAutorise(req)) return NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })

  const corps = await req.json().catch(() => null)
  const marqueId = typeof corps?.marqueId === 'string' ? corps.marqueId : undefined
  const echeance = Date.now() + (maxDuration - 30) * 1000

  const aFaire = await prisma.veillePub.findMany({
    where: visees(marqueId),
    orderBy: { premiereVue: 'asc' },
    select: { id: true, adArchiveId: true, titre: true, texte: true, medias: true },
    take: 8,
  })

  let faites = 0
  let echecs = 0
  let dernierEchec: string | null = null
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
      // Un média trop lourd ou d'un format refusé est marqué comme tel. Sans
      // cette marque il reviendrait en tête du lot suivant, et un seul média
      // cassé suffirait à bloquer toute la file.
      echecs++
      dernierEchec = (e as Error).message
      console.error('[veille/decortiquer/lot]', pub.adArchiveId, dernierEchec)
      await prisma.veillePub.update({
        where: { id: pub.id },
        data: { analyse: { accroche: '', angle: '', concept: '', structure: [], transcription: [], echec: dernierEchec, date: new Date().toISOString() } },
      })
    }
  }

  const restantes = await prisma.veillePub.count({ where: visees(marqueId) })
  return NextResponse.json({ faites, echecs, dernierEchec, restantes })
}
