'use client'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { budgetEstime, type Transparence } from '@/lib/veille/adLibrary'
import type { Decorticage } from '@/lib/veille/gemini'
import { compact, FichePub } from './FichePub'

/** Une pub de la veille, telle que /api/veille/pubs la renvoie. */
export type PubVeille = {
  id: string
  adArchiveId: string
  format: string
  texte: string | null
  titre: string | null
  description: string | null
  cta: string | null
  lienUrl: string | null
  plateformes: string[]
  debut: string | null
  fin: string | null
  active: boolean
  medias: { type: 'image' | 'video'; url: string; apercu: string | null }[]
  marque: { id: string; nom: string }
  sauvegardes: { id: string; dossierId: string | null }[]
  reachUe: number | null
  transparence: Transparence | null
  analyse: Decorticage | null
}

export type Dossier = { id: string; nom: string; parentId: string | null; n: number }

const FORMATS: Record<string, string> = { IMAGE: 'Image', VIDEO: 'Vidéo', CAROUSEL: 'Carrousel', DCO: 'Dynamique' }

function domaine(url: string | null) {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Jours de diffusion : jusqu'à aujourd'hui si la pub tourne encore. */
export function joursDeDiffusion(pub: PubVeille) {
  if (!pub.debut) return null
  const fin = pub.active || !pub.fin ? Date.now() : Date.parse(pub.fin)
  return Math.max(1, Math.round((fin - Date.parse(pub.debut)) / 86_400_000))
}

/** Les dossiers à plat, chaque sous-dossier indenté sous son parent. */
export function dossiersEnArbre(dossiers: Dossier[], parentId: string | null = null, niveau = 0): (Dossier & { niveau: number })[] {
  return dossiers
    .filter((d) => d.parentId === parentId)
    .flatMap((d) => [{ ...d, niveau }, ...dossiersEnArbre(dossiers, d.id, niveau + 1)])
}

export function CartePub({ pub, actions }: { pub: PubVeille; actions?: React.ReactNode }) {
  const [deplie, setDeplie] = useState(false)
  const [fiche, setFiche] = useState(false)
  const media = pub.medias[0]
  const jours = joursDeDiffusion(pub)
  const site = domaine(pub.lienUrl)
  const budget = budgetEstime(pub.reachUe)

  return (
    <article className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden flex flex-col">
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <p className="text-sm font-semibold text-[#0d0d12] truncate">{pub.marque.nom}</p>
        <span className={pub.active ? 'badge-green' : 'badge-gray'}>{pub.active ? 'Active' : 'Inactive'}</span>
      </header>

      <div className="relative bg-gray-100">
        {media?.type === 'video' ? (
          <video
            src={media.url}
            poster={media.apercu ?? undefined}
            controls
            muted
            playsInline
            preload="none"
            className="w-full max-h-[460px] object-contain"
            onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => e.currentTarget.pause()}
          />
        ) : media ? (
          <button type="button" onClick={() => setFiche(true)} aria-label="Voir la fiche de la pub" className="block w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media.url} alt="" loading="lazy" className="w-full max-h-[460px] object-contain" />
          </button>
        ) : (
          <div className="aspect-square flex items-center justify-center text-xs text-gray-400">Aucun média</div>
        )}
        <span className="badge-gray absolute top-2 left-2">
          {FORMATS[pub.format] ?? pub.format}
          {pub.medias.length > 1 && ` · ${pub.medias.length}`}
        </span>
        {budget !== null && (
          <span className="badge-green absolute top-2 right-2" title="Budget estimé à partir de la couverture UE">≈ {compact(budget)} €</span>
        )}
      </div>

      <div className="px-3 py-3 space-y-1.5 flex-1">
        {pub.titre && <p className="text-sm font-semibold text-[#0d0d12]">{pub.titre}</p>}
        {pub.texte && (
          <button
            type="button"
            onClick={() => setDeplie(!deplie)}
            className={`block text-left text-sm text-gray-600 whitespace-pre-line ${deplie ? '' : 'line-clamp-4'}`}
          >
            {pub.texte}
          </button>
        )}
        {(pub.cta || site) && (
          <p className="text-xs text-gray-500">
            {pub.cta && <span className="font-medium text-[#0d0d12]">{pub.cta}</span>}
            {pub.cta && site && ' · '}
            {site}
          </p>
        )}
      </div>

      <footer className="px-3 pb-3 space-y-2">
        <p className="text-xs text-gray-400">
          {jours !== null && <>Diffusée depuis {jours} j</>}
          {pub.reachUe !== null && <> · {compact(pub.reachUe)} personnes (UE)</>}
          {pub.plateformes.length > 0 && <> · {pub.plateformes.join(', ')}</>}
        </p>
        <button type="button" onClick={() => setFiche(true)} className="block text-xs font-medium text-[#3434ef] hover:underline">
          Voir la fiche
        </button>
        <a
          href={`https://www.facebook.com/ads/library/?id=${pub.adArchiveId}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-[#3434ef] hover:underline"
        >
          Voir dans la Ad Library
        </a>
        {actions}
      </footer>
      {fiche && <FichePub pub={pub} jours={jours} actions={actions} fermer={() => setFiche(false)} />}
    </article>
  )
}

/** « Sauvegarder dans… » : range la pub dans la bibliothèque, au dossier choisi. */
export function ChoixSauvegarde({ pub, dossiers }: { pub: PubVeille; dossiers: Dossier[] }) {
  const [dedans, setDedans] = useState(pub.sauvegardes.length > 0)

  async function sauvegarder(dossierId: string | null) {
    const r = await fetch('/api/veille/sauvegardes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pubId: pub.id, dossierId }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return void toast.error(j.erreur || 'Sauvegarde impossible')
    toast.success(j.deja ? 'Déjà dans ce dossier' : 'Ajoutée à la bibliothèque')
    setDedans(true)
  }

  return (
    <select
      aria-label="Sauvegarder dans un dossier"
      value=""
      onChange={(e) => sauvegarder(e.target.value === 'sans' ? null : e.target.value)}
      className="select py-1.5 text-xs"
    >
      <option value="" disabled>{dedans ? 'Dans la bibliothèque · ajouter à…' : 'Sauvegarder dans…'}</option>
      <option value="sans">Sans dossier</option>
      {dossiersEnArbre(dossiers).map((d) => (
        <option key={d.id} value={d.id}>{'\u00a0\u00a0'.repeat(d.niveau)}{d.nom}</option>
      ))}
    </select>
  )
}
