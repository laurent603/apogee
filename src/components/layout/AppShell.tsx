'use client'
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { AccountSelector } from './AccountSelector'
import { useStore } from '@/lib/store'

/**
 * L'avertissement de repli.
 *
 * Quand la base est injoignable, les comptes viennent de Meta et aucun écran
 * d'analyse n'aura de données à montrer. Sans ce bandeau, tout paraît
 * simplement vide — et un compte vide se confond avec un compte sans
 * diffusion, ce qui est exactement la mauvaise conclusion.
 */
function BanniereSansBase() {
  const degrade = useStore((s) => s.degrade)
  if (!degrade) return null
  return (
    <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-900">Base de données injoignable</p>
      <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
        Les comptes affichés viennent directement de Meta. L’upload et le lancement fonctionnent
        normalement ; les écrans d’analyse resteront vides tant que la connexion n’est pas rétablie.
      </p>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fc]">
      <Sidebar open={open} onNavigate={() => setOpen(false)} />
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-[#E5E7EB] flex items-center justify-between gap-2 px-4 sm:px-6 flex-shrink-0">
          <div className="flex items-center gap-1 min-w-0">
            <button
              onClick={() => setOpen(true)}
              className="md:hidden p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100 flex-shrink-0"
              aria-label="Ouvrir le menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <AccountSelector />
          </div>
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-green-500" title="IA connectée" />
            <span className="text-xs text-gray-400 font-medium">IA connectée</span>
          </div>
        </header>
        {/* Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <BanniereSansBase />
          {children}
        </main>
      </div>
    </div>
  )
}
