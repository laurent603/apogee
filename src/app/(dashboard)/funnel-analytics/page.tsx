'use client'
import { useEffect, useState, useCallback } from 'react'
import { useStore } from '@/lib/store'

interface FunnelStep {
  label: string
  key: string
  value: number
  color: string
}

export default function FunnelAnalyticsPage() {
  const { selectedAccount } = useStore()
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [datePreset, setDatePreset] = useState('last_7d')

  const fetch_ = useCallback(async () => {
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

  useEffect(() => { fetch_() }, [fetch_])

  const actions = overview?.actions as { action_type: string; value: string }[] | undefined
  const outbound = overview?.outbound_clicks as { value: string }[] | undefined

  const impressions = parseInt(String(overview?.impressions || '0'))
  const clicks = parseInt(String((outbound?.[0]?.value) || overview?.clicks || '0'))
  const lpv = parseInt(actions?.find(a => a.action_type === 'landing_page_view')?.value || '0')
  const atc = parseInt(
    actions?.find(a => a.action_type === 'add_to_cart' || a.action_type === 'offsite_conversion.fb_pixel_add_to_cart')?.value || '0'
  )
  const checkout = parseInt(
    actions?.find(a => a.action_type === 'initiate_checkout' || a.action_type === 'offsite_conversion.fb_pixel_initiate_checkout')?.value || '0'
  )
  const purchases = parseInt(
    actions?.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || '0'
  )
  const leads = parseInt(
    actions?.find(a => a.action_type === 'lead')?.value || '0'
  )

  const isEcom = purchases > 0
  const isLead = leads > 0 && !isEcom

  const tofu: FunnelStep[] = [
    { label: 'Impressions', key: 'impressions', value: impressions, color: '#3434ef' },
    { label: 'Clics (outbound)', key: 'clicks', value: clicks, color: '#3434ef' },
    { label: 'Landing Page Views', key: 'lpv', value: lpv, color: '#3434ef' },
  ]

  const mofu: FunnelStep[] = isEcom
    ? [
        { label: 'Add to Cart', key: 'atc', value: atc, color: '#8b5cf6' },
        { label: 'Initiate Checkout', key: 'checkout', value: checkout, color: '#8b5cf6' },
      ]
    : [
        { label: 'Leads', key: 'leads', value: leads, color: '#8b5cf6' },
      ]

  const bofu: FunnelStep[] = isEcom
    ? [{ label: 'Achats', key: 'purchases', value: purchases, color: '#059669' }]
    : []

  function pct(a: number, b: number) {
    if (!b || !a) return null
    return ((a / b) * 100).toFixed(1)
  }

  function StepCard({ step, prev, color }: { step: FunnelStep; prev?: FunnelStep; color: string }) {
    const conversion = prev ? pct(step.value, prev.value) : null
    return (
      <div className="relative">
        {prev && conversion && (
          <div className="flex items-center justify-center py-1">
            <div className="flex items-center gap-1.5 bg-white border border-[#E5E7EB] rounded-full px-3 py-1 shadow-sm">
              <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              <span className="text-xs font-semibold" style={{ color }}>{conversion}%</span>
            </div>
          </div>
        )}
        <div className="card flex items-center gap-4 py-3">
          <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ background: color }} />
          <div className="flex-1">
            <p className="text-xs text-gray-400 font-medium">{step.label}</p>
            <p className="text-xl font-bold text-[#0d0d12] tabular-nums">
              {step.value > 0 ? step.value.toLocaleString('fr-FR') : '—'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Funnel Analytics</h1>
          <p className="page-subtitle mt-0.5">TOFU · MOFU · BOFU — {selectedAccount?.name || 'Sélectionnez un compte'}</p>
        </div>
        <select value={datePreset} onChange={e => setDatePreset(e.target.value)} className="select w-full sm:w-auto">
          <option value="last_7d">7 jours</option>
          <option value="last_14d">14 jours</option>
          <option value="last_30d">30 jours</option>
          <option value="this_month">Ce mois</option>
        </select>
      </div>

      {!selectedAccount && (
        <div className="card text-center py-12 text-gray-400 text-sm">Sélectionnez un compte pour voir le funnel</div>
      )}

      {selectedAccount && loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => <div key={i} className="space-y-3">{[...Array(3)].map((_, j) => <div key={j} className="card h-20 animate-pulse bg-gray-100" />)}</div>)}
        </div>
      )}

      {selectedAccount && !loading && overview && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* TOFU */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#3434ef]" />
              <span className="text-xs font-semibold text-[#3434ef] uppercase tracking-wider">TOFU</span>
              <span className="text-xs text-gray-400">Awareness</span>
            </div>
            <div className="space-y-0">
              {tofu.map((step, i) => (
                <StepCard key={step.key} step={step} prev={i > 0 ? tofu[i - 1] : undefined} color="#3434ef" />
              ))}
            </div>
          </div>

          {/* MOFU */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
              <span className="text-xs font-semibold text-[#8b5cf6] uppercase tracking-wider">MOFU</span>
              <span className="text-xs text-gray-400">Consideration</span>
            </div>
            <div className="space-y-0">
              {mofu.map((step, i) => (
                <StepCard key={step.key} step={step} prev={i === 0 ? tofu[tofu.length - 1] : mofu[i - 1]} color="#8b5cf6" />
              ))}
              {mofu.length === 0 && <div className="card text-center text-gray-400 text-sm py-8">Pas de données MOFU</div>}
            </div>
          </div>

          {/* BOFU */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#059669]" />
              <span className="text-xs font-semibold text-[#059669] uppercase tracking-wider">BOFU</span>
              <span className="text-xs text-gray-400">Conversion</span>
            </div>
            <div className="space-y-0">
              {bofu.map((step, i) => (
                <StepCard key={step.key} step={step} prev={i === 0 ? (mofu.length > 0 ? mofu[mofu.length - 1] : tofu[tofu.length - 1]) : bofu[i - 1]} color="#059669" />
              ))}
              {isLead && (
                <div className="card text-center text-gray-400 text-xs py-6">Compte Lead Gen — pas d&apos;achats</div>
              )}
              {!isEcom && !isLead && (
                <div className="card text-center text-gray-400 text-xs py-6">Pas de conversions sur cette période</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Metric summary cards */}
      {selectedAccount && !loading && overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'CTR', value: overview?.ctr ? `${parseFloat(overview.ctr as string).toFixed(2)}%` : '—', desc: 'Clics / Impressions' },
            { label: 'LPVR', value: clicks > 0 && lpv > 0 ? `${((lpv / clicks) * 100).toFixed(1)}%` : '—', desc: 'LPV / Clics' },
            { label: 'ATC Rate', value: lpv > 0 && atc > 0 ? `${((atc / lpv) * 100).toFixed(1)}%` : '—', desc: 'ATC / LPV' },
            { label: 'Conv. Rate', value: lpv > 0 && (purchases + leads) > 0 ? `${(((purchases + leads) / lpv) * 100).toFixed(2)}%` : '—', desc: 'Conv / LPV' },
          ].map(m => (
            <div key={m.label} className="card">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">{m.label}</p>
              <p className="text-xl font-bold text-[#0d0d12]">{m.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{m.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
