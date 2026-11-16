import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { estCategorie } from '@/lib/veille/categories'

/** Corriger à la main la catégorie d'une ou plusieurs marques (`id` ou `ids`), ou les masquer (leur veille s'arrête). */
export async function PATCH(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })
  const corps = await req.json().catch(() => null)
  const ids: string[] = (Array.isArray(corps?.ids) ? corps.ids : [corps?.id]).filter((x: unknown): x is string => typeof x === 'string' && !!x)
  if (!ids.length) return NextResponse.json({ erreur: 'Marque invalide' }, { status: 400 })
  if (corps.masquee === true) {
    await prisma.veilleMarque.updateMany({ where: { id: { in: ids } }, data: { masquee: true, suivie: false, suivieDepuis: null } })
    return NextResponse.json({ ok: true })
  }
  if (!estCategorie(corps.categorie)) return NextResponse.json({ erreur: 'Catégorie invalide' }, { status: 400 })
  await prisma.veilleMarque.updateMany({ where: { id: { in: ids } }, data: { categorie: corps.categorie } })
  return NextResponse.json({ ok: true })
}
