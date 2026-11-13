'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { dossiersEnArbre, joursDeDiffusion, type Dossier, type PubVeille } from '@/components/veille/CartePub'
import { FichePub, voisines } from '@/components/veille/FichePub'
import { ToutesLesPubs } from '@/components/veille/ToutesLesPubs'

/**
 * Le swipe file de l'équipe : les pubs gardées, rangées en dossiers et
 * sous-dossiers. Recherche (⌘K), filtre actives / inactives, glisser une pub
 * sur un dossier pour l'y ranger, partager un dossier par lien public, et
 * importer des pubs par leur lien ou leur ID dans la Ad Library.
 */

type Vue = 'tous' | 'sans' | string
type DossierBiblio = Dossier & { partageToken: string | null }
const FORMATS: Record<string, string> = { IMAGE: 'Image', VIDEO: 'Vidéo', CAROUSEL: 'Carrousel', DCO: 'Dynamique' }
const sansAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const lienPartage = (jeton: string) => `${location.origin}/partage/${jeton}`

/** Les ID d'un texte collé : liens `…/ads/library/?id=…` ou ID seuls, un par ligne. */
function idsDe(texte: string) {
  const ids = new Set<string>()
  for (const morceau of texte.split(/[\s,;]+/)) {
    const lien = morceau.match(/[?&]id=(\d{6,25})/)
    if (lien) ids.add(lien[1])
    else if (/^\d{10,25}$/.test(morceau)) ids.add(morceau)
  }
  return [...ids]
}

/** Vignette compacte : la vidéo se lit au survol, le son se coupe ou s'active. */
function Vignette({ pub, ouvrir }: { pub: PubVeille; ouvrir: () => void }) {
  const media = pub.medias[0]
  const video = useRef<HTMLVideoElement>(null)
  const [son, setSon] = useState(false)
  const jours = joursDeDiffusion(pub)
  const sauvee = pub.sauvegardes.map((s) => s.createdAt).filter(Boolean).sort().pop()

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/pub-id', pub.id); e.dataTransfer.effectAllowed = 'move' }}
      className="group bg-white border border-[#E5E7EB] rounded-xl overflow-hidden hover:border-gray-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="h-6 w-6 shrink-0 rounded-full bg-[#3434ef] text-white text-xs font-bold flex items-center justify-center">
          {pub.marque.nom.trim()[0]?.toUpperCase() ?? '?'}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#0d0d12] truncate">{pub.marque.nom}</p>
          {sauvee && <p className="text-[11px] text-gray-400">gardée le {new Date(sauvee).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</p>}
        </div>
      </div>
      <div
        className="relative aspect-[4/5] bg-gray-100 cursor-pointer"
        onClick={ouvrir}
        onMouseEnter={() => void video.current?.play().catch(() => {})}
        onMouseLeave={() => video.current?.pause()}
      >
        {media?.type === 'video' ? (
          <video ref={video} src={media.url} poster={media.apercu ?? undefined} muted={!son} loop playsInline preload="none" className="h-full w-full object-cover" />
        ) : media ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : null}
        <span className="badge-gray absolute top-2 left-2">{FORMATS[pub.format] ?? pub.format}</span>
        {jours !== null && <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">{jours} j</span>}
        {media?.type === 'video' && (
          <button type="button" aria-label={son ? 'Couper le son' : 'Activer le son'}
            onClick={(e) => { e.stopPropagation(); setSon(!son) }}
            className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
            {son ? '🔊' : '🔇'}
          </button>
        )}
      </div>
      <button type="button" onClick={ouvrir} className="block w-full text-left px-2.5 py-2 space-y-0.5">
        {pub.titre && <p className="text-xs font-semibold text-[#0d0d12] line-clamp-1">{pub.titre}</p>}
        {pub.texte && <p className="text-xs text-gray-500 line-clamp-2">{pub.texte}</p>}
      </button>
    </div>
  )
}

function MesSauvegardes() {
  const [vue, setVue] = useState<Vue>('tous')
  const [dossiers, setDossiers] = useState<DossierBiblio[]>([])
  const [compteurs, setCompteurs] = useState({ total: 0, sansDossier: 0 })
  const [pubs, setPubs] = useState<PubVeille[] | null>(null)
  const [nouveau, setNouveau] = useState('')
  const [recherche, setRecherche] = useState('')
  const [statut, setStatut] = useState<'toutes' | 'actives' | 'inactives'>('toutes')
  const [ouverte, setOuverte] = useState<PubVeille | null>(null)
  const [survol, setSurvol] = useState<Vue | null>(null)
  const [importer, setImporter] = useState(false)
  const champ = useRef<HTMLInputElement>(null)

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
  const toutRecharger = useCallback(() => Promise.all([chargerDossiers(), chargerPubs()]), [chargerDossiers, chargerPubs])

  useEffect(() => { chargerDossiers() }, [chargerDossiers])
  useEffect(() => { setPubs(null); chargerPubs() }, [chargerPubs])

  // ⌘K / Ctrl+K : la recherche.
  useEffect(() => {
    const raccourci = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); champ.current?.focus() }
    }
    window.addEventListener('keydown', raccourci)
    return () => window.removeEventListener('keydown', raccourci)
  }, [])

  const dossier = dossiers.find((d) => d.id === vue)
  const arbre = dossiersEnArbre(dossiers)
  const chemin = useMemo(() => {
    const c: DossierBiblio[] = []
    for (let d = dossier; d; d = dossiers.find((x) => x.id === d!.parentId)) c.unshift(d)
    return c
  }, [dossier, dossiers])

  const visibles = useMemo(() => {
    const q = sansAccents(recherche.trim())
    const dernier = (p: PubVeille) => p.sauvegardes.map((s) => s.createdAt ?? '').sort().pop() ?? ''
    return (pubs ?? [])
      .filter((p) => statut === 'toutes' || (statut === 'actives') === p.active)
      .filter((p) => !q || sansAccents(`${p.marque.nom} ${p.titre ?? ''} ${p.texte ?? ''} ${p.description ?? ''}`).includes(q))
      .sort((a, b) => dernier(b).localeCompare(dernier(a)))
  }, [pubs, recherche, statut])

  async function appel(url: string, method: string, corps?: object) {
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.erreur || 'Opération impossible')
    return j
  }

  async function creerDossier(nom: string, parentId: string | null) {
    if (!nom.trim()) return
    try { await appel('/api/veille/dossiers', 'POST', { nom, parentId }); setNouveau(''); chargerDossiers() } catch (e) { toast.error((e as Error).message) }
  }
  async function renommer(d: DossierBiblio) {
    const nom = prompt('Nom du dossier', d.nom)
    if (!nom?.trim() || nom === d.nom) return
    try { await appel('/api/veille/dossiers', 'PATCH', { id: d.id, nom }); chargerDossiers() } catch (e) { toast.error((e as Error).message) }
  }
  async function supprimerDossier(d: DossierBiblio) {
    if (!confirm(`Supprimer « ${d.nom} » et ses sous-dossiers ? Les pubs qu’ils contiennent repasseront « Sans dossier ».`)) return
    try { await appel(`/api/veille/dossiers?id=${d.id}`, 'DELETE'); if (vue === d.id) setVue('tous'); toutRecharger() } catch (e) { toast.error((e as Error).message) }
  }
  async function partager(d: DossierBiblio, actif: boolean) {
    try {
      const r = await appel('/api/veille/dossiers', 'PATCH', { id: d.id, partage: actif })
      if (actif) { await navigator.clipboard.writeText(lienPartage(r.partageToken)).catch(() => {}); toast.success('Lien public copié') }
      else toast.success('Partage désactivé : l’ancien lien ne marche plus')
      chargerDossiers()
    } catch (e) { toast.error((e as Error).message) }
  }

  /** La sauvegarde à déplacer : celle de la vue ouverte, sinon la première. */
  const sauvegardeDe = (pub: PubVeille) =>
    pub.sauvegardes.find((s) => (vue === 'sans' ? s.dossierId === null : s.dossierId === vue)) ?? pub.sauvegardes[0]
  async function ranger(pub: PubVeille, dossierId: string | null) {
    try { await appel('/api/veille/sauvegardes', 'PATCH', { id: sauvegardeDe(pub).id, dossierId }); toast.success('Pub rangée'); setOuverte(null); toutRecharger() } catch (e) { toast.error((e as Error).message) }
  }
  async function retirer(pub: PubVeille) {
    try { await appel(`/api/veille/sauvegardes?id=${sauvegardeDe(pub).id}`, 'DELETE'); setOuverte(null); toutRecharger() } catch (e) { toast.error((e as Error).message) }
  }
  async function deposer(e: React.DragEvent, cible: Vue) {
    e.preventDefault()
    setSurvol(null)
    const pub = pubs?.find((p) => p.id === e.dataTransfer.getData('text/pub-id'))
    if (pub && cible !== 'tous') await ranger(pub, cible === 'sans' ? null : cible)
  }

  const entree = (id: Vue, nom: string, n: number, niveau = 0, d?: DossierBiblio) => (
    <li key={id} className="group flex items-center gap-0.5"
      onDragOver={(e) => { if (id !== 'tous') { e.preventDefault(); setSurvol(id) } }}
      onDragLeave={() => setSurvol(null)}
      onDrop={(e) => deposer(e, id)}>
      <button type="button" onClick={() => setVue(id)} style={{ paddingLeft: 8 + niveau * 14 }}
        className={clsx('flex-1 min-w-0 flex items-center justify-between gap-2 rounded-lg pr-2 py-1.5 text-sm text-left',
          survol === id ? 'bg-[#f0f0ff] ring-2 ring-[#3434ef]' : vue === id ? 'bg-[#f0f0ff] text-[#3434ef] font-medium' : 'text-gray-600 hover:bg-gray-50')}>
        <span className="truncate">{nom}{d?.partageToken && <span title="Partagé par lien public"> · 🔗</span>}</span>
        <span className="text-xs text-gray-400 tabular-nums">{n}</span>
      </button>
      {d && (
        <span className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 text-gray-400">
          <button type="button" aria-label={`Créer un sous-dossier dans ${d.nom}`} onClick={() => creerDossier(prompt('Nom du sous-dossier') ?? '', d.id)} className="px-1 hover:text-[#3434ef]">+</button>
          <button type="button" aria-label={`Renommer ${d.nom}`} onClick={() => renommer(d)} className="px-1 hover:text-[#3434ef]">✎</button>
          <button type="button" aria-label={`Supprimer ${d.nom}`} onClick={() => supprimerDossier(d)} className="px-1 hover:text-red-600">×</button>
        </span>
      )}
    </li>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <input ref={champ} value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher une marque, un mot…"
            aria-label="Rechercher dans la bibliothèque" className="input pr-12" />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 border border-[#E5E7EB] rounded px-1">⌘K</kbd>
        </div>
        <div className="flex gap-1">
          {(['toutes', 'actives', 'inactives'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatut(s)}
              className={clsx('px-3 py-1.5 rounded-lg text-sm', statut === s ? 'bg-[#f0f0ff] text-[#3434ef] font-medium' : 'text-gray-500 hover:bg-gray-50')}>
              {s === 'toutes' ? 'Toutes' : s === 'actives' ? 'Actives' : 'Inactives'}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setImporter(true)} className="btn-secondary">Importer</button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start">
        <nav aria-label="Dossiers" className="card p-3 w-full md:w-60 flex-shrink-0 space-y-3 md:sticky md:top-4">
          <ul className="space-y-0.5">
            {entree('tous', 'Toutes mes sauvegardes', compteurs.total)}
            {entree('sans', 'Sans dossier', compteurs.sansDossier)}
            {arbre.map((d) => entree(d.id, d.nom, d.n, d.niveau, d))}
          </ul>
          <form onSubmit={(e) => { e.preventDefault(); creerDossier(nouveau, null) }} className="flex gap-1.5">
            <input value={nouveau} onChange={(e) => setNouveau(e.target.value)} placeholder="Nouveau dossier" aria-label="Nom du nouveau dossier" className="input py-1.5 text-xs" />
            <button type="submit" className="btn-secondary px-2.5 py-1.5 text-xs">Créer</button>
          </form>
          <p className="text-[11px] text-gray-400">Glissez une pub sur un dossier pour l’y ranger.</p>
        </nav>

        <section className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-500">
              {vue === 'tous' ? 'Toutes mes sauvegardes' : vue === 'sans' ? 'Sans dossier' : chemin.map((d, i) => (
                <span key={d.id}>{i > 0 && ' / '}<button type="button" onClick={() => setVue(d.id)} className={i === chemin.length - 1 ? 'font-semibold text-[#0d0d12]' : 'hover:underline'}>{d.nom}</button></span>
              ))}
              {pubs && <span className="text-gray-400"> · {visibles.length} pub{visibles.length > 1 ? 's' : ''}</span>}
            </p>
            {dossier && (dossier.partageToken ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="badge-green">Partagé par lien public</span>
                <button type="button" onClick={() => navigator.clipboard.writeText(lienPartage(dossier.partageToken!)).then(() => toast.success('Lien copié'))} className="text-[#3434ef] hover:underline">Copier le lien</button>
                <button type="button" onClick={() => partager(dossier, false)} className="text-gray-400 hover:text-red-600">Désactiver le partage</button>
              </div>
            ) : (
              <button type="button" onClick={() => partager(dossier, true)} className="text-xs text-[#3434ef] hover:underline">Partager ce dossier par lien</button>
            ))}
          </div>

          {pubs === null && <div className="card text-center py-20 text-gray-400 text-sm">Chargement…</div>}
          {pubs && visibles.length === 0 && (
            <div className="card text-center py-16">
              <p className="text-[#0d0d12] font-medium">{recherche || statut !== 'toutes' ? 'Aucune pub pour cette recherche.' : 'Aucune pub ici.'}</p>
              <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
                Sauvegardez des pubs depuis l’onglet « Toutes les pubs », Espion ou la Meta Ad Library avec l’extension, ou importez-les par leur lien.
              </p>
            </div>
          )}
          {visibles.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
              {visibles.map((p) => <Vignette key={p.id} pub={p} ouvrir={() => setOuverte(p)} />)}
            </div>
          )}
        </section>
      </div>

      {ouverte && (
        <FichePub pub={ouverte} jours={joursDeDiffusion(ouverte)} fermer={() => setOuverte(null)} {...voisines(visibles, ouverte, setOuverte)} apresMasquage={() => { chargerPubs(); chargerDossiers() }} actions={
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Classer dans un dossier</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => ranger(ouverte, null)} className="px-2 py-1 rounded-md border border-[#E5E7EB] text-xs hover:border-[#3434ef]">Sans dossier</button>
              {arbre.map((d) => (
                <button key={d.id} type="button" onClick={() => ranger(ouverte, d.id)}
                  className={clsx('px-2 py-1 rounded-md border text-xs hover:border-[#3434ef]', ouverte.sauvegardes.some((s) => s.dossierId === d.id) ? 'border-[#3434ef] text-[#3434ef]' : 'border-[#E5E7EB]')}>
                  {d.nom}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => retirer(ouverte)} className="text-xs text-gray-400 hover:text-red-600">Retirer de la bibliothèque</button>
          </div>
        } />
      )}

      {importer && <Importer dossiers={arbre} vue={vue} fermer={() => setImporter(false)} fini={toutRecharger} />}
    </div>
  )
}

/** « Importer » : des liens ou des ID de la Ad Library, que l'extension va chercher. */
function Importer({ dossiers, vue, fermer, fini }: {
  dossiers: (Dossier & { niveau: number })[]; vue: Vue; fermer: () => void; fini: () => void
}) {
  const [texte, setTexte] = useState('')
  const [dossierId, setDossierId] = useState(vue !== 'tous' && vue !== 'sans' ? vue : '')
  const [etat, setEtat] = useState<string | null>(null)
  const [extension, setExtension] = useState<boolean | null>(null)
  const ids = idsDe(texte)

  useEffect(() => {
    const ecoute = (e: MessageEvent) => {
      const m = e.data
      if (e.source !== window || m?.source !== 'apogee-extension') return
      if (m.type === 'presente') setExtension(true)
      else if (m.type === 'progression' && m.etape === 'import') setEtat(`Import en cours : ${m.fait + 1} / ${m.total}…`)
      else if (m.type === 'erreur') setEtat(`L’import a échoué : ${m.message}`)
      else if (m.type === 'fini' && 'importees' in m) {
        const manque = [...m.introuvables, ...m.erreurs]
        setEtat(`${m.importees} pub${m.importees > 1 ? 's' : ''} importée${m.importees > 1 ? 's' : ''}${manque.length ? ` · introuvables ou en erreur : ${manque.join(', ')}` : ''}`)
        fini()
      }
    }
    window.addEventListener('message', ecoute)
    window.postMessage({ source: 'apogee-page', type: 'ping' }, location.origin)
    const delai = setTimeout(() => setExtension((v) => v ?? false), 1500)
    return () => { window.removeEventListener('message', ecoute); clearTimeout(delai) }
  }, [fini])

  function lancer() {
    setEtat('Ouverture de la Ad Library…')
    window.postMessage({ source: 'apogee-page', type: 'importer', ids, dossierId: dossierId || null }, location.origin)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={fermer}>
      <div role="dialog" aria-modal="true" aria-label="Importer des pubs" onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl w-full max-w-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-[#0d0d12]">Importer des pubs dans la bibliothèque</h2>
          <button type="button" onClick={fermer} aria-label="Fermer" className="text-gray-400 hover:text-[#0d0d12] text-xl leading-none">×</button>
        </div>
        <p className="text-sm text-gray-500">Collez des liens de la Meta Ad Library (…/ads/library/?id=…) ou des ID, un par ligne.</p>
        <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={5} className="input font-mono text-xs" aria-label="Liens ou ID à importer"
          placeholder={'https://www.facebook.com/ads/library/?id=1123972317269386\n2124918468134275'} />
        <div className="flex items-center gap-2">
          <select aria-label="Dossier de destination" value={dossierId} onChange={(e) => setDossierId(e.target.value)} className="select select-chevron flex-1">
            <option value="">Sans dossier</option>
            {dossiers.map((d) => <option key={d.id} value={d.id}>{'\u00a0\u00a0'.repeat(d.niveau)}{d.nom}</option>)}
          </select>
          <button type="button" onClick={lancer} disabled={!ids.length || !extension || !!etat?.startsWith('Import en cours')} className="btn-primary disabled:opacity-50">
            Importer {ids.length > 0 && `(${ids.length})`}
          </button>
        </div>
        {extension === false && <p className="text-xs text-red-600">L’extension Apogee Veille (0.5.0) n’est pas détectée : elle seule peut lire la Ad Library.</p>}
        {etat && <p className="text-sm text-gray-600" role="status">{etat}</p>}
      </div>
    </div>
  )
}

const ONGLETS = [['toutes', 'Toutes les pubs'], ['sauvegardes', 'Mes sauvegardes']] as const

/**
 * La Bibliothèque : « Toutes les pubs » ramenées par les scans, la veille et
 * la collecte, et « Mes sauvegardes » rangées en dossiers. ?onglet=sauvegardes
 * ouvre la seconde.
 */
export default function BibliothequePage() {
  const [onglet, setOnglet] = useState<(typeof ONGLETS)[number][0]>('toutes')
  useEffect(() => {
    if (new URLSearchParams(location.search).get('onglet') === 'sauvegardes') setOnglet('sauvegardes')
  }, [])

  function choisir(o: (typeof ONGLETS)[number][0]) {
    setOnglet(o)
    history.replaceState(null, '', o === 'sauvegardes' ? '?onglet=sauvegardes' : location.pathname)
  }

  return (
    <div className="space-y-4">
      <h1 className="page-title">Bibliothèque</h1>
      <nav className="flex gap-2 border-b border-[#E5E7EB]" aria-label="Bibliothèque">
        {ONGLETS.map(([cle, libelle]) => (
          <button key={cle} type="button" onClick={() => choisir(cle)} aria-current={onglet === cle ? 'page' : undefined}
            className={clsx('px-4 py-2.5 text-sm -mb-px border-b-2', onglet === cle ? 'border-[#3434ef] text-[#3434ef] font-medium' : 'border-transparent text-gray-500 hover:text-[#0d0d12]')}>
            {libelle}
          </button>
        ))}
      </nav>
      {onglet === 'toutes' ? <ToutesLesPubs /> : <MesSauvegardes />}
    </div>
  )
}
