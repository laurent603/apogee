'use client'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'

export type Guidelines = { typoTitre: string; typoTexte: string; tonDeVoix: string; motsAEmployer: string; motsAEviter: string }
export type Kit = { logo: string | null; logoClair: string | null; couleurs: string[]; photos: { chemin: string; url: string }[]; guidelines: Guidelines }

const CHAMPS_GUIDELINES: [keyof Guidelines, string, string][] = [
  ['typoTitre', 'Typographie des titres', 'ex. Montserrat, grasse'],
  ['typoTexte', 'Typographie des textes', 'ex. Open Sans'],
  ['tonDeVoix', 'Ton de voix', 'ex. professionnel, rassurant, proche'],
  ['motsAEmployer', 'Mots à employer', 'ex. autoconsommation, étude gratuite'],
  ['motsAEviter', 'Mots à éviter', 'ex. gratuit, pas cher, arnaque'],
]

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

/** Un logo du kit, sur damier clair (principal) ou sombre (pour fonds sombres). */
function BlocLogo({ titre, url, sombre, envoi, deposer, retirer }: {
  titre: string; url: string | null; sombre?: boolean; envoi: boolean; deposer: (f: FileList | null) => void; retirer: () => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">{titre}</p>
      <div className={`h-20 rounded-lg flex items-center justify-center overflow-hidden bg-[length:16px_16px] ${sombre
        ? 'bg-[conic-gradient(#1f2937_25%,#374151_0_50%,#1f2937_0_75%,#374151_0)]'
        : 'bg-[conic-gradient(#d1d5db_25%,#9ca3af_0_50%,#d1d5db_0_75%,#9ca3af_0)]'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt={titre} className="max-h-16 max-w-[80%] object-contain" /> : <span className="text-xs text-gray-400">Aucun</span>}
      </div>
      <div className="flex items-center gap-3 text-xs">
        <label className="text-[#3434ef] hover:underline cursor-pointer">
          {url ? 'Remplacer' : 'Déposer'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={envoi} onChange={(e) => { deposer(e.target.files); e.target.value = '' }} />
        </label>
        {url && <button type="button" onClick={retirer} className="text-gray-400 hover:text-red-600">Retirer</button>}
      </div>
    </div>
  )
}

/**
 * Logos, couleurs, photos réelles et guidelines du client : ce que la
 * génération d'images reprend pour que la créa soit à sa marque. Chaque
 * changement s'enregistre tout de suite, sans le bouton Sauvegarder de la page.
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

  async function deposer(quoi: 'logo' | 'logoClair' | 'photo', fichiers: FileList | null) {
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
          les couleurs et les guidelines guident les nouveaux concepts, les photos réelles remplacent les visuels inventés.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-[#E5E7EB] p-4 space-y-3">
          <p className="label">Logos</p>
          <div className="grid grid-cols-2 gap-3">
            <BlocLogo titre="Principal" url={kit.logo} envoi={envoi} deposer={(f) => deposer('logo', f)} retirer={() => patcher({ retirerLogo: true })} />
            <BlocLogo titre="Pour fonds sombres" url={kit.logoClair} sombre envoi={envoi} deposer={(f) => deposer('logoClair', f)} retirer={() => patcher({ retirerLogoClair: true })} />
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

      <div className="rounded-xl border border-[#E5E7EB] p-4 space-y-3">
        <p className="label">Guidelines</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          {CHAMPS_GUIDELINES.map(([cle, libelle, exemple]) => (
            <label key={cle} className="space-y-1">
              <span className="text-xs text-gray-500">{libelle}</span>
              <input defaultValue={kit.guidelines[cle]} placeholder={exemple} maxLength={400}
                onBlur={(e) => { if (e.target.value.trim() !== kit.guidelines[cle]) patcher({ [cle]: e.target.value }) }}
                className="input text-sm" />
            </label>
          ))}
        </div>
        <p className="text-[11px] text-gray-400">Le modèle d’image imite le style de la police, sans pouvoir la charger : vérifiez le rendu.</p>
      </div>
    </div>
  )
}
