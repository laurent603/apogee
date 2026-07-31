'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import toast from 'react-hot-toast'

interface AnalysisPanelProps {
  title: string
  description: string
  category: string
  analysisType: string
  datePreset?: string
}

export function AnalysisPanel({ title, description, category, analysisType, datePreset = 'last_7d' }: AnalysisPanelProps) {
  const { selectedAccount } = useStore()
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState(datePreset)

  async function runAnalysis() {
    if (!selectedAccount) {
      toast.error('Sélectionnez un compte publicitaire')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const bsRes = await fetch(`/api/brand-settings?dbAccountId=${selectedAccount.id}`)
      const bsData = await bsRes.json()

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccount.metaAccountId || selectedAccount.id,
          dbAccountId: selectedAccount.id,
          category,
          analysisType,
          datePreset: period,
          brandSettings: bsData.settings,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data.result)
      toast.success('Analyse terminée')
    } catch (err) {
      toast.error('Erreur lors de l\'analyse')
      console.error(err)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-white">{title}</h3>
            <p className="text-sm text-gray-400 mt-0.5">{description}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="select w-auto text-sm py-1.5"
            >
              <option value="last_7d">7 jours</option>
              <option value="last_14d">14 jours</option>
              <option value="last_30d">30 jours</option>
              <option value="this_month">Ce mois</option>
              <option value="last_month">Mois dernier</option>
            </select>
            <button
              onClick={runAnalysis}
              disabled={loading}
              className="btn-primary flex items-center gap-2 whitespace-nowrap"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyse en cours…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Lancer l&apos;analyse
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="card flex items-center justify-center py-16">
          <div className="text-center space-y-3">
            <svg className="animate-spin w-8 h-8 text-brand-500 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-gray-400 text-sm">L&apos;IA analyse vos données Meta Ads…</p>
            <p className="text-gray-600 text-xs">Cela peut prendre 20-40 secondes</p>
          </div>
        </div>
      )}

      {result && !loading && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-gray-300">Résultat de l&apos;analyse</h4>
            <button
              onClick={() => {
                navigator.clipboard.writeText(result)
                toast.success('Copié !')
              }}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Copier
            </button>
          </div>
          <div
            className="report-content prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{
              __html: result.startsWith('<')
                ? result
                : result.replace(/\n/g, '<br/>'),
            }}
          />
        </div>
      )}
    </div>
  )
}
