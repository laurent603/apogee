'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { clsx } from 'clsx'

/**
 * L'historique des lancements — et rien d'autre.
 *
 * Cette page a un temps porté les analyses aussi, parce qu'aucun écran ne les
 * montrait alors qu'elles étaient enregistrées. Ce n'est plus vrai : Autopilot
 * a son propre historique, avec ses filtres par agent et ses badges de type.
 *
 * Les garder aux deux endroits obligeait à se demander laquelle des deux listes
 * faisait foi. « Lancer » montre donc ce qu'on a lancé, « Autopilot » ce qu'on
 * a analysé — chaque écran répond de ce qu'il porte.
 */

type Lancement = {
  id: string; metaAccountId: string; campaignName: string
  objective: string | null; structure: string | null
  adsetCount: number; adCount: number; status: string; logs: string; createdAt: string
}

const horodatage = (d: string) => {
  const x = new Date(d)
  return `${x.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

export default function HistoryPage() {
  const { selectedAccount } = useStore()
  const [lancements, setLancements] = useState<Lancement[]>([])
  const [filtre, setFiltre] = useState<'all' | 'success' | 'error'>('all')
  const [recherche, setRecherche] = useState('')
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const charger = useCallback(() => {
    setLoading(true)
    const metaId = selectedAccount?.metaAccountId || selectedAccount?.id
    fetch(metaId ? `/api/launch-history?metaAccountId=${metaId}` : '/api/launch-history')
      .then((r) => r.json())
      .catch(() => [])
      .then((l) => {
        setLancements(Array.isArray(l) ? l : [])
        setLoading(false)
      })
  }, [selectedAccount?.id, selectedAccount?.metaAccountId])

  useEffect(() => { charger() }, [charger])

  const reussis = lancements.filter((l) => l.status === 'success').length

  const visibles = useMemo(() => {
    let tout = lancements
    if (filtre === 'success') tout = tout.filter((l) => l.status === 'success')
    else if (filtre === 'error') tout = tout.filter((l) => l.status !== 'success')
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      tout = tout.filter((l) => l.campaignName.toLowerCase().includes(q))
    }
    return [...tout].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [lancements, filtre, recherche])

  const onglets = [
    { id: 'all' as const, label: 'Tous', n: lancements.length },
    { id: 'success' as const, label: 'Réussis', n: reussis },
    { id: 'error' as const, label: 'En échec', n: lancements.length - reussis },
  ]

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Historique des lancements</h1>
          <p className="page-subtitle mt-0.5">
            Ce qui a été envoyé sur <strong>{selectedAccount?.name || 'tous les comptes'}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher une campagne…" className="input w-auto text-sm py-1.5 min-w-[180px]" />
          <button onClick={charger} className="text-xs text-[#3434ef] hover:underline">Actualiser</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {onglets.filter((o) => o.n > 0 || o.id === 'all').map((o) => (
          <button key={o.id} onClick={() => setFiltre(o.id)}
            className={clsx('px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              filtre === o.id ? 'bg-[#3434ef] text-white border-[#3434ef]'
                : 'bg-white text-gray-600 border-[#E5E7EB] hover:border-gray-300')}>
            {o.label} <span className={filtre === o.id ? 'text-white/70' : 'text-gray-400'}>{o.n}</span>
          </button>
        ))}
      </div>

      {loading && <div className="card text-center py-20 text-gray-400 text-sm">Chargement…</div>}

      {!loading && !visibles.length && (
        <div className="card text-center py-16">
          <p className="text-[#0d0d12] font-medium">Aucun lancement pour ce filtre.</p>
          <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
            Les campagnes envoyées depuis <strong>Upload</strong> apparaissent ici, du plus récent au plus
            ancien. Les analyses, elles, sont dans l’historique d’Autopilot.
          </p>
        </div>
      )}

      {!loading && visibles.length > 0 && (
        <div className="space-y-2.5">
          {visibles.map((e) => {
            const estOuvert = ouvert === e.id
            return (
              <div key={e.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className={clsx('mt-1 w-2 h-2 rounded-full flex-shrink-0',
                      e.status === 'success' ? 'bg-emerald-500' : 'bg-red-500')} />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-[#0d0d12] truncate">{e.campaignName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {e.adsetCount} ad set{e.adsetCount !== 1 ? 's' : ''} · {e.adCount} pub{e.adCount !== 1 ? 's' : ''}
                        {e.objective && <> · {e.objective}</>}
                        {e.structure && <> · {e.structure}</>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 pl-5 sm:pl-0">
                    <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{horodatage(e.createdAt)}</span>
                    <button onClick={() => setOuvert(estOuvert ? null : e.id)}
                      className="text-xs text-[#3434ef] hover:underline">
                      {estOuvert ? 'Masquer' : 'Journal'}
                    </button>
                  </div>
                </div>
                {estOuvert && (
                  <pre className="mt-3 pt-3 border-t border-[#F3F4F6] text-xs text-gray-600 whitespace-pre-wrap font-mono bg-[#f8f9fc] rounded-lg p-3 max-h-60 overflow-y-auto">
                    {e.logs || '(vide)'}
                  </pre>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
