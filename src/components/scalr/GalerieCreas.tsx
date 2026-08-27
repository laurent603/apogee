'use client'
import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { METRIC_BY_KEY, formatMetric, senseVariation, type MetricDef } from '@/lib/scalr/metrics'
import { DetailCrea } from './DetailCrea'
import { CadreApercu, type Apercu } from './ApercuMeta'

/**
 * La galerie de créas.
 *
 * Un tableau ne suffit pas ici : **on juge une créa en la regardant.** Les
 * chiffres disent laquelle marche, l'image dit pourquoi — et c'est ce
 * rapprochement qui permet de décider quoi décliner.
 *
 * L'image est l'aperçu officiel de Meta, pas la vignette du créatif : celle-ci
 * plafonne à 64×64, et l'image de la publication n'existe pas pour des dark
 * posts. Le rendu et sa mise à l'échelle vivent dans `CadreApercu`, partagé
 * avec le détail créa.
 *
 * **Le mur se pagine, et tire ses aperçus par lots.** Un compte de cent créas
 * lançait cent requêtes, donc cent fonctions serverless et cent appels à Meta.
 * Une page en demande un seul, groupé.
 */

/** Cinq rangées de six sur un grand écran. */
const PAR_PAGE = 30

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

/**
 * Un indicateur de la carte.
 *
 * Le résultat principal garde son nom réel — « Prospects formulaire » plutôt
 * que « Résultat » : le registre ne peut pas le connaître, il dépend de
 * l'objectif de la campagne.
 */
function Indicateur({ cle, r }: { cle: string; r: Ligne }) {
  const def = METRIC_BY_KEY.get(cle)
  if (!def) return null
  const label = cle === 'resultValue' ? (r.resultLabel || def.label) : def.label
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-gray-500 truncate" title={label}>{label}</span>
      <span className="tabular-nums font-medium text-[#0d0d12] whitespace-nowrap">
        {formatMetric(r[cle] as number | null, def)}
        <Var v={r.variations?.[cle]} def={def} />
      </span>
    </div>
  )
}

export function GalerieCreas({ lignes, periode, attribution, colonnes }: {
  lignes: Ligne[]; periode: string; attribution: string; colonnes: string[]
}) {
  const [classement, setClassement] = useState(CLASSEMENTS[0])
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [apercus, setApercus] = useState<Record<string, Apercu>>({})

  // Le tri seulement : écarter les créas sans diffusion est décidé plus haut,
  // par la bascule « Diffusées seulement ». Filtrer ici les rendait invisibles
  // après que les pastilles les avaient comptées.
  const creas = useMemo(() => {
    return [...lignes].sort((a, b) => {
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

  const pages = Math.max(1, Math.ceil(creas.length / PAR_PAGE))
  const pageSure = Math.min(page, pages)
  const visibles = useMemo(
    () => creas.slice((pageSure - 1) * PAR_PAGE, pageSure * PAR_PAGE),
    [creas, pageSure])

  // Un filtre ou un tri redistribue les créas : rester en page 4 renverrait
  // sur du vide.
  useEffect(() => { setPage(1) }, [lignes, classement])

  // Les aperçus de la page, en un appel. La clé évite de redemander ce qu'on
  // a déjà quand on revient sur une page.
  const cle = visibles.map((c) => c.id).join(',')
  useEffect(() => {
    const manquants = visibles.map((c) => c.id).filter((id) => !apercus[id])
    if (!manquants.length) return
    let vivant = true
    fetch('/api/scalr/previews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adIds: manquants, format: 'MOBILE_FEED_STANDARD' }),
    })
      .then((r) => r.json())
      .then((d) => { if (vivant && d.apercus) setApercus((prev) => ({ ...prev, ...d.apercus })) })
      .catch(() => {})
    return () => { vivant = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle])

  const maxSpend = Math.max(...creas.map((c) => c.spend), 1)

  if (!creas.length) {
    return (
      <div className="card text-center py-16 text-gray-400 text-sm">
        Aucune créa pour ce filtre.
        <span className="block text-xs mt-1 text-gray-300">
          Décochez « Diffusées seulement » pour inclure celles qui n’ont pas dépensé.
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
          Analyse créas <span className="text-gray-300 font-medium normal-case tracking-normal">
            · {creas.length} créas{pages > 1 && ` · page ${pageSure} sur ${pages}`}
          </span>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
        {visibles.map((r) => (
          <div key={r.id} onClick={() => setOuvert(r.id)}
            className={clsx('card p-0 overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition-shadow',
              r.id === meilleure?.id && 'ring-2 ring-[#3434ef] ring-offset-1')}>
            <div className="relative bg-[#f8f9fc] aspect-[4/5] overflow-hidden">
              <CadreApercu apercu={apercus[r.id] ?? null}
                etat={!apercus[r.id] ? 'charge' : apercus[r.id].src ? 'pret' : 'absent'} />
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
                {colonnes.map((k) => <Indicateur key={k} cle={k} r={r} />)}
                {!colonnes.length && (
                  <p className="text-[10px] text-gray-400 italic">Aucun indicateur sélectionné.</p>
                )}
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

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSure === 1}
            className="text-xs px-3 py-1.5 rounded-lg border border-[#E5E7EB] text-gray-600 hover:border-gray-300 disabled:opacity-40 disabled:hover:border-[#E5E7EB]">
            Précédent
          </button>
          <span className="text-xs text-gray-400 tabular-nums px-2">{pageSure} / {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={pageSure === pages}
            className="text-xs px-3 py-1.5 rounded-lg border border-[#E5E7EB] text-gray-600 hover:border-gray-300 disabled:opacity-40 disabled:hover:border-[#E5E7EB]">
            Suivant
          </button>
        </div>
      )}

      {ouvert && (
        <DetailCrea adId={ouvert} periode={periode} attribution={attribution}
          decision={creas.find((c) => c.id === ouvert)?.decision}
          format={creas.find((c) => c.id === ouvert)?.creativeType}
          onClose={() => setOuvert(null)} />
      )}
    </div>
  )
}
