'use client'

import { useEffect, useState, useCallback } from 'react'
import { useStore } from '@/lib/store'

interface LaunchRecord {
  id: string
  metaAccountId: string
  campaignName: string
  campaignId: string | null
  objective: string | null
  structure: string | null
  adsetCount: number
  adCount: number
  status: string
  logs: string
  createdAt: string
}

export default function HistoryPage() {
  const { selectedAccount } = useStore()
  const [launches, setLaunches] = useState<LaunchRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const metaId = selectedAccount?.metaAccountId || selectedAccount?.id
    const url = metaId ? `/api/launch-history?metaAccountId=${metaId}` : '/api/launch-history'
    fetch(url)
      .then(r => r.json())
      .then(data => { setLaunches(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedAccount?.id])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div>
          <h1 className="page-title">Historique des lancements</h1>
          <p className="page-subtitle mt-0.5">
            Lancements pour <strong>{selectedAccount?.name || 'tous les comptes'}</strong>
          </p>
        </div>
        <button onClick={load} className="text-xs text-[#3434ef] hover:underline mt-1">Actualiser</button>
      </div>

      {loading && (
        <div className="card text-center py-20 text-gray-400 text-sm">Chargement…</div>
      )}

      {!loading && launches.length === 0 && (
        <div className="card text-center py-20">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-[#3434ef]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-[#0d0d12] mb-2">Aucun lancement pour ce compte</h2>
          <p className="text-sm text-gray-400 mb-5 max-w-sm mx-auto">
            Les lancements de campagnes Meta Ads pour <strong>{selectedAccount?.name}</strong> apparaîtront ici.
          </p>
          <a href="/upload" className="btn-primary inline-block">Lancer une campagne</a>
        </div>
      )}

      {!loading && launches.length > 0 && (
        <div className="space-y-3">
          {launches.map((l) => {
            const date = new Date(l.createdAt)
            const isExpanded = expanded === l.id
            return (
              <div key={l.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className={`mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${l.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-[#0d0d12] truncate">{l.campaignName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {l.adsetCount} adset{l.adsetCount !== 1 ? 's' : ''} · {l.adCount} ad{l.adCount !== 1 ? 's' : ''}
                        {l.objective && <> · {l.objective}</>}
                        {l.structure && <> · {l.structure}</>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 pl-5 sm:pl-0">
                    <span className="text-xs text-gray-400">
                      {date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      {' '}
                      {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      onClick={() => setExpanded(isExpanded ? null : l.id)}
                      className="text-xs text-[#3434ef] hover:underline"
                    >
                      {isExpanded ? 'Masquer' : 'Journal'}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 rounded-lg p-3 max-h-60 overflow-y-auto">
                      {l.logs || '(vide)'}
                    </pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
