'use client'
import { useState } from 'react'
import { AnalysisPanel } from '@/components/ui/AnalysisPanel'

const ANALYSES = [
  {
    key: 'creativeAnalysis',
    label: 'Analyse créas (per-ad)',
    icon: '🔬',
    description: 'Analyse détaillée par publicité : Hook Rate, Hold Rate, Completion Rate, copy complète, diagnostic.',
    datePreset: 'last_14d',
  },
  {
    key: 'awareness',
    label: 'Audit niveaux de conscience',
    icon: '🧠',
    description: 'Classe vos créas par niveau Schwartz (Unaware → Most Aware) et identifie les gaps.',
    datePreset: 'last_14d',
  },
  {
    key: 'angleBank',
    label: 'Banque d\'angles',
    icon: '💡',
    description: 'Construis une bibliothèque d\'angles créatifs structurés, prêts à briefer.',
    datePreset: 'last_30d',
  },
  {
    key: 'fullFunnelStrategy',
    label: 'Stratégie full-funnel',
    icon: '🗺',
    description: 'Architecture créative 90 jours : personas, angles par étape, roadmap de production.',
    datePreset: 'last_30d',
  },
]

export default function CreativeStrategyPage() {
  const [active, setActive] = useState('creativeAnalysis')
  const current = ANALYSES.find((a) => a.key === active)!

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="page-title">Creative Strategy</h1>
        <p className="page-subtitle mt-0.5">Analyse, banque d&apos;angles, et stratégie créative full-funnel</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {ANALYSES.map((a) => (
          <button
            key={a.key}
            onClick={() => setActive(a.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              active === a.key
                ? 'bg-[#3434ef] text-white'
                : 'bg-white text-gray-600 hover:text-[#0d0d12] hover:bg-gray-50 border border-[#E5E7EB]'
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
        category="creativeStrategy"
        analysisType={current.key}
        datePreset={current.datePreset}
      />
    </div>
  )
}
