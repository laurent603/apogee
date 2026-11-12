'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useStore } from '@/lib/store'
import { CATEGORIES } from '@/lib/veille/categories'

/**
 * Le secteur du client sélectionné en haut d'Apogee : Veille, Discovery et
 * Espion n'affichent que ses marques. `secteur` vaut undefined tant qu'il
 * n'est pas lu, null quand le client n'en a pas (tout est affiché).
 */
export function useSecteurClient() {
  const compte = useStore((s) => s.selectedAccount)
  const cle = compte?.metaAccountId || compte?.id || null
  const [secteur, setSecteur] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (!cle) return setSecteur(null)
    setSecteur(undefined)
    fetch(`/api/veille/secteur?compte=${encodeURIComponent(cle)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSecteur(d?.categorie ?? null))
      .catch(() => setSecteur(null))
  }, [cle])

  async function changer(categorie: string | null) {
    if (!cle) return
    const r = await fetch('/api/veille/secteur', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ compte: cle, categorie }),
    })
    if (!r.ok) return void toast.error('Secteur non enregistré')
    setSecteur(categorie)
    toast.success(categorie ? `${compte?.name} : ${categorie}` : `${compte?.name} : tous les secteurs`)
  }

  return { client: compte?.name ?? null, secteur, changer }
}

/** « Secteur de <client> : [choix] », et de quoi voir les autres secteurs un moment. */
export function ChoixSecteur({ s, voirTout, setVoirTout }: {
  s: ReturnType<typeof useSecteurClient>
  voirTout?: boolean
  setVoirTout?: (v: boolean) => void
}) {
  if (!s.client || s.secteur === undefined) return null
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
      <span>Secteur de <strong className="text-[#0d0d12]">{s.client}</strong></span>
      <select aria-label={`Secteur de ${s.client}`} value={s.secteur ?? ''} onChange={(e) => s.changer(e.target.value || null)}
        className="select select-chevron w-auto text-xs py-1.5">
        <option value="">Non défini : tout afficher</option>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      {s.secteur && setVoirTout && (
        <button type="button" onClick={() => setVoirTout(!voirTout)} className="text-xs text-[#3434ef] hover:underline">
          {voirTout ? `Revenir à ${s.secteur}` : 'Voir tous les secteurs'}
        </button>
      )}
    </div>
  )
}

/** Une marque se montre si le client n'a pas de secteur, si elle est du sien, ou pas encore classée. */
export const dansLeSecteur = (secteur: string | null | undefined, categorie: string | null | undefined) =>
  !secteur || !categorie || categorie === secteur
