'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { CartePub, ChoixSauvegarde, joursDeDiffusion, type Dossier, type PubVeille } from '@/components/veille/CartePub'
import { FichePub, voisines } from '@/components/veille/FichePub'
import { ChoixSecteur, useSecteurClient } from '@/components/veille/SecteurClient'
import { MotsClesCollecte } from '@/components/veille/MotsClesCollecte'

/**
 * Toutes les pubs concurrentes collectées : celles sauvegardées avec
 * l'extension, et demain celles que la veille ramène chaque nuit.
 */

const PAR_PAGE = 60

const FILTRES = {
  format: [['', 'Tous formats'], ['IMAGE', 'Image'], ['VIDEO', 'Vidéo'], ['CAROUSEL', 'Carrousel'], ['DCO', 'Dynamique']],
  plateforme: [['', 'Toutes plateformes'], ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['messenger', 'Messenger'], ['audience_network', 'Audience Network'], ['threads', 'Threads']],
  statut: [['', 'Actives et inactives'], ['active', 'Actives'], ['inactive', 'Inactives']],
  duree: [['', 'Toute durée'], ['7', 'Diffusée +1 semaine'], ['30', 'Diffusée +1 mois'], ['90', 'Diffusée +3 mois'], ['180', 'Diffusée +6 mois']],
  tri: [['', 'Plus récentes'], ['couverture', 'Plus de personnes touchées (UE)'], ['duree', 'Diffusées le plus longtemps']],
} as const

const LIBELLES: Record<keyof typeof FILTRES, string> = { format: 'Format', plateforme: 'Plateforme', statut: 'Statut', duree: 'Durée de diffusion', tri: 'Tri' }

type Filtres = Record<keyof typeof FILTRES | 'marque' | 'categorie', string>
const AUCUN: Filtres = { format: '', plateforme: '', statut: '', duree: '', tri: '', marque: '', categorie: '' }

/** L'onglet « Toutes les pubs » de la Bibliothèque : tout ce que les scans, la veille et la collecte ont ramené. */
export function ToutesLesPubs() {
  const [q, setQ] = useState('')
  const [recherche, setRecherche] = useState('')
  const [filtres, setFiltres] = useState<Filtres>(AUCUN)
  const [n, setN] = useState(PAR_PAGE)
  const [donnees, setDonnees] = useState<{
    pubs: PubVeille[]; total: number; marques: { id: string; nom: string; categorie: string | null }[]; categories: { libelle: string; n: number }[]
  } | null>(null)
  const [rafraichir, setRafraichir] = useState(0)
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [chargement, setChargement] = useState(true)
  const [ouverte, setOuverte] = useState<PubVeille | null>(null)
  const secteurClient = useSecteurClient()
  const { secteur } = secteurClient

  // Le client sélectionné ouvre Discovery sur son secteur ; la puce « Toutes » montre le reste.
  useEffect(() => {
    if (secteur !== undefined) setFiltres((f) => ({ ...f, categorie: secteur ?? '' }))
  }, [secteur])

  // La recherche part 300 ms après la dernière frappe.
  useEffect(() => {
    const t = setTimeout(() => { setRecherche(q.trim()); setN(PAR_PAGE) }, 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    if (secteur === undefined) return
    const params = new URLSearchParams({ n: String(n), ...(recherche && { q: recherche }), ...(secteurClient.compte && { compte: secteurClient.compte }) })
    for (const [k, v] of Object.entries(filtres)) if (v) params.set(k, v)
    setChargement(true)
    // Une réponse arrivée après une requête plus récente est ignorée.
    let actuelle = true
    fetch(`/api/veille/pubs?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (actuelle) { setDonnees(d); setChargement(false) } })
      .catch(() => actuelle && setChargement(false))
    return () => { actuelle = false }
  }, [recherche, filtres, n, rafraichir, secteur])

  useEffect(() => {
    fetch('/api/veille/dossiers').then((r) => (r.ok ? r.json() : null)).then((d) => d && setDossiers(d.dossiers))
    // Les marques pas encore classées le sont à l'ouverture ; on recharge si c'est le cas.
    fetch('/api/veille/marques/categoriser', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.classees && setRafraichir((x) => x + 1))
  }, [])

  function filtrer(cle: keyof Filtres, valeur: string) {
    setFiltres((f) => ({ ...f, [cle]: valeur }))
    setN(PAR_PAGE)
  }

  const actifs = Object.values(filtres).some(Boolean) || !!recherche
  const pubs = donnees?.pubs ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="page-subtitle">
          {donnees ? `${donnees.total} pub${donnees.total > 1 ? 's' : ''} concurrente${donnees.total > 1 ? 's' : ''}` : 'Les pubs concurrentes collectées'}
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un mot, une marque…"
          aria-label="Rechercher dans les pubs"
          className="input w-auto min-w-[260px]"
        />
      </div>

      <ChoixSecteur s={secteurClient} />

      <MotsClesCollecte />

      {!!donnees?.categories.length && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Catégories">
          {[{ libelle: '', n: donnees.categories.reduce((s, c) => s + c.n, 0) }, ...donnees.categories].map((c) => (
            <button key={c.libelle || 'toutes'} type="button" aria-pressed={filtres.categorie === c.libelle} onClick={() => filtrer('categorie', c.libelle)}
              className={clsx('px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                filtres.categorie === c.libelle ? 'bg-[#3434ef] text-white border-[#3434ef]' : 'bg-white text-gray-600 border-[#E5E7EB] hover:border-gray-300')}>
              {c.libelle || 'Toutes'} <span className={filtres.categorie === c.libelle ? 'text-white/70' : 'text-gray-400'}>{c.n}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Marque" value={filtres.marque} onChange={(e) => filtrer('marque', e.target.value)} className="select select-chevron w-auto">
          <option value="">Toutes les marques</option>
          {donnees?.marques.filter((m) => !filtres.categorie || m.categorie === filtres.categorie).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
        </select>
        {(Object.keys(FILTRES) as (keyof typeof FILTRES)[]).map((cle) => (
          <select key={cle} aria-label={LIBELLES[cle]} value={filtres[cle]} onChange={(e) => filtrer(cle, e.target.value)} className="select select-chevron w-auto">
            {FILTRES[cle].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        {actifs && (
          <button type="button" onClick={() => { setFiltres(AUCUN); setQ('') }} className="text-xs text-[#3434ef] hover:underline">
            Effacer les filtres
          </button>
        )}
      </div>

      {chargement && !donnees && <div className="card text-center py-20 text-gray-400 text-sm">Chargement…</div>}

      {donnees && pubs.length === 0 && (
        <div className="card text-center py-16">
          <p className="text-[#0d0d12] font-medium">{actifs ? 'Aucune pub pour ces filtres.' : 'Aucune pub collectée pour l’instant.'}</p>
          <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
            Les pubs arrivent ici quand on les sauvegarde depuis la Meta Ad Library avec l’extension Apogee Veille.
          </p>
        </div>
      )}

      {pubs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          {pubs.map((pub) => (
            <CartePub
              key={pub.id}
              pub={pub}
              actions={<ChoixSauvegarde pub={pub} dossiers={dossiers} />}
              ouvrir={() => setOuverte(pub)}
              retirer={() => setDonnees((d) => d && { ...d, pubs: d.pubs.filter((x) => x.id !== pub.id), total: d.total - 1 })}
            />
          ))}
        </div>
      )}

      {donnees && pubs.length < donnees.total && (
        <div className="text-center">
          <button type="button" onClick={() => setN(n + PAR_PAGE)} disabled={chargement} className="btn-secondary">
            {chargement ? 'Chargement…' : `Charger plus (${donnees.total - pubs.length} restantes)`}
          </button>
        </div>
      )}
      {ouverte && (
        <FichePub pub={ouverte} jours={joursDeDiffusion(ouverte)} actions={<ChoixSauvegarde pub={ouverte} dossiers={dossiers} />}
          fermer={() => setOuverte(null)} {...voisines(pubs, ouverte, setOuverte)} ouvrir={setOuverte}
          apresMasquage={() => setDonnees((d) => d && { ...d, pubs: d.pubs.filter((x) => x.id !== ouverte.id), total: d.total - 1 })} />
      )}
    </div>
  )
}
