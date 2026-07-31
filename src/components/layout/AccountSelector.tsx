'use client'
import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import type { AdAccountMeta } from '@/types'

export function AccountSelector() {
  const { selectedAccount, setSelectedAccount, accounts, setAccounts } = useStore()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (accounts.length === 0) {
      setLoading(true)
      fetch('/api/meta/accounts')
        .then((r) => r.json())
        .then((d) => {
          setAccounts(d.accounts || [])
          if (d.accounts?.length > 0 && !selectedAccount) {
            setSelectedAccount(d.accounts[0])
          }
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [])

  if (loading) return (
    <div className="h-9 w-48 bg-gray-800 rounded-lg animate-pulse" />
  )

  if (accounts.length === 0) return (
    <span className="text-sm text-gray-500">Aucun compte trouvé</span>
  )

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 font-medium">Compte :</span>
      <select
        value={selectedAccount?.id || ''}
        onChange={(e) => {
          const acc = accounts.find((a: AdAccountMeta) => a.id === e.target.value)
          if (acc) setSelectedAccount(acc)
        }}
        className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 max-w-[220px]"
      >
        {accounts.map((acc: AdAccountMeta) => (
          <option key={acc.id} value={acc.id}>{acc.name}</option>
        ))}
      </select>
      {selectedAccount?.currency && (
        <span className="badge-blue">{selectedAccount.currency}</span>
      )}
    </div>
  )
}
