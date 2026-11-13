'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

type MotCle = { id: string; motCle: string; derniereCollecte: string | null; dernierBilan: string | null }

const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

/**
 * Les mots-clés que la tâche du Mac cherche chaque matin dans la Ad Library :
 * leurs nouvelles pubs arrivent dans Discovery sans scan à lancer.
 */
export function MotsClesCollecte() {
  const [ouvert, setOuvert] = useState(false)
  const [mots, setMots] = useState<MotCle[] | null>(null)
  const [saisie, setSaisie] = useState('')

  useEffect(() => {
    fetch('/api/veille/mots-cles').then((r) => (r.ok ? r.json() : null)).then((d) => d && setMots(d.motsCles))
  }, [])

  async function ajouter(e: React.FormEvent) {
    e.preventDefault()
    if (!saisie.trim()) return
    const r = await fetch('/api/veille/mots-cles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ motCle: saisie }) })
    const m = await r.json().catch(() => null)
    if (!r.ok) return void toast.error(m?.erreur || 'Ajout impossible')
    setMots((l) => (l?.some((x) => x.id === m.id) ? l : [...(l ?? []), m]))
    setSaisie('')
  }

  async function retirer(m: MotCle) {
    const r = await fetch('/api/veille/mots-cles', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: m.id }) })
    if (r.ok) setMots((l) => l?.filter((x) => x.id !== m.id) ?? null)
  }

  if (!mots) return null
  const derniere = mots.map((m) => m.derniereCollecte).filter((d): d is string => !!d).sort().pop()

  return (
    <div className="card p-4 space-y-3">
      <button type="button" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert} className="w-full flex items-center justify-between gap-3 text-left">
        <span className="text-sm">
          <strong className="text-[#0d0d12]">Collecte quotidienne</strong>
          <span className="text-gray-500"> · {mots.length} mot{mots.length > 1 ? 's' : ''}-clé{mots.length > 1 ? 's' : ''}{derniere && ` · dernière le ${date(derniere)}`}</span>
        </span>
        <span className="text-xs text-[#3434ef]">{ouvert ? 'Fermer' : 'Gérer'}</span>
      </button>
      {ouvert && (
        <>
          <p className="text-xs text-gray-500">
            Chaque matin à 8 h, la tâche du Mac cherche ces mots-clés (phrase exacte) dans la Ad Library (France) et ajoute ici les pubs
            qu’elle ne connaît pas, jusqu’à 50 par mot-clé. Si le Mac est en veille à 8 h, elle part à son réveil.
          </p>
          <div className="flex flex-wrap gap-2">
            {mots.map((m) => (
              <span key={m.id} title={m.dernierBilan ? `${date(m.derniereCollecte!)} : ${m.dernierBilan}` : 'Pas encore collecté'}
                className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full border border-[#E5E7EB] bg-white text-xs text-[#0d0d12]">
                {m.motCle}
                {m.dernierBilan && <span className="text-gray-400">{m.dernierBilan.split(', ')[1]}</span>}
                <button type="button" onClick={() => retirer(m)} aria-label={`Retirer ${m.motCle}`} className="h-4 w-4 rounded-full text-gray-400 hover:text-red-600 hover:bg-gray-100 leading-none">×</button>
              </span>
            ))}
          </div>
          <form onSubmit={ajouter} className="flex gap-2">
            <input value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Ajouter un mot-clé, ex. pompe à chaleur" aria-label="Nouveau mot-clé" className="input max-w-xs" />
            <button type="submit" disabled={!saisie.trim()} className="btn-primary disabled:opacity-50">Ajouter</button>
          </form>
        </>
      )}
    </div>
  )
}
