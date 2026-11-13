'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { useStore } from '@/lib/store'
import { useKit } from './KitVisuel'
import type { PubVeille } from './CartePub'

type Crea = { id: string; format: string; url: string; consigne: string | null; createdAt: string }
const FORMATS = [['1:1', 'Carré 1:1 · fil'], ['9:16', 'Vertical 9:16 · Story']] as const

/**
 * L'onglet « Recréer » de la fiche : la pub concurrente sert de modèle à des
 * images au logo, aux couleurs et à l'offre du client sélectionné.
 */
export function Recreer({ pub }: { pub: PubVeille }) {
  const compte = useStore((s) => s.selectedAccount)
  const [kit] = useKit(compte?.id || undefined)
  const [formats, setFormats] = useState<string[]>(['1:1', '9:16'])
  const [variantes, setVariantes] = useState(2)
  const [precision, setPrecision] = useState('')
  const [chargement, setChargement] = useState(false)
  const [creas, setCreas] = useState<Crea[]>([])

  useEffect(() => {
    setCreas([])
    if (!compte?.id) return
    fetch(`/api/veille/recreer?pubId=${pub.id}&dbAccountId=${compte.id}`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setCreas(d.creas))
  }, [pub.id, compte?.id])

  if (!compte?.id) return <p className="text-sm text-gray-500">Choisissez le client en haut d’Apogee : les images sont faites à sa marque.</p>

  const total = variantes
  const video = !pub.medias.some((m) => m.type === 'image')

  async function generer() {
    setChargement(true)
    const r = await fetch('/api/veille/recreer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pubId: pub.id, dbAccountId: compte!.id, formats, variantes, consigne: precision }),
    })
    const j = await r.json().catch(() => ({}))
    setChargement(false)
    if (!r.ok) return void toast.error(j.erreur || 'Génération impossible', { duration: 8000 })
    setCreas((l) => [...j.creas, ...l])
    if (j.echecs) toast.error(`${j.echecs} créa${j.echecs > 1 ? 's' : ''} sur ${total} non générée${j.echecs > 1 ? 's' : ''} : ${j.erreur}`, { duration: 8000 })
  }

  async function retirer(c: Crea) {
    const r = await fetch(`/api/veille/recreer?id=${c.id}&dbAccountId=${compte!.id}`, { method: 'DELETE' })
    if (r.ok) setCreas((l) => l.filter((x) => x.id !== c.id))
  }

  const nomFichier = (c: Crea, i: number) => `${compte.name}-${pub.marque.nom}-${c.format.replace(':', 'x')}-${i + 1}.png`.replace(/[^\w.-]+/g, '-')

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#E5E7EB] bg-gray-50 px-5 py-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-[#0d0d12]">Recréer pour {compte.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Reprend la composition et l’angle de cette pub, avec le logo, les couleurs et l’offre de {compte.name} ; jamais la marque, les personnes ni les phrases du concurrent.
            {video && ' Vidéo : son aperçu sert de modèle, le résultat est une image fixe.'}
          </p>
        </div>

        <p className="text-xs text-gray-600">
          Kit visuel :{' '}
          {kit ? (
            <>
              {kit.logo ? 'logo' : <span className="text-amber-700">pas de logo</span>} · {kit.couleurs.length} couleur{kit.couleurs.length > 1 ? 's' : ''} ·{' '}
              {kit.photos.length} photo{kit.photos.length > 1 ? 's' : ''}
            </>
          ) : '…'}
          {' · '}
          <Link href="/brand-settings" className="text-[#3434ef] hover:underline">compléter dans Brand Settings › Référentiel créatif</Link>
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {FORMATS.map(([f, libelle]) => {
            const actif = formats.includes(f)
            return (
              <button key={f} type="button" aria-pressed={actif} onClick={() => setFormats(actif ? formats.filter((x) => x !== f) : [...formats, f])}
                className={clsx('rounded-full border px-3 py-1.5 text-xs', actif ? 'border-[#3434ef] bg-[#3434ef] text-white' : 'border-[#E5E7EB] bg-white text-[#0d0d12]')}>
                {libelle}
              </button>
            )
          })}
          <label className="ml-2 inline-flex items-center gap-2 text-xs text-gray-600">
            Variantes
            <select value={variantes} onChange={(e) => setVariantes(Number(e.target.value))} className="select select-chevron w-auto py-1 text-xs">
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>

        <textarea value={precision} onChange={(e) => setPrecision(e.target.value)} rows={2} maxLength={600}
          placeholder="Précision facultative : l’offre à mettre en avant, l’angle, une accroche…" aria-label="Précision pour la génération" className="input text-sm" />

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            {chargement
              ? 'Génération en cours : 20 à 60 secondes.'
              : 'La Story reprend le carré, posé entre 22 % et 78 % de la hauteur. Relisez le texte de chaque image : l’IA fait encore des fautes.'}
          </p>
          <button type="button" onClick={generer} disabled={chargement || !formats.length} className="btn-primary shrink-0 disabled:opacity-50">
            {chargement ? 'Génération…' : `Générer ${total} créa${total > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      {creas.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {creas.map((c, i) => (
            <figure key={c.id} className="space-y-2">
              <a href={c.url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-[#E5E7EB] bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.url} alt={`Image ${c.format} générée pour ${compte.name}`} className={clsx('w-full object-cover', c.format === '9:16' ? 'aspect-[9/16]' : 'aspect-square')} />
              </a>
              <figcaption className="flex items-center justify-between gap-2 text-xs">
                <span className="text-gray-400">{c.format} · {new Date(c.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                <span className="flex gap-3">
                  <a href={`${c.url}?download=${encodeURIComponent(nomFichier(c, i))}`} className="text-[#3434ef] hover:underline">Télécharger</a>
                  <button type="button" onClick={() => retirer(c)} className="text-gray-400 hover:text-red-600">Retirer</button>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}
