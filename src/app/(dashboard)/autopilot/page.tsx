'use client'
import { useEffect, useState, useCallback } from 'react'
import { useStore } from '@/lib/store'
import toast from 'react-hot-toast'
import type { AutopilotAgent } from '@/types'

const PRESET_AGENTS = [
  {
    name: 'Daily Kill Guard',
    description: 'Coupe chaque jour les ads qui ont dépensé 2× le CPA cible sans conversion.',
    role: 'performance_manager',
    frequency: 'daily',
    runMode: 'propose',
    analysisPeriod: 'last_3d',
    instructions: 'Analyse toutes les ads actives. Pour chaque ad, vérifie le spend depuis début de diffusion vs conversions. Kill si spend > 2× CPA cible sans conversion.',
    outputFormat: 'Tableau compact avec KPIs + 3 actions max',
    icon: '🔴',
  },
  {
    name: 'Traffic Quality Watchdog',
    description: 'Vérifie chaque jour la qualité du trafic (Cost per ATC / CPL).',
    role: 'media_buyer',
    frequency: 'daily',
    runMode: 'report',
    analysisPeriod: 'last_3d',
    instructions: 'Vérifie la qualité du trafic sur chaque adset actif. Focus sur le cost per ATC (e-commerce) ou CPL (lead gen). Flag chaque adset où le coût dépasse le seuil cible.',
    outputFormat: 'Tableau compact avec KPIs + 3 actions max',
    icon: '👁',
  },
  {
    name: 'Creative Fatigue Scanner',
    description: 'Détecte tous les 3 jours les créas fatiguées et propose des remplacements.',
    role: 'creative_strategist',
    frequency: 'every_3_days',
    runMode: 'propose',
    analysisPeriod: 'last_14d',
    instructions: 'Lance un scan de fatigue créative sur tout le compte. Pour chaque ad fatiguée (fréquence > 3 + CTR en baisse > 20%), propose un plan : pause + brief direction pour la remplacer.',
    outputFormat: 'Liste les ads fatiguées avec métriques, puis pour chacune un brief de remplacement en 3 lignes.',
    icon: '😴',
  },
  {
    name: 'Weekly Performance Report',
    description: 'Dashboard de performance complet chaque lundi matin.',
    role: 'performance_manager',
    frequency: 'weekly',
    runMode: 'report',
    analysisPeriod: 'last_7d',
    instructions: 'Fais un review de performance complet. Inclus: résumé exécutif, tableau daily, top 3 performers, bottom 3, alertes (fréquence, CTR, CPA), et 3 actions prioritaires pour la semaine prochaine. Génère un artifact HTML dashboard.',
    outputFormat: 'Dashboard HTML visuel. Commence par les chiffres clés, puis les alertes, puis les actions.',
    icon: '📊',
  },
  {
    name: 'Monthly Strategic Review',
    description: 'Bilan stratégique mensuel complet, présentable à un client.',
    role: 'performance_manager',
    frequency: 'monthly',
    runMode: 'report',
    analysisPeriod: 'last_30d',
    instructions: 'Fais un bilan stratégique mensuel complet. Inclus: executive summary, performance par semaine, top 5 ads, analyse créative (formats, angles), analyse audience (âge, genre, placements), business impact (rentabilité, MER estimé), et plan d\'action pour le mois prochain avec 5 priorités.',
    outputFormat: 'Dashboard HTML complet avec graphiques. Présentable à un client ou investisseur.',
    icon: '📅',
  },
]

const ROLE_LABELS: Record<string, string> = {
  performance_manager: 'Performance Manager',
  media_buyer: 'Media Buyer',
  creative_strategist: 'Creative Strategist',
  copywriter: 'Copywriter',
}

const FREQ_LABELS: Record<string, string> = {
  daily: 'Chaque jour',
  every_3_days: 'Tous les 3 jours',
  weekly: 'Chaque semaine',
  monthly: 'Chaque mois',
}

const MODE_LABELS: Record<string, { label: string; color: string }> = {
  report: { label: 'Rapport', color: 'badge-blue' },
  propose: { label: 'Propose actions', color: 'badge-yellow' },
  auto_execute: { label: 'Auto-exécute', color: 'badge-red' },
}

export default function AutopilotPage() {
  const { selectedAccount } = useStore()
  const [agents, setAgents] = useState<AutopilotAgent[]>([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, string>>({})

  const loadAgents = useCallback(async () => {
    if (!selectedAccount?.id) return
    const res = await fetch(`/api/autopilot?dbAccountId=${selectedAccount.id}`)
    const data = await res.json()
    setAgents(data.agents || [])
  }, [selectedAccount?.id])

  useEffect(() => { loadAgents() }, [loadAgents])

  async function addPreset(preset: typeof PRESET_AGENTS[0]) {
    if (!selectedAccount?.id) return
    const res = await fetch('/api/autopilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbAccountId: selectedAccount.id, ...preset }),
    })
    const data = await res.json()
    if (data.agent) { setAgents((prev) => [data.agent, ...prev]); toast.success(`Agent "${preset.name}" créé`) }
  }

  async function toggleAgent(agent: AutopilotAgent) {
    const res = await fetch('/api/autopilot', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: agent.id, isActive: !agent.isActive }),
    })
    const data = await res.json()
    if (data.agent) setAgents((prev) => prev.map((a) => a.id === agent.id ? data.agent : a))
  }

  async function deleteAgent(id: string) {
    if (!confirm('Supprimer cet agent ?')) return
    await fetch(`/api/autopilot?id=${id}`, { method: 'DELETE' })
    setAgents((prev) => prev.filter((a) => a.id !== id))
    toast.success('Agent supprimé')
  }

  async function runAgent(agent: AutopilotAgent) {
    if (!selectedAccount) return
    setRunning(agent.id)
    try {
      const bsRes = await fetch(`/api/brand-settings?dbAccountId=${selectedAccount.id}`)
      const bsData = await bsRes.json()

      const category = agent.role === 'creative_strategist' ? 'creativeStrategy'
        : agent.role === 'media_buyer' ? 'mediaBuying' : 'autopilot'
      const analysisType = agent.name.toLowerCase().includes('kill') ? 'dailyKillGuard'
        : agent.name.toLowerCase().includes('fatigue') ? 'creativeFatigue'
        : agent.name.toLowerCase().includes('traffic') ? 'trafficQuality'
        : agent.name.toLowerCase().includes('weekly') ? 'weeklyReport'
        : 'monthlyReview'

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccount.metaAccountId || selectedAccount.id,
          dbAccountId: selectedAccount.id,
          category,
          analysisType,
          datePreset: agent.analysisPeriod,
          brandSettings: bsData.settings,
        }),
      })
      const data = await res.json()
      if (data.result) {
        setResults((prev) => ({ ...prev, [agent.id]: data.result }))
        toast.success(`Agent "${agent.name}" terminé`)
        await fetch('/api/autopilot', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: agent.id, lastRunAt: new Date().toISOString() }),
        })
      }
    } catch { toast.error('Erreur lors de l\'exécution') }
    setRunning(null)
  }

  const presetNames = agents.map((a) => a.name)

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Autopilote</h1>
        <p className="text-gray-400 text-sm mt-0.5">Agents IA programmés pour surveiller et optimiser vos comptes</p>
      </div>

      {/* Presets */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Agents pré-configurés</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {PRESET_AGENTS.map((preset) => {
            const exists = presetNames.includes(preset.name)
            return (
              <div key={preset.name} className="bg-gray-800/50 rounded-xl p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{preset.icon}</span>
                  <span className="font-medium text-white text-sm">{preset.name}</span>
                </div>
                <p className="text-xs text-gray-400 flex-1">{preset.description}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-500">{FREQ_LABELS[preset.frequency]}</span>
                  {exists ? (
                    <span className="text-xs text-green-500">✓ Actif</span>
                  ) : (
                    <button
                      onClick={() => addPreset(preset)}
                      disabled={!selectedAccount}
                      className="text-xs text-brand-400 hover:text-brand-300 font-medium"
                    >
                      + Ajouter
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Active agents */}
      {agents.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">Mes agents ({agents.length})</h2>
          {agents.map((agent) => (
            <div key={agent.id} className="card">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-white">{agent.name}</h3>
                    <span className={MODE_LABELS[agent.runMode].color}>{MODE_LABELS[agent.runMode].label}</span>
                    <span className="badge-blue">{ROLE_LABELS[agent.role]}</span>
                    <span className="text-xs text-gray-500">{FREQ_LABELS[agent.frequency]}</span>
                  </div>
                  {agent.description && (
                    <p className="text-sm text-gray-400 mt-1">{agent.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => runAgent(agent)}
                    disabled={running === agent.id || !selectedAccount}
                    className="btn-secondary text-xs py-1.5"
                  >
                    {running === agent.id ? (
                      <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    ) : '▶ Lancer'}
                  </button>
                  <button
                    onClick={() => toggleAgent(agent)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      agent.isActive ? 'bg-green-900/40 text-green-400 hover:bg-red-900/40 hover:text-red-400' : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {agent.isActive ? 'Actif' : 'Inactif'}
                  </button>
                  <button onClick={() => deleteAgent(agent.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Result */}
              {results[agent.id] && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <div
                    className="report-content prose prose-invert max-w-none text-sm"
                    dangerouslySetInnerHTML={{
                      __html: results[agent.id].startsWith('<') ? results[agent.id] : results[agent.id].replace(/\n/g, '<br/>')
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!selectedAccount && (
        <div className="card text-center py-8 text-gray-400">Sélectionnez un compte publicitaire.</div>
      )}
    </div>
  )
}
