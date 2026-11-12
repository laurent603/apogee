import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { urlPublique } from '@/lib/veille/stockage'
import { CartePub, type PubVeille } from '@/components/veille/CartePub'

/**
 * Un dossier de la bibliothèque partagé par lien : page publique, sans
 * connexion, en lecture seule. Elle montre les pubs du dossier et de ses
 * sous-dossiers ; fermer le partage rend le lien mort.
 */

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Dossier partagé · Leadscore', robots: { index: false, follow: false } }

export default async function PagePartage({ params }: { params: { jeton: string } }) {
  const dossier = await prisma.veilleDossier.findFirst({ where: { partageToken: params.jeton }, select: { id: true, nom: true } })
  if (!dossier) notFound()

  const tous = await prisma.veilleDossier.findMany({ select: { id: true, parentId: true } })
  const branche = [dossier.id]
  for (let i = 0; i < branche.length; i++) for (const d of tous) if (d.parentId === branche[i]) branche.push(d.id)

  const lignes = await prisma.veillePub.findMany({
    where: { masquee: false, marque: { masquee: false }, sauvegardes: { some: { dossierId: { in: branche } } } },
    orderBy: { premiereVue: 'desc' },
    include: { marque: { select: { id: true, nom: true } } },
  })
  // Ni sauvegardes, ni analyse : la page publique ne dit rien de plus que la pub.
  const pubs = JSON.parse(JSON.stringify(lignes.map((l) => ({
    ...l,
    sauvegardes: [],
    analyse: null,
    medias: (l.medias as { type: string; chemin: string; apercu?: string }[]).map((m) => ({
      type: m.type, url: urlPublique(m.chemin), apercu: m.apercu ? urlPublique(m.apercu) : null,
    })),
  })))) as PubVeille[]

  return (
    <main className="min-h-screen bg-[#f8f9fc] px-4 py-8">
      <div className="max-w-7xl mx-auto space-y-5">
        <div>
          <p className="text-xs font-medium text-[#3434ef]">Dossier partagé · Leadscore</p>
          <h1 className="page-title mt-1">{dossier.nom}</h1>
          <p className="page-subtitle mt-0.5">{pubs.length} pub{pubs.length > 1 ? 's' : ''} de la Meta Ad Library</p>
        </div>
        {pubs.length === 0 ? (
          <div className="card text-center py-16 text-sm text-gray-400">Ce dossier est vide.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 items-start">
            {pubs.map((p) => <CartePub key={p.id} pub={p} lectureSeule />)}
          </div>
        )}
      </div>
    </main>
  )
}
