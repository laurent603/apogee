'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useStore } from '@/lib/store'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import type { AutopilotAgent } from '@/types'

type Tab = 'session' | 'agent' | 'history' | 'settings'

// --- Markdown renderer ---
function inlineMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/→/g, '→')
}

function markdownToHtml(md: string): string {
  if (!md) return ''

  // Pre-process: code blocks (protect content)
  const codeBlocks: string[] = []
  let html = md.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(code)
    return `%%CODE${codeBlocks.length - 1}%%`
  })

  // Tables
  html = html.replace(
    /\|(.+)\|\s*\n\|[-| :]+\|\s*\n((?:\|.+\|[ \t]*\n?)+)/g,
    (_, header, body) => {
      const ths = header.split('|').map((s: string) => s.trim()).filter(Boolean)
      const rows = body.trim().split('\n').filter((r: string) => r.trim().startsWith('|'))
        .map((row: string) => row.split('|').map((s: string) => s.trim()).filter(Boolean))
      const thead = `<thead><tr>${ths.map((h: string) => `<th>${inlineMd(h)}</th>`).join('')}</tr></thead>`
      const tbody = `<tbody>${rows.map((r: string[]) => `<tr>${r.map((c: string) => `<td>${inlineMd(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
      return `<table>${thead}${tbody}</table>\n`
    }
  )

  // Process line by line
  const lines = html.split('\n')
  const out: string[] = []
  let inUl = false, inOl = false, paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) {
      const txt = paragraph.join('<br>')
      if (txt.trim()) out.push(`<p>${txt}</p>`)
      paragraph = []
    }
  }

  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false }
    if (inOl) { out.push('</ol>'); inOl = false }
  }

  for (const rawLine of lines) {
    const line = rawLine

    // Code block restore
    const codeMatch = line.match(/^%%CODE(\d+)%%$/)
    if (codeMatch) {
      flushParagraph(); closeList()
      out.push(`<pre><code>${codeBlocks[parseInt(codeMatch[1])]}</code></pre>`)
      continue
    }

    // Table rows (already converted)
    if (line.startsWith('<table>') || line.startsWith('<thead>') || line.startsWith('<tbody>')) {
      flushParagraph(); closeList()
      out.push(line)
      continue
    }

    // H1 / H2 / H3
    const h3 = line.match(/^###\s+(.+)/)
    if (h3) { flushParagraph(); closeList(); out.push(`<h3>${inlineMd(h3[1])}</h3>`); continue }
    const h2 = line.match(/^##\s+(.+)/)
    if (h2) { flushParagraph(); closeList(); out.push(`<h2>${inlineMd(h2[1])}</h2>`); continue }
    const h1 = line.match(/^#\s+(.+)/)
    if (h1) { flushParagraph(); closeList(); out.push(`<h1>${inlineMd(h1[1])}</h1>`); continue }

    // HR
    if (/^---+$/.test(line.trim())) {
      flushParagraph(); closeList(); out.push('<hr>'); continue
    }

    // Blockquote
    const bq = line.match(/^>\s*(.+)/)
    if (bq) { flushParagraph(); closeList(); out.push(`<blockquote>${inlineMd(bq[1])}</blockquote>`); continue }

    // UL
    const ul = line.match(/^[*\-]\s+(.+)/)
    if (ul) {
      flushParagraph()
      if (inOl) { out.push('</ol>'); inOl = false }
      if (!inUl) { out.push('<ul>'); inUl = true }
      out.push(`<li>${inlineMd(ul[1])}</li>`)
      continue
    }

    // OL
    const ol = line.match(/^\d+\.\s+(.+)/)
    if (ol) {
      flushParagraph()
      if (inUl) { out.push('</ul>'); inUl = false }
      if (!inOl) { out.push('<ol>'); inOl = true }
      out.push(`<li>${inlineMd(ol[1])}</li>`)
      continue
    }

    // Blank line = paragraph break
    if (line.trim() === '') {
      closeList()
      flushParagraph()
      continue
    }

    // Otherwise: accumulate paragraph
    if (inUl || inOl) { closeList() }
    paragraph.push(inlineMd(line))
  }

  flushParagraph()
  closeList()

  return out.join('\n')
}

// --- Prompt bank (33 prompts, 4 catégories) ---
const PROMPT_BANK = {
  'Performance': [
    { id: 'p1', label: 'Analyse globale du compte', prompt: 'Analyse les performances globales de mon compte sur les 7 derniers jours. Identifie les tendances principales, les points forts et les alertes.' },
    { id: 'p2', label: 'Top / Flop des publicités', prompt: 'Liste le top 5 et flop 5 de mes publicités actives sur 14 jours. Pour chaque ad, donne : CPM, CTR, CPC, ROAS et une recommandation.' },
    { id: 'p3', label: 'Analyse du ROAS', prompt: 'Analyse en profondeur le ROAS de toutes mes campagnes actives. Identifie les campagnes rentables vs déficitaires et les leviers pour améliorer.' },
    { id: 'p4', label: 'Détection des ads à couper', prompt: 'Identifie les publicités à couper maintenant. Critères : spend > 2× CPA cible sans conversion, ou CPC > 2€ avec CTR < 0.5%.' },
    { id: 'p5', label: 'Analyse du CPM', prompt: 'Analyse le CPM par campagne et ad set. Identifie les audiences avec CPM anormalement élevé et les raisons possibles.' },
    { id: 'p6', label: 'Courbe de performance journalière', prompt: 'Analyse la courbe de performance jour par jour sur les 30 derniers jours. Identifie les pics, creux et facteurs explicatifs.' },
    { id: 'p7', label: 'Analyse du funnel complet', prompt: 'Analyse le funnel complet : impressions → clics → vue LP → ATC → checkout → achat. Identifie le point de rupture principal.' },
    { id: 'p8', label: 'Alerte dépassement budget', prompt: 'Vérifie si des campagnes dépassent leur budget prévisionnel. Calcule le rythme de dépense actuel vs objectif mensuel.' },
  ],
  'Créa & Stratégie': [
    { id: 'c1', label: 'Scan de fatigue créative', prompt: 'Lance un scan de fatigue créative sur toutes les ads actives. Signale celles avec fréquence > 3 et CTR en baisse sur 7j.' },
    { id: 'c2', label: 'Hook Rate analysis', prompt: 'Analyse le Hook Rate de toutes mes vidéos actives. Classe-les du plus performant au moins bon et donne des recommandations.' },
    { id: 'c3', label: 'Hold Rate analysis', prompt: 'Analyse le Hold Rate de mes vidéos. Quels créatifs retiennent le mieux l\'attention et pourquoi ?' },
    { id: 'c4', label: 'Comparaison formats créatifs', prompt: 'Compare les performances entre les formats 1:1, 9:16 et 16:9. Lequel génère le meilleur ROAS sur mes campagnes ?' },
    { id: 'c5', label: 'Angles créatifs qui convertissent', prompt: 'Analyse les titres et descriptions de mes meilleures ads. Quels angles créatifs génèrent le plus de conversions ?' },
    { id: 'c6', label: 'Brief créatif IA', prompt: 'Génère 3 briefs créatifs détaillés pour remplacer mes 3 publicités les moins performantes. Inclus : angle, accroche, structure, CTA.' },
    { id: 'c7', label: 'Test créatif recommandé', prompt: 'Sur la base de mes données actuelles, recommande un plan de test créatif pour les 2 prochaines semaines.' },
    { id: 'c8', label: 'Analyse des CTA', prompt: 'Analyse l\'efficacité des call-to-actions utilisés dans mes publicités. Quels CTA génèrent le meilleur CTR ?' },
  ],
  'Media Buying': [
    { id: 'm1', label: 'Audit des ad sets', prompt: 'Audite tous mes ad sets actifs : budget, audience, optimisation, résultats phase apprentissage. Donne une note /10 et des actions.' },
    { id: 'm2', label: 'Analyse des audiences', prompt: 'Compare les performances par audience (âge, genre, placement). Identifie les segments les plus rentables.' },
    { id: 'm3', label: 'Recommandation de budget', prompt: 'Sur la base du ROAS actuel, recommande une réallocation des budgets entre les campagnes pour maximiser le profit.' },
    { id: 'm4', label: 'Analyse des placements', prompt: 'Compare les performances par placement (Feed, Stories, Reels, Audience Network). Recommande la meilleure stratégie.' },
    { id: 'm5', label: 'Phase apprentissage', prompt: 'Identifie les ad sets encore en phase apprentissage. Lesquels ont des signaux positifs et méritent d\'attendre ?' },
    { id: 'm6', label: 'Stratégie de scaling', prompt: 'Identifie les campagnes prêtes à scaler. Propose une stratégie de scaling précise (budget, audience, duplicate).' },
    { id: 'm7', label: 'Analyse CPL / CPA', prompt: 'Analyse le coût par lead ou coût par achat par campagne et ad set. Compare au CPA cible et identifie les outliers.' },
    { id: 'm8', label: 'Détection des conflits d\'audience', prompt: 'Vérifie si des ad sets se chevauchent sur les audiences et causent une compétition interne au compte.' },
    { id: 'm9', label: 'Optimisation des enchères', prompt: 'Analyse la stratégie d\'enchères actuelle. Recommande des ajustements pour réduire le CPM sans sacrifier les conversions.' },
  ],
  'Reporting': [
    { id: 'r1', label: 'Rapport hebdomadaire', prompt: 'Génère un rapport de performance complet pour la semaine écoulée. Format : executive summary, tableaux, alertes, actions prioritaires.' },
    { id: 'r2', label: 'Rapport mensuel client', prompt: 'Génère un rapport mensuel présentable à un client. Include : performance vs mois précédent, insights créatifs, plan d\'action.' },
    { id: 'r3', label: 'Dashboard HTML', prompt: 'Génère un dashboard HTML visuel de la performance du compte sur 30 jours avec les KPIs clés, graphiques et recommandations.' },
    { id: 'r4', label: 'Résumé exécutif', prompt: 'Rédige un résumé exécutif de 5 lignes sur la performance du compte ce mois-ci. Pour partage rapide avec le client.' },
    { id: 'r5', label: 'Comparaison M/M', prompt: 'Compare les performances du mois en cours vs le mois précédent. Mets en évidence les évolutions positives et négatives.' },
    { id: 'r6', label: 'Analyse de rentabilité', prompt: 'Analyse la rentabilité globale du compte : ROAS, MER estimé, revenue brut, coût des dépenses pub. L\'activité est-elle rentable ?' },
    { id: 'r7', label: 'Rapport d\'audit complet', prompt: 'Génère un audit complet du compte : structure, budget, créas, audiences, pixel. Note chaque dimension et donne un plan d\'amélioration.' },
    { id: 'r8', label: 'Plan d\'action 7 jours', prompt: 'Sur la base de l\'analyse actuelle, génère un plan d\'action détaillé pour les 7 prochains jours. Priorités classées par impact.' },
  ],
}

const PRESET_AGENTS = [
  { name: 'Daily Kill Guard', description: 'Coupe chaque jour les ads qui ont dépensé 2× le CPA cible sans conversion.', role: 'performance_manager', frequency: 'daily', runMode: 'propose', analysisPeriod: 'last_3d', instructions: 'Analyse toutes les ads actives. Pour chaque ad, vérifie le spend vs conversions. Kill si spend > 2× CPA cible sans conversion.', outputFormat: 'Tableau compact avec KPIs + 3 actions max', icon: '🛡️' },
  { name: 'Traffic Quality Watchdog', description: 'Vérifie chaque jour la qualité du trafic (Cost per ATC / CPL).', role: 'media_buyer', frequency: 'daily', runMode: 'report', analysisPeriod: 'last_3d', instructions: 'Vérifie la qualité du trafic sur chaque adset actif. Focus sur le cost per ATC ou CPL.', outputFormat: 'Tableau compact avec KPIs + 3 actions max', icon: '👁️' },
  { name: 'Creative Fatigue Scanner', description: 'Détecte tous les 3 jours les créas fatiguées et propose des remplacements.', role: 'creative_strategist', frequency: 'every_3_days', runMode: 'propose', analysisPeriod: 'last_14d', instructions: 'Lance un scan de fatigue créative. Pour chaque ad fatiguée (fréquence > 3 + CTR en baisse > 20%), propose un brief de remplacement.', outputFormat: 'Liste les ads fatiguées avec métriques puis brief de remplacement.', icon: '😴' },
  { name: 'Weekly Performance Report', description: 'Dashboard de performance complet chaque lundi matin.', role: 'performance_manager', frequency: 'weekly', runMode: 'report', analysisPeriod: 'last_7d', instructions: 'Fais un review de performance complet. Inclus : résumé, tableau daily, top/bottom 3, alertes, et 3 actions prioritaires.', outputFormat: 'Dashboard HTML visuel.', icon: '📊' },
  { name: 'Monthly Strategic Review', description: 'Bilan stratégique mensuel complet, présentable à un client.', role: 'performance_manager', frequency: 'monthly', runMode: 'report', analysisPeriod: 'last_30d', instructions: 'Fais un bilan stratégique mensuel complet incluant executive summary, analyse créative et plan d\'action.', outputFormat: 'Dashboard HTML complet présentable à un client.', icon: '📅' },
]

const ROLE_OPTIONS = [
  { value: 'performance_manager', label: 'Performance Manager' },
  { value: 'media_buyer', label: 'Media Buyer' },
  { value: 'creative_strategist', label: 'Creative Strategist' },
  { value: 'copywriter', label: 'Copywriter' },
]

const FREQ_OPTIONS = [
  { value: 'daily', label: 'Chaque jour' },
  { value: 'every_3_days', label: 'Tous les 3 jours' },
  { value: 'weekly', label: 'Chaque semaine' },
  { value: 'monthly', label: 'Chaque mois' },
]

const MODE_OPTIONS = [
  { value: 'report', label: 'Rapport uniquement' },
  { value: 'propose', label: 'Propose des actions' },
  { value: 'auto_execute', label: 'Auto-exécute (avancé)' },
]

const PERIOD_OPTIONS = [
  { value: 'last_3d', label: '3 derniers jours' },
  { value: 'last_7d', label: '7 derniers jours' },
  { value: 'last_14d', label: '14 derniers jours' },
  { value: 'last_30d', label: '30 derniers jours' },
]

interface Message { role: 'user' | 'assistant'; content: string }

export default function AutopilotPage() {
  const { selectedAccount } = useStore()
  const [tab, setTab] = useState<Tab>('session')

  // --- Session (chat) ---
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [search, setSearch] = useState('')
  const [promptCategory, setPromptCategory] = useState<keyof typeof PROMPT_BANK>('Performance')
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const filteredPrompts = PROMPT_BANK[promptCategory].filter((p) =>
    p.label.toLowerCase().includes(search.toLowerCase()) ||
    p.prompt.toLowerCase().includes(search.toLowerCase())
  )

  async function sendMessage(text?: string) {
    const msg = text || input.trim()
    if (!msg || streaming) return
    if (!selectedAccount) { toast.error('Sélectionnez un compte publicitaire'); return }

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: msg }])
    setStreaming(true)

    try {
      const bsRes = await fetch(`/api/brand-settings?dbAccountId=${selectedAccount.id}`)
      const bsData = await bsRes.json()

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccount.metaAccountId || selectedAccount.id,
          dbAccountId: selectedAccount.id,
          category: 'autopilot',
          analysisType: 'session',
          datePreset: 'last_7d',
          brandSettings: bsData.settings,
          customPrompt: msg,
        }),
      })

      if (!res.ok || !res.body) throw new Error('Erreur serveur')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setMessages((prev) => {
          const copy = [...prev]
          copy[copy.length - 1] = { role: 'assistant', content: accumulated }
          return copy
        })
      }
    } catch {
      toast.error('Erreur lors de l\'analyse')
    }
    setStreaming(false)
  }

  // --- Agent ---
  const [agents, setAgents] = useState<AutopilotAgent[]>([])
  const [agentForm, setAgentForm] = useState({
    name: '', description: '', role: 'performance_manager', frequency: 'daily',
    runMode: 'report', analysisPeriod: 'last_7d', instructions: '', outputFormat: '',
    deliveryEmail: '', deliveryNotion: '', deliveryNotionToken: '',
    channels: ['in_app'] as string[],
  })
  const [running, setRunning] = useState<string | null>(null)
  const [newReportId, setNewReportId] = useState<string | null>(null)

  // --- History ---
  type Report = { id: string; title: string; content: string; createdAt: string; agent: { name: string } | null }
  const [reports, setReports] = useState<Report[]>([])
  const [expandedReport, setExpandedReport] = useState<string | null>(null)

  const loadReports = useCallback(async () => {
    if (!selectedAccount?.id) return
    const res = await fetch(`/api/autopilot/report?dbAccountId=${selectedAccount.id}`)
    const data = await res.json()
    setReports(data.reports || [])
  }, [selectedAccount?.id])

  useEffect(() => { if (tab === 'history') loadReports() }, [tab, loadReports])

  const loadAgents = useCallback(async () => {
    if (!selectedAccount?.id) return
    const res = await fetch(`/api/autopilot?dbAccountId=${selectedAccount.id}`)
    const data = await res.json()
    setAgents(data.agents || [])
  }, [selectedAccount?.id])

  useEffect(() => { loadAgents() }, [loadAgents])

  async function createAgent(data: typeof agentForm | typeof PRESET_AGENTS[0]) {
    if (!selectedAccount?.id) { toast.error('Sélectionnez un compte publicitaire'); return }
    // Build deliveryChannels JSON for custom form
    let deliveryChannels = 'in_app'
    if ('channels' in data) {
      const cfg: Record<string, unknown> = { channels: data.channels }
      if (data.channels.includes('email') && data.deliveryEmail) cfg.email = data.deliveryEmail
      if (data.channels.includes('notion') && data.deliveryNotion) { cfg.notionPageId = data.deliveryNotion; cfg.notionToken = data.deliveryNotionToken }
      deliveryChannels = JSON.stringify(cfg)
    }
    const payload = { ...data, deliveryChannels }
    const res = await fetch('/api/autopilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbAccountId: selectedAccount.id, metaAccountId: selectedAccount.metaAccountId || selectedAccount.id, accountName: selectedAccount.name, ...payload }),
    })
    const json = await res.json()
    if (json.agent) {
      setAgents((prev) => [json.agent, ...prev])
      toast.success(`Agent "${data.name}" créé`)
      setAgentForm({ name: '', description: '', role: 'performance_manager', frequency: 'daily', runMode: 'report', analysisPeriod: 'last_7d', instructions: '', outputFormat: '', deliveryEmail: '', deliveryNotion: '', deliveryNotionToken: '', channels: ['in_app'] })
    } else {
      toast.error(json.error || 'Erreur création agent')
    }
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
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccount.metaAccountId || selectedAccount.id,
          dbAccountId: selectedAccount.id,
          category: 'autopilot',
          analysisType: agent.name,
          datePreset: agent.analysisPeriod,
          brandSettings: bsData.settings,
          customPrompt: agent.instructions,
          agentRole: agent.role,
          outputFormat: agent.outputFormat,
        }),
      })
      if (!res.ok || !res.body) throw new Error()

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
      }
      // Save report to DB
      const title = `${agent.name} — ${new Date().toLocaleDateString('fr-FR')}`
      const saveRes = await fetch('/api/autopilot/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id, dbAccountId: selectedAccount.id, title, content: acc }),
      })
      const saveData = await saveRes.json()
      if (saveData.report?.id) setNewReportId(saveData.report.id)
      await loadReports()
      setTab('history')
      toast.success(`Rapport "${agent.name}" généré`)
    } catch { toast.error('Erreur lors de l\'exécution') }
    setRunning(null)
  }

  const presetNames = agents.map((a) => a.name)

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'session', label: 'Nouvelle session',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>,
    },
    {
      id: 'agent', label: 'Nouvel agent',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-1" /></svg>,
    },
    {
      id: 'history', label: 'Historique',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
    },
    {
      id: 'settings', label: 'Paramètres',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
  ]

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="page-title">Autopilot Agent IA</h1>
        <p className="page-subtitle mt-0.5">Analysez en conversation libre ou créez des agents automatisés</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#f8f9fc] rounded-xl p-1 border border-[#E5E7EB] w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t.id
                ? 'bg-white text-[#3434ef] shadow-sm border border-[#E5E7EB]'
                : 'text-gray-500 hover:text-[#0d0d12]'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* --- TAB: Nouvelle session --- */}
      {tab === 'session' && (
        <div className="flex gap-4" style={{ minHeight: 600 }}>

          {/* ── Prompt bank (left column) ── */}
          <div className="flex-shrink-0 w-56">
            <div className="card p-3 sticky top-4">
              <p className="text-xs font-bold text-[#0d0d12] mb-2 uppercase tracking-wide">Prompts</p>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="input mb-2 py-1 text-xs"
              />
              <div className="flex gap-1 flex-wrap mb-2">
                {(Object.keys(PROMPT_BANK) as (keyof typeof PROMPT_BANK)[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setPromptCategory(cat)}
                    className={clsx(
                      'text-[10px] px-2 py-0.5 rounded font-semibold transition-colors',
                      promptCategory === cat
                        ? 'bg-[#3434ef] text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="space-y-0.5 max-h-[520px] overflow-y-auto">
                {filteredPrompts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => sendMessage(p.prompt)}
                    disabled={streaming}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-blue-50 hover:text-[#3434ef] transition-colors text-[11px] text-gray-600 leading-snug"
                  >
                    {p.label}
                  </button>
                ))}
                {filteredPrompts.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">Aucun résultat</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Chat (right, full width) ── */}
          <div className="flex-1 flex flex-col min-w-0">

            {/* Top bar */}
            <div className="card p-3 mb-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-semibold text-[#0d0d12]">Session d&apos;analyse</span>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-gray-400">{selectedAccount?.name || 'Aucun compte'}</span>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Effacer
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-4 overflow-y-auto pb-4">
              {messages.length === 0 && (
                <div className="card text-center py-16">
                  <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-[#3434ef]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-1" />
                    </svg>
                  </div>
                  <p className="font-semibold text-[#0d0d12]">Démarrez une analyse</p>
                  <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
                    Choisissez un prompt dans la bibliothèque ou tapez votre question ci-dessous
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center mt-4">
                    {['Analyse du funnel complet', 'Top / Flop des publicités', 'Rapport hebdomadaire'].map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          const found = Object.values(PROMPT_BANK).flat().find((p) => p.label === s)
                          if (found) sendMessage(found.prompt)
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-[#3434ef] border border-blue-200 hover:bg-blue-100 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i}>
                  {m.role === 'user' ? (
                    /* ── User question chip ── */
                    <div className="flex justify-end">
                      <div className="max-w-[75%] bg-[#3434ef] text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    /* ── AI response — full width card ── */
                    <div className="card p-0 overflow-hidden">
                      {/* Card header */}
                      <div className="flex items-center gap-2 px-5 py-3 border-b border-[#E5E7EB] bg-[#f8f9fc]">
                        <div className="w-6 h-6 rounded-md bg-[#3434ef] flex items-center justify-center flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <span className="text-xs font-semibold text-[#0d0d12]">Analyse Metanalyzer</span>
                        {streaming && i === messages.length - 1 && (
                          <div className="flex gap-0.5 ml-1">
                            <span className="w-1 h-1 bg-[#3434ef] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1 h-1 bg-[#3434ef] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1 h-1 bg-[#3434ef] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        )}
                        {!streaming && (
                          <button
                            onClick={() => { navigator.clipboard.writeText(m.content); toast.success('Copié !') }}
                            className="ml-auto text-[10px] text-gray-400 hover:text-[#0d0d12] transition-colors"
                          >
                            Copier
                          </button>
                        )}
                      </div>
                      {/* Card body — full width, proper spacing */}
                      <div className="px-5 py-5">
                        <div
                          className="chat-report"
                          dangerouslySetInnerHTML={{
                            __html: m.content
                              ? markdownToHtml(m.content)
                              : '<p class="text-gray-400 text-sm">Analyse en cours…</p>',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input bar */}
            <div className="card p-3 mt-3 flex-shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Posez votre question ou collez un prompt…"
                  className="input flex-1 py-2"
                  disabled={streaming}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={streaming || !input.trim()}
                  className="btn-primary px-4 py-2 flex-shrink-0 flex items-center gap-2"
                >
                  {streaming ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>Analyse…</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      <span>Envoyer</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5 text-center">
                L&apos;IA accède à vos données Meta Ads en temps réel · 20-40 secondes
              </p>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB: Nouvel agent --- */}
      {tab === 'agent' && (
        <div className="space-y-4">
          {/* Templates */}
          <div className="card">
            <p className="text-sm font-semibold text-[#0d0d12] mb-3">Templates préconfigurés</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {PRESET_AGENTS.map((preset) => {
                const exists = presetNames.includes(preset.name)
                return (
                  <div key={preset.name} className="border border-[#E5E7EB] rounded-xl p-4 flex flex-col gap-2 bg-[#f8f9fc]">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{preset.icon}</span>
                      <span className="font-semibold text-[#0d0d12] text-sm">{preset.name}</span>
                    </div>
                    <p className="text-xs text-gray-500 flex-1">{preset.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="badge-gray">{FREQ_OPTIONS.find((f) => f.value === preset.frequency)?.label}</span>
                      {exists ? (
                        <span className="text-xs text-green-600 font-medium">✓ Créé</span>
                      ) : (
                        <button onClick={() => createAgent(preset)} disabled={!selectedAccount} className="text-xs text-[#3434ef] hover:underline font-medium">
                          + Ajouter
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Formulaire création */}
          <div className="card">
            <p className="text-sm font-semibold text-[#0d0d12] mb-4">Créer un agent personnalisé</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Nom de l&apos;agent</label>
                <input type="text" className="input" placeholder="Ex: Budget Optimizer" value={agentForm.name} onChange={(e) => setAgentForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Description</label>
                <input type="text" className="input" placeholder="Ce que fait cet agent en une phrase" value={agentForm.description} onChange={(e) => setAgentForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="label">Rôle IA</label>
                <select className="select" value={agentForm.role} onChange={(e) => setAgentForm((f) => ({ ...f, role: e.target.value }))}>
                  {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Fréquence</label>
                <select className="select" value={agentForm.frequency} onChange={(e) => setAgentForm((f) => ({ ...f, frequency: e.target.value }))}>
                  {FREQ_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Mode d&apos;exécution</label>
                <select className="select" value={agentForm.runMode} onChange={(e) => setAgentForm((f) => ({ ...f, runMode: e.target.value }))}>
                  {MODE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Période d&apos;analyse</label>
                <select className="select" value={agentForm.analysisPeriod} onChange={(e) => setAgentForm((f) => ({ ...f, analysisPeriod: e.target.value }))}>
                  {PERIOD_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Instructions de l&apos;agent</label>
                <textarea rows={4} className="input resize-none" placeholder="Décrivez précisément ce que l'agent doit analyser et faire…" value={agentForm.instructions} onChange={(e) => setAgentForm((f) => ({ ...f, instructions: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Format de sortie attendu</label>
                <input type="text" className="input" placeholder="Ex: Tableau compact avec les 5 ads à couper + justification" value={agentForm.outputFormat} onChange={(e) => setAgentForm((f) => ({ ...f, outputFormat: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Canaux de livraison</label>
                <div className="flex gap-3 mb-2">
                  {[{ id: 'in_app', label: 'Dans l\'app' }, { id: 'email', label: 'Email' }, { id: 'notion', label: 'Notion' }].map((ch) => (
                    <label key={ch.id} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={agentForm.channels.includes(ch.id)}
                        onChange={(e) => setAgentForm((f) => ({
                          ...f,
                          channels: e.target.checked ? [...f.channels, ch.id] : f.channels.filter((c) => c !== ch.id),
                        }))}
                        className="rounded"
                      />
                      {ch.label}
                    </label>
                  ))}
                </div>
                {agentForm.channels.includes('email') && (
                  <input type="email" className="input mb-2" placeholder="Adresse email de réception" value={agentForm.deliveryEmail} onChange={(e) => setAgentForm((f) => ({ ...f, deliveryEmail: e.target.value }))} />
                )}
                {agentForm.channels.includes('notion') && (
                  <div className="space-y-2">
                    <input type="text" className="input" placeholder="Notion Integration Token (secret_xxx)" value={agentForm.deliveryNotionToken} onChange={(e) => setAgentForm((f) => ({ ...f, deliveryNotionToken: e.target.value }))} />
                    <input type="text" className="input" placeholder="ID de la page Notion parent" value={agentForm.deliveryNotion} onChange={(e) => setAgentForm((f) => ({ ...f, deliveryNotion: e.target.value }))} />
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => createAgent(agentForm)} disabled={!agentForm.name || !selectedAccount} className="btn-primary">
                Créer l&apos;agent
              </button>
            </div>
          </div>

          {/* Agents actifs */}
          {agents.length > 0 && (
            <div className="card">
              <p className="text-sm font-semibold text-[#0d0d12] mb-3">Mes agents ({agents.length})</p>
              <div className="space-y-2">
                {agents.map((agent) => (
                  <div key={agent.id} className="border border-[#E5E7EB] rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[#0d0d12] text-sm">{agent.name}</span>
                          <span className={clsx('badge-gray', agent.runMode === 'propose' && 'bg-amber-50 text-amber-700 border-amber-200', agent.runMode === 'auto_execute' && 'bg-red-50 text-red-700 border-red-200')}>
                            {MODE_OPTIONS.find((m) => m.value === agent.runMode)?.label}
                          </span>
                          <span className="badge-gray">{FREQ_OPTIONS.find((f) => f.value === agent.frequency)?.label}</span>
                        </div>
                        {agent.description && <p className="text-xs text-gray-500 mt-1">{agent.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => runAgent(agent)} disabled={running === agent.id || !selectedAccount} className="btn-secondary py-1 text-xs">
                          {running === agent.id ? (
                            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                          ) : '▶ Lancer'}
                        </button>
                        <button
                          onClick={() => toggleAgent(agent)}
                          className={clsx('text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border', agent.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200')}
                        >
                          {agent.isActive ? 'Actif' : 'Inactif'}
                        </button>
                        <button onClick={() => deleteAgent(agent.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                    {running === agent.id && (
                      <div className="mt-3 pt-3 border-t border-[#E5E7EB] flex items-center gap-2 text-xs text-[#3434ef]">
                        <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        Analyse en cours… le rapport apparaîtra dans l&apos;onglet Historique
                      </div>
                    )}
                    {agent.lastRunAt && running !== agent.id && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        Dernier rapport : {new Date(agent.lastRunAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        <button onClick={() => setTab('history')} className="text-[#3434ef] hover:underline ml-1">→ Voir dans Historique</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- TAB: Historique --- */}
      {tab === 'history' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#0d0d12]">Rapports générés</p>
              <p className="text-xs text-gray-400 mt-0.5">Les rapports de vos agents autopilot sont sauvegardés ici automatiquement</p>
            </div>
            <button onClick={loadReports} className="text-xs text-[#3434ef] hover:underline flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Actualiser
            </button>
          </div>
          {reports.length === 0 ? (
            <div className="card text-center py-16">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              </div>
              <p className="text-sm font-medium text-gray-500">Aucun rapport encore</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">Cliquez sur <strong>▶ Lancer</strong> depuis un agent dans l&apos;onglet Nouvel agent — le rapport apparaîtra ici.</p>
              <button onClick={() => setTab('agent')} className="mt-4 text-xs text-[#3434ef] hover:underline">→ Aller aux agents</button>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report, idx) => {
                const isNew = report.id === newReportId
                const isExpanded = expandedReport === report.id
                return (
                  <div key={report.id} className={clsx('card p-0 overflow-hidden transition-shadow', isNew && 'ring-2 ring-[#3434ef] ring-offset-1')}>
                    {/* Card header */}
                    <button
                      onClick={() => { setExpandedReport(isExpanded ? null : report.id); if (isNew) setNewReportId(null) }}
                      className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-[#f8f9fc] transition-colors"
                    >
                      <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', isNew ? 'bg-[#3434ef]' : 'bg-gray-100')}>
                        <svg className={clsx('w-4 h-4', isNew ? 'text-white' : 'text-gray-400')} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-[#0d0d12]">{report.title}</span>
                          {isNew && <span className="text-[10px] font-bold bg-[#3434ef] text-white px-2 py-0.5 rounded-full">Nouveau</span>}
                          {idx === 0 && !isNew && <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Dernier</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {report.agent && (
                            <span className="text-xs font-medium text-[#3434ef] bg-blue-50 px-2 py-0.5 rounded-md">{report.agent.name}</span>
                          )}
                          <span className="text-xs text-gray-400">{new Date(report.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                      <svg className={clsx('w-4 h-4 text-gray-400 transition-transform flex-shrink-0', isExpanded && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                    </button>

                    {/* Report content */}
                    {isExpanded && (
                      <div className="border-t border-[#E5E7EB]">
                        <div className="px-5 py-5">
                          <div className="chat-report" dangerouslySetInnerHTML={{ __html: markdownToHtml(report.content) }} />
                        </div>
                        <div className="px-5 pb-4 flex items-center gap-3">
                          <button
                            onClick={() => { navigator.clipboard.writeText(report.content); toast.success('Rapport copié !') }}
                            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#0d0d12] transition-colors border border-[#E5E7EB] rounded-lg px-3 py-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                            Copier
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* --- TAB: Paramètres --- */}
      {tab === 'settings' && (
        <div className="space-y-4">
          <div className="card">
            <p className="text-sm font-semibold text-[#0d0d12] mb-1">Exécution automatique (cron)</p>
            <p className="text-xs text-gray-500 mb-4">
              Les agents actifs sont déclenchés automatiquement chaque jour à 7h00 via <code className="bg-gray-100 px-1 rounded">/api/cron/agents</code>.
              Sur Vercel, le <code className="bg-gray-100 px-1 rounded">vercel.json</code> est déjà configuré.
              En local ou sur un autre hébergeur, appelez l&apos;endpoint avec le header <code className="bg-gray-100 px-1 rounded">x-cron-secret: {'{CRON_SECRET}'}</code>.
            </p>
            <div className="space-y-2">
              <div>
                <label className="label">CRON_SECRET (à ajouter dans .env.local)</label>
                <input type="text" className="input font-mono text-xs" value="CRON_SECRET=votre-secret-ici" readOnly />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xs text-gray-400 mb-2">Agents actifs programmés :</p>
              {agents.filter((a) => a.isActive).length === 0 ? (
                <p className="text-xs text-gray-400">Aucun agent actif</p>
              ) : (
                <div className="space-y-1">
                  {agents.filter((a) => a.isActive).map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-xs border border-[#E5E7EB] rounded-lg px-3 py-2">
                      <span className="font-medium text-[#0d0d12]">{a.name}</span>
                      <div className="flex items-center gap-3 text-gray-400">
                        <span>{FREQ_OPTIONS.find((f) => f.value === a.frequency)?.label}</span>
                        <span>Prochain : {a.nextRunAt ? new Date(a.nextRunAt).toLocaleDateString('fr-FR') : '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="card">
            <p className="text-sm font-semibold text-[#0d0d12] mb-1">Canaux de livraison</p>
            <p className="text-xs text-gray-500 mb-3">Configurez les canaux sur chaque agent lors de sa création.</p>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex items-start gap-2 p-3 bg-[#f8f9fc] rounded-lg border border-[#E5E7EB]">
                <span className="font-semibold w-16 flex-shrink-0">Email</span>
                <span>Utilise <a href="https://resend.com" target="_blank" rel="noreferrer" className="text-[#3434ef] hover:underline">Resend</a>. Ajoutez <code className="bg-gray-100 px-1 rounded">RESEND_API_KEY</code> dans .env.local.</span>
              </div>
              <div className="flex items-start gap-2 p-3 bg-[#f8f9fc] rounded-lg border border-[#E5E7EB]">
                <span className="font-semibold w-16 flex-shrink-0">Notion</span>
                <span>Créez une intégration sur <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" className="text-[#3434ef] hover:underline">notion.so/my-integrations</a>, copiez le token et l&apos;ID de la page parente dans les paramètres de l&apos;agent.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
