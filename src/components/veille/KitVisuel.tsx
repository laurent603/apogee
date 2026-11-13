'use client'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'

export type Kit = { logo: string | null; couleurs: string[]; photos: { chemin: string; url: string }[] }

/** Le kit visuel d'un client : lu par Brand Settings et par « Recréer pour ce client ». */
export function useKit(dbAccountId: string | undefined) {
  const [kit, setKit] = useState<Kit | null>(null)
  useEffect(() => {
    setKit(null)
    if (!dbAccountId) return
    fetch(`/api/brand-settings/kit?dbAccountId=${dbAccountId}`).then((r) => (r.ok ? r.json() : null)).then(setKit)
  }, [dbAccountId])
  return [kit, setKit] as const
}

/**
 * Logo, couleurs et photos réelles du client : ce que la génération d'images
 * reprend pour que la créa soit à sa marque. Chaque changement s'enregistre
 * tout de suite, sans le bouton Sauvegarder de la page.
 */
export function KitVisuel({ dbAccountId }: { dbAccountId: string }) {
  const [kit, setKit] = useKit(dbAccountId)
  const [envoi, setEnvoi] = useState(false)
  const [couleurs, setCouleurs] = useState<string[] | null>(null)
  const premier = useRef(true)

  useEffect(() => {
    if (kit && couleurs === null) setCouleurs(kit.couleurs)
  }, [kit, couleurs])

  // Les couleurs partent 600 ms après le dernier changement : le sélecteur en émet un par mouvement.
  useEffect(() => {
    if (couleurs === null) return
    if (premier.current) return void (premier.current = false)
    const t = setTimeout(() => patcher({ couleurs }), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couleurs])

  async function patcher(corps: object) {
    const r = await fetch('/api/brand-settings/kit', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dbAccountId, ...corps }),
    })
    if (!r.ok) return void toast.error('Kit visuel non enregistré')
    setKit(await r.json())
  }

  async function deposer(quoi: 'logo' | 'photo', fichiers: FileList | null) {
    if (!fichiers?.length) return
    setEnvoi(true)
    for (const fichier of Array.from(fichiers)) {
      const form = new FormData()
      form.set('dbAccountId', dbAccountId)
      form.set('quoi', quoi)
      form.set('fichier', fichier)
      const r = await fetch('/api/brand-settings/kit', { method: 'POST', body: form })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.erreur || `${fichier.name} non envoyé`); break }
      setKit(j)
    }
    setEnvoi(false)
  }

  if (!kit || couleurs === null) return <p className="text-xs text-gray-400">Chargement du kit visuel…</p>

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-[#0d0d12] mb-1">Kit visuel</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          Repris quand une pub concurrente est recréée pour ce client (fiche d’une pub › Recréer) : le logo est posé tel quel,
          les couleurs guident la mise en page, les photos réelles remplacent les visuels inventés.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-[#E5E7EB] p-4 space-y-3">
          <p className="label">Logo</p>
          <div className="h-24 rounded-lg flex items-center justify-center overflow-hidden bg-[conic-gradient(#d1d5db_25%,#9ca3af_0_50%,#d1d5db_0_75%,#9ca3af_0)] bg-[length:16px_16px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {kit.logo ? <img src={kit.logo} alt="Logo du client" className="max-h-20 max-w-[80%] object-contain" /> : <span className="text-xs text-gray-400">Aucun logo</span>}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <label className="text-[#3434ef] hover:underline cursor-pointer">
              {kit.logo ? 'Remplacer' : 'Déposer le logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={envoi} onChange={(e) => { deposer('logo', e.target.files); e.target.value = '' }} />
            </label>
            {kit.logo && <button type="button" onClick={() => patcher({ retirerLogo: true })} className="text-gray-400 hover:text-red-600">Retirer</button>}
          </div>
          <p className="text-[11px] text-gray-400">PNG à fond transparent de préférence.</p>
        </div>

        <div className="rounded-xl border border-[#E5E7EB] p-4 space-y-3">
          <p className="label">Couleurs de marque</p>
          <div className="flex flex-wrap gap-2">
            {couleurs.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-full border border-[#E5E7EB] pl-1 pr-2 py-1">
                <input type="color" value={c} aria-label={`Couleur ${i + 1}`} onChange={(e) => setCouleurs(couleurs.map((x, j) => (j === i ? e.target.value : x)))}
                  className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0" />
                <span className="text-xs font-mono text-gray-600">{c}</span>
                <button type="button" onClick={() => setCouleurs(couleurs.filter((_, j) => j !== i))} aria-label={`Retirer ${c}`} className="text-gray-400 hover:text-red-600">×</button>
              </div>
            ))}
          </div>
          {couleurs.length < 6 && (
            <button type="button" onClick={() => setCouleurs([...couleurs, '#0076ff'])} className="text-xs text-[#3434ef] hover:underline">+ Ajouter une couleur</button>
          )}
          <p className="text-[11px] text-gray-400">La principale d’abord.</p>
        </div>

        <div className="rounded-xl border border-[#E5E7EB] p-4 space-y-3">
          <p className="label">Photos réelles</p>
          <div className="grid grid-cols-4 gap-2">
            {kit.photos.map((p) => (
              <div key={p.chemin} className="relative aspect-square rounded-md overflow-hidden bg-gray-50 group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => patcher({ retirerPhoto: p.chemin })} aria-label="Retirer la photo"
                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-white/90 text-xs text-gray-600 hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100">×</button>
              </div>
            ))}
          </div>
          {kit.photos.length < 8 && (
            <label className="inline-block text-xs text-[#3434ef] hover:underline cursor-pointer">
              {envoi ? 'Envoi…' : '+ Ajouter des photos'}
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" disabled={envoi} onChange={(e) => { deposer('photo', e.target.files); e.target.value = '' }} />
            </label>
          )}
          <p className="text-[11px] text-gray-400">Chantiers, produit, équipe : 8 au plus.</p>
        </div>
      </div>
    </div>
  )
}
