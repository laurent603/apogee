'use client'
import { useState } from 'react'
import { AnalysisPanel } from '@/components/ui/AnalysisPanel'

const ANALYSES = [
  {
    key: 'weeklyReview',
    label: 'Review hebdomadaire',
    icon: '📊',
    description: 'Dashboard 7 jours : KPIs, top/bottom performers, alertes, 3 actions prioritaires.',
    datePreset: 'last_7d',
  },
  {
    key: 'scaling',
    label: 'Identifier les winners à scaler',
    icon: '📈',
    description: 'Identifie les campagnes/adsets à scaler (ROAS, CPA, fréquence, learning phase).',
    datePreset: 'last_14d',
  },
  {
    key: 'kill',
    label: 'Kill Guard — Ads à couper',
    icon: '🔴',
    description: 'Détecte les ads/adsets à couper immédiatement : ROAS faible, CTR mort, fréquence épuisée.',
    datePreset: 'last_14d',
  },
  {
    key: 'budgetReallocation',
    label: 'Réallocation budget',
    icon: '🔄',
    description: 'Optimise la répartition budgétaire. Même enveloppe, meilleur rendement.',
    datePreset: 'last_14d',
  },
]

export default function MediaBuyingPage() {
  const [active, setActive] = useState('weeklyReview')
  const current = ANALYSES.find((a) => a.key === active)!

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Media Buying</h1>
        <p className="text-gray-400 text-sm mt-0.5">Scaling, kill, réallocation budget et review hebdomadaire</p>
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
        category="mediaBuying"
        analysisType={current.key}
        datePreset={current.datePreset}
      />
    </div>
  )
}
