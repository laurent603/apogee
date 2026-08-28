'use client'
import { useEffect, useState } from 'react'
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

const CLE_REDUIT = 'leadscore-menu-reduit'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [reduit, setReduit] = useState(false)
  // `monte` retarde l'animation d'un cran : au chargement, le menu doit
  // apparaître déjà réduit, pas se réduire sous les yeux à chaque page.
  const [monte, setMonte] = useState(false)

  useEffect(() => {
    try { setReduit(localStorage.getItem(CLE_REDUIT) === '1') } catch { /* stockage refusé */ }
    setMonte(true)
  }, [])

  const basculer = () => {
    setReduit((v) => {
      const n = !v
      try { localStorage.setItem(CLE_REDUIT, n ? '1' : '0') } catch { /* stockage refusé */ }
      return n
    })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fc]">
      <Sidebar open={open} onNavigate={() => setOpen(false)} reduit={reduit} anime={monte} />
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
            {/* Réduire le menu : les tableaux à douze colonnes gagnent
                deux cents pixels de largeur utile. */}
            <button
              onClick={basculer}
              title={reduit ? 'Déployer le menu' : 'Réduire le menu'}
              aria-label={reduit ? 'Déployer le menu' : 'Réduire le menu'}
              aria-pressed={reduit}
              className="hidden md:flex p-2 -ml-2 mr-1 rounded-lg text-gray-400 hover:text-[#0d0d12] hover:bg-gray-100 flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                <path strokeLinecap="round" strokeLinejoin="round"
                  d={reduit ? 'M13 9l3 3-3 3' : 'M11 9l-3 3 3 3'} />
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
