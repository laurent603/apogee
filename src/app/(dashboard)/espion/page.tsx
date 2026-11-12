'use client'

import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { type Dossier, type PubVeille } from '@/components/veille/CartePub'
import { RapportMarque } from '@/components/veille/RapportMarque'

/**
 * Espion : une marque, un produit ou un lien Ad Library, et ses pubs actives.
 *
 * Le serveur ne peut pas lire la Ad Library (Facebook le refuse) : c'est
 * l'extension qui ouvre la recherche dans Chrome, la fait défiler et renvoie
 * chaque pub à Apogee. Les pubs scannées entrent aussi dans Discovery.
 */

const PAYS = [
  ['FR', 'France'], ['BE', 'Belgique'], ['CH', 'Suisse'], ['LU', 'Luxembourg'], ['CA', 'Canada'],
  ['ES', 'Espagne'], ['IT', 'Italie'], ['DE', 'Allemagne'], ['GB', 'Royaume-Uni'], ['US', 'États-Unis'],
]

type Etat =
  | { etape: 'attente' }
  | { etape: 'ouverture' | 'lecture' }
  | { etape: 'details' | 'envoi'; fait: number; total: number }
  | { etape: 'erreur'; message: string }
  | { etape: 'fini'; trouvees: number; erreurs: number; premiereErreur: string | null }

const MESSAGES = {
  ouverture: 'Ouverture de la Ad Library dans un nouvel onglet…',
  lecture: 'Lecture des pubs : l’onglet défile tout seul, laissez-le ouvert…',
}

export default function EspionPage() {
  const [extension, setExtension] = useState<boolean | null>(null)
  const [recherche, setRecherche] = useState('')
  const [pays, setPays] = useState('FR')
  const [etat, setEtat] = useState<Etat>({ etape: 'attente' })
  const [pubs, setPubs] = useState<PubVeille[]>([])
  // La marque dont le rapport s'affiche : choisie après un scan ou dans la liste.
  const [choisie, setChoisie] = useState<{ id: string; nom: string; suivie?: boolean } | null>(null)
  const [toutesMarques, setToutesMarques] = useState<{ id: string; nom: string; suivie: boolean }[]>([])
  const [dossiers, setDossiers] = useState<Dossier[]>([])

  useEffect(() => {
    const ecoute = async (e: MessageEvent) => {
      const m = e.data
      if (e.source !== window || m?.source !== 'apogee-extension') return
      if (m.type === 'presente') setExtension(true)
      else if (m.type === 'progression') setEtat(m.etape === 'envoi' || m.etape === 'details' ? { etape: m.etape, fait: m.fait, total: m.total } : { etape: m.etape })
      else if (m.type === 'erreur') setEtat({ etape: 'erreur', message: m.message })
      else if (m.type === 'fini') {
        // Les plus touchées d'abord, comme dans la Ad Library.
        const d = m.ids.length ? await fetch(`/api/veille/pubs?ids=${m.ids.join(',')}&n=200&tri=couverture`).then((r) => (r.ok ? r.json() : null)) : null
        const scannees: PubVeille[] = d?.pubs ?? []
        setPubs(scannees)
        // Le rapport s'ouvre sur l'annonceur le plus présent dans le scan.
        const n = new Map<string, number>()
        for (const p of scannees) n.set(p.marque.id, (n.get(p.marque.id) ?? 0) + 1)
        const premier = [...n.entries()].sort((a, b) => b[1] - a[1])[0]
        if (d?.marques) setToutesMarques(d.marques)
        setChoisie(premier ? d.marques.find((x: { id: string }) => x.id === premier[0]) ?? scannees.find((p) => p.marque.id === premier[0])!.marque : null)
        setEtat({ etape: 'fini', trouvees: m.ids.length, erreurs: m.erreurs, premiereErreur: m.premiereErreur })
      }
    }
    window.addEventListener('message', ecoute)
    window.postMessage({ source: 'apogee-page', type: 'ping' }, location.origin)
    const delai = setTimeout(() => setExtension((v) => v ?? false), 1500)
    fetch('/api/veille/dossiers').then((r) => (r.ok ? r.json() : null)).then((d) => d && setDossiers(d.dossiers))
    fetch('/api/veille/pubs?n=1').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return
      setToutesMarques(d.marques)
      // ?marque=… : arrivée depuis la page Veille.
      const id = new URLSearchParams(location.search).get('marque')
      const m = id && d.marques.find((x: { id: string }) => x.id === id)
      if (m) setChoisie(m)
    })
    return () => {
      window.removeEventListener('message', ecoute)
      clearTimeout(delai)
    }
  }, [])

  function scanner(e: React.FormEvent) {
    e.preventDefault()
    if (!recherche.trim()) return
    setPubs([])
    setChoisie(null)
    setEtat({ etape: 'ouverture' })
    window.postMessage({ source: 'apogee-page', type: 'scanner', recherche: recherche.trim(), pays }, location.origin)
  }

  const enCours = ['ouverture', 'lecture', 'details', 'envoi'].includes(etat.etape)
  const annonceurs = useMemo(() => {
    const n = new Map<string, { id: string; nom: string; n: number }>()
    for (const p of pubs) n.set(p.marque.id, { ...p.marque, n: (n.get(p.marque.id)?.n ?? 0) + 1 })
    return [...n.values()].sort((a, b) => b.n - a.n)
  }, [pubs])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Espion</h1>
        <p className="page-subtitle mt-0.5">Les pubs actives d’une marque ou d’un produit, lues dans la Meta Ad Library</p>
      </div>

      <form onSubmit={scanner} className="card flex flex-col sm:flex-row gap-2">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Nom d’une marque, d’un produit, ou lien Ad Library"
          aria-label="Marque, produit ou lien Ad Library"
          className="input flex-1"
        />
        <select aria-label="Pays" value={pays} onChange={(e) => setPays(e.target.value)} className="select sm:w-44">
          {PAYS.map(([code, nom]) => <option key={code} value={code}>{nom}</option>)}
        </select>
        <button type="submit" disabled={!extension || enCours || !recherche.trim()} className="btn-primary disabled:opacity-50">
          {enCours ? 'Scan en cours…' : 'Scanner'}
        </button>
      </form>

      {toutesMarques.length > 0 && (
        <select aria-label="Revoir une marque espionnée" value={choisie?.id ?? ''} className="select w-auto"
          onChange={(e) => setChoisie(toutesMarques.find((m) => m.id === e.target.value) ?? null)}>
          <option value="" disabled>Revoir une marque espionnée…</option>
          {toutesMarques.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
        </select>
      )}

      {extension === false && (
        <div className="card text-sm text-gray-600 space-y-1">
          <p className="font-medium text-[#0d0d12]">L’extension Apogee Veille n’est pas détectée sur cette page.</p>
          <p>
            Installez-la depuis <code>chrome://extensions</code> (mode développeur → « Charger l’extension non empaquetée » →
            dossier <code>extension</code> d’Apogee), renseignez l’adresse d’Apogee et la clé dans ses options, puis
            rechargez cette page.
          </p>
        </div>
      )}

      {enCours && (
        <div className="card text-sm text-gray-600" role="status">
          {etat.etape === 'envoi'
            ? `Enregistrement des pubs et de leurs médias : ${etat.fait} / ${etat.total}`
            : etat.etape === 'details'
              ? `Lecture de la couverture et de l’audience de chaque pub : ${etat.fait} / ${etat.total}`
              : etat.etape === 'ouverture' || etat.etape === 'lecture' ? MESSAGES[etat.etape] : null}
        </div>
      )}

      {etat.etape === 'erreur' && <div className="card text-sm text-red-600" role="alert">Le scan a échoué : {etat.message}</div>}

      {etat.etape === 'fini' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {etat.trouvees} pub{etat.trouvees > 1 ? 's' : ''} de {annonceurs.length} annonceur{annonceurs.length > 1 ? 's' : ''}, aussi
            ajoutées à Discovery.
            {etat.erreurs > 0 && (
              <span className="text-amber-700">
                {' '}{etat.erreurs} {etat.erreurs > 1 ? 'n’ont pas pu être enregistrées' : 'n’a pas pu être enregistrée'} ({etat.premiereErreur}).
              </span>
            )}
          </p>
          {annonceurs.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {annonceurs.map((a) => (
                <button key={a.id} type="button" onClick={() => setChoisie(toutesMarques.find((m) => m.id === a.id) ?? a)}
                  className={clsx('px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                    choisie?.id === a.id ? 'bg-[#3434ef] text-white border-[#3434ef]' : 'bg-white text-gray-600 border-[#E5E7EB] hover:border-gray-300')}>
                  {a.nom} <span className={choisie?.id === a.id ? 'text-white/70' : 'text-gray-400'}>{a.n}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {choisie && <RapportMarque key={choisie.id} marque={choisie} dossiers={dossiers} />}
    </div>
  )
}
