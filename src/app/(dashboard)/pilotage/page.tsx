'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { clsx } from 'clsx'
import {
  METRICS, METRIC_BY_KEY, GROUPES, COLONNES_DEFAUT, formatMetric, senseVariation,
  type MetricDef,
} from '@/lib/scalr/metrics'
import { GalerieCreas } from '@/components/scalr/GalerieCreas'
import { DetailCrea } from '@/components/scalr/DetailCrea'

/**
 * Le tableau de pilotage.
 *
 * Campagnes, ad sets et publicités ne sont pas trois écrans : c'est un écran
 * et un niveau de lecture. Même barre d'outils, même moteur, même verdict —
 * seul le regroupement change.
 *
 * La colonne Décision en est la colonne vertébrale, et les pastilles du haut
 * ne sont pas des étiquettes mais des filtres : on clique « À couper », on
 * obtient sa liste, on agit.
 */

type Decision = { kind: string; label: string; reason: string }
type Ligne = Record<string, unknown> & {
  id: string; name: string; status: string | null
  decision: Decision
  variations: Record<string, number | null>
}

const NIVEAUX = [
  { id: 'campaign', label: 'Campagnes' },
  { id: 'adset', label: 'Ad Sets' },
  { id: 'ad', label: 'Publicités' },
  { id: 'crea', label: 'Créas' },
] as const

const PERIODES = [
  { id: '7d', label: '7 j' }, { id: '14d', label: '14 j' }, { id: '30d', label: '30 j' },
  { id: '90d', label: '3 mois' },
]

const ATTRIBUTIONS = [
  { id: 'default', label: 'Attribution par défaut' },
  { id: '7d_click', label: '7 j après clic' },
  { id: '1d_click', label: '1 j après clic' },
  { id: '1d_view', label: '1 j après vue' },
]

/** Une pastille par verdict. `kind` vient du moteur de décision. */
const PASTILLES: { id: string; label: string; kinds: string[] }[] = [
  { id: 'all', label: 'Toutes', kinds: [] },
  { id: 'scale', label: 'À scaler', kinds: ['scale'] },
  { id: 'iterate', label: 'À itérer', kinds: ['iterate'] },
  { id: 'cut', label: 'À couper', kinds: ['cut'] },
  { id: 'test', label: 'Nouveau test', kinds: ['test'] },
  { id: 'watch', label: 'Fatigue / à surveiller', kinds: ['watch'] },
  { id: 'objective', label: 'Dans l’objectif', kinds: ['objective'] },
]

const COULEUR_DECISION: Record<string, string> = {
  cut: 'bg-red-50 text-red-700 border-red-200',
  scale: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  iterate: 'bg-blue-50 text-blue-700 border-blue-200',
  watch: 'bg-amber-50 text-amber-700 border-amber-200',
  objective: 'bg-teal-50 text-teal-700 border-teal-200',
  test: 'bg-gray-50 text-gray-600 border-gray-200',
}

/** Une hausse n'est pas une bonne nouvelle en soi : le registre dit dans quel
 *  sens lire chaque métrique. */
function Variation({ value, def }: { value: number | null | undefined; def: MetricDef }) {
  const sens = senseVariation(value, def)
  if (sens === null) return null
  const v = value as number
  return (
    <span className={clsx('ml-1 text-[10px] font-medium tabular-nums whitespace-nowrap',
      sens === 'bon' ? 'text-emerald-600' : sens === 'mauvais' ? 'text-red-500' : 'text-gray-400')}>
      {v > 0 ? '▲' : '▼'}{Math.abs(v).toFixed(0)}%
    </span>
  )
}

export default function PilotagePage() {
  const { selectedAccount } = useStore()
  const [niveau, setNiveau] = useState<string>('campaign')
  const [periode, setPeriode] = useState('30d')
  const [attribution, setAttribution] = useState('default')
  const [pastille, setPastille] = useState('all')
  const [colonnes, setColonnes] = useState<string[]>(COLONNES_DEFAUT)
  const [tri, setTri] = useState<{ cle: string; sens: 'asc' | 'desc' }>({ cle: 'spend', sens: 'desc' })
  const [afficherVariations, setAfficherVariations] = useState(true)
  const [choixColonnes, setChoixColonnes] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [detailOuvert, setDetailOuvert] = useState<string | null>(null)

  const [data, setData] = useState<{ lignes: Ligne[]; periode: { since: string; until: string }; precedente: { since: string; until: string }; goals: { targetCpl: number | null; maxCpl: number | null } } | null>(null)
  const [loading, setLoading] = useState(false)

  const charger = useCallback(() => {
    if (!selectedAccount) return
    setLoading(true)
    fetch(`/api/scalr/table?dbAccountId=${selectedAccount.id}&level=${niveau}&periode=${periode}&attribution=${attribution}`)
      .then((r) => r.json())
      .then((d) => setData(d.error ? null : d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [selectedAccount, niveau, periode, attribution])

  useEffect(() => { charger() }, [charger])

  const lignes = useMemo(() => {
    let l = data?.lignes || []
    const p = PASTILLES.find((x) => x.id === pastille)
    if (p && p.kinds.length) l = l.filter((r) => p.kinds.includes(r.decision.kind))
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      l = l.filter((r) => r.name.toLowerCase().includes(q))
    }
    return [...l].sort((a, b) => {
      const va = a[tri.cle] as number | null
      const vb = b[tri.cle] as number | null
      // Les valeurs absentes vont en fin de tri quel que soit le sens : une
      // métrique qui n'existe pas n'est ni la meilleure ni la pire.
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      return tri.sens === 'desc' ? vb - va : va - vb
    })
  }, [data, pastille, recherche, tri])

  const compteurs = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of data?.lignes || []) c[r.decision.kind] = (c[r.decision.kind] || 0) + 1
    return c
  }, [data])

  const cols = colonnes.map((k) => METRIC_BY_KEY.get(k)).filter(Boolean) as MetricDef[]

  function basculerColonne(k: string) {
    setColonnes((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
  }

  return (
    <div className="space-y-4 max-w-[1600px]">
      <div>
        <h1 className="page-title">Pilotage</h1>
        <p className="page-subtitle mt-0.5">
          {selectedAccount?.name || 'Sélectionnez un compte'}
          {data && ` · ${data.periode.since} → ${data.periode.until}`}
          {data && <span className="text-gray-300"> · comparé au {data.precedente.since} → {data.precedente.until}</span>}
        </p>
      </div>

      {/* Barre d'outils — son état vaut pour tous les niveaux */}
      <div className="card flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-[#f8f9fc] rounded-lg p-1 border border-[#E5E7EB]">
          {NIVEAUX.map((n) => (
            <button key={n.id} onClick={() => setNiveau(n.id)}
              className={clsx('px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap',
                niveau === n.id ? 'bg-white text-[#3434ef] shadow-sm border border-[#E5E7EB]' : 'text-gray-500 hover:text-[#0d0d12]')}>
              {n.label}
            </button>
          ))}
        </div>

        <select value={periode} onChange={(e) => setPeriode(e.target.value)} className="select w-auto text-sm">
          {PERIODES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>

        <select value={attribution} onChange={(e) => setAttribution(e.target.value)} className="select w-auto text-sm">
          {ATTRIBUTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>

        <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher…" className="input w-auto text-sm py-1.5 min-w-[160px]" />

        <div className="relative">
          <button onClick={() => setChoixColonnes((v) => !v)}
            className="text-sm px-3 py-1.5 rounded-lg border border-[#E5E7EB] text-gray-600 hover:border-gray-300 whitespace-nowrap">
            + Métriques <span className="text-gray-400">({cols.length})</span>
          </button>
          {choixColonnes && (
            <div className="absolute top-full left-0 mt-1 z-40 bg-white border border-[#E5E7EB] rounded-xl shadow-xl p-3 w-72 max-h-[420px] overflow-y-auto">
              {GROUPES.map((g) => (
                <div key={g} className="mb-3 last:mb-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{g}</p>
                  {METRICS.filter((m) => m.group === g).map((m) => (
                    <label key={m.key} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[#f8f9fc] rounded px-1">
                      <input type="checkbox" checked={colonnes.includes(m.key)} onChange={() => basculerColonne(m.key)}
                        className="w-3.5 h-3.5 rounded border-gray-300 accent-[#3434ef]" />
                      <span className="text-xs text-[#0d0d12]">{m.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer ml-auto">
          <input type="checkbox" checked={afficherVariations} onChange={(e) => setAfficherVariations(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 accent-[#3434ef]" />
          Variations
        </label>
      </div>

      {/* Pastilles — des filtres sur le verdict, pas des étiquettes */}
      <div className="flex flex-wrap gap-2">
        {PASTILLES.map((p) => {
          const n = p.kinds.length ? p.kinds.reduce((s, k) => s + (compteurs[k] || 0), 0) : (data?.lignes.length || 0)
          if (p.id !== 'all' && !n) return null
          return (
            <button key={p.id} onClick={() => setPastille(p.id)}
              className={clsx('px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                pastille === p.id
                  ? 'bg-[#3434ef] text-white border-[#3434ef]'
                  : 'bg-white text-gray-600 border-[#E5E7EB] hover:border-gray-300')}>
              {p.label} <span className={pastille === p.id ? 'text-white/70' : 'text-gray-400'}>{n}</span>
            </button>
          )
        })}
      </div>

      {!selectedAccount && <div className="card text-center py-16 text-gray-400 text-sm">Sélectionnez un compte publicitaire.</div>}
      {selectedAccount && loading && <div className="card text-center py-16 text-gray-400 text-sm">Chargement…</div>}

      {selectedAccount && !loading && data && niveau === 'crea' && (
        <GalerieCreas lignes={lignes as never} periode={periode} attribution={attribution} />
      )}

      {selectedAccount && !loading && data && niveau !== 'crea' && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wider bg-[#f8f9fc]">
                  <th className="px-4 py-2.5 text-left font-semibold sticky left-0 bg-[#f8f9fc] min-w-[240px]">
                    {NIVEAUX.find((n) => n.id === niveau)?.label}
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold min-w-[280px]">Décision</th>
                  {cols.map((c) => (
                    <th key={c.key}
                      onClick={() => setTri((t) => ({ cle: c.key, sens: t.cle === c.key && t.sens === 'desc' ? 'asc' : 'desc' }))}
                      className="px-3 py-2.5 text-right font-semibold cursor-pointer hover:text-[#0d0d12] whitespace-nowrap">
                      {c.label}
                      {tri.cle === c.key && <span className="ml-1 text-[#3434ef]">{tri.sens === 'desc' ? '↓' : '↑'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((r) => (
                  <tr key={r.id}
                    onClick={() => niveau === 'ad' && setDetailOuvert(r.id)}
                    className={clsx('border-t border-[#F3F4F6] hover:bg-[#f8f9fc] group',
                      niveau === 'ad' && 'cursor-pointer')}>
                    <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-[#f8f9fc] min-w-[240px]">
                      <div className="flex items-start gap-2">
                        <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5',
                          r.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-gray-300')} />
                        <span className="font-medium text-[#0d0d12] leading-snug break-words">{r.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={clsx('inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border mb-1',
                        COULEUR_DECISION[r.decision.kind] || COULEUR_DECISION.test)}>
                        {r.decision.label}
                      </span>
                      <p className="text-[11px] text-gray-500 leading-snug">{r.decision.reason}</p>
                    </td>
                    {cols.map((c) => (
                      <td key={c.key} className="px-3 py-3 text-right tabular-nums whitespace-nowrap align-top">
                        <span className="text-[#0d0d12]">{formatMetric(r[c.key] as number | null, c)}</span>
                        {afficherVariations && <Variation value={r.variations?.[c.key]} def={c} />}
                      </td>
                    ))}
                  </tr>
                ))}
                {!lignes.length && (
                  <tr><td colSpan={cols.length + 2} className="px-4 py-12 text-center text-gray-400 text-sm">
                    Aucune ligne pour ce filtre.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detailOuvert && (
        <DetailCrea adId={detailOuvert} periode={periode} attribution={attribution}
          decision={(data?.lignes as Ligne[] | undefined)?.find((l) => l.id === detailOuvert)?.decision}
          format={(data?.lignes as (Ligne & { creativeType?: string })[] | undefined)?.find((l) => l.id === detailOuvert)?.creativeType}
          onClose={() => setDetailOuvert(null)} />
      )}

      {data && (
        <p className="text-[11px] text-gray-400 px-1">
          {data.goals.targetCpl
            ? `Verdicts calés sur les objectifs du compte : CPL cible ${data.goals.targetCpl} €${data.goals.maxCpl ? `, plafond ${data.goals.maxCpl} €` : ''}.`
            : 'Aucun objectif renseigné pour ce compte — les verdicts se calent sur la médiane du compte lui-même.'}
        </p>
      )}
    </div>
  )
}
