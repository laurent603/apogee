'use client'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import type { AdAccountMeta } from '@/types'

/** L'identité stable d'un compte : `id` en base, l'identifiant Meta en repli. */
const cle = (a: AdAccountMeta) => a.id || a.metaAccountId || a.name

export function AccountSelector() {
  const { selectedAccount, setSelectedAccount, accounts, setAccounts, setDegrade } = useStore()
  const [loading, setLoading] = useState(false)
  const [echec, setEchec] = useState(false)
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
        setDegrade(Boolean(d.degrade))
        const current = useStore.getState().selectedAccount
        // La comparaison se fait sur l'identifiant Meta : en repli, `id` est
        // vide, et une sélection retenue d'une session en base doit être
        // reconnue — sinon elle serait remplacée à chaque bascule.
        const stillValid = current && fresh.find((a: AdAccountMeta) => cle(a) === cle(current))
        if (fresh.length > 0 && !stillValid) setSelectedAccount(fresh[0])
        // Une sélection retenue d'un repli précédent ne vaut plus rien dès que
        // la base répond : on la remplace par son équivalent complet.
        //
        // La comparaison porte sur le contenu, jamais sur la référence : deux
        // objets issus de deux requêtes ne sont jamais identiques, et remplacer
        // à chaque montage relançait toutes les requêtes des pages qui
        // dépendent du compte — chaque écran se chargeait deux fois.
        else if (stillValid && (current!.sansBase || current!.id !== stillValid.id)) {
          setSelectedAccount(stillValid)
        }
        setLoading(false)
      })
      .catch(() => { setEchec(true); setLoading(false) })
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
  const estChoisi = (a: AdAccountMeta) => Boolean(selectedAccount) && cle(a) === cle(selectedAccount!)

  if (loading) return <div className="h-8 w-48 bg-gray-100 rounded-lg animate-pulse" />
  // Ne pas confondre « vous n'avez aucun compte » et « la liste n'a pas pu
  // être chargée » : le premier message envoie chercher côté Meta, le second
  // côté application.
  if (echec) return <span className="text-sm text-amber-600">Comptes indisponibles</span>
  if (accounts.length === 0) return <span className="text-sm text-gray-400">Aucun compte trouvé</span>

  return (
    <div className="flex items-center gap-2 min-w-0" ref={ref}>
      <span className="hidden sm:inline text-xs text-gray-400 font-medium flex-shrink-0">Compte</span>

      {/* Custom dropdown */}
      <div className="relative min-w-0">
        <button
          onClick={() => { setOpen((v) => !v); setSearch('') }}
          className="flex items-center gap-2 bg-white border border-[#E5E7EB] text-[#0d0d12] text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#3434ef]/20 focus:border-[#3434ef] max-w-[52vw] sm:max-w-[240px] hover:border-gray-300 transition-colors"
        >
          <span className="truncate">{selectedAccount?.name || 'Sélectionner…'}</span>
          <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#E5E7EB] rounded-xl shadow-lg w-72 max-w-[90vw] overflow-hidden">
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
                    key={cle(acc)}
                    onClick={() => { setSelectedAccount(acc); setOpen(false) }}
                    className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-[#f8f9fc] transition-colors ${estChoisi(acc) ? 'bg-blue-50' : ''}`}
                  >
                    <span className={`text-sm truncate ${estChoisi(acc) ? 'font-semibold text-[#3434ef]' : 'text-[#0d0d12]'}`}>{acc.name}</span>
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
