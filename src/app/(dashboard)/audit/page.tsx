'use client'
import { useState } from 'react'
import { AnalysisPanel } from '@/components/ui/AnalysisPanel'

const AUDITS = [
  {
    key: 'full',
    label: 'Audit complet Andromeda',
    icon: '🔬',
    description: 'Score 0-100 sur 50 points de contrôle : Pixel/CAPI, Créatives, Structure, Audiences.',
  },
  {
    key: 'pixel',
    label: 'Audit Pixel & CAPI',
    icon: '📡',
    description: 'Vérifie le Pixel, CAPI, EMQ, déduplication, attribution, et conformité iOS 14.5.',
  },
  {
    key: 'fatigue',
    label: 'Scan de fatigue créative',
    icon: '😴',
    description: 'Détecte les créas fatiguées (fréquence, CTR en baisse, hook rate faible).',
  },
  {
    key: 'structure',
    label: 'Audit structure du compte',
    icon: '🏗',
    description: 'CBO vs ABO, Learning Phase, overlaps audiences, Advantage+.',
  },
]

export default function AuditPage() {
  const [active, setActive] = useState('full')
  const current = AUDITS.find((a) => a.key === active)!

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="page-title">Audit</h1>
        <p className="page-subtitle mt-0.5">Framework Andromeda — Diagnostic complet de votre compte Meta Ads</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {AUDITS.map((a) => (
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
        category="audit"
        analysisType={current.key}
        datePreset="last_30d"
      />
    </div>
  )
}
