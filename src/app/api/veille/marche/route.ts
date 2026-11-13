import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { EUROS_POUR_MILLE_PERSONNES } from '@/lib/veille/adLibrary'
import { ligneMarche } from '@/lib/veille/rapport'

/**
 * La vue Marché d'Espion : une ligne par marque non masquée, avec ses pubs
 * actives, son rythme de lancement, sa dépense estimée et ses pubs actives
 * jour par jour sur 90 jours. Le secteur et les marques cachées pour le
 * client sont filtrés dans la page, comme ailleurs.
 */
export async function GET() {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ erreur: 'Non connecté' }, { status: 401 })

  const [marques, pubs] = await Promise.all([
    prisma.veilleMarque.findMany({ where: { masquee: false }, select: { id: true, nom: true, categorie: true, suivie: true } }),
    prisma.veillePub.findMany({ where: { masquee: false, marque: { masquee: false } }, select: { marqueId: true, debut: true, fin: true, active: true, reachUe: true } }),
  ])
  const parMarque = new Map<string, typeof pubs>()
  for (const p of pubs) parMarque.set(p.marqueId, [...(parMarque.get(p.marqueId) ?? []), p])

  const maintenant = Date.now()
  const lignes = marques
    .filter((m) => parMarque.has(m.id))
    .map((m) => ({
      ...m,
      ...ligneMarche(
        parMarque.get(m.id)!.map((p) => ({ ...p, debut: p.debut?.toISOString() ?? null, fin: p.fin?.toISOString() ?? null })),
        EUROS_POUR_MILLE_PERSONNES,
        maintenant,
      ),
    }))
  return NextResponse.json({ lignes })
}
