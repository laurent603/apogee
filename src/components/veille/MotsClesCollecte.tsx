'use client'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'

type MotCle = { id: string; motCle: string; statut: string; origine: string | null; derniereCollecte: string | null; dernierBilan: string | null }

const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const EVENEMENT = 'veille:mots-cles'

/**
 * Une marque vient d'être sauvegardée ou suivie : l'IA propose les mots-clés
 * qui ramèneraient ses concurrents. Ils attendent une validation dans Discovery.
 */
export function suggererSimilaires(marque: { id: string; nom: string }) {
  fetch('/api/veille/mots-cles/suggerer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ marqueId: marque.id }) })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const n = d?.ajoutes?.length ?? 0
      if (!n) return
      toast.success(`${n} mot${n > 1 ? 's' : ''}-clé${n > 1 ? 's' : ''} proposé${n > 1 ? 's' : ''} d’après ${marque.nom}, à valider dans la Bibliothèque`)
      window.dispatchEvent(new Event(EVENEMENT))
    })
    .catch(() => {})
}

/**
 * Les mots-clés que la tâche du Mac cherche chaque matin dans la Ad Library :
 * leurs nouvelles pubs arrivent dans Discovery sans scan à lancer.
 */
export function MotsClesCollecte() {
  const [ouvert, setOuvert] = useState(false)
  const [mots, setMots] = useState<MotCle[] | null>(null)
  const [saisie, setSaisie] = useState('')

  const charger = useCallback(() => {
    fetch('/api/veille/mots-cles').then((r) => (r.ok ? r.json() : null)).then((d) => d && setMots(d.motsCles))
  }, [])

  useEffect(() => {
    charger()
    window.addEventListener(EVENEMENT, charger)
    return () => window.removeEventListener(EVENEMENT, charger)
  }, [charger])

  async function ajouter(e: React.FormEvent) {
    e.preventDefault()
    if (!saisie.trim()) return
    const r = await fetch('/api/veille/mots-cles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ motCle: saisie }) })
    const m = await r.json().catch(() => null)
    if (!r.ok) return void toast.error(m?.erreur || 'Ajout impossible')
    setMots((l) => [...(l ?? []).filter((x) => x.id !== m.id), m])
    setSaisie('')
  }

  /** Valider (actif) ou écarter (refuse) : un mot-clé écarté n'est plus reproposé. */
  async function decider(m: MotCle, statut: 'actif' | 'refuse') {
    const r = await fetch('/api/veille/mots-cles', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: m.id, statut }) })
    if (!r.ok) return void toast.error('Changement impossible')
    setMots((l) => (l ?? []).flatMap((x) => (x.id !== m.id ? [x] : statut === 'actif' ? [{ ...x, statut }] : [])))
  }

  if (!mots) return null
  const actifs = mots.filter((m) => m.statut === 'actif')
  const suggestions = mots.filter((m) => m.statut === 'suggere')
  const derniere = actifs.map((m) => m.derniereCollecte).filter((d): d is string => !!d).sort().pop()

  return (
    <div className="card p-4 space-y-3">
      <button type="button" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert} className="w-full flex items-center justify-between gap-3 text-left">
        <span className="text-sm">
          <strong className="text-[#0d0d12]">Collecte quotidienne</strong>
          <span className="text-gray-500"> · {actifs.length} mot{actifs.length > 1 ? 's' : ''}-clé{actifs.length > 1 ? 's' : ''}{derniere && ` · dernière le ${date(derniere)}`}</span>
          {suggestions.length > 0 && <span className="badge-blue ml-2">{suggestions.length} à valider</span>}
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
            {actifs.map((m) => (
              <span key={m.id} title={m.dernierBilan ? `${date(m.derniereCollecte!)} : ${m.dernierBilan}` : 'Pas encore collecté'}
                className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full border border-[#E5E7EB] bg-white text-xs text-[#0d0d12]">
                {m.motCle}
                {m.dernierBilan && <span className="text-gray-400">{m.dernierBilan.split(', ')[1]}</span>}
                <button type="button" onClick={() => decider(m, 'refuse')} aria-label={`Retirer ${m.motCle}`} className="h-4 w-4 rounded-full text-gray-400 hover:text-red-600 hover:bg-gray-100 leading-none">×</button>
              </span>
            ))}
          </div>
          {suggestions.length > 0 && (
            <div className="space-y-2 rounded-lg bg-[#f0f0ff] p-3">
              <p className="text-xs text-gray-600">Proposés par l’IA d’après les marques sauvegardées ou suivies : à garder ou écarter.</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((m) => (
                  <span key={m.id} title={m.origine ? `D’après ${m.origine}` : undefined}
                    className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full border border-dashed border-[#3434ef]/40 bg-white text-xs text-[#0d0d12]">
                    {m.motCle}
                    <button type="button" onClick={() => decider(m, 'actif')} aria-label={`Garder ${m.motCle}`}
                      className="ml-1 px-1.5 rounded-full text-emerald-700 hover:bg-emerald-50 font-semibold">✓</button>
                    <button type="button" onClick={() => decider(m, 'refuse')} aria-label={`Écarter ${m.motCle}`}
                      className="px-1.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-gray-100">×</button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={ajouter} className="flex gap-2">
            <input value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Ajouter un mot-clé, ex. pompe à chaleur" aria-label="Nouveau mot-clé" className="input max-w-xs" />
            <button type="submit" disabled={!saisie.trim()} className="btn-primary disabled:opacity-50">Ajouter</button>
          </form>
        </>
      )}
    </div>
  )
}
