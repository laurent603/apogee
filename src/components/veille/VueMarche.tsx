'use client'
import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { compact } from './FichePub'

export type LigneMarche = {
  id: string; nom: string; categorie: string | null; suivie: boolean
  actives: number; total: number; nouvelles30: number; nouvellesAvant: number; depenseJour: number; courbe: number[]
}

const COLONNES = [
  ['actives', 'Pubs actives'], ['nouvelles30', 'Lancées en 30 j'], ['depenseJour', 'Dépense / jour'], ['total', 'Pubs vues'],
] as const
type Cle = 'nom' | (typeof COLONNES)[number][0]

/** Les pubs actives jour par jour sur 90 jours, en petit. */
function Tendance({ courbe }: { courbe: number[] }) {
  const max = Math.max(1, ...courbe)
  const [L, H] = [112, 28]
  const points = courbe.map((v, i) => `${((i / (courbe.length - 1)) * L).toFixed(1)},${(H - 2 - (v / max) * (H - 4)).toFixed(1)}`).join(' ')
  return (
    <svg width={L} height={H} viewBox={`0 0 ${L} ${H}`} aria-label={`${courbe[0]} pubs actives il y a 90 jours, ${courbe[courbe.length - 1]} aujourd’hui`} role="img">
      <polyline points={points} fill="none" stroke="#3434ef" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

/** « +40 % » face aux 30 jours d'avant ; « nouveau » si rien n'avait été lancé. */
function Evolution({ n, avant }: { n: number; avant: number }) {
  if (!n && !avant) return null
  if (!avant) return <span className="badge-green">nouveau</span>
  const pct = Math.round(((n - avant) / avant) * 100)
  return <span className={pct > 0 ? 'badge-green' : 'badge-gray'}>{pct > 0 ? '+' : ''}{pct} %</span>
}

/**
 * La vue Marché d'Espion : toutes les marques du secteur du client sur une
 * ligne chacune, triables. Un clic ouvre le rapport de la marque.
 */
export function VueMarche({ visible, ouvrir }: {
  visible: (m: { id: string; categorie: string | null }) => boolean
  ouvrir: (m: { id: string; nom: string; suivie: boolean }) => void
}) {
  const [lignes, setLignes] = useState<LigneMarche[] | null>(null)
  const [tri, setTri] = useState<{ cle: Cle; desc: boolean }>({ cle: 'actives', desc: true })

  useEffect(() => {
    fetch('/api/veille/marche').then((r) => (r.ok ? r.json() : null)).then((d) => setLignes(d?.lignes ?? []))
  }, [])

  if (!lignes) return <div className="card text-center py-10 text-sm text-gray-400">Chargement du marché…</div>
  const affichees = lignes
    .filter(visible)
    .sort((a, b) => {
      const ecart = tri.cle === 'nom' ? a.nom.localeCompare(b.nom, 'fr') : a[tri.cle] - b[tri.cle]
      return (tri.desc ? -ecart : ecart) || a.nom.localeCompare(b.nom, 'fr')
    })
  if (!affichees.length) return null

  const entete = (cle: Cle, libelle: string, aDroite = true) => (
    <th scope="col" aria-sort={tri.cle === cle ? (tri.desc ? 'descending' : 'ascending') : 'none'} className={clsx('px-3 py-2.5 font-medium', aDroite ? 'text-right' : 'text-left pl-5')}>
      <button type="button" onClick={() => setTri({ cle, desc: tri.cle === cle ? !tri.desc : cle !== 'nom' })}
        className={clsx('inline-flex items-center gap-1 hover:text-[#0d0d12]', tri.cle === cle && 'text-[#0d0d12]')}>
        {libelle}
        <span aria-hidden="true" className={tri.cle === cle ? '' : 'opacity-0'}>{tri.desc ? '↓' : '↑'}</span>
      </button>
    </th>
  )

  return (
    <section className="card p-0 overflow-hidden" aria-label="Vue Marché">
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-3">
        <p className="text-sm font-semibold text-[#0d0d12]">Vue Marché <span className="font-normal text-gray-400">· {affichees.length} marque{affichees.length > 1 ? 's' : ''}</span></p>
        <p className="text-xs text-gray-400">Cliquez une marque pour son rapport</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-y border-[#E5E7EB] bg-gray-50 text-xs text-gray-500">
            <tr>
              {entete('nom', 'Marque', false)}
              {COLONNES.map(([cle, libelle]) => entete(cle, libelle))}
              <th scope="col" className="px-3 py-2.5 font-medium text-right">Pubs actives sur 90 j</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {affichees.map((m) => (
              <tr key={m.id} onClick={() => ouvrir(m)} className="cursor-pointer hover:bg-gray-50">
                <td className="px-3 py-2.5 pl-5">
                  <button type="button" onClick={(e) => { e.stopPropagation(); ouvrir(m) }} className="font-medium text-[#0d0d12] hover:text-[#3434ef] text-left">{m.nom}</button>
                  <p className="text-xs text-gray-400">{m.categorie ?? 'Non classée'}{m.suivie && <span className="text-emerald-700"> · suivie</span>}</p>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-[#0d0d12] tabular-nums">{m.actives}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <span className="inline-flex items-center gap-2">{m.nouvelles30}<Evolution n={m.nouvelles30} avant={m.nouvellesAvant} /></span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{m.depenseJour > 0 ? `≈ ${compact(m.depenseJour)} €` : '—'}</td>
                <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">{m.total}</td>
                <td className="px-3 py-2.5 pr-5"><div className="flex justify-end"><Tendance courbe={m.courbe} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-xs text-gray-400 border-t border-[#F3F4F6]">
        Sur les pubs collectées par Apogee : complet pour les marques suivies, partiel pour les autres. « Lancées en 30 j » est comparé aux 30 jours d’avant ;
        dépense estimée comme dans les rapports (couverture UE × 9,10 € pour 1 000 personnes, répartie sur les jours de diffusion).
      </p>
    </section>
  )
}
