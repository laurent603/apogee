'use client'
import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import type { AnalyseMarque } from '@/lib/veille/gemini'
import { CATEGORIES } from '@/lib/veille/categories'
import { suggererSimilaires } from './MotsClesCollecte'
import { EUROS_POUR_MILLE_PERSONNES, budgetEstime } from '@/lib/veille/adLibrary'
import { courbesEstimees, courbesRelevees, rapportMarque, resumeStrategie, rythmeParSemaine, strategieMarque } from '@/lib/veille/rapport'
import { ChoixSauvegarde, joursDeDiffusion, type Dossier, type PubVeille } from './CartePub'
import { Barre, Courbe, FichePub, chiffresPub, compact, voisines } from './FichePub'

/**
 * Le rapport Espion d'une marque : ses pubs actives en chiffres, comme le
 * fait Créabase. Tout se calcule à partir des pubs en base ; la couverture et
 * l'audience n'existent que pour les pubs lues par la seconde passe (extension
 * 0.3.0 et suivantes).
 */

// Le rapport n'a plus d'onglets : il en avait cinq, dont le premier empilait
// les quatre autres — dix-sept blocs pleine largeur à la suite. Les créas
// d'abord, puis une section d'analyse en cartes de grille.
const PERIODES = [[30, '30 jours'], [90, '90 jours'], [365, '12 mois']] as const

/** Les six axes de tags, dans l'ordre où on les lit : ouverture → offre. */
const AXES_IA = [
  ['accroche', 'Tactique d’accroche', 'Comment la créa ouvre.'],
  ['titre', 'Tactique de titre', 'Ce que fait le titre sous la créa.'],
  ['angle', 'Angle de message', 'L’argument mis en avant.'],
  ['concept', 'Concept créatif', 'Le format d’exécution.'],
  ['persona', 'Persona', 'Qui la créa vise, d’après son texte.'],
  ['offre', 'Type d’offre', 'Ce qu’elle propose concrètement.'],
] as const
type AxeIA = (typeof AXES_IA)[number][0]
const FORMATS: Record<string, string> = { IMAGE: 'Image', VIDEO: 'Vidéo', CAROUSEL: 'Carrousel', DCO: 'Dynamique' }

/**
 * Le format vu par le lecteur, pas celui déclaré par Meta. « DCO » est un
 * mode de diffusion — la créa reste une image ou une vidéo, et c'est ça
 * qu'on compare. On retombe sur le champ Meta quand aucun média n'est copié.
 */
const formatReel = (pub: { format: string; medias: { type: string }[] }) => {
  // Un DCO porte plusieurs médias sans être un carrousel : seul Meta sait le
  // dire, on garde donc son champ pour ce cas-là.
  if (pub.format === 'CAROUSEL') return 'CAROUSEL'
  const type = pub.medias[0]?.type
  if (type === 'video') return 'VIDEO'
  if (type === 'image') return 'IMAGE'
  return pub.format
}
const pourcent = (x: number) => `${Math.round(100 * x)} %`
const mois = (aaaamm: string) => new Date(`${aaaamm}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
const dateCourte = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })

function Bloc({ titre, sousTitre, aDroite, dense, children, className }: {
  titre: string; sousTitre?: string; children: React.ReactNode; className?: string
  /** Au bout de la ligne du titre : une légende, un sélecteur. */
  aDroite?: React.ReactNode
  /** Carte d'analyse en grille : titre plus petit, moins d'air. */
  dense?: boolean
}) {
  return (
    <section className={clsx('card', dense ? 'p-[18px] space-y-3.5' : 'p-6 space-y-5', className)}>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h3 className={dense ? 'text-[13px] font-semibold text-[#0d0d12]' : 'text-base font-semibold text-[#0d0d12]'}>{titre}</h3>
          {sousTitre && <p className={dense ? 'mt-1 text-[11px] leading-snug text-gray-400' : 'text-sm text-gray-500 mt-1'}>{sousTitre}</p>}
        </div>
        {aDroite}
      </div>
      {children}
    </section>
  )
}

/**
 * Un chiffre du bandeau de tête. La note porte toujours la portée — sur quoi
 * et sur quelle période : un nombre nu se relit mal deux semaines plus tard.
 */
function Chiffre({ libelle, valeur, apres, note, badge, variation }: {
  libelle: string; valeur: string; note?: React.ReactNode; badge?: string
  /** Le dénominateur, en gris à côté de la valeur : « 229 / 307 au total ». */
  apres?: string
  /** Une variation en pourcentage, posée à droite de la valeur. */
  variation?: number | null
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white px-[18px] py-4">
      <p className="truncate text-[13px] text-gray-500">
        {libelle}
        {badge && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-800">{badge}</span>}
      </p>
      <p className="mt-1.5 flex items-baseline gap-2 text-[26px] font-bold leading-none tracking-tight text-[#0d0d12]">
        <span className="whitespace-nowrap tabular-nums">{valeur}</span>
        {apres && <span className="text-[13px] font-normal text-gray-400">{apres}</span>}
        {variation !== null && variation !== undefined && (
          <span className={clsx('text-[13px] font-semibold tabular-nums', variation < 0 ? 'text-red-600' : 'text-green-700')}>
            {variation < 0 ? '↓' : '↑'} {Math.abs(variation)} %
          </span>
        )}
      </p>
      {note && <p className="mt-2 text-[12px] leading-snug text-gray-400">{note}</p>}
    </div>
  )
}

/** « Les Astuces Eco » → « LA », « Lumélio » → « LU ». Jamais d'emoji. */
const initiales = (nom: string) => {
  const mots = nom.split(/[\s-]+/).filter(Boolean)
  if (!mots.length) return '?'
  return (mots.length > 1 ? mots[0][0] + mots[1][0] : mots[0].slice(0, 2)).toUpperCase()
}

function Vide({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400">{children}</p>
}

/** Vignette d'une pub dans un classement ; un clic ouvre sa fiche. */
function Vignette({ pub, etiquette, ouvrir }: { pub: PubVeille; etiquette: string; ouvrir: () => void }) {
  const media = pub.medias[0]
  const budget = budgetEstime(pub.reachUe)
  const image = media?.type === 'video' ? media.apercu : media?.url
  return (
    <button type="button" onClick={ouvrir} className="flex flex-col text-left rounded-xl border border-[#E5E7EB] overflow-hidden hover:border-gray-300 bg-white">
      <div className="relative w-full aspect-[4/5] overflow-hidden bg-gray-100">
        {/* Posée en absolu, comme dans CarteCrea : `h-full` dans un parent à
            hauteur automatique laisse passer la hauteur naturelle du média. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && <img src={image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
        {budget !== null && <span className="badge-green absolute top-2 left-2">≈ {compact(budget)} €</span>}
        {media?.type === 'video' && <span className="badge-gray absolute top-2 right-2">Vidéo</span>}
      </div>
      <div className="w-full p-3 space-y-1">
        <p className="text-xs font-medium text-[#3434ef]">{etiquette}</p>
        {pub.titre && <p className="text-sm font-semibold text-[#0d0d12] line-clamp-2">{pub.titre}</p>}
        {pub.texte && <p className="text-xs text-gray-500 line-clamp-2">{pub.texte}</p>}
      </div>
    </button>
  )
}

const HAUT = 150
const BAS = 110
const semaineCourte = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

/**
 * Lancements et arrêts, semaine par semaine : un parc stable peut cacher dix
 * créas lancées et dix arrêtées chaque semaine.
 *
 * Même nombre de pixels par créa de part et d'autre de la ligne. Si chaque
 * moitié se normalisait sur son propre maximum, une semaine qui arrête plus
 * qu'elle ne lance se lirait à l'équilibre.
 */
function RythmeDeTest({ serie }: { serie: ReturnType<typeof courbesEstimees> }) {
  const { semaines, recent } = useMemo(() => rythmeParSemaine(serie), [serie])
  /**
   * Au plus treize colonnes : sur douze mois, cinquante-deux barres dans une
   * carte de grille ne se lisent plus et leurs dates débordent. Au-delà, les
   * semaines sont regroupées par paquets égaux et la colonne porte la date de
   * son premier jour.
   */
  const colonnes = useMemo(() => {
    const par = Math.ceil(semaines.length / 13)
    if (par <= 1) return { groupes: semaines, par }
    const groupes: typeof semaines = []
    for (let i = 0; i < semaines.length; i += par) {
      const bloc = semaines.slice(i, i + par)
      groupes.push({
        jour: bloc[0].jour,
        lancees: bloc.reduce((t, x) => t + x.lancees, 0),
        arretees: bloc.reduce((t, x) => t + x.arretees, 0),
      })
    }
    return { groupes, par }
  }, [semaines])
  if (!semaines.some((s) => s.lancees || s.arretees)) return null

  const parUnite = Math.min(
    (HAUT - 22) / Math.max(1, ...colonnes.groupes.map((s) => s.lancees)),
    (BAS - 22) / Math.max(1, ...colonnes.groupes.map((s) => s.arretees)),
  )

  return (
    <Bloc dense titre="Rythme de test"
      sousTitre={colonnes.par > 1 ? `Lancées au-dessus, arrêtées sous la ligne. Une colonne = ${colonnes.par} semaines.` : 'Lancées au-dessus, arrêtées sous la ligne, une colonne par semaine.'}
      aDroite={
        <div className="flex shrink-0 gap-3 pt-0.5 text-[11px] text-gray-500 whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#3434ef]" />Lancées</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#CBD5E1]" />Arrêtées</span>
        </div>
      }>
      <div className="relative">
        <div className="flex gap-1.5">
          {colonnes.groupes.map((s) => (
            <div key={s.jour} className="flex-1 flex flex-col">
              <div className="flex flex-col justify-end items-center gap-1.5" style={{ height: HAUT }}>
                <span className="text-[11px] font-medium text-[#3434ef] tabular-nums leading-none">{s.lancees}</span>
                <div className="w-[62%] mb-1 rounded-t-[3px] bg-[#3434ef]" style={{ height: Math.round(s.lancees * parUnite) }} />
              </div>
              <div className="flex flex-col justify-start items-center gap-1.5" style={{ height: BAS }}>
                <div className="w-[62%] mt-1 rounded-b-[3px] bg-[#CBD5E1]" style={{ height: Math.round(s.arretees * parUnite) }} />
                <span className="text-[11px] text-gray-400 tabular-nums leading-none">{s.arretees}</span>
              </div>
              <p className="pt-2.5 text-center text-[10px] text-gray-400 whitespace-nowrap">{semaineCourte(s.jour)}</p>
            </div>
          ))}
        </div>
        {/* Un seul trait continu : un trait par colonne se lirait comme un empilement. */}
        <div className="absolute inset-x-0 h-px bg-gray-400" style={{ top: HAUT }} />
      </div>
      {recent && (
        <p className="border-t border-[#F3F4F6] pt-3 text-[12px] leading-relaxed text-gray-700">
          Sur les 4 dernières semaines : <strong className="font-semibold text-[#0d0d12]">{recent.lancees} créas lancées</strong>,{' '}
          <strong className="font-semibold text-[#0d0d12]">{recent.arretees} arrêtées</strong> —{' '}
          {recent.solde === 0 ? (
            <>le parc actif ne bouge pas.</>
          ) : (
            <>le parc actif {recent.solde < 0 ? 'perd' : 'gagne'} <strong className="font-semibold text-[#0d0d12]">{Math.abs(recent.solde)} créa{Math.abs(recent.solde) > 1 ? 's' : ''}</strong>.</>
          )}
          {recent.variation !== null && (
            recent.variation === 0
              ? <> Le rythme de lancement est stable par rapport aux 4 semaines précédentes.</>
              : <> Le rythme de lancement {recent.variation < 0 ? 'baisse' : 'monte'} de{' '}
                  <span className={clsx('font-semibold', recent.variation < 0 ? 'text-red-700' : 'text-[#0d0d12]')}>{Math.abs(recent.variation)} %</span>
                  {' '}par rapport aux 4 semaines précédentes.</>
          )}
        </p>
      )}
    </Bloc>
  )
}

const STATUTS = ['Actives', 'Arrêtées', 'Toutes'] as const
const TRIS = ['Couverture UE', 'Dépense / jour', 'Jours en ligne', 'Plus récentes'] as const

/** Une créa dans la grille : le visuel en grand, trois chiffres en pied. */
function CarteCrea({ pub, ouvrir }: { pub: PubVeille; ouvrir: () => void }) {
  const jours = joursDeDiffusion(pub)
  const c = chiffresPub(pub, jours)
  const media = pub.medias[0]
  const image = media?.type === 'video' ? media.apercu : media?.url
  return (
    <button type="button" onClick={ouvrir}
      className="flex flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white text-left hover:border-gray-300">
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-gray-100">
        {/* Posée en absolu : dans un parent à hauteur automatique, `h-full` ne
            contraint rien et c'est la hauteur naturelle du média qui gagne. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && <img src={image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
        <span className={clsx('absolute left-2 top-2', pub.active ? 'badge-green' : 'badge-gray')}>{pub.active ? 'Active' : 'Arrêtée'}</span>
        <span className="badge-gray absolute right-2 top-2">{FORMATS[formatReel(pub)] ?? pub.format}</span>
      </div>
      <div className="flex items-center justify-between gap-1.5 px-2.5 py-2 text-[11px] tabular-nums">
        <span className="font-semibold text-[#0d0d12]">{jours !== null ? `${jours} j` : '—'}</span>
        <span className="truncate text-gray-500">{c.budget !== null ? `≈ ${compact(c.budget)} €` : '—'}</span>
        {(pub.variantes ?? 1) > 1 && (
          <span className="shrink-0 text-gray-400" title={`${pub.variantes} créas avec ce texte`}>×{pub.variantes}</span>
        )}
      </div>
    </button>
  )
}

/**
 * Toutes les créas de la marque dans une grille unique, filtrable et triable.
 * Elle remplace « les plus diffusées » et « celles qui tournent le plus
 * longtemps » : c'étaient deux tris figés du même ensemble, chacun coupé à six.
 */
function GrilleCreas({ toutes, ouvrir }: { toutes: PubVeille[]; ouvrir: (p: PubVeille) => void }) {
  const [statut, setStatut] = useState<(typeof STATUTS)[number]>('Actives')
  const [tri, setTri] = useState<(typeof TRIS)[number]>('Couverture UE')
  const [complet, setComplet] = useState(false)

  const liste = useMemo(() => {
    const gardees = toutes.filter((p) => (statut === 'Toutes' ? true : statut === 'Actives' ? p.active : !p.active))
    // Un tri décroissant sur une clé ; les valeurs inconnues finissent en bas.
    const cle = (p: PubVeille) => {
      const jours = joursDeDiffusion(p)
      if (tri === 'Couverture UE') return p.reachUe ?? -1
      if (tri === 'Jours en ligne') return jours ?? -1
      if (tri === 'Plus récentes') return p.debut ? Date.parse(p.debut) : -1
      return chiffresPub(p, jours).parJour ?? -1
    }
    return [...gardees].sort((a, b) => cle(b) - cle(a))
  }, [toutes, statut, tri])

  const actives = toutes.filter((p) => p.active).length
  const visibles = complet ? liste : liste.slice(0, 20)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold text-[#0d0d12]">
          Créatives <span className="ml-1 text-sm font-normal text-gray-400">{actives} actives · {toutes.length} connues</span>
        </h3>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {STATUTS.map((s) => (
            <button key={s} type="button" onClick={() => { setStatut(s); setComplet(false) }}
              className={clsx('rounded-md px-2.5 py-1 text-xs', statut === s ? 'bg-white font-medium text-[#0d0d12] shadow-sm' : 'text-gray-500 hover:text-[#0d0d12]')}>
              {s}
            </button>
          ))}
        </div>
        <select aria-label="Trier les créatives" value={tri} onChange={(e) => setTri(e.target.value as (typeof TRIS)[number])}
          className="select select-chevron ml-auto w-auto py-1.5 text-xs">
          {TRIS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {liste.length ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
            {visibles.map((p) => <CarteCrea key={p.id} pub={p} ouvrir={() => ouvrir(p)} />)}
          </div>
          {liste.length > 20 && (
            <p className="text-center">
              <button type="button" onClick={() => setComplet(!complet)} className="btn-secondary text-sm">
                {complet ? 'Réduire' : `Voir les ${liste.length} créatives`}
              </button>
            </p>
          )}
        </>
      ) : (
        <Vide>{statut === 'Arrêtées' ? 'Aucune créa arrêtée connue : les arrêts ne sont relevés que sur les marques sous veille.' : 'Aucune créa.'}</Vide>
      )}
    </section>
  )
}

/**
 * Les jours moyens disent si le libellé tient ou s'il est encore à l'essai :
 * sans eux, un classement dit seulement ce que la marque fait le plus.
 */
function JoursMoyens({ jours }: { jours?: number | null }) {
  if (jours === null || jours === undefined) return null
  return <span className="text-gray-400" title="jours de diffusion moyens des pubs concernées"> · {jours} j moy.</span>
}

type Ligne = { libelle: string; n: number; joursMoyens?: number | null }

function Classement({ libelles, total }: { libelles: Ligne[]; total: number }) {
  return (
    <div className="space-y-3">
      {libelles.map((l) => (
        <div key={l.libelle} className="space-y-1.5">
          <div className="flex justify-between gap-3 text-sm">
            <span className="min-w-0 text-[#0d0d12]">{l.libelle}</span>
            <span className="shrink-0 whitespace-nowrap text-gray-500 tabular-nums">{pourcent(l.n / total)} · {l.n}<JoursMoyens jours={l.joursMoyens} /></span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-[#3434ef]" style={{ width: `${(100 * l.n) / total}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Un tableau de tags : part, effectif, durée moyenne. C'est la seule forme
 * qui met les trois en regard — une liste de barres montre la part et cache
 * la durée, alors que c'est elle qui dit si le tag a été retenu.
 *
 * Remplace le second composant à barres : les mêmes angles sortaient en
 * barres fines d'un côté et en cartes bordées de l'autre.
 */
function TableauTags({ libelles, total }: { libelles: Ligne[]; total: number }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[#F3F4F6] text-[10px] font-medium uppercase tracking-wide text-gray-400">
          <th className="pb-2 text-left">Tag</th>
          <th className="pb-2 text-right">Part</th>
          <th className="pb-2 pl-3 text-right">Créas</th>
          <th className="pb-2 pl-3 text-right">Jours moy.</th>
        </tr>
      </thead>
      <tbody>
        {libelles.map((l) => (
          <tr key={l.libelle} className="border-b border-[#F3F4F6] last:border-0">
            <td className="py-2.5 pr-3 text-[#0d0d12]">{l.libelle}</td>
            <td className="py-2.5 text-right tabular-nums text-gray-600">
              <span className="flex items-center justify-end gap-2">
                <span className="h-1.5 w-12 overflow-hidden rounded-full bg-gray-100">
                  <span className="block h-full bg-[#3434ef]" style={{ width: `${(100 * l.n) / total}%` }} />
                </span>
                {pourcent(l.n / total)}
              </span>
            </td>
            <td className="py-2.5 pl-3 text-right tabular-nums text-gray-600">{l.n}</td>
            <td className="py-2.5 pl-3 text-right tabular-nums text-gray-400">{l.joursMoyens !== null && l.joursMoyens !== undefined ? `${l.joursMoyens} j` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function RapportMarque({ marque, dossiers, retiree, pourClient }: {
  marque: { id: string; nom: string; suivie?: boolean; categorie?: string | null; pageId?: string }; dossiers: Dossier[]
  /** Appelé une fois la marque masquée : la page la retire de ses listes. */
  retiree: () => void
  /** Le client sélectionné : la marque peut être cachée pour lui seul. */
  pourClient?: { nom: string; cachee: boolean; basculer: () => void }
}) {
  const [pubs, setPubs] = useState<PubVeille[] | null>(null)
  const [toutes, setToutes] = useState<PubVeille[] | null>(null)
  const [periode, setPeriode] = useState<number>(90)
  const [mesures, setMesures] = useState<{ pubId: string; jour: string; reachUe: number }[]>([])
  const [ouverte, setOuverte] = useState<PubVeille | null>(null)
  const [analyse, setAnalyse] = useState<AnalyseMarque | null>(null)
  const [analyseEnCours, setAnalyseEnCours] = useState(false)
  const [aDecortiquer, setADecortiquer] = useState<number | null>(null)
  const [decorticageEnCours, setDecorticageEnCours] = useState(false)
  const [suivie, setSuivie] = useState(!!marque.suivie)
  const [categorie, setCategorie] = useState(marque.categorie ?? '')

  async function changerCategorie(valeur: string) {
    const r = await fetch('/api/veille/marques', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: marque.id, categorie: valeur }),
    })
    if (!r.ok) return void toast.error('Changement impossible')
    setCategorie(valeur)
    toast.success(`Catégorie : ${valeur}`)
  }

  async function masquerMarque() {
    if (!confirm(`Masquer ${marque.nom} ? La marque et ses pubs disparaissent partout, sa veille s’arrête et elles ne seront plus réimportées.`)) return
    const r = await fetch('/api/veille/marques', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: marque.id, masquee: true }),
    })
    if (!r.ok) return void toast.error('Masquage impossible')
    toast.success(`${marque.nom} masquée`)
    retiree()
  }

  async function basculerSuivi() {
    const r = await fetch('/api/veille/suivi', {
      method: suivie ? 'DELETE' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ marqueId: marque.id }),
    })
    if (!r.ok) return void toast.error('Changement impossible')
    setSuivie(!suivie)
    toast.success(suivie ? 'Marque retirée de la veille' : 'Marque sous veille : vérifiée chaque jour')
    if (!suivie) suggererSimilaires(marque)
  }

  useEffect(() => {
    setAnalyse(null)
    setADecortiquer(null)
    fetch(`/api/veille/marques/analyse?marqueId=${marque.id}`).then((r) => (r.ok ? r.json() : null)).then(setAnalyse)
    fetch(`/api/veille/decortiquer/lot?marque=${marque.id}`).then((r) => (r.ok ? r.json() : null)).then((d) => setADecortiquer(d?.restantes ?? 0))
  }, [marque.id])

  /**
   * Rattrape les transcriptions manquantes, lot par lot. Une requête ne peut
   * en faire que quelques-unes — un appel multimodal par créa —, donc on
   * boucle côté navigateur tant qu'il en reste et que ça avance.
   */
  async function decortiquerTout() {
    setDecorticageEnCours(true)
    try {
      for (;;) {
        const r = await fetch('/api/veille/decortiquer/lot', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ marqueId: marque.id }),
        })
        const j = await r.json().catch(() => null)
        if (!r.ok || !j) { toast.error(j?.erreur || 'Décorticage interrompu'); break }
        setADecortiquer(j.restantes)
        // Un lot qui n'avance plus ne sert qu'à brûler des appels.
        if (!j.restantes || (!j.faites && !j.echecs)) break
      }
      toast.success('Transcriptions à jour')
    } finally {
      setDecorticageEnCours(false)
    }
  }

  async function analyser(refaire = false) {
    setAnalyseEnCours(true)
    const r = await fetch('/api/veille/marques/analyse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ marqueId: marque.id, refaire }),
    })
    const j = await r.json().catch(() => ({}))
    setAnalyseEnCours(false)
    if (!r.ok) return void toast.error(j.erreur || 'Analyse impossible')
    setAnalyse(j)
  }

  useEffect(() => {
    setPubs(null)
    setToutes(null)
    fetch(`/api/veille/pubs?marque=${marque.id}&statut=active&tri=couverture&n=600`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPubs(d?.pubs ?? []))
    fetch(`/api/veille/mesures?marque=${marque.id}`).then((r) => (r.ok ? r.json() : null)).then((d) => setMesures(d?.mesures ?? []))
    // Les pubs arrêtées aussi : le bandeau et les courbes en ont besoin.
    fetch(`/api/veille/pubs?marque=${marque.id}&n=600`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setToutes(d?.pubs ?? []))
  }, [marque.id])

  const r = useMemo(() => (pubs ? rapportMarque(pubs, EUROS_POUR_MILLE_PERSONNES) : null), [pubs])
  const estimees = useMemo(
    () => (toutes ? courbesEstimees(toutes, EUROS_POUR_MILLE_PERSONNES, Date.now(), periode) : null),
    [toutes, periode],
  )
  const relevees = useMemo(() => courbesRelevees(mesures, EUROS_POUR_MILLE_PERSONNES), [mesures])
  /**
   * Les créas en ligne sur la période : lancées avant la fin de la fenêtre et
   * pas encore arrêtées à son début. C'est la définition de la Ad Library —
   * « part des annonces en ligne sur la période » — et non « lancées pendant ».
   */
  const rp = useMemo(() => {
    const source = toutes ?? pubs
    if (!source) return null
    const depuis = Date.now() - periode * 86_400_000
    const enLigne = source.filter((p) => p.debut && (p.active || !p.fin || Date.parse(p.fin) >= depuis))
    const retenues = (enLigne.length ? enLigne : source).map((p) => ({ ...p, format: formatReel(p) }))
    return rapportMarque(retenues, EUROS_POUR_MILLE_PERSONNES)
  }, [toutes, pubs, periode])
  const rythme = useMemo(() => (estimees ? rythmeParSemaine(estimees) : null), [estimees])
  if (!pubs || !r || !rp) return <div className="card text-center py-16 text-gray-400 text-sm">Calcul du rapport…</div>
  if (!r.total) return <div className="card text-center py-16 text-gray-400 text-sm">Aucune pub active connue pour {marque.nom}.</div>

  const parId = new Map(pubs.map((p) => [p.id, p]))
  // Les créas qui accélèrent peuvent être arrêtées : on les cherche dans tout.
  const pubDe = new Map((toutes ?? pubs).map((p) => [p.id, p]))
  const pub = (p: { id: string }) => parId.get(p.id)!
  const maxMois = Math.max(...r.parMois.map((m) => m.n))
  const sansCouverture = r.avecCouverture === 0
  // L'analyse de la marque, quand elle existe, remplace les comptes pub par pub.
  // Les six axes de l'analyse IA. Les quatre derniers manquent aux analyses
  // d'avant novembre 2026 : un axe vide ne s'affiche pas.
  const parClasse = (cle: AxeIA): Ligne[] => {
    const groupes = new Map<string, { n: number; jours: number[] }>()
    for (const c of analyse!.classement) {
      const tag = c[cle]
      if (!tag) continue
      const g = groupes.get(tag) ?? { n: 0, jours: [] }
      g.n++
      const pb = parId.get(c.pubId)
      const j = pb ? joursDeDiffusion(pb) : null
      if (j !== null) g.jours.push(j)
      groupes.set(tag, g)
    }
    return [...groupes.entries()]
      .map(([libelle, g]) => ({ libelle, n: g.n, joursMoyens: g.jours.length ? Math.round(g.jours.reduce((s, x) => s + x, 0) / g.jours.length) : null }))
      .sort((a, b) => b.n - a.n)
  }
  const axes = analyse ? AXES_IA.map(([cle, titre, sous]) => ({ cle, titre, sous, lignes: parClasse(cle) })).filter((a) => a.lignes.length) : []
  const classees = analyse?.classement.length ?? 0
  // Le tri test / en ligne / arrêté, calculé sur tous les axes à la fois.
  const strategie = analyse && toutes
    ? strategieMarque(
        analyse.classement.map((c) => ({
          pubId: c.pubId,
          tags: AXES_IA.map(([cle, titre]) => ({ axe: titre, tag: c[cle] ?? '' })),
        })),
        toutes.map((pb) => ({ id: pb.id, debut: pb.debut, fin: pb.fin, active: pb.active })),
      )
    : null
  const resume = strategie ? resumeStrategie(strategie, marque.nom) : []
  const plusDe90 = r.anciennete.tranches.find((t) => t.libelle === 'Plus de 90 j')?.n ?? 0
  // La plus ancienne encore en ligne : le signal le plus fort du rapport.
  const premiere = r.plusLongues[0]
  const laPlusLongue = premiere?.debut ? { pub: pub(premiere), jours: joursDeDiffusion(pub(premiere)) } : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#3434ef] to-[#6d6dff] text-[15px] font-bold tracking-wide text-white">
            {initiales(marque.nom)}
          </span>
          <div className="min-w-0">
            <h2 className="text-[25px] font-bold tracking-tight text-[#0d0d12]">{marque.nom}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-500">
              {marque.pageId && (
                <>
                  <a href={`https://www.facebook.com/ads/library/?view_all_page_id=${marque.pageId}`} target="_blank" rel="noreferrer" className="text-[#3434ef] hover:underline">Meta Ad Library ↗</a>
                  <span className="text-gray-300">·</span>
                </>
              )}
              {r.domaines[0] && <>{r.domaines[0].libelle}<span className="text-gray-300">·</span></>}
              {r.periode && <>diffusion de {date(r.periode.de)} à {date(r.periode.a)}</>}
              {suivie && <><span className="text-gray-300">·</span>relevée chaque matin</>}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <select aria-label="Catégorie de la marque" value={categorie} onChange={(e) => changerCategorie(e.target.value)} className="select select-chevron w-auto text-xs py-1.5">
            <option value="" disabled>Catégorie…</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="button" onClick={basculerSuivi} title={suivie ? 'Ne plus surveiller cette marque' : undefined}
            className={suivie ? 'btn-secondary' : 'btn-primary'}>
            {suivie ? 'Veille active ✓' : 'Activer la veille'}
          </button>
          {pourClient && (
            <button type="button" onClick={pourClient.basculer} className="text-sm text-gray-500 hover:text-[#0d0d12]">
              {pourClient.cachee ? `Réafficher pour ${pourClient.nom}` : `Masquer pour ${pourClient.nom}`}
            </button>
          )}
          <button type="button" onClick={masquerMarque} className="text-sm text-gray-400 hover:text-red-600">Masquer pour tous</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Chiffre libelle="Créatives actives" valeur={String(r.total)}
          apres={toutes ? `/ ${toutes.length} au total` : undefined}
          note="actives et arrêtées confondues" />
        <Chiffre libelle={`Dépense est. ${periode === 365 ? '12 mois' : `${periode} j`}`} badge="estimation"
          valeur={r.budget ? `${compact(r.budget.bas)}–${compact(r.budget.haut)} €` : '—'}
          note={r.budget ? 'Diffusion UE uniquement' : sansCouverture ? 'couverture inconnue : relancez un scan' : 'pas assez de créas à couverture connue'} />
        <Chiffre libelle="Jours en ligne, médiane" valeur={r.anciennete.mediane !== null ? String(r.anciennete.mediane) : '—'}
          note={`${rp.total} créatives en ligne sur la période`} />
        <Chiffre libelle="La plus longue" valeur={laPlusLongue ? `${laPlusLongue.jours} jours` : '—'}
          note={laPlusLongue && (
            <button type="button" onClick={() => setOuverte(laPlusLongue.pub)} className="text-[#3434ef] hover:underline">voir la créa</button>
          )} />
        <Chiffre libelle="Nouvelles créas / semaine"
          valeur={rythme?.recent ? (rythme.recent.lancees / 4).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—'}
          variation={rythme?.recent?.variation}
          note={rythme?.recent
            ? rythme.recent.variation === null ? '4 dernières semaines ; aucune les 4 précédentes' : '4 dernières semaines vs les 4 précédentes'
            : 'moins de huit semaines relevées'} />
      </div>

      {/* Les créas avant l'analyse : c'est ce qu'on vient voir. */}
      {toutes && <GrilleCreas toutes={toutes} ouvrir={setOuverte} />}

      {/* ── Analyse de la marque ─────────────────────────────────────
          Une seule section, en cartes de grille : les dix-sept blocs pleine
          largeur ne disaient pas par quoi commencer. Le sélecteur de période
          gouverne tout ce qui suit. ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <h3 className="text-[17px] font-semibold text-[#0d0d12]">Analyse de la marque</h3>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {PERIODES.map(([jours, libelle]) => (
            <button key={jours} type="button" onClick={() => setPeriode(jours)}
              className={clsx('rounded-md px-2.5 py-1 text-xs', periode === jours ? 'bg-white font-medium text-[#0d0d12] shadow-sm' : 'text-gray-500 hover:text-[#0d0d12]')}>
              {libelle}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {estimees && (
          <Bloc dense titre="Dépense estimée par jour" sousTitre="Couverture UE × coût pour mille, étalée sur les jours de diffusion.">
            <Courbe id="courbe-depense" titre="" donnees={estimees} cle="depense" format={(v) => `${compact(v)} €`} />
          </Bloc>
        )}
        {estimees && <RythmeDeTest serie={estimees} />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Bloc dense titre="Ancienneté" sousTitre={`Par tranche de jours en ligne. Médiane ${r.anciennete.mediane ?? '—'} j.`}>
          <Classement libelles={r.anciennete.tranches} total={r.total} />
        </Bloc>
        <Bloc dense titre="Formats" sousTitre="Part des créatives en ligne sur la période.">
          <Classement libelles={rp.formats.map((f) => ({ ...f, libelle: FORMATS[f.libelle] ?? f.libelle }))} total={rp.total} />
        </Bloc>
        <Bloc dense titre="Plateformes" sousTitre="Combinaisons de placements.">
          <Classement libelles={rp.plateformes.slice(0, 4)} total={rp.total} />
        </Bloc>
        <Bloc dense titre="Bouton d’action" sousTitre="Part des créatives en ligne sur la période.">
          {rp.boutons.length ? <Classement libelles={rp.boutons.slice(0, 4)} total={rp.total} /> : <Vide>Aucun bouton relevé.</Vide>}
        </Bloc>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Bloc dense titre="Destinations" sousTitre="Où la marque envoie le trafic.">
          {rp.produits.length ? <Classement libelles={rp.produits.slice(0, 5)} total={rp.total} /> : <Vide>Aucun lien de destination lisible.</Vide>}
        </Bloc>
        <Bloc dense titre="Offres" sousTitre={`${pourcent(rp.offres.part)} des créatives portent une réduction, une remise ou un code.`}>
          {rp.offres.liste.length ? <Classement libelles={rp.offres.liste.slice(0, 5)} total={rp.total} /> : <Vide>Aucune offre chiffrée dans les textes.</Vide>}
        </Bloc>
        <Bloc dense titre="Audience touchée"
          sousTitre={rp.audience ? `${compact(rp.audience.total)} personnes dans l’UE · ${rp.audience.pays.slice(0, 3).map((p) => p.libelle).join(', ')}` : undefined}>
          {rp.audience ? (
            <div className="space-y-2">
              {rp.audience.sexe.map((s) => <Barre key={s.libelle} libelle={s.libelle} valeur={s.n} total={rp.audience!.total} />)}
              {rp.audience.ages.map((a) => <Barre key={a.libelle} libelle={a.libelle === 'Unknown' ? 'Inconnu' : a.libelle} valeur={a.n} total={rp.audience!.total} />)}
            </div>
          ) : <Vide>Audience inconnue : relancez un scan avec l’extension à jour.</Vide>}
        </Bloc>
      </div>

      {/* ── Relevés quotidiens : la seule donnée mesurée, pas estimée. ── */}
      {relevees.jours.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Bloc dense titre="Couverture relevée par jour" sousTitre="Écart de couverture d’un matin à l’autre : du mesuré, pas de l’estimé.">
            <Courbe id="courbe-relevee" titre="" donnees={relevees.jours} cle="depense" format={(v) => `${compact(v)} €`} />
          </Bloc>
          <Bloc dense titre="Créas qui accélèrent" sousTitre="Couverture gagnée par jour sur les 7 derniers relevés.">
            {relevees.accelerent.length ? (
              <div className="grid grid-cols-3 gap-2.5">
                {relevees.accelerent.slice(0, 3).map((a) => pubDe.get(a.pubId)).filter((p): p is PubVeille => !!p).map((p) => (
                  <Vignette key={p.id} pub={p} ouvrir={() => setOuverte(p)}
                    etiquette={`+${compact(relevees.accelerent.find((a) => a.pubId === p.id)!.parJour)} pers./j`} />
                ))}
              </div>
            ) : <Vide>Aucune créa n’a gagné de couverture sur les derniers relevés.</Vide>}
          </Bloc>
        </div>
      )}

      {/* ── Analyse IA ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <h3 className="text-[17px] font-semibold text-[#0d0d12]">
          Analyse IA <span className="badge-gray ml-1">Gemini</span>
        </h3>
        {analyse && (
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>D’après {analyse.nbPubs} créa{analyse.nbPubs > 1 ? 's' : ''}, le {new Date(analyse.date).toLocaleDateString('fr-FR')}</span>
            <button type="button" onClick={() => analyser(true)} disabled={analyseEnCours} className="hover:text-[#0d0d12] disabled:opacity-50">
              {analyseEnCours ? 'Analyse…' : 'Régénérer'}
            </button>
          </div>
        )}
      </div>

      {/* Sans transcription, l'analyse ne lit que le texte publicitaire — et
          la plupart des créas sont des vidéos muettes de ce côté-là. */}
      {suivie && aDecortiquer !== null && aDecortiquer > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm text-amber-900">
            <strong>{aDecortiquer} créa{aDecortiquer > 1 ? 's' : ''} sans transcription.</strong>{' '}
            L’analyse ne lira que leur texte publicitaire — or le message d’une vidéo est dans sa bande son.
            Le rattrapage tourne aussi chaque nuit.
          </p>
          <button type="button" onClick={decortiquerTout} disabled={decorticageEnCours}
            className="btn-secondary shrink-0 text-sm disabled:opacity-50">
            {decorticageEnCours ? `Décorticage… ${aDecortiquer} restantes` : 'Décortiquer maintenant'}
          </button>
        </section>
      )}
      {!suivie && (
        <p className="text-xs text-gray-400">
          Les transcriptions ne sont relevées que sur les marques en veille : activez-la pour que l’analyse lise aussi les vidéos.
        </p>
      )}

      {!analyse ? (
        <section className="card p-6 text-center space-y-3">
          <p className="mx-auto max-w-lg text-sm text-gray-600">
            L’IA déduit les <strong>angles</strong>, les <strong>concepts</strong> et les <strong>personas ciblés</strong> à partir des créas actives de {marque.nom}.
          </p>
          <button type="button" onClick={() => analyser()} disabled={analyseEnCours} className="btn-primary disabled:opacity-50">
            {analyseEnCours ? 'Analyse en cours… une trentaine de secondes' : 'Générer l’analyse IA'}
          </button>
        </section>
      ) : (
        <>
          {resume.length > 0 && strategie && (
            <Bloc dense titre="Résumé de la stratégie" sousTitre="Écrit à partir des tags ci-dessous : ce qu’elle garde, ce qu’elle essaie, ce qu’elle arrête.">
              <p className="text-sm leading-relaxed text-gray-700">{resume.join(' ')}</p>
              <div className="grid gap-3 md:grid-cols-3">
                {([
                  ['En test', 'lancées ces 30 jours', strategie.enTest, 'bg-[#f0f0ff] text-[#3434ef]'],
                  ['Toujours en ligne', 'en ligne depuis 60 jours et plus', strategie.installees, 'bg-green-50 text-green-700'],
                  ['Arrêtées', 'arrêtées ces 30 jours', strategie.arretees, 'bg-gray-100 text-gray-600'],
                ] as const).map(([titre, sous, liste, ton]) => (
                  <div key={titre} className="rounded-xl border border-[#E5E7EB] p-4 space-y-2.5">
                    <p className="flex flex-wrap items-baseline gap-2">
                      <span className={clsx('rounded px-2 py-0.5 text-[11px] font-medium', ton)}>{titre}</span>
                      <span className="text-[11px] text-gray-400">{sous}</span>
                    </p>
                    {liste.length ? (
                      <ul className="space-y-1.5 text-[13px]">
                        {liste.map((t) => (
                          <li key={`${t.axe}|${t.tag}`} className="flex justify-between gap-3">
                            <span className="min-w-0 truncate text-[#0d0d12]" title={t.axe}>{t.tag}</span>
                            <span className="shrink-0 tabular-nums text-gray-500">
                              {'joursMoyens' in t ? `${t.joursMoyens} j moy.` : `${t.n} créa${t.n > 1 ? 's' : ''}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : <Vide>Rien sur cette période.</Vide>}
                  </div>
                ))}
              </div>
            </Bloc>
          )}
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {axes.map((a) => (
              <Bloc key={a.cle} dense titre={a.titre} sousTitre={a.sous}>
                <TableauTags libelles={a.lignes} total={classees} />
              </Bloc>
            ))}
          </div>
          <Bloc dense titre="Personas déduits des messages" sousTitre="Interprétation des textes publicitaires par l’IA, pas une donnée de ciblage fournie par Meta.">
            <div className="grid gap-4 md:grid-cols-2">
              {analyse.personas.map((p) => (
                <div key={p.nom} className="rounded-xl border border-[#E5E7EB] p-4 space-y-1.5">
                  <p className="text-sm font-semibold text-[#0d0d12]">{p.nom}</p>
                  <p className="text-sm text-gray-600">{p.description}</p>
                </div>
              ))}
            </div>
          </Bloc>
        </>
      )}

      {ouverte && (
        <FichePub pub={ouverte} jours={joursDeDiffusion(ouverte)} actions={<ChoixSauvegarde pub={ouverte} dossiers={dossiers} />} fermer={() => setOuverte(null)}
          apresMasquage={() => setPubs((l) => l && l.filter((x) => x.id !== ouverte.id))}
          {...voisines(toutes ?? pubs, ouverte, setOuverte)} ouvrir={setOuverte} />
      )}
    </div>
  )
}
