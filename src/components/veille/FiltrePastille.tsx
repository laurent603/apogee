'use client'
import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'

export type OptionFiltre = { valeur: string; libelle: string; n?: number }
/** Bornes libres « min..max » (l'une ou l'autre peut manquer), en jours, caractères, ans… ou en dates. */
export type Plage = { unite: string; date?: boolean }

const jourCourt = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

/** « 7..30 » → « 7–30 j », « 7.. » → « 7 j et plus », « ..30 » → « 30 j au plus ». */
function resumePlage(v: string, { unite, date }: Plage) {
  const [a, b] = v.split('..').map((x) => (x && date ? jourCourt(x) : x))
  if (a && b) return a === b ? `${a} ${unite}`.trim() : date ? `${a} → ${b}` : `${a}–${b} ${unite}`
  if (date) return a ? `depuis le ${a}` : `jusqu’au ${b}`
  return a ? `${a} ${unite} et plus` : `${b} ${unite} au plus`
}

/**
 * Un filtre en pastille : un clic ouvre ses choix en puces, plusieurs à la
 * fois si `multiple` (valeurs séparées par des virgules), avec une recherche
 * quand ils sont nombreux. Avec `plage`, un minimum et un maximum libres en plus.
 */
export function FiltrePastille({ libelle, options, valeur, multiple, plage, onChange }: {
  libelle: string; options: OptionFiltre[]; valeur: string; multiple?: boolean; plage?: Plage; onChange: (v: string) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [bornes, setBornes] = useState(['', ''])
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

  function ouvrir() {
    if (!ouvert && plage) setBornes(valeur.includes('..') ? valeur.split('..') : ['', ''])
    setOuvert(!ouvert)
  }

  function basculer(v: string) {
    if (!multiple) {
      onChange(choisies[0] === v ? '' : v)
      return setOuvert(false)
    }
    onChange((choisies.includes(v) ? choisies.filter((x) => x !== v) : [...choisies, v]).join(','))
  }

  function appliquer(e: React.FormEvent) {
    e.preventDefault()
    const [a, b] = bornes.map((x) => x.trim())
    onChange(a || b ? `${a}..${b}` : '')
    setOuvert(false)
  }

  const option = options.find((o) => o.valeur === choisies[0])
  const premier = option?.libelle ?? (plage && valeur.includes('..') ? resumePlage(valeur, plage) : choisies[0])
  const resume = !choisies.length ? libelle : choisies.length === 1 ? premier : `${libelle} · ${choisies.length}`
  const motif = recherche.trim().toLowerCase()
  const visibles = options.filter((o) => !motif || o.libelle.toLowerCase().includes(motif))

  return (
    <div ref={boite} className="relative">
      <button type="button" onClick={ouvrir} aria-expanded={ouvert} aria-haspopup="true"
        className={clsx('inline-flex max-w-[240px] items-center gap-1 rounded-full border px-3 py-1 text-[13px] transition-colors',
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
              <button type="button" onClick={() => { onChange(''); setBornes(['', '']) }} className="text-xs text-gray-400 hover:text-red-600">Effacer</button>
            )}
          </div>
          {plage && (
            <form onSubmit={appliquer} className="flex items-center gap-2">
              {(['Min', 'Max'] as const).map((nom, i) => (
                <input key={nom} type={plage.date ? 'date' : 'number'} min={0} value={bornes[i]} placeholder={nom} aria-label={`${libelle} : ${nom.toLowerCase()}`}
                  onChange={(e) => setBornes((b) => (i ? [b[0], e.target.value] : [e.target.value, b[1]]))}
                  className="input min-w-0 flex-1 py-1.5 text-xs" />
              ))}
              <button type="submit" className="btn-primary px-3 py-1.5 text-xs">OK</button>
            </form>
          )}
          <div className="space-y-3 rounded-lg bg-gray-50 p-3">
            {plage && <p className="text-xs text-gray-500">Choix rapides</p>}
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
