import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'

/** Les dossiers de la bibliothèque, partagés par toute l'équipe. */

async function connecte() {
  return !!(await getServerSession(authOptions))
}
const refus = () => NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })

export async function GET() {
  if (!(await connecte())) return refus()
  const [dossiers, comptes, sansDossier, total] = await Promise.all([
    prisma.veilleDossier.findMany({ orderBy: { nom: 'asc' }, select: { id: true, nom: true, parentId: true, partageToken: true } }),
    prisma.veilleSauvegarde.groupBy({ by: ['dossierId'], _count: true }),
    prisma.veilleSauvegarde.count({ where: { dossierId: null } }),
    prisma.veilleSauvegarde.count(),
  ])
  const n = new Map(comptes.map((c) => [c.dossierId, c._count]))
  return NextResponse.json({
    dossiers: dossiers.map((d) => ({ ...d, n: n.get(d.id) ?? 0 })),
    sansDossier,
    total,
  })
}

export async function POST(req: NextRequest) {
  if (!(await connecte())) return refus()
  const corps = await req.json().catch(() => null)
  const nom = typeof corps?.nom === 'string' ? corps.nom.trim().slice(0, 80) : ''
  if (!nom) return NextResponse.json({ erreur: 'Nom vide' }, { status: 400 })
  const parentId = typeof corps?.parentId === 'string' ? corps.parentId : null
  const dossier = await prisma.veilleDossier.create({ data: { nom, parentId } })
  return NextResponse.json(dossier)
}

/**
 * Renommer un dossier (`nom`) et/ou ouvrir ou fermer son lien public
 * (`partage`). Le jeton est tiré au hasard : un lien fermé puis rouvert n'est
 * plus le même, l'ancien cesse de marcher.
 */
export async function PATCH(req: NextRequest) {
  if (!(await connecte())) return refus()
  const corps = await req.json().catch(() => null)
  if (typeof corps?.id !== 'string') return NextResponse.json({ erreur: 'id manquant' }, { status: 400 })
  const data: { nom?: string; partageToken?: string | null } = {}
  if (typeof corps.nom === 'string') {
    const nom = corps.nom.trim().slice(0, 80)
    if (!nom) return NextResponse.json({ erreur: 'Nom vide' }, { status: 400 })
    data.nom = nom
  }
  if (typeof corps.partage === 'boolean') data.partageToken = corps.partage ? randomBytes(18).toString('base64url') : null
  const dossier = await prisma.veilleDossier.update({ where: { id: corps.id }, data, select: { id: true, nom: true, partageToken: true } })
  return NextResponse.json(dossier)
}

/**
 * Supprimer un dossier ne supprime pas les pubs qu'il contient : elles
 * repassent « Sans dossier », comme celles de ses sous-dossiers.
 */
export async function DELETE(req: NextRequest) {
  if (!(await connecte())) return refus()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ erreur: 'id manquant' }, { status: 400 })

  const tous = await prisma.veilleDossier.findMany({ select: { id: true, parentId: true } })
  const branche = [id]
  for (let i = 0; i < branche.length; i++) {
    for (const d of tous) if (d.parentId === branche[i]) branche.push(d.id)
  }
  // Une pub déjà « Sans dossier », ou présente dans deux dossiers de la
  // branche, n'y revient qu'une fois.
  const dansBranche = await prisma.veilleSauvegarde.findMany({
    where: { dossierId: { in: branche } },
    select: { id: true, pubId: true },
  })
  const dejaSans = new Set(
    (await prisma.veilleSauvegarde.findMany({
      where: { dossierId: null, pubId: { in: dansBranche.map((s) => s.pubId) } },
      select: { pubId: true },
    })).map((s) => s.pubId),
  )
  const aGarder: string[] = []
  const aRetirer: string[] = []
  for (const s of dansBranche) {
    if (dejaSans.has(s.pubId)) aRetirer.push(s.id)
    else {
      dejaSans.add(s.pubId)
      aGarder.push(s.id)
    }
  }
  await prisma.$transaction([
    prisma.veilleSauvegarde.deleteMany({ where: { id: { in: aRetirer } } }),
    prisma.veilleSauvegarde.updateMany({ where: { id: { in: aGarder } }, data: { dossierId: null } }),
    prisma.veilleDossier.delete({ where: { id } }),
  ])
  return NextResponse.json({ ok: true })
}
