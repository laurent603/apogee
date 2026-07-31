'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AdAccountMeta } from '@/types'

interface AppStore {
  selectedAccount: AdAccountMeta | null
  setSelectedAccount: (account: AdAccountMeta | null) => void
  accounts: AdAccountMeta[]
  setAccounts: (accounts: AdAccountMeta[]) => void
}

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      selectedAccount: null,
      setSelectedAccount: (account) => set({ selectedAccount: account }),
      accounts: [],
      setAccounts: (accounts) => set({ accounts }),
    }),
    { name: 'apogee-store' }
  )
)
