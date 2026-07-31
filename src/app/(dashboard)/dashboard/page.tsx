'use client'
import { useEffect, useState, useCallback } from 'react'
import { useStore } from '@/lib/store'
import type { MetaInsight } from '@/types'

function KPICard({ label, value, sub, color = 'text-white' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="card">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
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
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-0.5">{selectedAccount?.name || 'Sélectionnez un compte'}</p>
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
        <div className="card text-center py-12 text-gray-400">Sélectionnez un compte publicitaire en haut de page.</div>
      )}

      {selectedAccount && loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-gray-800/50" />)}
        </div>
      )}

      {selectedAccount && !loading && overview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard label="Dépense" value={`${spend.toFixed(0)}€`} />
            <KPICard
              label="ROAS"
              value={roas ? parseFloat(roas).toFixed(2) : 'N/A'}
              color={roas && parseFloat(roas) >= 2 ? 'text-green-400' : roas ? 'text-yellow-400' : 'text-gray-400'}
            />
            <KPICard label="CPA" value={cpa ? `${parseFloat(cpa).toFixed(2)}€` : 'N/A'} color="text-blue-400" />
            <KPICard label="Conversions" value={conversions || '0'} color="text-purple-400" />
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
              color={overview.ctr && parseFloat(overview.ctr) >= 1 ? 'text-green-400' : 'text-yellow-400'}
            />
            <KPICard
              label="Fréquence"
              value={overview.frequency ? parseFloat(overview.frequency).toFixed(2) : 'N/A'}
              color={overview.frequency && parseFloat(overview.frequency) > 3 ? 'text-red-400' : 'text-green-400'}
            />
          </div>

          <div className="card">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Analyses rapides</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { href: '/audit', label: 'Audit complet', icon: '🔍', desc: 'Score Andromeda' },
                { href: '/performance', label: 'Performance', icon: '📈', desc: 'Funnel & rentabilité' },
                { href: '/media-buying', label: 'Media Buying', icon: '💰', desc: 'Scale & Kill' },
                { href: '/creative-strategy', label: 'Créatives', icon: '🎨', desc: 'Fatigue & angles' },
              ].map((action) => (
                <a
                  key={action.href}
                  href={action.href}
                  className="flex flex-col items-center gap-2 p-4 bg-gray-800/50 hover:bg-gray-800 rounded-xl transition-colors text-center group"
                >
                  <span className="text-2xl">{action.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-200 group-hover:text-white">{action.label}</p>
                    <p className="text-xs text-gray-500">{action.desc}</p>
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
