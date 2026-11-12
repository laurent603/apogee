'use client'

import { useCallback, useEffect, useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { CartePub, dossiersEnArbre, type Dossier, type PubVeille } from '@/components/veille/CartePub'

/**
 * Le swipe file de l'équipe : les pubs concurrentes gardées, rangées en
 * dossiers et sous-dossiers.
 */

type Vue = 'tous' | 'sans' | string

export default function BibliothequePage() {
  const [vue, setVue] = useState<Vue>('tous')
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [compteurs, setCompteurs] = useState({ total: 0, sansDossier: 0 })
  const [pubs, setPubs] = useState<PubVeille[] | null>(null)
  const [nouveau, setNouveau] = useState('')

  const chargerDossiers = useCallback(async () => {
    const d = await fetch('/api/veille/dossiers').then((r) => (r.ok ? r.json() : null))
    if (!d) return
    setDossiers(d.dossiers)
    setCompteurs({ total: d.total, sansDossier: d.sansDossier })
  }, [])

  const chargerPubs = useCallback(async () => {
    const d = await fetch(`/api/veille/pubs?dossier=${encodeURIComponent(vue)}&n=600`).then((r) => (r.ok ? r.json() : null))
    setPubs(d?.pubs ?? [])
  }, [vue])

  useEffect(() => { chargerDossiers() }, [chargerDossiers])
  useEffect(() => { setPubs(null); chargerPubs() }, [chargerPubs])

  const toutRecharger = () => Promise.all([chargerDossiers(), chargerPubs()])

  async function creerDossier(nom: string, parentId: string | null) {
    if (!nom.trim()) return
    const r = await fetch('/api/veille/dossiers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nom, parentId }),
    })
    if (!r.ok) return void toast.error('Création impossible')
    setNouveau('')
    chargerDossiers()
  }

  async function supprimerDossier(d: Dossier) {
    if (!confirm(`Supprimer « ${d.nom} » et ses sous-dossiers ? Les pubs qu’ils contiennent repasseront « Sans dossier ».`)) return
    const r = await fetch(`/api/veille/dossiers?id=${d.id}`, { method: 'DELETE' })
    if (!r.ok) return void toast.error('Suppression impossible')
    if (vue === d.id) setVue('tous')
    toutRecharger()
  }

  /** La sauvegarde affichée dans cette vue : celle du dossier ouvert, sinon la première. */
  const sauvegardeDe = (pub: PubVeille) =>
    pub.sauvegardes.find((s) => (vue === 'sans' ? s.dossierId === null : s.dossierId === vue)) ?? pub.sauvegardes[0]

  async function deplacer(pub: PubVeille, dossierId: string) {
    const s = sauvegardeDe(pub)
    const r = await fetch('/api/veille/sauvegardes', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: s.id, dossierId: dossierId === 'sans' ? null : dossierId }),
    })
    if (!r.ok) return void toast.error('Déplacement impossible')
    toast.success('Pub déplacée')
    toutRecharger()
  }

  async function retirer(pub: PubVeille) {
    const r = await fetch(`/api/veille/sauvegardes?id=${sauvegardeDe(pub).id}`, { method: 'DELETE' })
    if (!r.ok) return void toast.error('Retrait impossible')
    toutRecharger()
  }

  const arbre = dossiersEnArbre(dossiers)
  const titre = vue === 'tous' ? 'Toutes les pubs' : vue === 'sans' ? 'Sans dossier' : dossiers.find((d) => d.id === vue)?.nom ?? ''

  const entree = (id: Vue, nom: string, n: number, niveau = 0, dossier?: Dossier) => (
    <li key={id} className="group flex items-center gap-1">
      <button
        type="button"
        onClick={() => setVue(id)}
        style={{ paddingLeft: 8 + niveau * 14 }}
        className={clsx('flex-1 min-w-0 flex items-center justify-between gap-2 rounded-lg pr-2 py-1.5 text-sm text-left',
          vue === id ? 'bg-[#f0f0ff] text-[#3434ef] font-medium' : 'text-gray-600 hover:bg-gray-50')}
      >
        <span className="truncate">{nom}</span>
        <span className="text-xs text-gray-400 tabular-nums">{n}</span>
      </button>
      {dossier && (
        <span className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">
          <button type="button" aria-label={`Créer un sous-dossier dans ${dossier.nom}`}
            onClick={() => creerDossier(prompt('Nom du sous-dossier') ?? '', dossier.id)}
            className="px-1.5 text-gray-400 hover:text-[#3434ef]">+</button>
          <button type="button" aria-label={`Supprimer ${dossier.nom}`}
            onClick={() => supprimerDossier(dossier)}
            className="px-1.5 text-gray-400 hover:text-red-600">×</button>
        </span>
      )}
    </li>
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Bibliothèque</h1>
        <p className="page-subtitle mt-0.5">Les pubs concurrentes gardées par l’équipe</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start">
        <nav aria-label="Dossiers" className="card p-3 w-full md:w-60 flex-shrink-0 space-y-3">
          <ul className="space-y-0.5">
            {entree('tous', 'Toutes', compteurs.total)}
            {entree('sans', 'Sans dossier', compteurs.sansDossier)}
            {arbre.map((d) => entree(d.id, d.nom, d.n, d.niveau, d))}
          </ul>
          <form onSubmit={(e) => { e.preventDefault(); creerDossier(nouveau, null) }} className="flex gap-1.5">
            <input value={nouveau} onChange={(e) => setNouveau(e.target.value)} placeholder="Nouveau dossier"
              aria-label="Nom du nouveau dossier" className="input py-1.5 text-xs" />
            <button type="submit" className="btn-secondary px-2.5 py-1.5 text-xs">Créer</button>
          </form>
        </nav>

        <section className="flex-1 min-w-0 space-y-3">
          <h2 className="text-sm font-semibold text-[#0d0d12]">{titre}</h2>

          {pubs === null && <div className="card text-center py-20 text-gray-400 text-sm">Chargement…</div>}

          {pubs?.length === 0 && (
            <div className="card text-center py-16">
              <p className="text-[#0d0d12] font-medium">Aucune pub ici.</p>
              <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
                Sauvegardez des pubs depuis Discovery, ou depuis la Meta Ad Library avec l’extension Apogee Veille.
              </p>
            </div>
          )}

          {!!pubs?.length && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
              {pubs.map((pub) => (
                <CartePub
                  key={pub.id}
                  pub={pub}
                  actions={
                    <div className="flex items-center gap-2">
                      <select aria-label="Déplacer vers un dossier" value="" onChange={(e) => deplacer(pub, e.target.value)}
                        className="select py-1.5 text-xs">
                        <option value="" disabled>Déplacer vers…</option>
                        <option value="sans">Sans dossier</option>
                        {arbre.map((d) => (
                          <option key={d.id} value={d.id}>{'\u00a0\u00a0'.repeat(d.niveau)}{d.nom}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => retirer(pub)} className="text-xs text-gray-400 hover:text-red-600 whitespace-nowrap">
                        Retirer
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
