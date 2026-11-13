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

// Les formats de la Ad Library que Discovery nomme ; le reste est « Autre ».
const FORMATS_CONNUS = ['IMAGE', 'VIDEO', 'CAROUSEL', 'DCO', 'DPA']

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
  // Les filtres à plusieurs choix arrivent séparés par des virgules.
  const liste = (cle: string) => p.get(cle)?.split(',').map((v) => v.trim()).filter(Boolean) ?? []
  const et: Prisma.VeillePubWhereInput[] = []
  const JOUR_MS = 86_400_000
  /** « 7..30 », « 7.. », « ..30 » : bornes incluses, celle qui manque est sans limite. */
  const plage = (cle: string): [number, number] | null => {
    const v = p.get(cle)
    if (!v?.includes('..')) return null
    const [a, b] = v.split('..').map((x) => (x.trim() ? Number(x) : NaN))
    return [Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 1_000_000_000]
  }

  const formats = liste('format')
  if (formats.length) {
    const connus = formats.filter((f) => f !== 'AUTRE')
    et.push({ OR: [...(connus.length ? [{ format: { in: connus } }] : []), ...(formats.includes('AUTRE') ? [{ format: { notIn: FORMATS_CONNUS } }] : [])] })
  }
  if (liste('plateforme').length) where.plateformes = { hasSome: liste('plateforme') }
  if (p.get('statut') === 'active') where.active = true
  if (p.get('statut') === 'inactive') where.active = false
  if (p.get('marque')) where.marqueId = p.get('marque')!
  if (p.get('categorie')) where.marque = { ...marqueVisible, categorie: p.get('categorie')! }
  // Lancement : les N derniers jours, ou entre deux dates (« 2026-10-01..2026-11-13 »).
  const lancement = p.get('lancement') ?? ''
  if (lancement.includes('..')) {
    const [du, au] = lancement.split('..')
    const debut = { ...(du && { gte: new Date(du) }), ...(au && { lte: new Date(`${au}T23:59:59Z`) }) }
    if (Object.values(debut).every((d) => !Number.isNaN(d.getTime()))) where.debut = debut
  } else if (Number(lancement) > 0) where.debut = { gte: new Date(Date.now() - Number(lancement) * JOUR_MS) }
  const duree = plage('duree')
  if (duree) {
    // Comme la carte : jusqu'à aujourd'hui si la pub tourne encore, au moins 1 jour.
    const lignes = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "VeillePub" WHERE debut IS NOT NULL
        AND greatest(1, round(extract(epoch FROM (CASE WHEN active OR fin IS NULL THEN now() ELSE fin END) - debut) / 86400))
          BETWEEN ${duree[0]} AND ${duree[1]}`
    et.push({ id: { in: lignes.map((l) => l.id) } })
  }
  const age = plage('age')
  if (age) {
    // Le ciblage publié par Meta tient dans les bornes : « 35.. » = pubs qui ne visent que les 35 ans et plus.
    const lignes = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "VeillePub"
      WHERE (transparence->'ciblage'->>'ageMin')::int >= ${age[0]} AND (transparence->'ciblage'->>'ageMax')::int <= ${age[1]}`
    et.push({ id: { in: lignes.map((l) => l.id) } })
  }
  const derniere = Number(p.get('derniere'))
  if (derniere > 0) et.push({ active: false, fin: { gte: new Date(Date.now() - derniere * JOUR_MS) } })
  if (liste('cta').length) et.push({ cta: { in: liste('cta') } })
  if (liste('page').length) et.push({ OR: liste('page').map((d) => ({ lienUrl: { contains: d, mode: 'insensitive' as const } })) })
  if (liste('pays').length) {
    const lignes = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "VeillePub" WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(transparence->'repartition', '[]'::jsonb)) e WHERE e->>'pays' IN (${Prisma.join(liste('pays'))}))`
    et.push({ id: { in: lignes.map((l) => l.id) } })
  }
  const longueur = plage('longueur')
  if (longueur) {
    const lignes = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "VeillePub" WHERE length(coalesce(texte, '')) BETWEEN ${longueur[0]} AND ${longueur[1]}`
    et.push({ id: { in: lignes.map((l) => l.id) } })
  }
  const copies = plage('copies')
  if (copies) {
    // Créa réutilisée : pubs actives de la même marque avec le même texte.
    const lignes = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM (
        SELECT id, count(*) OVER (PARTITION BY "marqueId", coalesce(nullif(concat(titre, texte), ''), id)) AS n
        FROM "VeillePub" WHERE masquee = false AND active = true) t
      WHERE n BETWEEN ${copies[0]} AND ${copies[1]}`
    et.push({ id: { in: lignes.map((l) => l.id) } })
  }

  // Les pubs d'un scan Espion, quelle que soit la recherche texte.
  const ids = p.get('ids')?.split(',').filter(Boolean).slice(0, 200)
  if (ids?.length) et.push({ id: { in: ids } })
  if (et.length) where.AND = et

  const dossier = p.get('dossier')
  if (dossier === 'tous') where.sauvegardes = { some: {} }
  else if (dossier === 'sans') where.sauvegardes = { some: { dossierId: null } }
  else if (dossier) where.sauvegardes = { some: { dossierId: dossier } }

  // Tri par dépense / jour ou par rang, filtre « top N de sa marque » : calculés
  // ici, la base ne les connaît pas. Rang = place par couverture parmi les pubs
  // actives de la marque ; dépense / jour = couverture ÷ jours de diffusion.
  const tri = p.get('tri')
  const rangMax = Number(p.get('rang')) || 0
  const parOrdre = tri === 'depenseJour' || tri === 'rang'
  let ordre: string[] | null = null
  if (parOrdre || rangMax) {
    const rangs = new Map(
      (await prisma.$queryRaw<{ id: string; rang: bigint }[]>`
        SELECT id, rank() OVER (PARTITION BY "marqueId" ORDER BY "reachUe" DESC) AS rang
        FROM "VeillePub" WHERE masquee = false AND active = true AND "reachUe" IS NOT NULL`).map((r) => [r.id, Number(r.rang)]),
    )
    const rangDe = (id: string) => rangs.get(id) ?? 1e9
    let candidats = await prisma.veillePub.findMany({ where, select: { id: true, reachUe: true, debut: true, fin: true, active: true } })
    if (rangMax) candidats = candidats.filter((c) => rangDe(c.id) <= rangMax)
    const parJour = (c: (typeof candidats)[number]) => {
      if (!c.reachUe || !c.debut) return -1
      const fin = c.active || !c.fin ? Date.now() : c.fin.getTime()
      return c.reachUe / Math.max(1, Math.round((fin - c.debut.getTime()) / 86_400_000))
    }
    if (tri === 'depenseJour') candidats.sort((a, b) => parJour(b) - parJour(a))
    if (tri === 'rang') candidats.sort((a, b) => rangDe(a.id) - rangDe(b.id) || (b.reachUe ?? 0) - (a.reachUe ?? 0))
    ordre = candidats.map((c) => c.id)
    if (!parOrdre) where.AND = [...et, { id: { in: ordre } }]
  }

  const inclure = {
    marque: { select: { id: true, nom: true } },
    sauvegardes: { select: { id: true, dossierId: true, createdAt: true } },
  } satisfies Prisma.VeillePubInclude
  const page = parOrdre ? ordre!.slice(0, n) : []
  const [brutes, total, marques] = await Promise.all([
    parOrdre
      ? prisma.veillePub.findMany({ where: { id: { in: page } }, include: inclure })
      : prisma.veillePub.findMany({
          where,
          orderBy:
            tri === 'duree' ? [{ debut: 'asc' }, { id: 'asc' }]
            : tri === 'couverture' ? [{ reachUe: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }]
            : [{ premiereVue: 'desc' }, { id: 'asc' }],
          take: n,
          include: inclure,
        }),
    parOrdre ? ordre!.length : prisma.veillePub.count({ where }),
    prisma.veilleMarque.findMany({ where: marqueVisible, select: { id: true, nom: true, suivie: true, categorie: true }, orderBy: { nom: 'asc' } }),
  ])

  const parId = new Map(brutes.map((l) => [l.id, l]))
  const lignes = parOrdre ? page.map((id) => parId.get(id)!).filter(Boolean) : brutes

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

  // Les choix des filtres qui dépendent des données : boutons, pages de destination, pays.
  const visibles: Prisma.VeillePubWhereInput = { masquee: false, marque: marqueVisible }
  const [ctas, liens, pays] = await Promise.all([
    prisma.veillePub.groupBy({ by: ['cta'], where: { ...visibles, cta: { not: null } }, _count: true }),
    prisma.veillePub.findMany({ where: { ...visibles, lienUrl: { not: null } }, select: { lienUrl: true } }),
    prisma.$queryRaw<{ pays: string; n: bigint }[]>`
      SELECT e->>'pays' AS pays, count(DISTINCT p.id) AS n
      FROM "VeillePub" p, jsonb_array_elements(coalesce(p.transparence->'repartition', '[]'::jsonb)) e
      WHERE p.masquee = false GROUP BY 1 ORDER BY 2 DESC LIMIT 30`,
  ])
  const parDomaine = new Map<string, number>()
  for (const { lienUrl } of liens) {
    const d = lienUrl!.replace(/^https?:\/\/(www\.)?/, '').split(/[/?#]/)[0].toLowerCase()
    if (d) parDomaine.set(d, (parDomaine.get(d) ?? 0) + 1)
  }
  const options = {
    ctas: ctas.map((c) => ({ valeur: c.cta!, n: c._count })).sort((a, b) => b.n - a.n),
    pages: [...parDomaine.entries()].map(([valeur, n]) => ({ valeur, n })).sort((a, b) => b.n - a.n).slice(0, 30),
    pays: pays.filter((x) => x.pays).map((x) => ({ valeur: x.pays, n: Number(x.n) })),
  }

  return NextResponse.json({ pubs, total, marques, categories, options })
}

/** Masquer une pub : elle disparaît partout et n'est plus réimportée. */
export async function PATCH(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })
  const corps = await req.json().catch(() => null)
  if (typeof corps?.id !== 'string' || corps.masquee !== true) return NextResponse.json({ erreur: 'Pub invalide' }, { status: 400 })
  await prisma.veillePub.update({ where: { id: corps.id }, data: { masquee: true } })
  return NextResponse.json({ ok: true })
}
