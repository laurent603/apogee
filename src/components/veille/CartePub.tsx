'use client'
import { useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import type { Transparence } from '@/lib/veille/adLibrary'
import type { Decorticage } from '@/lib/veille/gemini'
import { chiffresPub, compact, Duree, FichePub, masquerPub } from './FichePub'
import { suggererSimilaires } from './MotsClesCollecte'

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
  marque: { id: string; nom: string; categorie?: string | null }
  sauvegardes: { id: string; dossierId: string | null; createdAt?: string }[]
  reachUe: number | null
  transparence: Transparence | null
  analyse: Decorticage | null
  /** Parmi les pubs actives de la marque (route /api/veille/pubs seulement). */
  rang?: number | null
  surMarque?: number
  /** Pubs de la marque au même texte, elle comprise. */
  variantes?: number
  /** Pubs de la marque vers la même page de destination, elle comprise. */
  memeLien?: number
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
export function dossiersEnArbre<D extends Dossier>(dossiers: D[], parentId: string | null = null, niveau = 0): (D & { niveau: number })[] {
  return dossiers
    .filter((d) => d.parentId === parentId)
    .flatMap((d) => [{ ...d, niveau }, ...dossiersEnArbre(dossiers, d.id, niveau + 1)])
}

export function CartePub({ pub, actions, lectureSeule, retirer, ouvrir }: {
  pub: PubVeille; actions?: React.ReactNode; lectureSeule?: boolean
  /** Retire la carte de sa liste une fois la pub masquée ; sans lui, pas de lien « Masquer ». */
  retirer?: () => void
  /** La liste ouvre elle-même la fiche (avec ‹ › pour passer d'une pub à l'autre). */
  ouvrir?: () => void
}) {
  const [fiche, setFiche] = useState(false)
  const voir = () => (ouvrir ? ouvrir() : setFiche(true))
  const media = pub.medias[0]
  const jours = joursDeDiffusion(pub)
  const site = domaine(pub.lienUrl)
  const c = chiffresPub(pub, jours)

  return (
    <article className="h-full bg-white border border-[#E5E7EB] rounded-xl overflow-hidden flex flex-col">
      <header className="px-3 pt-2.5 pb-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[#0d0d12] truncate">{pub.marque.nom}</p>
          {pub.rang ? (
            <span className="badge-blue shrink-0" title={`Rang par couverture parmi les ${pub.surMarque} pubs actives de la marque`}>#{pub.rang}/{pub.surMarque}</span>
          ) : (
            <span className={clsx('shrink-0', pub.active ? 'badge-green' : 'badge-gray')}>{pub.active ? 'Active' : 'Inactive'}</span>
          )}
        </div>
        <Duree pub={pub} jours={jours} />
        {c.budget !== null ? (
          <p className="flex items-center justify-between gap-2 rounded-md bg-[#f0f0ff] px-2 py-1 text-[11px] text-[#3434ef]"
            title="Estimation : couverture UE publiée par Meta × 9,10 € pour 1 000 personnes">
            <span className="font-semibold truncate">{compact(c.parJour!)} €/j · {compact(c.budget)} € · {compact(pub.reachUe!)}</span>
            {c.pays > 0 && <span className="shrink-0 opacity-70">{c.pays} pays</span>}
          </p>
        ) : (
          // Même hauteur que le bandeau chiffré : les visuels restent alignés d'une carte à l'autre.
          <p className="rounded-md bg-gray-50 px-2 py-1 text-[11px] text-gray-400" title="Meta n’a pas encore donné la couverture de cette pub : elle sera lue au prochain scan ou relevé">
            Couverture inconnue
          </p>
        )}
      </header>

      <button type="button" onClick={voir} aria-label="Voir la fiche de la pub" className="relative block aspect-[4/5] bg-gray-100 overflow-hidden">
        {media?.type === 'video' ? (
          <video
            src={media.url}
            poster={media.apercu ?? undefined}
            muted
            loop
            playsInline
            preload="none"
            className="h-full w-full object-cover"
            onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => e.currentTarget.pause()}
          />
        ) : media ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="h-full flex items-center justify-center text-xs text-gray-400">Aucun média</span>
        )}
        <span className="badge-gray absolute top-2 left-2">
          {FORMATS[pub.format] ?? pub.format}
          {pub.medias.length > 1 && ` · ${pub.medias.length}`}
        </span>
        {(pub.variantes ?? 1) > 1 && (
          <span className="badge-gray absolute top-2 right-2" title={`${pub.variantes} pubs actives de la marque avec ce texte : créa réutilisée`}>⧉ {pub.variantes}</span>
        )}
      </button>

      <div className="px-3 pt-3 space-y-1 flex-1">
        {pub.titre && <p className="text-sm font-semibold text-[#0d0d12] line-clamp-1">{pub.titre}</p>}
        {pub.texte && <p className="text-xs text-gray-600 line-clamp-3">{pub.texte}</p>}
        {(pub.cta || site) && (
          <p className="text-xs text-gray-500 truncate">
            {pub.cta && <span className="font-medium text-[#0d0d12]">{pub.cta}</span>}
            {pub.cta && site && ' · '}
            {site}
          </p>
        )}
      </div>

      <footer className="px-3 pt-2 pb-3 space-y-2">
        {pub.plateformes.length > 0 && <p className="text-[11px] text-gray-400 truncate">{pub.plateformes.join(', ')}</p>}
        <p className="text-xs">
          <button type="button" onClick={voir} className="font-medium text-[#3434ef] hover:underline">Voir la fiche</button>
          <span className="text-gray-300"> · </span>
          <a href={`https://www.facebook.com/ads/library/?id=${pub.adArchiveId}`} target="_blank" rel="noreferrer" className="text-[#3434ef] hover:underline">
            Ad Library
          </a>
          {retirer && !lectureSeule && (
            <>
              <span className="text-gray-300"> · </span>
              <button type="button" onClick={async () => { if (await masquerPub(pub)) retirer() }} className="text-gray-400 hover:text-red-600">Masquer</button>
            </>
          )}
        </p>
        {actions}
      </footer>
      {fiche && <FichePub pub={pub} jours={jours} actions={actions} lectureSeule={lectureSeule} apresMasquage={retirer} fermer={() => setFiche(false)} />}
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
    suggererSimilaires(pub.marque)
  }

  return (
    <select
      aria-label="Sauvegarder dans un dossier"
      value=""
      onChange={(e) => sauvegarder(e.target.value === 'sans' ? null : e.target.value)}
      className="select select-chevron py-1.5 text-xs"
    >
      <option value="" disabled>{dedans ? 'Dans la bibliothèque · ajouter à…' : 'Sauvegarder dans…'}</option>
      <option value="sans">Sans dossier</option>
      {dossiersEnArbre(dossiers).map((d) => (
        <option key={d.id} value={d.id}>{'\u00a0\u00a0'.repeat(d.niveau)}{d.nom}</option>
      ))}
    </select>
  )
}
