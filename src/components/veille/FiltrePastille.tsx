'use client'
import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'

export type OptionFiltre = { valeur: string; libelle: string; n?: number }

/**
 * Un filtre en pastille : un clic ouvre ses choix en puces, plusieurs à la
 * fois si `multiple` (valeurs séparées par des virgules), avec une recherche
 * quand ils sont nombreux.
 */
export function FiltrePastille({ libelle, options, valeur, multiple, onChange }: {
  libelle: string; options: OptionFiltre[]; valeur: string; multiple?: boolean; onChange: (v: string) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const [recherche, setRecherche] = useState('')
  const boite = useRef<HTMLDivElement>(null)
  const choisies = valeur ? valeur.split(',') : []

  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: MouseEvent) => { if (!boite.current?.contains(e.target as Node)) setOuvert(false) }
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    document.addEventListener('mousedown', dehors)
    document.addEventListener('keydown', echap)
    return () => {
      document.removeEventListener('mousedown', dehors)
      document.removeEventListener('keydown', echap)
    }
  }, [ouvert])

  function basculer(v: string) {
    if (!multiple) {
      onChange(choisies[0] === v ? '' : v)
      return setOuvert(false)
    }
    onChange((choisies.includes(v) ? choisies.filter((x) => x !== v) : [...choisies, v]).join(','))
  }

  const premier = options.find((o) => o.valeur === choisies[0])?.libelle ?? choisies[0]
  const resume = !choisies.length ? libelle : choisies.length === 1 ? premier : `${libelle} · ${choisies.length}`
  const motif = recherche.trim().toLowerCase()
  const visibles = options.filter((o) => !motif || o.libelle.toLowerCase().includes(motif))

  return (
    <div ref={boite} className="relative">
      <button type="button" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert} aria-haspopup="true"
        className={clsx('inline-flex max-w-[240px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
          choisies.length ? 'border-[#3434ef] bg-[#f0f0ff] font-medium text-[#3434ef]' : 'border-[#E5E7EB] bg-white text-[#0d0d12] hover:border-gray-300')}>
        <span className="truncate">{resume}</span>
        <svg className="h-3.5 w-3.5 shrink-0 opacity-60" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {ouvert && (
        <div role="dialog" aria-label={libelle} className="absolute left-0 z-30 mt-2 w-80 space-y-3 rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[#0d0d12]">{libelle}</p>
            {choisies.length > 0 && (
              <button type="button" onClick={() => onChange('')} className="text-xs text-gray-400 hover:text-red-600">Effacer</button>
            )}
          </div>
          <div className="space-y-3 rounded-lg bg-gray-50 p-3">
            {options.length > 8 && (
              <input autoFocus value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher" aria-label={`Rechercher dans ${libelle}`}
                className="input py-1.5" />
            )}
            <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto">
              {visibles.map((o) => {
                const actif = choisies.includes(o.valeur)
                return (
                  <button key={o.valeur} type="button" onClick={() => basculer(o.valeur)} aria-pressed={actif}
                    className={clsx('rounded-full border px-3 py-1.5 text-xs transition-colors',
                      actif ? 'border-[#3434ef] bg-[#3434ef] text-white' : 'border-[#E5E7EB] bg-white text-[#0d0d12] hover:border-gray-300')}>
                    {o.libelle}
                    {o.n !== undefined && <span className={actif ? 'text-white/70' : 'text-gray-400'}> {o.n}</span>}
                  </button>
                )
              })}
              {!visibles.length && <p className="text-xs text-gray-400">Aucun choix.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
