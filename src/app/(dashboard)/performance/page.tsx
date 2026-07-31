'use client'
import { useState } from 'react'
import { AnalysisPanel } from '@/components/ui/AnalysisPanel'

const ANALYSES = [
  {
    key: 'funnel',
    label: 'Analyse du funnel',
    icon: '🔽',
    description: 'Visualise votre funnel complet (Impressions → Achat) et identifie le goulot d\'étranglement.',
    datePreset: 'last_14d',
  },
  {
    key: 'profitability',
    label: 'Rentabilité réelle',
    icon: '💶',
    description: 'ROAS vs breakeven ROAS, MER réel, profitabilité par campagne. Au-delà du ROAS déclaratif.',
    datePreset: 'last_30d',
  },
  {
    key: 'monthly',
    label: 'Bilan mensuel',
    icon: '📅',
    description: 'Dashboard HTML complet : KPIs, top 5 ads, analyse créative, audience, plan d\'action mois prochain.',
    datePreset: 'last_30d',
  },
  {
    key: 'attribution',
    label: 'Qualité attribution',
    icon: '🎯',
    description: 'Détecte la sur-attribution Meta, cannibalisation retargeting, et vérifie les fenêtres post-jan 2026.',
    datePreset: 'last_30d',
  },
]

export default function PerformancePage() {
  const [active, setActive] = useState('funnel')
  const current = ANALYSES.find((a) => a.key === active)!

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Performance</h1>
        <p className="text-gray-400 text-sm mt-0.5">Analyse approfondie de la performance et de la rentabilité réelle</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {ANALYSES.map((a) => (
          <button
            key={a.key}
            onClick={() => setActive(a.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              active === a.key
                ? 'bg-brand-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            <span>{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>

      <AnalysisPanel
        title={`${current.icon} ${current.label}`}
        description={current.description}
        category="performance"
        analysisType={current.key}
        datePreset={current.datePreset}
      />
    </div>
  )
}
