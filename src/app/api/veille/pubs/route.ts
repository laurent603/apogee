import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { urlPublique } from '@/lib/veille/stockage'
import { CATEGORIES } from '@/lib/veille/categories'

/**
 * Les pubs de la veille, filtrées — pour Discovery (toutes) et pour la
 * Bibliothèque (`dossier` = `tous`, `sans` ou l'id d'un dossier).
 *
 * `n` est le nombre de pubs voulues : « Charger plus » le fait grandir.
 */

const PAR_PAGE = 60
const MAX = 600
// translate() exige deux chaînes de même longueur : une lettre par accent.
const AVEC_ACCENTS = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ'
const SANS_ACCENTS = 'aaaaaaceeeeiiiinooooouuuuyy'

const sansAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Recherche sans accents ni casse dans le texte, le titre, la description et la marque. */
async function idsCorrespondant(q: string): Promise<string[]> {
  const motif = `%${sansAccents(q).replace(/[\\%_]/g, '\\$&')}%`
  const lignes = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM "VeillePub" p JOIN "VeilleMarque" m ON m.id = p."marqueId"
    WHERE translate(lower(concat_ws(' ', p.texte, p.titre, p.description, m.nom)), ${AVEC_ACCENTS}, ${SANS_ACCENTS})
      LIKE ${motif}`
  return lignes.map((l) => l.id)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const n = Math.min(Math.max(Number(p.get('n')) || PAR_PAGE, 1), MAX)
  // `compte` : le client sélectionné ; ses marques cachées sont écartées.
  const compte = p.get('compte')
  const cachees = compte
    ? (await prisma.veilleMarqueCachee.findMany({ where: { metaAccountId: compte }, select: { marqueId: true } })).map((c) => c.marqueId)
    : []
  const marqueVisible: Prisma.VeilleMarqueWhereInput = { masquee: false, ...(cachees.length > 0 && { id: { notIn: cachees } }) }
  const where: Prisma.VeillePubWhereInput = { masquee: false, marque: marqueVisible }

  const q = p.get('q')?.trim()
  if (q) where.id = { in: await idsCorrespondant(q) }
  if (p.get('format')) where.format = p.get('format')!
  if (p.get('plateforme')) where.plateformes = { has: p.get('plateforme')! }
  if (p.get('statut') === 'active') where.active = true
  if (p.get('statut') === 'inactive') where.active = false
  if (p.get('marque')) where.marqueId = p.get('marque')!
  if (p.get('categorie')) where.marque = { ...marqueVisible, categorie: p.get('categorie')! }
  const jours = Number(p.get('duree'))
  if (jours > 0) where.debut = { lte: new Date(Date.now() - jours * 86_400_000) }

  // Les pubs d'un scan Espion, quelle que soit la recherche texte.
  const ids = p.get('ids')?.split(',').filter(Boolean).slice(0, 200)
  if (ids?.length) where.AND = [{ id: { in: ids } }]

  const dossier = p.get('dossier')
  if (dossier === 'tous') where.sauvegardes = { some: {} }
  else if (dossier === 'sans') where.sauvegardes = { some: { dossierId: null } }
  else if (dossier) where.sauvegardes = { some: { dossierId: dossier } }

  const [lignes, total, marques] = await Promise.all([
    prisma.veillePub.findMany({
      where,
      orderBy:
        p.get('tri') === 'duree' ? [{ debut: 'asc' }, { id: 'asc' }]
        : p.get('tri') === 'couverture' ? [{ reachUe: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }]
        : [{ premiereVue: 'desc' }, { id: 'asc' }],
      take: n,
      include: { marque: { select: { id: true, nom: true } }, sauvegardes: { select: { id: true, dossierId: true, createdAt: true } } },
    }),
    prisma.veillePub.count({ where }),
    prisma.veilleMarque.findMany({ where: marqueVisible, select: { id: true, nom: true, suivie: true, categorie: true }, orderBy: { nom: 'asc' } }),
  ])

  // Les puces de Discovery : nombre de pubs par catégorie, sur toute la base.
  const parMarque = await prisma.veillePub.groupBy({ by: ['marqueId'], where: { masquee: false, marque: marqueVisible }, _count: true })
  const categorieDe = new Map(marques.map((m) => [m.id, m.categorie ?? 'Autre']))
  const nParCategorie = new Map<string, number>()
  for (const g of parMarque) {
    const c = categorieDe.get(g.marqueId) ?? 'Autre'
    nParCategorie.set(c, (nParCategorie.get(c) ?? 0) + g._count)
  }
  const categories = CATEGORIES.filter((c) => nParCategorie.get(c)).map((c) => ({ libelle: c, n: nParCategorie.get(c)! }))

  // Par pub active, parmi les pubs actives de sa marque : rang par couverture,
  // pubs au même texte (créa réutilisée), pubs vers la même page de destination.
  const marquesIds = [...new Set(lignes.map((l) => l.marqueId))]
  const stats = marquesIds.length
    ? await prisma.$queryRaw<{ id: string; rang: bigint; sur: bigint; variantes: bigint; memelien: bigint }[]>`
        SELECT id,
          rank() OVER (PARTITION BY "marqueId" ORDER BY "reachUe" DESC NULLS LAST) AS rang,
          count(*) OVER (PARTITION BY "marqueId") AS sur,
          count(*) OVER (PARTITION BY "marqueId", coalesce(nullif(concat(titre, texte), ''), id)) AS variantes,
          count(*) OVER (PARTITION BY "marqueId", coalesce("lienUrl", id)) AS memelien
        FROM "VeillePub"
        WHERE masquee = false AND active = true AND "marqueId" IN (${Prisma.join(marquesIds)})`
    : []
  const statsDe = new Map(stats.map((s) => [s.id, s]))

  const pubs = lignes.map((l) => ({
    ...l,
    ...(statsDe.has(l.id) && {
      rang: l.reachUe ? Number(statsDe.get(l.id)!.rang) : null,
      surMarque: Number(statsDe.get(l.id)!.sur),
      variantes: Number(statsDe.get(l.id)!.variantes),
      memeLien: Number(statsDe.get(l.id)!.memelien),
    }),
    medias: (l.medias as { type: string; chemin: string; apercu?: string }[]).map((m) => ({
      type: m.type,
      url: urlPublique(m.chemin),
      apercu: m.apercu ? urlPublique(m.apercu) : null,
    })),
  }))

  return NextResponse.json({ pubs, total, marques, categories })
}

/** Masquer une pub : elle disparaît partout et n'est plus réimportée. */
export async function PATCH(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })
  const corps = await req.json().catch(() => null)
  if (typeof corps?.id !== 'string' || corps.masquee !== true) return NextResponse.json({ erreur: 'Pub invalide' }, { status: 400 })
  await prisma.veillePub.update({ where: { id: corps.id }, data: { masquee: true } })
  return NextResponse.json({ ok: true })
}
