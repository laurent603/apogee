'use client'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import type { AdAccountMeta } from '@/types'

export function AccountSelector() {
  const { selectedAccount, setSelectedAccount, accounts, setAccounts } = useStore()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/meta/accounts')
      .then((r) => r.json())
      .then((d) => {
        const fresh: AdAccountMeta[] = (d.accounts || []).filter((a: AdAccountMeta) => {
          const n = (a.name || '').toLowerCase()
          return !(n.includes('read') && (n.includes('only') || n.includes('-only')))
        })
        setAccounts(fresh)
        const current = useStore.getState().selectedAccount
        const stillValid = current && fresh.find((a: AdAccountMeta) => a.id === current.id)
        if (fresh.length > 0 && !stillValid) setSelectedAccount(fresh[0])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = accounts.filter((a: AdAccountMeta) =>
    a.name?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="h-8 w-48 bg-gray-100 rounded-lg animate-pulse" />
  if (accounts.length === 0) return <span className="text-sm text-gray-400">Aucun compte trouvé</span>

  return (
    <div className="flex items-center gap-2" ref={ref}>
      <span className="text-xs text-gray-400 font-medium">Compte</span>

      {/* Custom dropdown */}
      <div className="relative">
        <button
          onClick={() => { setOpen((v) => !v); setSearch('') }}
          className="flex items-center gap-2 bg-white border border-[#E5E7EB] text-[#0d0d12] text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#3434ef]/20 focus:border-[#3434ef] max-w-[240px] hover:border-gray-300 transition-colors"
        >
          <span className="truncate">{selectedAccount?.name || 'Sélectionner…'}</span>
          <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#E5E7EB] rounded-xl shadow-lg w-72 overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-[#E5E7EB]">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un compte…"
                  className="w-full pl-7 pr-3 py-1.5 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3434ef]/20 focus:border-[#3434ef]"
                />
              </div>
            </div>

            {/* List */}
            <div className="max-h-64 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">Aucun résultat</p>
              ) : (
                filtered.map((acc: AdAccountMeta) => (
                  <button
                    key={acc.id}
                    onClick={() => { setSelectedAccount(acc); setOpen(false) }}
                    className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-[#f8f9fc] transition-colors ${selectedAccount?.id === acc.id ? 'bg-blue-50' : ''}`}
                  >
                    <span className={`text-sm truncate ${selectedAccount?.id === acc.id ? 'font-semibold text-[#3434ef]' : 'text-[#0d0d12]'}`}>{acc.name}</span>
                    {acc.currency && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">{acc.currency}</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {selectedAccount?.currency && (
        <span className="badge-blue">{selectedAccount.currency}</span>
      )}
    </div>
  )
}
