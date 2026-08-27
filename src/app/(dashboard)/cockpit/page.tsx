'use client'
import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { clsx } from 'clsx'

/* ─── Types ─────────────────────────────────────────────────────────────── */

type Metrics = {
  spend: number; impressions: number; clicks: number
  reachSum: number; reachIsApproximate: boolean; frequency: number | null
  leads: number; purchases: number; revenue: number
  resultValue: number; resultLabel: string; resultType: string; costPerResult: number | null
  cpl: number | null; cpa: number | null; roas: number | null
  ctr: number | null; linkCtr: number | null; cpm: number | null; cpc: number | null
  hasVideo: boolean; hookRate: number | null; holdRate: number | null
  funnel: {
    linkClicks: number; landingPageViews: number; addToCart: number
    initiateCheckout: number; purchases: number
    lpvRate: number | null; atcRate: number | null
    checkoutRate: number | null; purchaseRate: number | null
  }
}

type Campagne = Metrics & {
  campaignId: string | null; name: string; objective: string | null
  status: string | null; dailyBudget: number | null
}

type Overview = {
  periode: { since: string; until: string; jours: number }
  precedente: { since: string; until: string }
  fraicheur: string | null
  courant: Metrics
  precedent: Metrics
  evolutions: Record<string, number | null>
  serie: { date: string; spend: number; leads: number; clicks: number; cpl: number | null }[]
  campagnes: Campagne[]
}

/* ─── Format ────────────────────────────────────────────────────────────── */

const PERIODES = [
  { id: '7d', label: '7 j' }, { id: '14d', label: '14 j' }, { id: '30d', label: '30 j' },
  { id: '90d', label: '3 mois' }, { id: '180d', label: '6 mois' },
]

/* Les gardes testent `== null`, qui attrape null ET undefined.
   Un `=== null` laissait passer une clé absente de la réponse — c'est
   exactement ce qui a fait planter l'écran sur l'évolution du CPC, que
   l'API ne renvoyait pas. Une métrique manquante doit s'afficher « — »,
   jamais casser la page. */
const eur = (n?: number | null, d = 0) =>
  n == null ? '—' : `${n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`
const nb = (n?: number | null) => (n == null ? '—' : n.toLocaleString('fr-FR'))
const pc = (n?: number | null, d = 2) => (n == null ? '—' : `${n.toFixed(d)} %`)

/** Une baisse de coût est une bonne nouvelle : le sens dépend de la métrique. */
function Evolution({ value, inverse }: { value?: number | null; inverse?: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-xs text-gray-300">—</span>
  const bon = inverse ? value < 0 : value > 0
  const neutre = Math.abs(value) < 1
  return (
    <span className={clsx('text-xs font-medium tabular-nums',
      neutre ? 'text-gray-400' : bon ? 'text-emerald-600' : 'text-red-500')}>
      {value > 0 ? '+' : ''}{value.toFixed(1)} %
    </span>
  )
}

function Kpi({ label, value, evolution, inverse, sub }: {
  label: string; value: string; evolution?: number | null; inverse?: boolean; sub?: string
}) {
  return (
    <div className="card">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{label}</p>
      <div className="flex items-baseline gap-2 mt-1.5">
        <p className="text-2xl font-bold text-[#0d0d12] tabular-nums">{value}</p>
        {evolution !== undefined && <Evolution value={evolution} inverse={inverse} />}
      </div>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function CockpitPage() {
  const { selectedAccount } = useStore()
  const [periode, setPeriode] = useState('30d')
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    if (!selectedAccount) return
    setLoading(true)
    fetch(`/api/scalr/overview?dbAccountId=${selectedAccount.id}&periode=${periode}`)
      .then((r) => r.json())
      .then((d) => setData(d.error ? null : d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [selectedAccount, periode])

  useEffect(() => { load() }, [load])

  const c = data?.courant
  const e = data?.evolutions || {}

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Cockpit</h1>
          <p className="page-subtitle mt-0.5">
            {selectedAccount?.name || 'Sélectionnez un compte'}
            {data && ` · ${data.periode.since} → ${data.periode.until}`}
          </p>
        </div>
        <div className="flex gap-1 bg-[#f8f9fc] rounded-xl p-1 border border-[#E5E7EB] w-full sm:w-fit overflow-x-auto">
          {PERIODES.map((p) => (
            <button key={p.id} onClick={() => setPeriode(p.id)}
              className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0',
                periode === p.id ? 'bg-white text-[#3434ef] shadow-sm border border-[#E5E7EB]' : 'text-gray-500 hover:text-[#0d0d12]')}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!selectedAccount && (
        <div className="card text-center py-16 text-gray-400 text-sm">Sélectionnez un compte publicitaire.</div>
      )}

      {selectedAccount && loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-gray-100" />)}
        </div>
      )}

      {selectedAccount && !loading && c && (
        <>
          {/* Ce que le compte a produit — le résultat dépend de l'objectif */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Dépense" value={eur(c.spend)} evolution={e.spend} />
            <Kpi label={c.resultLabel} value={nb(c.resultValue)} evolution={e.resultValue} />
            <Kpi label={`Coût / ${c.resultLabel.toLowerCase()}`} value={eur(c.costPerResult, 2)}
                 evolution={e.costPerResult} inverse />
            {c.roas != null && c.revenue > 0
              ? <Kpi label="ROAS" value={`${c.roas.toFixed(2)}×`} evolution={e.roas} sub={eur(c.revenue) + ' de CA'} />
              : <Kpi label="CPM" value={eur(c.cpm, 2)} evolution={e.cpm} inverse />}
          </div>

          {/* Comparaison éclatée : budget, engagement, conversions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { titre: 'Budget', lignes: [
                ['Dépense', eur(c.spend), e.spend, false],
                ['CPM', eur(c.cpm, 2), e.cpm, true],
                ['CPC', eur(c.cpc, 2), e.cpc, true],
              ] },
              { titre: 'Engagement', lignes: [
                ['Impressions', nb(c.impressions), e.impressions, false],
                ['Clics', nb(c.clicks), e.clicks, false],
                ['CTR', pc(c.ctr), e.ctr, false],
              ] },
              { titre: 'Conversions', lignes: [
                [c.resultLabel, nb(c.resultValue), e.resultValue, false],
                [`Coût / ${c.resultLabel.toLowerCase()}`, eur(c.costPerResult, 2), e.costPerResult, true],
                ['Taux de conv.', pc(c.funnel.lpvRate ?? null, 1), null, false],
              ] },
            ].map((bloc) => (
              <div key={bloc.titre} className="card">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{bloc.titre}</p>
                <div className="space-y-2.5">
                  {bloc.lignes.map(([label, val, ev, inv]) => (
                    <div key={String(label)} className="flex items-center justify-between gap-4">
                      <span className="text-sm text-gray-500">{String(label)}</span>
                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        <span className="text-sm font-semibold text-[#0d0d12] tabular-nums">{String(val)}</span>
                        <Evolution value={ev as number | null} inverse={Boolean(inv)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Tendance */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-[#0d0d12]">Tendance journalière</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Dépense et {c.resultLabel.toLowerCase()} par jour</p>
              </div>
            </div>
            {data.serie.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.serie} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cockpitSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3434ef" stopOpacity={0.16} />
                      <stop offset="95%" stopColor="#3434ef" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => String(v).slice(5)} minTickGap={24} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => `${v}€`} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }}
                    formatter={(v: number, k: string) => [k === 'spend' ? eur(v, 2) : nb(v), k === 'spend' ? 'Dépense' : 'Résultats']}
                  />
                  <Area type="monotone" dataKey="spend" stroke="#3434ef" strokeWidth={2} fill="url(#cockpitSpend)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Pas de données sur cette période</div>
            )}
          </div>

          {/* Campagnes */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E7EB]">
              <h2 className="text-sm font-semibold text-[#0d0d12]">Par campagne</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">{data.campagnes.length} campagnes sur la période</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase tracking-wider bg-[#f8f9fc]">
                    <th className="px-5 py-2.5 font-semibold">Campagne</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Dépense</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Résultats</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Coût / rés.</th>
                    <th className="px-3 py-2.5 font-semibold text-right">CTR</th>
                    <th className="px-5 py-2.5 font-semibold text-right">CPM</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campagnes.map((k) => (
                    <tr key={k.campaignId || k.name} className="border-t border-[#F3F4F6] hover:bg-[#f8f9fc]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0',
                            k.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-gray-300')} />
                          <span className="font-medium text-[#0d0d12] truncate max-w-[320px]">{k.name}</span>
                        </div>
                        <span className="text-[11px] text-gray-400 ml-3.5">{k.resultLabel}</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{eur(k.spend)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{nb(k.resultValue)}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-medium">{eur(k.costPerResult, 2)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-500">{pc(k.ctr)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-500">{eur(k.cpm, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ce que les chiffres ne disent pas d'eux-mêmes */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-gray-400 px-1">
            <span>Comparé au {data.precedente.since} → {data.precedente.until}</span>
            {data.fraicheur && <span>Données du {new Date(data.fraicheur).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
            {c.reachIsApproximate && <span>Portée non cumulable sur plusieurs jours — fréquence masquée</span>}
          </div>
        </>
      )}
    </div>
  )
}
