'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AdAccountMeta } from '@/types'

interface AppStore {
  selectedAccount: AdAccountMeta | null
  setSelectedAccount: (account: AdAccountMeta | null) => void
  accounts: AdAccountMeta[]
  setAccounts: (accounts: AdAccountMeta[]) => void
  /** La base est injoignable : les écrans d'analyse n'auront rien à montrer. */
  degrade: boolean
  setDegrade: (v: boolean) => void
}

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      selectedAccount: null,
      setSelectedAccount: (account) => set({ selectedAccount: account }),
      accounts: [],
      setAccounts: (accounts) => set({ accounts }),
      degrade: false,
      setDegrade: (degrade) => set({ degrade }),
    }),
    {
      name: 'leadscore-store',
      // L'état dégradé décrit l'instant, pas une préférence : le persister
      // afficherait la bannière au rechargement suivant, base revenue ou non.
      partialize: (s) => ({ selectedAccount: s.selectedAccount, accounts: s.accounts }),
    }
  )
)
