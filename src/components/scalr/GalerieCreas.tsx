'use client'
import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { METRIC_BY_KEY, formatMetric, senseVariation, type MetricDef } from '@/lib/scalr/metrics'
import { DetailCrea } from './DetailCrea'

/**
 * La galerie de créas.
 *
 * Un tableau ne suffit pas ici : **on juge une créa en la regardant.** Les
 * chiffres disent laquelle marche, l'image dit pourquoi — et c'est ce
 * rapprochement qui permet de décider quoi décliner.
 *
 * L'image est l'aperçu officiel de Meta, pas la vignette du créatif : celle-ci
 * plafonne à 64×64, et l'image de la publication n'existe pas pour des dark
 * posts. Chaque aperçu coûte un appel, on ne le charge donc qu'au moment où la
 * carte entre à l'écran — sinon vingt appels partent d'un coup à l'ouverture.
 */

/**
 * Charge l'aperçu Meta, en décalant les appels.
 *
 * La première version n'appelait qu'à l'entrée dans le champ de vision, via un
 * IntersectionObserver. Élégant sur le papier, fragile en pratique : là où
 * l'observateur ne se déclenche pas, la carte reste en chargement pour
 * toujours, sans erreur ni trace. Un affichage ne doit pas dépendre d'un signal
 * qui peut ne jamais venir.
 *
 * On charge donc systématiquement, en étalant les requêtes de 120 ms par carte
 * pour ne pas envoyer vingt appels d'un coup à l'ouverture.
 */
function Apercu({ adId, rang }: { adId: string; rang: number }) {
  const [src, setSrc] = useState<string | null>(null)
  const [etat, setEtat] = useState<'charge' | 'absent'>('charge')

  useEffect(() => {
    let vivant = true
    const t = setTimeout(() => {
      fetch(`/api/scalr/preview?adId=${adId}&format=MOBILE_FEED_STANDARD`)
        .then((r) => r.json())
        .then((d) => { if (!vivant) return; if (d.src) setSrc(d.src); else setEtat('absent') })
        .catch(() => { if (vivant) setEtat('absent') })
    }, Math.min(rang, 24) * 120)
    return () => { vivant = false; clearTimeout(t) }
  }, [adId, rang])

  if (src) {
    return (
      <iframe src={src} className="w-full h-full border-0 pointer-events-none"
        sandbox="allow-scripts allow-same-origin" loading="lazy" title="Aperçu de la publicité" />
    )
  }
  return (
    <div className="w-full h-full flex items-center justify-center text-gray-300">
      {etat === 'absent' ? (
        <span className="text-[10px] text-gray-400 px-2 text-center">Aperçu indisponible</span>
      ) : (
        <svg className="w-6 h-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )}
    </div>
  )
}

type Ligne = Record<string, unknown> & {
  id: string
  name: string
  status: string | null
  thumbnailUrl: string | null
  creativeType: string | null
  decision: { kind: string; label: string; reason: string }
  variations: Record<string, number | null>
  spend: number
  leads: number
  cpl: number | null
  ctr: number | null
  resultValue: number
  resultLabel: string
  costPerResult: number | null
}

const COULEUR_DECISION: Record<string, string> = {
  cut: 'bg-red-50 text-red-700 border-red-200',
  scale: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  iterate: 'bg-blue-50 text-blue-700 border-blue-200',
  watch: 'bg-amber-50 text-amber-700 border-amber-200',
  objective: 'bg-teal-50 text-teal-700 border-teal-200',
  test: 'bg-gray-50 text-gray-600 border-gray-200',
}

/** Métrique qui ordonne la galerie. Le coût se classe à l'envers : le
 *  meilleur est le plus bas. */
const CLASSEMENTS: { cle: string; label: string; sens: 'asc' | 'desc' }[] = [
  { cle: 'costPerResult', label: 'Coût/rés.', sens: 'asc' },
  { cle: 'resultValue', label: 'Résultats', sens: 'desc' },
  { cle: 'ctr', label: 'CTR', sens: 'desc' },
  { cle: 'spend', label: 'Budget', sens: 'desc' },
]

function Var({ v, def }: { v: number | null | undefined; def: MetricDef }) {
  const s = senseVariation(v, def)
  if (s === null) return null
  const n = v as number
  return (
    <span className={clsx('text-[10px] font-medium tabular-nums ml-1',
      s === 'bon' ? 'text-emerald-600' : s === 'mauvais' ? 'text-red-500' : 'text-gray-400')}>
      {n > 0 ? '↑' : '↓'}{Math.abs(n).toFixed(0)}%
    </span>
  )
}

function Ligne4({ label, cle, r }: { label: string; cle: string; r: Ligne }) {
  const def = METRIC_BY_KEY.get(cle)
  if (!def) return null
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="tabular-nums font-medium text-[#0d0d12] whitespace-nowrap">
        {formatMetric(r[cle] as number | null, def)}
        <Var v={r.variations?.[cle]} def={def} />
      </span>
    </div>
  )
}

export function GalerieCreas({ lignes, periode, attribution }: { lignes: Ligne[]; periode: string; attribution: string }) {
  const [classement, setClassement] = useState(CLASSEMENTS[0])
  const [ouvert, setOuvert] = useState<string | null>(null)

  const creas = useMemo(() => {
    // Une créa sans diffusion n'a rien à dire : on ne la met pas au mur.
    const actives = lignes.filter((l) => l.spend > 0)
    return [...actives].sort((a, b) => {
      const va = a[classement.cle] as number | null
      const vb = b[classement.cle] as number | null
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      return classement.sens === 'asc' ? va - vb : vb - va
    })
  }, [lignes, classement])

  /**
   * La meilleure n'est pas simplement la première du tri : une créa à deux
   * résultats peut afficher un coût imbattable sans rien prouver. On exige un
   * verdict favorable et un minimum de volume.
   */
  const meilleure = useMemo(() => {
    const eligibles = creas.filter((c) => c.decision.kind === 'scale' && c.resultValue >= 3)
    const pool = eligibles.length ? eligibles : creas
    return [...pool].sort((a, b) => {
      const va = a.costPerResult, vb = b.costPerResult
      if (va == null) return 1
      if (vb == null) return -1
      return va - vb
    })[0]
  }, [creas])

  const maxSpend = Math.max(...creas.map((c) => c.spend), 1)

  if (!creas.length) {
    return <div className="card text-center py-16 text-gray-400 text-sm">Aucune créa diffusée sur cette période.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
          Analyse créas <span className="text-gray-300 font-medium normal-case tracking-normal">· {creas.length} diffusées</span>
        </p>
        <div className="flex gap-1 bg-[#f8f9fc] rounded-lg p-1 border border-[#E5E7EB]">
          {CLASSEMENTS.map((c) => (
            <button key={c.cle} onClick={() => setClassement(c)}
              className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-all',
                classement.cle === c.cle ? 'bg-white text-[#3434ef] shadow-sm border border-[#E5E7EB]' : 'text-gray-500 hover:text-[#0d0d12]')}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Meilleure créa */}
      {meilleure && (
        <div className="card flex flex-wrap items-center gap-4 border-[#3434ef]/20 bg-[#f0f0ff]/40">
          <span className="text-2xl" aria-hidden>🏆</span>
          <div className="flex-1 min-w-[200px]">
            <p className="text-[10px] font-bold text-[#3434ef] uppercase tracking-widest">Meilleure créa</p>
            <p className="font-semibold text-[#0d0d12] leading-snug">{meilleure.name}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{meilleure.decision.reason}</p>
          </div>
          <div className="flex gap-5 flex-wrap">
            {[['Coût/rés.', 'costPerResult'], ['Résultats', 'resultValue'], ['CTR', 'ctr'], ['Dépense', 'spend']].map(([l, k]) => {
              const def = METRIC_BY_KEY.get(k)!
              return (
                <div key={k} className="text-right">
                  <p className="text-sm font-bold text-[#0d0d12] tabular-nums">
                    {formatMetric(meilleure[k] as number | null, def)}
                  </p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">{l}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {creas.map((r, i) => (
          <div key={r.id} onClick={() => setOuvert(r.id)}
            className={clsx('card p-0 overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition-shadow',
              r.id === meilleure?.id && 'ring-2 ring-[#3434ef] ring-offset-1')}>
            <div className="relative bg-[#f8f9fc] aspect-[4/5] overflow-hidden">
              <Apercu adId={r.id} rang={i} />
              <span className={clsx('absolute top-2 left-2 w-2 h-2 rounded-full ring-2 ring-white',
                r.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-gray-300')} />
              {r.creativeType && (
                <span className="absolute bottom-2 left-2 text-[10px] font-semibold uppercase tracking-wide bg-black/60 text-white px-1.5 py-0.5 rounded">
                  {r.creativeType}
                </span>
              )}
              {r.id === meilleure?.id && (
                <span className="absolute top-2 right-2 text-[10px] font-bold bg-[#3434ef] text-white px-2 py-0.5 rounded-full">Best</span>
              )}
            </div>

            <div className="p-3 flex flex-col gap-2 flex-1">
              <div>
                <p className="text-xs font-semibold text-[#0d0d12] leading-snug line-clamp-2">{r.name}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 font-mono">ID {r.id}</p>
              </div>

              <div>
                <span className={clsx('inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                  COULEUR_DECISION[r.decision.kind] || COULEUR_DECISION.test)}>
                  {r.decision.label}
                </span>
                <p className="text-[10px] text-gray-500 leading-snug mt-1 line-clamp-2">{r.decision.reason}</p>
              </div>

              <div className="space-y-1 mt-auto pt-1">
                <Ligne4 label="Dépense" cle="spend" r={r} />
                <Ligne4 label={r.resultLabel} cle="resultValue" r={r} />
                <Ligne4 label="Coût/rés." cle="costPerResult" r={r} />
                <Ligne4 label="CTR" cle="ctr" r={r} />
              </div>

              {/* Part du budget que cette créa consomme */}
              <div className="h-1 bg-[#F3F4F6] rounded-full overflow-hidden mt-1">
                <div className={clsx('h-full rounded-full',
                  r.decision.kind === 'cut' ? 'bg-red-400'
                    : r.decision.kind === 'scale' ? 'bg-emerald-500' : 'bg-[#3434ef]/40')}
                  style={{ width: `${Math.max(2, (r.spend / maxSpend) * 100)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {ouvert && (
        <DetailCrea adId={ouvert} periode={periode} attribution={attribution} onClose={() => setOuvert(null)} />
      )}
    </div>
  )
}
