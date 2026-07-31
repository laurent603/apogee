'use client'
import { useEffect, useState, useCallback } from 'react'
import { useStore } from '@/lib/store'
import type { MetaInsight } from '@/types'

function KPICard({ label, value, sub, trend }: {
  label: string; value: string; sub?: string; trend?: 'good' | 'bad' | 'neutral'
}) {
  const valueColor = trend === 'good' ? 'text-green-600' : trend === 'bad' ? 'text-red-500' : 'text-[#0d0d12]'
  return (
    <div className="card">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1.5">{label}</p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const { selectedAccount } = useStore()
  const [overview, setOverview] = useState<MetaInsight | null>(null)
  const [loading, setLoading] = useState(false)
  const [datePreset, setDatePreset] = useState('last_7d')

  const fetchOverview = useCallback(async () => {
    if (!selectedAccount) return
    setLoading(true)
    try {
      const metaId = selectedAccount.metaAccountId || selectedAccount.id
      const res = await fetch(`/api/meta/insights?accountId=${metaId}&type=overview&datePreset=${datePreset}`)
      const data = await res.json()
      setOverview(data)
    } catch {}
    setLoading(false)
  }, [selectedAccount, datePreset])

  useEffect(() => { fetchOverview() }, [fetchOverview])

  const spend = parseFloat(overview?.spend || '0')
  const roas = overview?.website_purchase_roas?.[0]?.value
  const cpa = overview?.cost_per_action_type?.find((a: { action_type: string; value: string }) =>
    a.action_type === 'offsite_conversion.fb_pixel_purchase' || a.action_type === 'lead'
  )?.value
  const conversions = overview?.actions?.find((a: { action_type: string; value: string }) =>
    a.action_type === 'offsite_conversion.fb_pixel_purchase' || a.action_type === 'lead'
  )?.value

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle mt-0.5">{selectedAccount?.name || 'Sélectionnez un compte'}</p>
        </div>
        <select value={datePreset} onChange={(e) => setDatePreset(e.target.value)} className="select w-auto">
          <option value="last_3d">3 derniers jours</option>
          <option value="last_7d">7 derniers jours</option>
          <option value="last_14d">14 derniers jours</option>
          <option value="last_30d">30 derniers jours</option>
          <option value="this_month">Ce mois</option>
          <option value="last_month">Mois dernier</option>
        </select>
      </div>

      {!selectedAccount && (
        <div className="card text-center py-12">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-[#3434ef]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
          </div>
          <p className="text-[#0d0d12] font-medium">Sélectionnez un compte publicitaire</p>
          <p className="text-xs text-gray-400 mt-1">Utilisez le sélecteur en haut de page</p>
        </div>
      )}

      {selectedAccount && loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-gray-100" />)}
        </div>
      )}

      {selectedAccount && !loading && overview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard label="Dépense" value={`${spend.toFixed(0)}€`} />
            <KPICard
              label="ROAS"
              value={roas ? parseFloat(roas).toFixed(2) : 'N/A'}
              trend={roas && parseFloat(roas) >= 2 ? 'good' : roas ? 'neutral' : undefined}
            />
            <KPICard label="CPA" value={cpa ? `${parseFloat(cpa).toFixed(2)}€` : 'N/A'} />
            <KPICard label="Conversions" value={conversions || '0'} trend="good" />
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
              trend={overview.ctr && parseFloat(overview.ctr) >= 1 ? 'good' : 'neutral'}
            />
            <KPICard
              label="Fréquence"
              value={overview.frequency ? parseFloat(overview.frequency).toFixed(2) : 'N/A'}
              trend={overview.frequency && parseFloat(overview.frequency) > 3 ? 'bad' : 'good'}
            />
          </div>

          <div className="card">
            <h2 className="text-sm font-semibold text-[#0d0d12] mb-4">Modules d&apos;analyse</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { href: '/audit', label: 'Audit complet', icon: '🔍', desc: 'Score & recommandations' },
                { href: '/performance', label: 'Performance', icon: '📈', desc: 'Funnel & rentabilité' },
                { href: '/media-buying', label: 'Media Buying', icon: '💰', desc: 'Scale & Kill' },
                { href: '/creative-strategy', label: 'Créatifs', icon: '🎨', desc: 'Fatigue & angles' },
              ].map((action) => (
                <a
                  key={action.href}
                  href={action.href}
                  className="flex flex-col items-center gap-2 p-4 bg-[#f8f9fc] hover:bg-blue-50 hover:border-blue-200 border border-[#E5E7EB] rounded-xl transition-all text-center group"
                >
                  <span className="text-2xl">{action.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-[#0d0d12]">{action.label}</p>
                    <p className="text-xs text-gray-400">{action.desc}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
