'use client'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { budgetEstime, EUROS_POUR_MILLE_PERSONNES } from '@/lib/veille/adLibrary'
import { courbesEstimees, courbesRelevees } from '@/lib/veille/rapport'
import type { PubVeille } from './CartePub'
import type { Decorticage } from '@/lib/veille/gemini'
import { Recreer } from './Recreer'

/** 2 694 → « 2,7 K », 783 → « 780 » : deux chiffres significatifs, comme un ordre de grandeur. */
export function compact(v: number) {
  const arrondi = Number(v.toPrecision(2))
  // « 2,7 K », « 1,0 K », mais « 65 K » : une décimale seulement sous 10.
  const fr = (x: number) => x.toLocaleString('fr-FR', { minimumFractionDigits: x < 10 ? 1 : 0, maximumFractionDigits: 1 })
  if (arrondi >= 1_000_000) return `${fr(arrondi / 1_000_000)} M`
  if (arrondi >= 1_000) return `${fr(arrondi / 1_000)} K`
  return arrondi.toLocaleString('fr-FR')
}

const AGES = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'Unknown']
const pct = (n: number, total: number) => (total ? Math.round((100 * n) / total) : 0)

export function Barre({ libelle, valeur, total }: { libelle: string; valeur: number; total: number }) {
  const p = pct(valeur, total)
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-gray-500 shrink-0">{libelle}</span>
      <span className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <span className="block h-full bg-[#3434ef]" style={{ width: `${p}%` }} />
      </span>
      <span className="w-10 text-right tabular-nums text-gray-600">{p} %</span>
    </div>
  )
}

export function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{titre}</h3>
      {children}
    </section>
  )
}

const jourCourt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

/** Une courbe en aire, au jour le jour. */
export function Courbe({ id, titre, aide, donnees, cle, format }: {
  id: string; titre: string; aide?: string; donnees: object[]; cle: string; format: (v: number) => string
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-[#0d0d12]">{titre}</p>
        {aide && <p className="text-xs text-gray-400">{aide}</p>}
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={donnees} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3434ef" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#3434ef" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#F3F4F6" />
            <XAxis dataKey="jour" tickFormatter={jourCourt} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} minTickGap={32} />
            <YAxis tickFormatter={format} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={52} allowDecimals={false} />
            <Tooltip formatter={(v) => [format(Number(v)), titre]} labelFormatter={(l) => jourCourt(String(l))}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }} />
            <Area type="monotone" dataKey={cle} stroke="#3434ef" strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const dateCourte = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) })
}

/** « 406 j · 3 oct. 2025 → en cours », pastille verte si la pub tourne. */
export function Duree({ pub, jours, grand }: { pub: PubVeille; jours: number | null; grand?: boolean }) {
  return (
    <p className={clsx('flex items-center gap-1.5 text-gray-500', grand ? 'text-sm' : 'text-[11px]')}>
      <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', pub.active ? 'bg-emerald-500' : 'bg-gray-300')} />
      {jours !== null && pub.debut ? (
        <>
          <strong className="font-semibold text-[#0d0d12]">{jours} j</strong>
          <span className="truncate">· {dateCourte(pub.debut)} → {pub.active || !pub.fin ? 'en cours' : dateCourte(pub.fin)}</span>
        </>
      ) : pub.active ? 'Active' : 'Inactive'}
    </p>
  )
}

/** Dépense estimée totale et par jour, pays touchés. */
export function chiffresPub(pub: PubVeille, jours: number | null) {
  const budget = budgetEstime(pub.reachUe)
  return {
    budget,
    parJour: budget !== null && jours ? budget / jours : null,
    pays: new Set((pub.transparence?.repartition ?? []).map((l) => l.pays)).size,
  }
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Sous-titres .srt : chaque phrase dure jusqu'à la suivante, trois secondes au plus. */
function srt(segments: Decorticage['transcription']) {
  const t = (s: number) => {
    const ms = Math.round(s * 1000)
    const p = (n: number, l = 2) => String(n).padStart(l, '0')
    return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
  }
  return segments
    .map((g, i) => {
      const fin = Math.min(segments[i + 1]?.debut ?? g.debut + 3, g.debut + 3)
      return `${i + 1}\n${t(g.debut)} --> ${t(Math.max(fin, g.debut + 0.5))}\n${g.texte}\n`
    })
    .join('\n')
}

function telecharger(nom: string, contenu: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([contenu], { type: 'application/x-subrip;charset=utf-8' }))
  a.download = nom
  a.click()
  URL.revokeObjectURL(a.href)
}

/** « Décortiquer cette pub » : analyse Gemini du média, gardée sur la pub. */
function Decortiquer({ pub, analyse, setAnalyse }: { pub: PubVeille; analyse: Decorticage | null; setAnalyse: (a: Decorticage) => void }) {
  const [chargement, setChargement] = useState(false)

  async function lancer(refaire = false) {
    setChargement(true)
    const r = await fetch('/api/veille/decortiquer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pubId: pub.id, refaire }),
    })
    const j = await r.json().catch(() => ({}))
    setChargement(false)
    if (!r.ok) return void toast.error(j.erreur || 'Analyse impossible')
    setAnalyse(j)
  }

  if (!analyse) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-[#E5E7EB] bg-gray-50 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-[#0d0d12]">Décortiquer cette pub</p>
          <p className="text-xs text-gray-500">
            {chargement ? 'Analyse en cours… jusqu’à une minute pour une vidéo.' : 'Accroche, angle, concept, structure et transcription.'}
          </p>
        </div>
        <button type="button" onClick={() => lancer()} disabled={chargement} className="btn-primary disabled:opacity-50">
          {chargement ? 'Analyse…' : 'Lancer'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          {pub.medias.some((m) => m.type === 'video') ? 'Vidéo' : 'Image'} décortiquée le {new Date(analyse.date).toLocaleDateString('fr-FR')} · transcription dans l’onglet du même nom
        </p>
        <button type="button" onClick={() => lancer(true)} disabled={chargement} className="text-xs text-gray-400 hover:text-[#0d0d12] disabled:opacity-50">
          {chargement ? 'Analyse…' : 'Refaire'}
        </button>
      </div>
      <Section titre="Accroche"><p className="text-sm text-[#0d0d12]">« {analyse.accroche} »</p></Section>
      <div className="grid grid-cols-2 gap-4">
        <Section titre="Angle"><p className="text-sm text-gray-700">{analyse.angle}</p></Section>
        <Section titre="Concept"><p className="text-sm text-gray-700">{analyse.concept}</p></Section>
      </div>
      <Section titre="Promesse"><p className="text-sm text-gray-700">{analyse.promesse}</p></Section>
      <Section titre="Appel à l’action"><p className="text-sm text-gray-700">{analyse.appelAction}</p></Section>
      {analyse.structure.length > 0 && (
        <Section titre="Structure">
          <ol className="space-y-2">
            {analyse.structure.map((e, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="h-5 w-5 shrink-0 rounded-full bg-[#f0f0ff] text-[#3434ef] text-xs font-semibold flex items-center justify-center">{i + 1}</span>
                <span><span className="font-medium text-[#0d0d12]">{e.type}</span> <span className="text-gray-600">— {e.resume}</span></span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  )
}

/** La transcription horodatée : recherche, voix ou écran, traduction en français, copie et .srt. */
function Transcription({ pub, analyse, setAnalyse, decortiquer }: {
  pub: PubVeille; analyse: Decorticage | null; setAnalyse: (a: Decorticage) => void; decortiquer: () => void
}) {
  const [filtre, setFiltre] = useState<'tout' | 'voix' | 'ecran'>('tout')
  const [recherche, setRecherche] = useState('')
  const [enFrancais, setEnFrancais] = useState(false)
  const [traduction, setTraduction] = useState(false)

  if (!analyse?.transcription.length) {
    return (
      <div className="rounded-xl border border-[#E5E7EB] bg-gray-50 px-5 py-4 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-600">{analyse ? 'Aucun texte relevé dans cette pub.' : 'Pas encore de transcription : décortiquez la pub, la transcription vient avec.'}</p>
        {!analyse && <button type="button" onClick={decortiquer} className="btn-primary">Décortiquer</button>}
      </div>
    )
  }

  async function traduire() {
    if (analyse!.traductionFr) return setEnFrancais(!enFrancais)
    setTraduction(true)
    const r = await fetch('/api/veille/traduire', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubId: pub.id }) })
    const j = await r.json().catch(() => ({}))
    setTraduction(false)
    if (!r.ok) return void toast.error(j.erreur || 'Traduction impossible')
    setAnalyse({ ...analyse!, traductionFr: j.traduction })
    setEnFrancais(true)
  }

  const lignes = analyse.transcription.map((g, i) => ({
    ...g,
    fin: analyse.transcription[i + 1]?.debut ?? null,
    affiche: enFrancais && analyse.traductionFr ? analyse.traductionFr[i] : g.texte,
  }))
  const motif = recherche.trim().toLowerCase()
  const visibles = lignes.filter((g) => (filtre === 'tout' || g.source === filtre) && (!motif || g.affiche.toLowerCase().includes(motif)))
  const horodatage = (g: (typeof lignes)[number]) => `${mmss(g.debut)}${g.fin !== null && g.fin > g.debut ? `–${mmss(g.fin)}` : ''}`
  const voix = analyse.transcription.filter((g) => g.source === 'voix')

  function toutCopier() {
    navigator.clipboard.writeText(visibles.map((g) => `${horodatage(g)}  ${g.affiche}`).join('\n')).then(() => toast.success('Transcription copiée'))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher dans la transcription" aria-label="Rechercher dans la transcription"
          className="input flex-1 min-w-[200px] py-1.5" />
        <button type="button" onClick={traduire} disabled={traduction} className="btn-secondary py-1.5 text-xs disabled:opacity-50">
          {traduction ? 'Traduction…' : enFrancais ? 'Voir l’original' : 'Traduire en français'}
        </button>
        <button type="button" onClick={toutCopier} className="btn-secondary py-1.5 text-xs">Tout copier</button>
        {pub.medias.some((m) => m.type === 'video') && (
          <button type="button" onClick={() => telecharger(`transcription-${pub.adArchiveId}.srt`, srt(voix.length ? voix : analyse.transcription))}
            className="btn-secondary py-1.5 text-xs">.srt</button>
        )}
      </div>
      <div className="flex gap-1.5">
        {(['tout', 'voix', 'ecran'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFiltre(f)}
            className={`px-2.5 py-1 rounded-full text-xs border ${filtre === f ? 'bg-[#3434ef] text-white border-[#3434ef]' : 'bg-white text-gray-600 border-[#E5E7EB]'}`}>
            {f === 'tout' ? 'Tout' : f === 'voix' ? 'Voix off' : 'Texte à l’écran'}
          </button>
        ))}
      </div>
      <ul className="space-y-3">
        {visibles.map((g, i) => (
          <li key={i} className="flex gap-4 text-sm">
            <span className="w-20 shrink-0 tabular-nums text-xs text-gray-400 pt-0.5">{horodatage(g)}</span>
            <span className={g.source === 'ecran' ? 'font-medium uppercase text-xs tracking-wide text-gray-500 pt-0.5' : 'text-gray-800 leading-relaxed'}>{g.affiche}</span>
          </li>
        ))}
        {!visibles.length && <li className="text-sm text-gray-400">Aucune ligne ne correspond.</li>}
      </ul>
    </div>
  )
}

const JOUR_MS = 86_400_000

/** L'annonceur de la pub : ses chiffres, ses courbes, ses dernières pubs et ses pages de destination. */
function Annonceur({ pub, ouvrir }: { pub: PubVeille; ouvrir?: (p: PubVeille) => void }) {
  const [pubs, setPubs] = useState<PubVeille[] | null>(null)
  const [mesures, setMesures] = useState<{ pubId: string; jour: string; reachUe: number }[]>([])

  useEffect(() => {
    setPubs(null)
    fetch(`/api/veille/pubs?marque=${pub.marque.id}&n=600`).then((r) => (r.ok ? r.json() : null)).then((d) => setPubs(d?.pubs ?? []))
    fetch(`/api/veille/mesures?marque=${pub.marque.id}`).then((r) => (r.ok ? r.json() : null)).then((d) => setMesures(d?.mesures ?? []))
  }, [pub.marque.id])

  const estimees = useMemo(() => (pubs ? courbesEstimees(pubs, EUROS_POUR_MILLE_PERSONNES) : null), [pubs])
  const relevees = useMemo(() => courbesRelevees(mesures, EUROS_POUR_MILLE_PERSONNES), [mesures])
  if (!pubs || !estimees) return <p className="text-sm text-gray-400">Chargement de l’annonceur…</p>

  const maintenant = Date.now()
  const actives = pubs.filter((p) => p.active)
  const lancees = (j: number) => pubs.filter((p) => p.debut && maintenant - Date.parse(p.debut) <= j * JOUR_MS).length
  const pays = new Set(actives.flatMap((p) => (p.transparence?.repartition ?? []).map((l) => l.pays))).size
  const dernieres = pubs.filter((p) => p.debut).sort((a, b) => Date.parse(b.debut!) - Date.parse(a.debut!)).slice(0, 4)
  const pages = new Map<string, number>()
  for (const p of actives) {
    if (!p.lienUrl) continue
    const page = p.lienUrl.replace(/^https?:\/\/(www\.)?/, '').split(/[?#]/)[0].replace(/\/$/, '')
    pages.set(page, (pages.get(page) ?? 0) + 1)
  }
  const euros = (v: number) => `${compact(v)} €`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-[#0d0d12]">{pub.marque.nom}</p>
        <a href={`/espion?marque=${pub.marque.id}`} className="btn-secondary py-1.5 text-xs">Rapport Espion complet</a>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Chiffre libelle="Pubs actives" valeur={`${actives.length}/${pubs.length}`} />
        <Chiffre libelle="Dépense / jour" valeur={estimees[89].depense ? `≈ ${euros(estimees[89].depense)}` : '—'} />
        <Chiffre libelle="Lancées 7 · 14 · 30 j" valeur={`${lancees(7)} · ${lancees(14)} · ${lancees(30)}`} />
        <Chiffre libelle="Pays touchés" valeur={pays ? String(pays) : '—'} />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <Courbe id={`annonceur-actives-${pub.id}`} titre="Pubs actives par jour" donnees={estimees} cle="actives" format={(v) => String(Math.round(v))} />
        {relevees.jours.length > 0 ? (
          <Courbe id={`annonceur-releve-${pub.id}`} titre="Dépense relevée par jour" donnees={relevees.jours} cle="depense" format={euros} />
        ) : (
          <Courbe id={`annonceur-estime-${pub.id}`} titre="Dépense estimée par jour" aide="estimation" donnees={estimees} cle="depense" format={euros} />
        )}
      </div>
      {dernieres.length > 0 && (
        <Section titre="Dernières pubs lancées">
          <div className="grid grid-cols-4 gap-3">
            {dernieres.map((p) => {
              const image = p.medias[0]?.type === 'video' ? p.medias[0].apercu : p.medias[0]?.url
              return (
                <button key={p.id} type="button" onClick={() => ouvrir?.(p)} disabled={!ouvrir}
                  className={clsx('text-left rounded-lg border overflow-hidden', p.id === pub.id ? 'border-[#3434ef]' : 'border-[#E5E7EB] hover:border-gray-300')}>
                  <div className="aspect-[4/5] bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {image && <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  </div>
                  <p className="px-2 py-1.5 text-[11px] text-gray-500">il y a {Math.max(0, Math.round((maintenant - Date.parse(p.debut!)) / JOUR_MS))} j</p>
                </button>
              )
            })}
          </div>
        </Section>
      )}
      {pages.size > 0 && (
        <Section titre="Pages de destination">
          <ul className="rounded-xl border border-[#E5E7EB] divide-y divide-[#F3F4F6]">
            {[...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([page, n]) => (
              <li key={page} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                <a href={`https://${page}`} target="_blank" rel="noreferrer" className="text-[#3434ef] hover:underline truncate">{page}</a>
                <span className="text-xs text-gray-500 shrink-0">{n} pub{n > 1 ? 's' : ''} active{n > 1 ? 's' : ''}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

/** Masque la pub partout, après confirmation. Vrai si c'est fait. */
export async function masquerPub(pub: PubVeille) {
  if (!confirm(`Masquer cette pub de ${pub.marque.nom} ? Elle disparaît de la Bibliothèque, de Veille et d’Espion, et ne sera plus réimportée.`)) return false
  const r = await fetch('/api/veille/pubs', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: pub.id, masquee: true }),
  })
  if (!r.ok) {
    toast.error('Masquage impossible')
    return false
  }
  toast.success('Pub masquée')
  return true
}

/** ‹ › dans une liste : la pub d'avant et celle d'après, s'il y en a. */
export function voisines<T extends { id: string }>(liste: T[], courante: T, ouvrir: (p: T) => void) {
  const i = liste.findIndex((p) => p.id === courante.id)
  return {
    precedente: i > 0 ? () => ouvrir(liste[i - 1]) : undefined,
    suivante: i >= 0 && i < liste.length - 1 ? () => ouvrir(liste[i + 1]) : undefined,
  }
}

const ONGLETS_FICHE = ['Détails', 'Annonceur', 'Texte', 'Décortiquer', 'Recréer', 'Transcription', 'Audience'] as const

function Chiffre({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] p-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{libelle}</p>
      <p className="text-xl font-bold text-[#0d0d12] mt-1 tabular-nums">{valeur}</p>
    </div>
  )
}

function Ligne({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 px-4 py-3 text-sm">
      <dt className="text-gray-500 shrink-0">{libelle}</dt>
      <dd className="text-right text-[#0d0d12] min-w-0">{children}</dd>
    </div>
  )
}

/**
 * La fiche d'une pub, en deux volets : la pub à gauche (‹ › pour passer à la
 * suivante de la liste), ses chiffres et son analyse à droite, en onglets.
 */
export function FichePub({ pub, jours, actions, fermer, lectureSeule, apresMasquage, precedente, suivante, ouvrir }: {
  pub: PubVeille; jours: number | null; actions?: React.ReactNode; fermer: () => void
  /** Page publique d'un dossier partagé : pas d'analyse à lancer. */
  lectureSeule?: boolean
  /** Retire la pub de la liste qui a ouvert la fiche ; sans lui, pas de bouton « Masquer ». */
  apresMasquage?: () => void
  /** Passer à la pub précédente ou suivante de la liste (flèches du clavier aussi). */
  precedente?: () => void
  suivante?: () => void
  /** Ouvrir une autre pub (dernières pubs de l'annonceur). */
  ouvrir?: (p: PubVeille) => void
}) {
  const [index, setIndex] = useState(0)
  const [onglet, setOnglet] = useState<(typeof ONGLETS_FICHE)[number]>('Détails')
  const [mesures, setMesures] = useState<{ pubId: string; jour: string; reachUe: number }[]>([])
  const [analyse, setAnalyse] = useState<Decorticage | null>(pub.analyse)
  const media = pub.medias[index]
  const c = chiffresPub(pub, jours)
  const t = pub.transparence
  const relevees = useMemo(() => courbesRelevees(mesures, EUROS_POUR_MILLE_PERSONNES), [mesures])

  useEffect(() => {
    setIndex(0)
    setMesures([])
    setAnalyse(pub.analyse)
    if (!lectureSeule) fetch(`/api/veille/mesures?pub=${pub.id}`).then((r) => (r.ok ? r.json() : null)).then((d) => setMesures(d?.mesures ?? []))
  }, [pub.id, lectureSeule])

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return
      if (e.key === 'Escape') fermer()
      else if (e.key === 'ArrowLeft') precedente?.()
      else if (e.key === 'ArrowRight') suivante?.()
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [fermer, precedente, suivante])

  const repartition = t?.repartition ?? []
  const totalRepartition = repartition.reduce((s, l) => s + l.hommes + l.femmes + l.inconnu, 0)
  const somme = (f: (l: (typeof repartition)[number]) => number) => repartition.reduce((s, l) => s + f(l), 0)
  const parAge = AGES.map((age) => ({ age, n: somme((l) => (l.age === age ? l.hommes + l.femmes + l.inconnu : 0)) })).filter((a) => a.n > 0)
  const parPays = [...new Set(repartition.map((l) => l.pays))]
    .map((pays) => ({ pays, n: somme((l) => (l.pays === pays ? l.hommes + l.femmes + l.inconnu : 0)) }))
    .sort((a, b) => b.n - a.n)
  // Page publique : ni analyse à lancer, ni données de l'annonceur (réservées aux comptes Apogee).
  const onglets = ONGLETS_FICHE.filter((o) => !(lectureSeule && ['Annonceur', 'Décortiquer', 'Recréer', 'Transcription'].includes(o)))
  const dateLongue = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  const visuel = (
    <div className="relative w-full flex items-center justify-center">
      {media?.type === 'video' ? (
        <video key={media.url} src={media.url} poster={media.apercu ?? undefined} controls playsInline className="max-h-[68vh] w-auto max-w-full rounded-lg shadow-sm bg-black" />
      ) : media ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.url} alt="" className="max-h-[68vh] w-auto max-w-full rounded-lg shadow-sm" />
      ) : (
        <div className="aspect-square w-full flex items-center justify-center text-xs text-gray-400">Aucun média</div>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={fermer}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Pub de ${pub.marque.nom}`}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-6xl h-[90vh] flex overflow-hidden shadow-xl"
      >
        {/* Volet gauche : la pub, et le passage d'une pub à l'autre. */}
        <div className="hidden md:flex w-[42%] shrink-0 flex-col bg-gray-50 border-r border-[#E5E7EB]">
          <div className="flex-1 min-h-0 flex items-center justify-center p-6">{visuel}</div>
          {pub.medias.length > 1 && (
            <div className="flex justify-center gap-1.5 px-6 pb-3 overflow-x-auto">
              {pub.medias.map((m, i) => (
                <button key={i} type="button" onClick={() => setIndex(i)} aria-label={`Média ${i + 1}`}
                  className={`h-12 w-12 shrink-0 rounded-md overflow-hidden border-2 ${i === index ? 'border-[#3434ef]' : 'border-transparent'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.apercu ?? m.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-center gap-2 pb-5">
            <button type="button" onClick={precedente} disabled={!precedente} aria-label="Pub précédente"
              className="h-9 w-9 rounded-full bg-white border border-[#E5E7EB] text-gray-600 hover:text-[#0d0d12] disabled:opacity-30">‹</button>
            <a href={`https://www.facebook.com/ads/library/?id=${pub.adArchiveId}`} target="_blank" rel="noreferrer"
              className="px-3 py-2 rounded-full bg-white border border-[#E5E7EB] text-xs text-[#3434ef] hover:underline">Ad Library</a>
            {media && (
              <a href={media.url} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-full bg-white border border-[#E5E7EB] text-xs text-gray-600 hover:text-[#0d0d12]">Média</a>
            )}
            {apresMasquage && !lectureSeule && (
              <button type="button" onClick={async () => { if (await masquerPub(pub)) { fermer(); apresMasquage() } }}
                className="px-3 py-2 rounded-full bg-white border border-[#E5E7EB] text-xs text-gray-400 hover:text-red-600">Masquer</button>
            )}
            <button type="button" onClick={suivante} disabled={!suivante} aria-label="Pub suivante"
              className="h-9 w-9 rounded-full bg-white border border-[#E5E7EB] text-gray-600 hover:text-[#0d0d12] disabled:opacity-30">›</button>
          </div>
        </div>

        {/* Volet droit : chiffres et analyse. */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="px-6 pt-5 border-b border-[#E5E7EB]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-lg font-semibold text-[#0d0d12] truncate">{pub.marque.nom}</p>
                <Duree pub={pub} jours={jours} grand />
              </div>
              <div className="flex items-center gap-2">
                <span className={pub.active ? 'badge-green' : 'badge-gray'}>{pub.active ? 'Active' : 'Inactive'}</span>
                <button type="button" onClick={fermer} aria-label="Fermer" className="text-gray-400 hover:text-[#0d0d12] text-2xl leading-none px-1">×</button>
              </div>
            </div>
            <nav className="flex gap-1 mt-4" aria-label="Fiche de la pub">
              {onglets.map((o) => (
                <button key={o} type="button" onClick={() => setOnglet(o)}
                  className={clsx('px-3 py-2.5 text-sm -mb-px border-b-2', onglet === o ? 'border-[#3434ef] text-[#3434ef] font-medium' : 'border-transparent text-gray-500 hover:text-[#0d0d12]')}>
                  {o}
                </button>
              ))}
            </nav>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            <div className="md:hidden">{visuel}</div>

            {onglet === 'Détails' && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Chiffre libelle="Dépense / jour" valeur={c.parJour !== null ? `≈ ${compact(c.parJour)} €` : '—'} />
                  <Chiffre libelle="Dépense totale" valeur={c.budget !== null ? `≈ ${compact(c.budget)} €` : '—'} />
                  <Chiffre libelle="Couverture UE" valeur={pub.reachUe !== null ? compact(pub.reachUe) : '—'} />
                  <Chiffre libelle="Rang" valeur={pub.rang ? `#${pub.rang}/${pub.surMarque}` : '—'} />
                </div>
                {relevees.jours.length > 0 ? (
                  <Courbe id={`fiche-${pub.id}`} titre="Dépense relevée par jour" aide="écart de couverture d’un matin à l’autre"
                    donnees={relevees.jours} cle="depense" format={(v) => `${compact(v)} €`} />
                ) : (
                  <p className="text-xs text-gray-400">
                    {pub.reachUe === null
                      ? 'Couverture inconnue : relancez un scan Espion de la marque pour lire la fiche Meta de cette pub.'
                      : 'Courbe jour par jour : la couverture des marques suivies est relevée chaque matin ; elle apparaît après deux relevés.'}
                  </p>
                )}
                <dl className="rounded-xl border border-[#E5E7EB] divide-y divide-[#F3F4F6]">
                  {pub.lienUrl && (
                    <Ligne libelle="Page de destination">
                      <a href={pub.lienUrl} target="_blank" rel="noreferrer" className="text-[#3434ef] hover:underline break-all">{pub.lienUrl.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70)}</a>
                    </Ligne>
                  )}
                  {(pub.memeLien ?? 0) > 1 && <Ligne libelle="Pubs vers cette page">{pub.memeLien} sur {pub.surMarque} actives</Ligne>}
                  {(pub.variantes ?? 0) > 1 && <Ligne libelle="Créa réutilisée">{pub.variantes} pubs avec ce texte</Ligne>}
                  {c.pays > 0 && <Ligne libelle="Pays touchés">{c.pays} · {parPays.slice(0, 4).map((p) => p.pays).join(', ')}</Ligne>}
                  <Ligne libelle="Format">{pub.format === 'VIDEO' ? 'Vidéo' : pub.format === 'IMAGE' ? 'Image' : pub.format === 'CAROUSEL' ? 'Carrousel' : pub.format}</Ligne>
                  {pub.cta && <Ligne libelle="Bouton">{pub.cta}</Ligne>}
                  {pub.plateformes.length > 0 && <Ligne libelle="Plateformes">{pub.plateformes.join(', ')}</Ligne>}
                  {pub.debut && (
                    <Ligne libelle="Diffusion">
                      depuis le {dateLongue(pub.debut)}{!pub.active && pub.fin && <>, arrêtée le {dateLongue(pub.fin)}</>}
                    </Ligne>
                  )}
                  {t && (t.ciblage.ageMin !== null || t.ciblage.lieux.length > 0) && (
                    <Ligne libelle="Ciblage">
                      {t.ciblage.ageMin !== null && <>{t.ciblage.ageMin}–{t.ciblage.ageMax ?? '65+'} ans</>}
                      {t.ciblage.sexe && <> · {t.ciblage.sexe}</>}
                      {t.ciblage.lieux.length > 0 && <> · {t.ciblage.lieux.join(', ')}</>}
                    </Ligne>
                  )}
                  {t?.payeur && <Ligne libelle="Payé par">{t.payeur}{t.beneficiaire && t.beneficiaire !== t.payeur && <>, pour {t.beneficiaire}</>}</Ligne>}
                </dl>
                <p className="text-xs text-gray-400">
                  Meta ne publie pas la dépense : estimation à {EUROS_POUR_MILLE_PERSONNES.toLocaleString('fr-FR')} € pour 1 000 personnes touchées
                  dans l’UE, répartie sur les jours de diffusion. L’écart avec le budget réel peut être fort.
                </p>
              </>
            )}

            {onglet === 'Texte' && (
              <>
                {pub.titre && <Section titre="Titre"><p className="text-sm text-[#0d0d12]">{pub.titre}</p></Section>}
                {pub.texte && <Section titre="Texte principal"><p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{pub.texte}</p></Section>}
                {pub.description && <Section titre="Description"><p className="text-sm text-gray-700">{pub.description}</p></Section>}
                {(pub.cta || pub.lienUrl) && (
                  <Section titre="Bouton">
                    <p className="text-sm text-[#0d0d12]">
                      {pub.cta}
                      {pub.lienUrl && <> · <a href={pub.lienUrl} target="_blank" rel="noreferrer" className="text-[#3434ef] hover:underline break-all">{pub.lienUrl}</a></>}
                    </p>
                  </Section>
                )}
              </>
            )}

            {onglet === 'Annonceur' && <Annonceur pub={pub} ouvrir={ouvrir} />}
            {onglet === 'Décortiquer' && <Decortiquer pub={pub} analyse={analyse} setAnalyse={setAnalyse} />}
            {onglet === 'Recréer' && <Recreer pub={pub} />}
            {onglet === 'Transcription' && (
              <Transcription pub={pub} analyse={analyse} setAnalyse={setAnalyse} decortiquer={() => setOnglet('Décortiquer')} />
            )}

            {onglet === 'Audience' && (
              totalRepartition > 0 ? (
                <Section titre="Qui a été touché">
                  <div className="space-y-2">
                    <Barre libelle="Hommes" valeur={somme((l) => l.hommes)} total={totalRepartition} />
                    <Barre libelle="Femmes" valeur={somme((l) => l.femmes)} total={totalRepartition} />
                    <Barre libelle="Non déterminé" valeur={somme((l) => l.inconnu)} total={totalRepartition} />
                  </div>
                  <div className="space-y-2 pt-3">
                    {parAge.map((a) => <Barre key={a.age} libelle={a.age === 'Unknown' ? 'Âge inconnu' : `${a.age} ans`} valeur={a.n} total={totalRepartition} />)}
                  </div>
                  {parPays.length > 1 && (
                    <div className="space-y-2 pt-3">
                      {parPays.map((p) => <Barre key={p.pays} libelle={p.pays} valeur={p.n} total={totalRepartition} />)}
                    </div>
                  )}
                </Section>
              ) : <p className="text-sm text-gray-400">Audience inconnue : Meta ne l’a pas publiée, ou la fiche n’a pas encore été lue.</p>
            )}
          </div>

          {actions && (
            <footer className="flex justify-end px-6 py-4 border-t border-[#E5E7EB]">
              <div className="w-56">{actions}</div>
            </footer>
          )}
        </div>
      </div>
    </div>
  )
}
