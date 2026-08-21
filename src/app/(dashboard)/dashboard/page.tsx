'use client'
import { useEffect, useState, useCallback } from 'react'
import { useStore } from '@/lib/store'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { MetaInsight } from '@/types'
import Image from 'next/image'

interface TopSpender {
  id: string
  name: string
  status: string
  thumbnail: string | null
  spend: number
  roas: number | null
  cpa: number | null
  purchases: number
  leads: number
  impressions: number
  ctr: number
}

interface LaunchRecord {
  id: string
  campaignName: string
  adsetCount: number
  adCount: number
  status: string
  objective: string | null
  createdAt: string
}

interface DailyPoint {
  date_start: string
  spend: string
  impressions: string
  clicks: string
  website_purchase_roas?: { value: string }[]
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtCur(n: number) {
  return `${fmt(n, 0)}€`
}

function KPICard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`card flex flex-col gap-1 ${highlight ? 'border-[#3434ef]/30 bg-[#f0f0ff]' : ''}`}>
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-[#3434ef]' : 'text-[#0d0d12]'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

function SpendTooltip({ active, payload }: { active?: boolean; payload?: { value: number; payload: { label: string } }[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg px-3 py-2 shadow-sm text-xs">
      <p className="text-gray-400 mb-1">{payload[0]?.payload?.label}</p>
      <p className="font-semibold text-[#0d0d12]">{fmtCur(payload[0]?.value || 0)}</p>
    </div>
  )
}

export default function DashboardPage() {
  const { selectedAccount } = useStore()
  const [overview, setOverview] = useState<MetaInsight | null>(null)
  const [daily, setDaily] = useState<DailyPoint[]>([])
  const [spenders, setSpenders] = useState<TopSpender[]>([])
  const [loading, setLoading] = useState(false)
  const [datePreset, setDatePreset] = useState('last_7d')
  const [recentLaunches, setRecentLaunches] = useState<LaunchRecord[]>([])

  useEffect(() => {
    if (!selectedAccount) return
    const metaId = selectedAccount.metaAccountId || selectedAccount.id
    fetch(`/api/launch-history?metaAccountId=${metaId}`)
      .then(r => r.json())
      .then(data => setRecentLaunches(Array.isArray(data) ? data.slice(0, 5) : []))
      .catch(() => {})
  }, [selectedAccount])

  const fetchAll = useCallback(async () => {
    if (!selectedAccount) return
    setLoading(true)
    const metaId = selectedAccount.metaAccountId || selectedAccount.id
    try {
      const [ovRes, dailyRes, spendersRes] = await Promise.all([
        fetch(`/api/meta/insights?accountId=${metaId}&dbAccountId=${selectedAccount.id}&type=overview&datePreset=${datePreset}`),
        fetch(`/api/meta/insights?accountId=${metaId}&type=daily&days=${datePreset === 'last_7d' ? 7 : datePreset === 'last_14d' ? 14 : 30}`),
        fetch(`/api/meta/top-spenders?accountId=${metaId}&limit=10&datePreset=${datePreset}`),
      ])
      const [ov, d, sp] = await Promise.all([ovRes.json(), dailyRes.json(), spendersRes.json()])
      setOverview(ov)
      setDaily(Array.isArray(d) ? d : [])
      setSpenders(sp.spenders || [])
    } catch {}
    setLoading(false)
  }, [selectedAccount, datePreset])

  useEffect(() => { fetchAll() }, [fetchAll])

  const spend = parseFloat(overview?.spend || '0')
  const roasArr = overview?.website_purchase_roas as { value: string }[] | undefined
  const roas = parseFloat(roasArr?.[0]?.value || '0')
  const purchases = parseFloat(
    (overview?.actions as { action_type: string; value: string }[] | undefined)
      ?.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || '0'
  )
  const leads = parseFloat(
    (overview?.actions as { action_type: string; value: string }[] | undefined)
      ?.find(a => a.action_type === 'lead')?.value || '0'
  )
  const conversions = purchases || leads

  const chartData = daily.map(d => ({
    label: new Date(d.date_start).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
    spend: parseFloat(d.spend || '0'),
  }))

  const totalChartSpend = chartData.reduce((s, d) => s + d.spend, 0)

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle mt-0.5">{selectedAccount?.name || 'Sélectionnez un compte'}</p>
        </div>
        <select value={datePreset} onChange={(e) => setDatePreset(e.target.value)} className="select w-auto">
          <option value="last_7d">7 derniers jours</option>
          <option value="last_14d">14 derniers jours</option>
          <option value="last_30d">30 derniers jours</option>
          <option value="this_month">Ce mois</option>
          <option value="last_month">Mois dernier</option>
        </select>
      </div>

      {!selectedAccount && (
        <div className="card text-center py-16">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-[#3434ef]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          </div>
          <p className="text-[#0d0d12] font-medium">Sélectionnez un compte publicitaire</p>
          <p className="text-xs text-gray-400 mt-1">Utilisez le sélecteur en haut de page</p>
        </div>
      )}

      {selectedAccount && loading && (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-gray-100" />)}
        </div>
      )}

      {selectedAccount && !loading && overview && (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard label="Dépense totale" value={fmtCur(spend)} highlight />
            <KPICard
              label="ROAS"
              value={roas ? fmt(roas, 2) + 'x' : 'N/A'}
              sub={roas >= 2 ? '✓ Rentable' : roas > 0 ? '⚠ Sous seuil' : undefined}
            />
            <KPICard label="Conversions" value={fmt(conversions)} sub={purchases > 0 ? 'Achats' : leads > 0 ? 'Leads' : undefined} />
            <KPICard
              label="Impressions"
              value={parseInt(overview.impressions || '0').toLocaleString('fr-FR')}
              sub={overview.cpm ? `CPM ${parseFloat(overview.cpm).toFixed(2)}€` : undefined}
            />
            <KPICard
              label="Clics"
              value={parseInt(overview.clicks || '0').toLocaleString('fr-FR')}
              sub={overview.cpc ? `CPC ${parseFloat(overview.cpc).toFixed(2)}€` : undefined}
            />
            <KPICard
              label="CTR"
              value={overview.ctr ? `${parseFloat(overview.ctr).toFixed(2)}%` : 'N/A'}
            />
            <KPICard
              label="Fréquence"
              value={overview.frequency ? parseFloat(overview.frequency).toFixed(2) : 'N/A'}
              sub={overview.frequency && parseFloat(overview.frequency) > 3 ? '⚠ Élevée' : undefined}
            />
            <KPICard
              label="CPM"
              value={overview.cpm ? `${parseFloat(overview.cpm).toFixed(2)}€` : 'N/A'}
            />
          </div>

          {/* Quadrant 2x2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Spend Chart */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-[#0d0d12]">Dépenses journalières</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Total : {fmtCur(totalChartSpend)}</p>
                </div>
              </div>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3434ef" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#3434ef" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}€`} />
                    <Tooltip content={<SpendTooltip />} />
                    <Area type="monotone" dataKey="spend" stroke="#3434ef" strokeWidth={2} fill="url(#spendGradient)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-44 flex items-center justify-center text-gray-400 text-sm">Pas de données</div>
              )}
            </div>

            {/* Top Spenders */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[#0d0d12]">Top Spenders</h2>
                <span className="text-xs text-gray-400">Top 10 créatifs</span>
              </div>
              {spenders.length > 0 ? (
                <div className="space-y-2">
                  {spenders.map((ad, i) => (
                    <div key={ad.id} className="flex items-center gap-3 py-1.5 border-b border-[#F3F4F6] last:border-0">
                      <span className="text-xs text-gray-400 w-4 font-medium tabular-nums">{i + 1}</span>
                      {ad.thumbnail ? (
                        <Image src={ad.thumbnail} alt="" width={32} height={32} className="w-8 h-8 rounded object-cover bg-gray-100 flex-shrink-0" unoptimized />
                      ) : (
                        <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0 flex items-center justify-center">
                          <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#0d0d12] truncate">{ad.name}</p>
                        <p className="text-xs text-gray-400">
                          {ad.purchases > 0 ? `${ad.purchases} ventes` : ad.leads > 0 ? `${ad.leads} leads` : `${ad.impressions.toLocaleString('fr-FR')} imp.`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-semibold text-[#0d0d12] tabular-nums">{fmtCur(ad.spend)}</p>
                        {ad.roas !== null && ad.roas > 0 && (
                          <p className={`text-xs tabular-nums ${ad.roas >= 2 ? 'text-green-600' : 'text-amber-600'}`}>
                            {ad.roas.toFixed(2)}x
                          </p>
                        )}
                        {ad.cpa !== null && ad.cpa > 0 && ad.roas === null && (
                          <p className="text-xs text-gray-400 tabular-nums">{fmtCur(ad.cpa)}/conv</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-44 flex items-center justify-center text-gray-400 text-sm">Aucune dépense sur cette période</div>
              )}
            </div>

            {/* Quick access — analyse modules */}
            <div className="card">
              <h2 className="text-sm font-semibold text-[#0d0d12] mb-3">Modules d&apos;analyse</h2>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { href: '/funnel-analytics', label: 'Funnel Analytics', icon: '📊', desc: 'TOFU · MOFU · BOFU' },
                  { href: '/autopilot', label: 'Autopilot IA', icon: '🤖', desc: 'Décisions automatisées' },
                  { href: '/comment-analysis', label: 'Commentaires', icon: '💬', desc: 'Sentiment & insights' },
                  { href: '/creative-strategist', label: 'Creative Strategist', icon: '✍️', desc: 'Génération de copies' },
                ].map(a => (
                  <a key={a.href} href={a.href} className="flex items-center gap-2.5 p-3 bg-[#f8f9fc] hover:bg-blue-50 hover:border-blue-200 border border-[#E5E7EB] rounded-xl transition-all group">
                    <span className="text-xl">{a.icon}</span>
                    <div>
                      <p className="text-xs font-medium text-[#0d0d12]">{a.label}</p>
                      <p className="text-xs text-gray-400">{a.desc}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* Recent launches */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[#0d0d12]">Derniers lancements</h2>
                <a href="/history" className="text-xs text-[#3434ef] hover:underline">Voir tout</a>
              </div>
              {recentLaunches.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-36 text-center">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-2">
                    <svg className="w-5 h-5 text-[#3434ef]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  </div>
                  <p className="text-sm text-gray-500 font-medium">Pas encore de lancement</p>
                  <a href="/upload" className="mt-2 btn-primary text-xs px-3 py-1.5 inline-block">Lancer une campagne</a>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentLaunches.map((l) => (
                    <div key={l.id} className="flex items-center gap-3 py-1.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${l.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#0d0d12] truncate">{l.campaignName}</p>
                        <p className="text-xs text-gray-400">{l.adsetCount} adsets · {l.adCount} ads</p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {new Date(l.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </>
      )}
    </div>
  )
}
