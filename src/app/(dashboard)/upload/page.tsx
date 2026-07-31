'use client'
import { useState, useRef, useCallback } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useStore } from '@/lib/store'
import Image from 'next/image'

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface UploadedFile {
  id: string; file: File; preview: string; type: 'image' | 'video'
  ratio?: string; concept: string; iteration: string; format: string; aiConfidence?: number
}
interface NomenclatureGroup { concept: string; iterations: UploadedFile[] }
type TestStructure = 'one-ad-one-adset' | 'one-concept-one-adset' | 'all-in-one' | 'insert-in-adset'
type LaunchStatus = 'SCHEDULED_PAUSED' | 'SCHEDULED_LIVE' | 'CREATED_PAUSED' | 'LIVE_NOW'

interface MetaCampaign {
  id: string; name: string; status: string; objective: string
  daily_budget?: string; lifetime_budget?: string; budget_rebalance_flag?: boolean
}
interface MetaAdset {
  id: string; name: string; campaign_id: string; status: string
  optimization_goal: string; daily_budget?: string
  targeting?: { age_min?: number; age_max?: number; genders?: number[]; geo_locations?: { countries?: string[] }; custom_audiences?: { id: string; name: string }[] }
  promoted_object?: { pixel_id?: string; custom_event_type?: string }
}
interface MetaAd {
  id: string; name: string; adset_id: string
  _parsed: { primary_text: string; headline: string; description: string; cta_type: string; destination_url: string; thumbnail: string | null }
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function detectRatio(w: number, h: number): string {
  const r = w / h
  if (Math.abs(r - 1) < 0.05) return '1:1'
  if (Math.abs(r - 9 / 16) < 0.06) return '9:16'
  if (Math.abs(r - 16 / 9) < 0.06) return '16:9'
  if (Math.abs(r - 4 / 5) < 0.05) return '4:5'
  if (Math.abs(r - 1.91) < 0.06) return '1.91:1'
  return `${w}×${h}`
}
function fmtSize(b: number) { return b < 1048576 ? `${(b / 1024).toFixed(0)} Ko` : `${(b / 1048576).toFixed(1)} Mo` }

const ITER_RE = /^([HhVvAa]\d+|v\d+|\d+|angle\d+|version\d+|iter\d+|it\d+|var\d+)$/i
const FMT_RE = /^(\d+[x:]\d+|square|portrait|landscape|story|reel|banner|feed|carousel)$/i
const SEP = /[_\-\.]/

function parseFilename(name: string): { concept: string; iteration: string; format: string } {
  const noExt = name.replace(/\.[^/.]+$/, '')
  const parts = noExt.split(SEP).filter(Boolean)
  let iteration = ''; let format = ''; const rest: string[] = []
  for (const p of parts) {
    if (!format && FMT_RE.test(p)) { format = p; continue }
    if (!iteration && ITER_RE.test(p)) { iteration = p; continue }
    rest.push(p)
  }
  return { concept: rest.join('_') || parts[0] || noExt, iteration, format }
}

function groupFiles(files: UploadedFile[]): NomenclatureGroup[] {
  const map = new Map<string, UploadedFile[]>()
  for (const f of files) {
    const k = f.concept || 'Sans concept'
    map.set(k, [...(map.get(k) ?? []), f])
  }
  return Array.from(map.entries()).map(([concept, iterations]) => ({ concept, iterations }))
}

function badgeObjective(obj: string) {
  const map: Record<string, string> = {
    OUTCOME_SALES: 'SALES', OUTCOME_LEADS: 'LEADS', OUTCOME_TRAFFIC: 'TRAFFIC',
    OUTCOME_AWARENESS: 'AWARENESS', OUTCOME_ENGAGEMENT: 'ENGAGEMENT',
  }
  return map[obj] || obj.replace('OUTCOME_', '')
}

/* ─── Confetti ───────────────────────────────────────────────────────────────── */

import { useEffect } from 'react'

function Confetti({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number>(0)
  const pieces = useRef<{ x: number; y: number; vx: number; vy: number; color: string; size: number; angle: number; va: number }[]>([])
  useEffect(() => {
    if (!active) return
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    const W = window.innerWidth, H = window.innerHeight
    c.width = W; c.height = H
    const colors = ['#3434ef', '#fff', '#ffd700', '#ff6b6b', '#22c55e', '#f59e0b']
    pieces.current = Array.from({ length: 160 }, () => ({
      x: Math.random() * W, y: -20, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 9 + 4, angle: Math.random() * Math.PI * 2, va: (Math.random() - 0.5) * 0.2,
    }))
    let frame = 0
    const animate = () => {
      ctx.clearRect(0, 0, W, H)
      for (const p of pieces.current) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.angle += p.va
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle)
        ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, 1 - p.y / H)
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      if (++frame < 260) frameRef.current = requestAnimationFrame(animate)
      else ctx.clearRect(0, 0, W, H)
    }
    animate()
    return () => cancelAnimationFrame(frameRef.current)
  }, [active])
  if (!active) return null
  return <canvas ref={ref} className="fixed inset-0 pointer-events-none z-50" />
}

/* ─── Modal shell ────────────────────────────────────────────────────────────── */

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-[640px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <h2 className="text-sm font-semibold text-[#0d0d12]">{title}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">{children}</div>
      </div>
    </div>
  )
}

/* ─── Step bar ───────────────────────────────────────────────────────────────── */

const STEPS = [
  { id: 1, label: 'Import', desc: 'Médias & fichiers' },
  { id: 2, label: 'Nomenclature', desc: 'Détection IA' },
  { id: 3, label: 'Configure Testing', desc: 'Campagne & adsets' },
  { id: 4, label: 'Aperçu', desc: 'Vérification' },
  { id: 5, label: 'Lancement', desc: 'Publication Meta' },
]

const TEST_STRUCTURES: { id: TestStructure; label: string; sub: string }[] = [
  { id: 'one-ad-one-adset', label: '1 Adset 1 Ad', sub: 'Each creative gets its own adset' },
  { id: 'one-concept-one-adset', label: '1 Concept 1 Adset', sub: 'Grouped by concept' },
  { id: 'all-in-one', label: 'All in One', sub: 'One adset, all creatives' },
  { id: 'insert-in-adset', label: 'Insert in Adset', sub: 'Into existing adsets' },
]

const LAUNCH_STATUSES: { id: LaunchStatus; label: string; sub: string }[] = [
  { id: 'SCHEDULED_PAUSED', label: 'Scheduled & Paused', sub: 'Created at date/time, paused' },
  { id: 'SCHEDULED_LIVE', label: 'Scheduled & Live', sub: 'Starts at date/time' },
  { id: 'CREATED_PAUSED', label: 'Created Paused', sub: 'Created now; paused' },
  { id: 'LIVE_NOW', label: 'Live Now', sub: 'Goes live immediately' },
]

/* ─── Main ───────────────────────────────────────────────────────────────────── */

export default function UploadPage() {
  const { selectedAccount } = useStore()
  const [step, setStep] = useState(1)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [groups, setGroups] = useState<NomenclatureGroup[]>([])
  const [dragging, setDragging] = useState(false)
  const [aiParsing, setAiParsing] = useState(false)
  const [nomenclatureMode, setNomenclatureMode] = useState<'auto' | 'manual' | 'bulk'>('auto')
  const [bulkPaste, setBulkPaste] = useState('')

  // Configure Testing state
  const [testStructure, setTestStructure] = useState<TestStructure>('one-ad-one-adset')
  const [launchStatus, setLaunchStatus] = useState<LaunchStatus>('SCHEDULED_PAUSED')
  const [launchDate, setLaunchDate] = useState('')
  const [launchTime, setLaunchTime] = useState('06:00')
  const [campaignBudget, setCampaignBudget] = useState('50')
  const [prefixOpen, setPrefixOpen] = useState(false)
  const [adsetPrefix, setAdsetPrefix] = useState('')
  const [adsetSuffix, setAdsetSuffix] = useState('')

  // Meta data state
  const [selectedCampaign, setSelectedCampaign] = useState<MetaCampaign | null>(null)
  const [adsetTemplate, setAdsetTemplate] = useState<MetaAdset | null>(null)
  const [adTemplate, setAdTemplate] = useState<MetaAd | null>(null)

  // Modal state
  const [campaignModal, setCampaignModal] = useState(false)
  const [adsetModal, setAdsetModal] = useState(false)
  const [adModal, setAdModal] = useState(false)
  const [metaCampaigns, setMetaCampaigns] = useState<MetaCampaign[]>([])
  const [metaAdsets, setMetaAdsets] = useState<MetaAdset[]>([])
  const [metaAds, setMetaAds] = useState<MetaAd[]>([])
  const [loadingMeta, setLoadingMeta] = useState(false)

  // Launch
  const [launching, setLaunching] = useState(false)
  const [launched, setLaunched] = useState(false)
  const [confetti, setConfetti] = useState(false)
  const [journal, setJournal] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const metaId = selectedAccount?.metaAccountId || selectedAccount?.id || ''
  const isCBO = selectedCampaign?.budget_rebalance_flag ?? true

  /* ── fetch helpers ── */
  async function fetchCampaigns() {
    if (!metaId) return
    setLoadingMeta(true)
    try {
      const r = await fetch(`/api/meta/configure?accountId=${metaId}&type=campaigns`)
      const d = await r.json()
      setMetaCampaigns(d || [])
    } catch {}
    setLoadingMeta(false)
  }

  async function fetchAdsets(campaignId?: string) {
    if (!metaId) return
    setLoadingMeta(true)
    try {
      const url = `/api/meta/configure?accountId=${metaId}&type=adsets${campaignId ? `&campaignId=${campaignId}` : ''}`
      const r = await fetch(url)
      const d = await r.json()
      setMetaAdsets(d || [])
    } catch {}
    setLoadingMeta(false)
  }

  async function fetchAds(campaignId?: string) {
    if (!metaId) return
    setLoadingMeta(true)
    try {
      const url = `/api/meta/configure?accountId=${metaId}&type=ads${campaignId ? `&campaignId=${campaignId}` : ''}`
      const r = await fetch(url)
      const d = await r.json()
      setMetaAds(d || [])
    } catch {}
    setLoadingMeta(false)
  }

  /* ── file processing ── */
  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    const newFiles: UploadedFile[] = []
    for (const f of arr) {
      const isVideo = f.type.startsWith('video/')
      const preview = URL.createObjectURL(f)
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const parsed = parseFilename(f.name)
      if (!isVideo) {
        await new Promise<void>(res => {
          const img = new window.Image()
          img.onload = () => { newFiles.push({ id, file: f, preview, type: 'image', ratio: detectRatio(img.naturalWidth, img.naturalHeight), ...parsed, aiConfidence: 85 }); res() }
          img.src = preview
        })
      } else {
        newFiles.push({ id, file: f, preview, type: 'video', ...parsed, aiConfidence: 80 })
      }
    }
    setFiles(prev => [...prev, ...newFiles])
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(false); processFiles(e.dataTransfer.files) }, [processFiles])

  function goToNomenclature() {
    setAiParsing(true)
    setTimeout(() => { setGroups(groupFiles(files)); setAiParsing(false); setStep(2) }, 700)
  }

  function updateFileField(id: string, field: 'concept' | 'iteration' | 'format', value: string) {
    const updated = files.map(f => f.id === id ? { ...f, [field]: value } : f)
    setFiles(updated); setGroups(groupFiles(updated))
  }

  function renameConcept(old: string, next: string) {
    const updated = files.map(f => f.concept === old ? { ...f, concept: next } : f)
    setFiles(updated); setGroups(prev => prev.map(g => g.concept === old ? { ...g, concept: next } : g))
  }

  function applyBulkPaste() {
    const lines = bulkPaste.trim().split('\n').filter(Boolean)
    const updated = files.map((f, i) => i < lines.length ? { ...f, ...parseFilename(lines[i]) } : f)
    setFiles(updated); setGroups(groupFiles(updated)); setNomenclatureMode('auto'); setBulkPaste('')
  }

  /* ── tree nodes ── */
  const treeNodes: { adsetName: string; ads: UploadedFile[] }[] = (() => {
    if (testStructure === 'one-ad-one-adset') return files.map(f => ({ adsetName: [f.concept, f.iteration].filter(Boolean).join('_') || f.file.name, ads: [f] }))
    if (testStructure === 'one-concept-one-adset') return groups.map(g => ({ adsetName: g.concept, ads: g.iterations }))
    if (testStructure === 'all-in-one') return files.length ? [{ adsetName: 'Adset_1', ads: files }] : []
    return files.length ? [{ adsetName: 'Adset existant', ads: files }] : []
  })()

  const adsetConfigured = adsetTemplate !== null
  const adConfigured = adTemplate !== null

  /* ── launch ── */
  async function simulateLaunch() {
    setLaunching(true); setJournal([])
    const steps = [
      'Connexion à Meta Ads API...',
      `Campagne "${selectedCampaign?.name || 'Nouvelle campagne'}" prête`,
      `Structure : ${TEST_STRUCTURES.find(s => s.id === testStructure)?.label}`,
      `Upload de ${files.length} créatif${files.length > 1 ? 's' : ''}...`,
      'Création des ad creatives Meta...',
      `Création de ${treeNodes.length} adset${treeNodes.length > 1 ? 's' : ''}...`,
      adsetTemplate ? `Ciblage copié depuis "${adsetTemplate.name}"` : 'Configuration adsets...',
      adTemplate ? `Copies copiées depuis "${adTemplate.name}"` : 'Configuration des annonces...',
      '🎉 Campagne lancée avec succès !',
    ]
    for (const s of steps) { await new Promise(r => setTimeout(r, 600 + Math.random() * 500)); setJournal(prev => [...prev, s]) }
    setLaunching(false); setLaunched(true); setConfetti(true)
    toast.success('Campagne lancée !'); setTimeout(() => setConfetti(false), 5000)
  }

  function resetAll() {
    setStep(1); setFiles([]); setGroups([]); setLaunched(false); setJournal([])
    setSelectedCampaign(null); setAdsetTemplate(null); setAdTemplate(null); setConfetti(false)
  }

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <Confetti active={confetti} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Upload de créatifs</h1>
          <p className="page-subtitle mt-0.5">Importez, configurez et lancez vos créatifs Meta Ads</p>
        </div>
        {step === 3 && (
          <div className="flex items-center gap-3">
            {!adsetConfigured && (
              <span className="text-xs text-red-500 font-medium">Paramètres d&apos;adset manquants</span>
            )}
            <button onClick={() => setStep(2)} className="btn-secondary flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Previous
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={!adsetConfigured}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="card p-4">
        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1">
              <button onClick={() => step > s.id && setStep(s.id)} className={clsx('flex items-center gap-2.5 min-w-0', step > s.id && 'cursor-pointer')}>
                <div className={clsx('step-dot flex-shrink-0', { done: step > s.id, active: step === s.id, pending: step < s.id })}>
                  {step > s.id ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : s.id}
                </div>
                <div className="hidden sm:block text-left min-w-0">
                  <div className={clsx('text-xs font-semibold truncate', { 'text-[#3434ef]': step === s.id, 'text-[#0d0d12]': step > s.id, 'text-gray-400': step < s.id })}>{s.label}</div>
                  <div className="text-xs text-gray-400 truncate">{s.desc}</div>
                </div>
              </button>
              {i < STEPS.length - 1 && <div className={clsx('flex-1 h-0.5 mx-3 transition-colors', step > s.id ? 'bg-[#3434ef]' : 'bg-[#E5E7EB]')} />}
            </div>
          ))}
        </div>
      </div>

      {/* ─── STEP 1 ─────────────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <div
            className={clsx('drop-zone', dragging && 'active')}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={e => e.target.files && processFiles(e.target.files)} />
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
                <svg className="w-7 h-7 text-[#3434ef]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </div>
              <div className="text-center">
                <p className="font-semibold text-[#0d0d12]">Glissez-déposez vos médias ici</p>
                <p className="text-sm text-gray-400 mt-0.5">ou cliquez pour parcourir — Images & vidéos</p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                {['JPG', 'PNG', 'MP4', 'MOV', 'GIF', 'WEBP'].map(f => <span key={f} className="badge-gray">{f}</span>)}
              </div>
            </div>
          </div>

          {files.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {files.map(f => (
                  <div key={f.id} className="card p-2 relative group">
                    <button onClick={e => { e.stopPropagation(); setFiles(prev => prev.filter(x => x.id !== f.id)) }} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs z-10">×</button>
                    {f.type === 'image'
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={f.preview} alt={f.file.name} className="w-full h-24 object-cover rounded-lg" />
                      : <div className="w-full h-24 bg-gray-100 rounded-lg flex items-center justify-center"><svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg></div>
                    }
                    <p className="text-xs font-medium text-[#0d0d12] truncate mt-1.5">{f.file.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs text-gray-400">{fmtSize(f.file.size)}</span>
                      {f.ratio && <span className="badge-blue py-0 text-xs">{f.ratio}</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="card bg-[#f0f0ff] border-[#c5c5ff] flex items-center gap-3">
                <div className="w-8 h-8 bg-[#3434ef] rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#0d0d12]">{files.length} fichier{files.length > 1 ? 's' : ''} importé{files.length > 1 ? 's' : ''}</p>
                  <p className="text-xs text-[#3434ef]">L&apos;IA va détecter concept / itération / format dans les noms</p>
                </div>
                <button onClick={goToNomenclature} disabled={aiParsing} className="btn-primary flex items-center gap-2 whitespace-nowrap">
                  {aiParsing ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyse...</> : 'Nomenclature IA →'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── STEP 2 ─────────────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="card p-1 flex gap-1">
            {[{ id: 'auto', label: 'Détection auto' }, { id: 'manual', label: 'Édition manuelle' }, { id: 'bulk', label: 'Bulk paste' }].map(m => (
              <button key={m.id} onClick={() => setNomenclatureMode(m.id as typeof nomenclatureMode)}
                className={clsx('flex-1 py-2 text-xs font-medium rounded-lg transition-all', nomenclatureMode === m.id ? 'bg-[#3434ef] text-white' : 'text-gray-500 hover:text-gray-700')}>
                {m.label}
              </button>
            ))}
          </div>

          {nomenclatureMode === 'auto' && (
            <div className="space-y-3">
              {groups.map(g => (
                <div key={g.concept} className="card space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#3434ef]" />
                    <input className="flex-1 text-sm font-semibold text-[#0d0d12] bg-transparent border-0 outline-none focus:bg-[#f8f9fc] focus:px-2 rounded transition-all"
                      value={g.concept} onChange={e => renameConcept(g.concept, e.target.value)} />
                    <span className="badge-blue">{g.iterations.length} créatif{g.iterations.length > 1 ? 's' : ''}</span>
                  </div>
                  {g.iterations.map(f => (
                    <div key={f.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[#f8f9fc]">
                      {f.type === 'image'
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={f.preview} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                        : <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center flex-shrink-0"><svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg></div>
                      }
                      <p className="text-xs text-gray-500 truncate flex-1">{f.file.name}</p>
                      <div className="flex items-center gap-1.5">
                        {f.iteration && <span className="badge-blue">{f.iteration}</span>}
                        {f.ratio && <span className="badge-gray">{f.ratio}</span>}
                        {f.aiConfidence && <span className="text-xs text-green-600 font-medium">{f.aiConfidence}%</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {nomenclatureMode === 'manual' && (
            <div className="card space-y-2">
              <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 pb-1 border-b border-[#E5E7EB]">
                <span>Fichier</span><span>Concept</span><span>Itération</span><span>Format</span>
              </div>
              {files.map(f => (
                <div key={f.id} className="grid grid-cols-4 gap-2 items-center p-2 rounded-lg hover:bg-[#f8f9fc]">
                  <p className="text-xs text-gray-600 truncate">{f.file.name}</p>
                  <input className="input py-1 text-xs" value={f.concept} onChange={e => updateFileField(f.id, 'concept', e.target.value)} placeholder="Concept" />
                  <input className="input py-1 text-xs" value={f.iteration} onChange={e => updateFileField(f.id, 'iteration', e.target.value)} placeholder="H1" />
                  <input className="input py-1 text-xs" value={f.format} onChange={e => updateFileField(f.id, 'format', e.target.value)} placeholder="9x16" />
                </div>
              ))}
            </div>
          )}

          {nomenclatureMode === 'bulk' && (
            <div className="card space-y-3">
              <p className="text-xs text-gray-500">Collez les noms (un par ligne, même ordre que les fichiers) :</p>
              <textarea className="input resize-none font-mono text-xs" rows={8} value={bulkPaste} onChange={e => setBulkPaste(e.target.value)} placeholder={'HeroVideo_H1_9x16.mp4\nHeroVideo_H2_9x16.mp4\n...'} />
              <button onClick={applyBulkPaste} className="btn-primary text-sm">Appliquer</button>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="btn-secondary">← Retour</button>
            <button onClick={() => setStep(3)} className="btn-primary">Configure Testing →</button>
          </div>
        </div>
      )}

      {/* ─── STEP 3 : Configure Testing ─────────────────────────────────────── */}
      {step === 3 && (
        <div className="flex gap-0 border border-[#E5E7EB] rounded-xl overflow-hidden bg-white min-h-[600px]">

          {/* LEFT SIDEBAR */}
          <div className="w-60 border-r border-[#E5E7EB] p-4 space-y-5 flex-shrink-0 bg-white">

            {/* Upload Structure */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#0d0d12] uppercase tracking-wider">Upload Structure</p>
              <div className="grid grid-cols-2 gap-1.5">
                {TEST_STRUCTURES.map(s => (
                  <button key={s.id} onClick={() => setTestStructure(s.id)}
                    className={clsx('text-left p-2.5 rounded-lg border transition-all', testStructure === s.id ? 'border-[#3434ef] bg-[#f0f0ff]' : 'border-[#E5E7EB] hover:border-gray-300')}>
                    <div className="w-5 h-4 bg-gray-200 rounded mb-1.5 flex items-center justify-center">
                      <svg className={clsx('w-3 h-3', testStructure === s.id ? 'text-[#3434ef]' : 'text-gray-400')} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                    </div>
                    <p className={clsx('text-xs font-semibold leading-tight', testStructure === s.id ? 'text-[#3434ef]' : 'text-[#0d0d12]')}>{s.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-tight">{s.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Budget & Schedule */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#0d0d12] uppercase tracking-wider">Budget & Schedule</p>
              {isCBO ? (
                <div className="text-xs text-[#3434ef] bg-[#f0f0ff] rounded-lg p-2.5 flex items-start gap-1.5">
                  <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Budget is managed at campaign level (CBO)
                </div>
              ) : null}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Daily budget (€)</label>
                <input
                  className={clsx('input py-1.5 text-sm', isCBO && 'opacity-40 pointer-events-none')}
                  value={isCBO ? 'CBO' : campaignBudget}
                  onChange={e => setCampaignBudget(e.target.value)}
                  disabled={isCBO}
                  placeholder="50"
                />
              </div>
            </div>

            {/* Launch Status */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#0d0d12] uppercase tracking-wider">Launch Status</p>
              <div className="grid grid-cols-2 gap-1.5">
                {LAUNCH_STATUSES.map(s => (
                  <button key={s.id} onClick={() => setLaunchStatus(s.id)}
                    className={clsx('text-left p-2.5 rounded-lg border transition-all', launchStatus === s.id ? 'border-[#3434ef] bg-[#f0f0ff]' : 'border-[#E5E7EB] hover:border-gray-300')}>
                    <p className={clsx('text-xs font-semibold leading-tight', launchStatus === s.id ? 'text-[#3434ef]' : 'text-[#0d0d12]')}>{s.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-tight">{s.sub}</p>
                  </button>
                ))}
              </div>

              {(launchStatus === 'SCHEDULED_PAUSED' || launchStatus === 'SCHEDULED_LIVE') && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Launch date*</label>
                      <input type="date" className="input py-1.5 text-xs" value={launchDate} onChange={e => setLaunchDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Start time*</label>
                      <input type="time" className="input py-1.5 text-xs" value={launchTime} onChange={e => setLaunchTime(e.target.value)} />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">All times in Europe/Paris</p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT MAIN */}
          <div className="flex-1 p-5 space-y-4">

            {/* Campaign selector */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#0d0d12] uppercase tracking-wider">Campaign Structure</p>
              <a href="/creative-strategist" target="_blank" className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                Copywriting Agent
              </a>
            </div>

            {/* Campaign row */}
            <div className="border border-[#E5E7EB] rounded-xl p-4 space-y-3">
              {selectedCampaign ? (
                <div className="flex items-center gap-3">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                  <span className="text-sm font-medium text-[#0d0d12] flex-1 truncate">{selectedCampaign.name}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {selectedCampaign.budget_rebalance_flag && <span className="badge-blue text-xs">CBO</span>}
                    <span className="badge-blue text-xs">{badgeObjective(selectedCampaign.objective)}</span>
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium border', selectedCampaign.status === 'ACTIVE' ? 'text-green-700 bg-green-50 border-green-200' : 'text-gray-600 bg-gray-50 border-gray-200')}>
                      {selectedCampaign.status}
                    </span>
                  </div>
                  <button onClick={() => { setCampaignModal(true); fetchCampaigns() }} className="btn-secondary text-xs py-1 px-2.5">Change</button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                  <span className="text-sm text-gray-400 flex-1">Aucune campagne sélectionnée</span>
                  <button onClick={() => { setCampaignModal(true); fetchCampaigns() }} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16" /></svg>
                    Choisir depuis Meta
                  </button>
                  <button className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    New
                  </button>
                </div>
              )}

              {/* Quick Bulk Edit */}
              <div className="border-t border-[#F3F4F6] pt-3 space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Quick Bulk Edit</p>

                {/* Adset params */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-24 flex-shrink-0">Adset params :</span>
                  <button
                    onClick={() => { setAdsetModal(true); fetchAdsets(selectedCampaign?.id) }}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg hover:border-[#3434ef] hover:text-[#3434ef] hover:bg-[#f0f0ff] transition-all"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                    Select from Meta
                  </button>
                  <button className="text-xs px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg text-gray-500 hover:border-gray-300 transition-all">Select Template</button>
                  <button className="text-xs px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg text-gray-500 hover:border-gray-300 transition-all">+ New</button>
                  {adsetConfigured && (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      {treeNodes.length}/{treeNodes.length} configuré{treeNodes.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Ad params */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-24 flex-shrink-0">Ad params :</span>
                  <button
                    onClick={() => { setAdModal(true); fetchAds(selectedCampaign?.id) }}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg hover:border-[#3434ef] hover:text-[#3434ef] hover:bg-[#f0f0ff] transition-all"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                    Select from Meta
                  </button>
                  <button className="text-xs px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg text-gray-500 hover:border-gray-300 transition-all">Select Template</button>
                  <button className="text-xs px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg text-gray-500 hover:border-gray-300 transition-all">+ New</button>
                  {adConfigured && (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      {files.length}/{files.length} configuré{files.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Prefix / Suffix */}
              <div className="border-t border-[#F3F4F6] pt-2">
                <button onClick={() => setPrefixOpen(p => !p)} className="flex items-center gap-2 w-full text-xs text-gray-500 hover:text-gray-700 py-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" /></svg>
                  Prefix / Suffix
                  <svg className={clsx('w-3.5 h-3.5 ml-auto transition-transform', prefixOpen && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {prefixOpen && (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Préfixe adset</label>
                      <input className="input py-1.5 text-xs" placeholder="[TEST]_" value={adsetPrefix} onChange={e => setAdsetPrefix(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Suffixe adset</label>
                      <input className="input py-1.5 text-xs" placeholder="_2025" value={adsetSuffix} onChange={e => setAdsetSuffix(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Tree view */}
            {treeNodes.length > 0 && (
              <div className="border border-[#E5E7EB] rounded-xl overflow-hidden">
                {treeNodes.map((node, ni) => (
                  <div key={ni} className="border-b border-[#F3F4F6] last:border-0">
                    {/* Adset row */}
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-[#fafafa]">
                      <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      <span className="text-xs font-medium text-[#0d0d12] flex-1 truncate">
                        {adsetPrefix}{node.adsetName}{adsetSuffix}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isCBO && <span className="badge-blue text-xs">CBO</span>}
                        <span className="text-xs text-gray-400">{node.ads.length} ad{node.ads.length > 1 ? 's' : ''}</span>
                        <button
                          onClick={() => { setAdsetModal(true); fetchAdsets(selectedCampaign?.id) }}
                          className={clsx('flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all',
                            adsetConfigured
                              ? 'border-green-200 bg-green-50 text-green-700'
                              : 'border-orange-200 bg-orange-50 text-orange-600 hover:border-orange-300'
                          )}
                        >
                          {adsetConfigured
                            ? <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>Adset params</>
                            : <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Adset params</>
                          }
                        </button>
                      </div>
                    </div>

                    {/* Ad rows */}
                    {node.ads.map((ad, ai) => (
                      <div key={ai} className="flex items-center gap-3 px-4 py-2.5 pl-10 bg-[#fafafa] border-t border-[#F3F4F6]">
                        {ad.type === 'image'
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={ad.preview} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                          : <div className="w-7 h-7 bg-gray-200 rounded flex-shrink-0 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg></div>
                        }
                        <span className="text-xs text-[#0d0d12] flex-1 truncate">{ad.file.name}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {ad.ratio && <span className="text-xs text-gray-400">{ad.ratio}</span>}
                          <button
                            onClick={() => { setAdModal(true); fetchAds(selectedCampaign?.id) }}
                            className={clsx('flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all',
                              adConfigured
                                ? 'border-green-200 bg-green-50 text-green-700'
                                : 'border-orange-200 bg-orange-50 text-orange-600 hover:border-orange-300'
                            )}
                          >
                            {adConfigured
                              ? <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>Ad Params</>
                              : <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Ad Params</>
                            }
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {treeNodes.length === 0 && (
              <div className="border border-dashed border-[#E5E7EB] rounded-xl p-8 text-center">
                <p className="text-sm text-gray-400">Aucun fichier importé — retournez à l&apos;étape 1</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── STEP 4 ─────────────────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-[#0d0d12]">Récapitulatif</h3>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Créatifs', value: files.length },
                { label: 'Adsets', value: treeNodes.length },
                { label: 'Formats', value: [...new Set(files.map(f => f.ratio).filter(Boolean))].length },
                { label: 'Concepts', value: groups.length },
              ].map(s => (
                <div key={s.label} className="bg-[#f8f9fc] rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-[#3434ef]">{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {[
                { label: 'Campagne', value: selectedCampaign?.name || 'Nouvelle campagne' },
                { label: 'Structure', value: TEST_STRUCTURES.find(s => s.id === testStructure)?.label || '' },
                { label: 'Adset template', value: adsetTemplate?.name || 'Non configuré' },
                { label: 'Ad template', value: adTemplate?.name || 'Non configuré' },
                { label: 'Launch status', value: LAUNCH_STATUSES.find(s => s.id === launchStatus)?.label || '' },
                { label: 'Budget', value: isCBO ? 'CBO' : `${campaignBudget}€/jour` },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-center text-sm py-1.5 border-b border-[#F3F4F6] last:border-0">
                  <span className="text-gray-500">{r.label}</span>
                  <span className="font-medium text-[#0d0d12] truncate max-w-xs text-right">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card border-amber-200 bg-amber-50">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              <p className="text-xs text-amber-700">Le budget sera débité dès la mise en ligne. Vérifiez vos paramètres avant de lancer.</p>
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="btn-secondary">← Retour</button>
            <button onClick={() => setStep(5)} className="btn-primary">Lancer →</button>
          </div>
        </div>
      )}

      {/* ─── STEP 5 ─────────────────────────────────────────────────────────── */}
      {step === 5 && (
        <div className="space-y-4">
          {!launched && !launching && (
            <div className="card text-center py-12">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[#3434ef]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              </div>
              <h3 className="text-lg font-bold text-[#0d0d12] mb-2">Prêt à lancer</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">{files.length} créatif{files.length > 1 ? 's' : ''} · {treeNodes.length} adset{treeNodes.length > 1 ? 's' : ''} · {LAUNCH_STATUSES.find(s => s.id === launchStatus)?.label}</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setStep(4)} className="btn-secondary">← Retour</button>
                <button onClick={simulateLaunch} className="btn-primary px-8 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  Lancer maintenant
                </button>
              </div>
            </div>
          )}

          {(launching || launched) && (
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-[#0d0d12]">Journal de lancement</h3>
              <div className="space-y-2">
                {journal.map((line, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-[#0d0d12]">
                    <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    {line}
                  </div>
                ))}
                {launching && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <svg className="animate-spin w-4 h-4 text-[#3434ef]" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    En cours...
                  </div>
                )}
              </div>
              {launched && (
                <div className="mt-4 p-5 bg-green-50 border border-green-200 rounded-xl text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p className="text-base font-bold text-green-800 mb-1">Campagne lancée !</p>
                  <p className="text-xs text-green-700">{files.length} créatifs · {treeNodes.length} adsets · {LAUNCH_STATUSES.find(s => s.id === launchStatus)?.label}</p>
                  <div className="flex gap-2 justify-center mt-4">
                    <a href="/dashboard" className="btn-secondary text-xs">Voir le Dashboard</a>
                    <button onClick={resetAll} className="btn-primary text-xs">Nouveau upload</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── MODALS ──────────────────────────────────────────────────────────── */}

      {/* Campaign modal */}
      {campaignModal && (
        <Modal title="Choisir une campagne Meta" onClose={() => setCampaignModal(false)}>
          {loadingMeta ? (
            <div className="flex justify-center py-8"><svg className="animate-spin w-5 h-5 text-[#3434ef]" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
          ) : metaCampaigns.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucune campagne active trouvée</p>
          ) : (
            <div className="space-y-1.5">
              {metaCampaigns.map(c => (
                <button key={c.id} onClick={() => { setSelectedCampaign(c); setCampaignModal(false) }}
                  className={clsx('w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 hover:border-[#3434ef] hover:bg-[#f0f0ff]',
                    selectedCampaign?.id === c.id ? 'border-[#3434ef] bg-[#f0f0ff]' : 'border-[#E5E7EB]')}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0d0d12] truncate">{c.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{badgeObjective(c.objective)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {c.budget_rebalance_flag && <span className="badge-blue text-xs">CBO</span>}
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', c.status === 'ACTIVE' ? 'text-green-700 bg-green-50' : 'text-gray-600 bg-gray-100')}>{c.status}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Adset template modal */}
      {adsetModal && (
        <Modal title="Copier la config d'un adset existant" onClose={() => setAdsetModal(false)}>
          <p className="text-xs text-gray-400 mb-3">Sélectionnez un adset pour copier son ciblage, pixel et objectif vers tous vos nouveaux adsets.</p>
          {loadingMeta ? (
            <div className="flex justify-center py-8"><svg className="animate-spin w-5 h-5 text-[#3434ef]" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
          ) : metaAdsets.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucun adset actif trouvé</p>
          ) : (
            <div className="space-y-1.5">
              {metaAdsets.map(a => {
                const targeting = a.targeting || {}
                const countries = (targeting.geo_locations?.countries || []).join(', ')
                const ageRange = targeting.age_min && targeting.age_max ? `${targeting.age_min}–${targeting.age_max} ans` : ''
                const pixel = a.promoted_object?.pixel_id
                return (
                  <button key={a.id} onClick={() => { setAdsetTemplate(a); setAdsetModal(false); toast.success(`Config "${a.name}" appliquée à tous les adsets`) }}
                    className={clsx('w-full text-left p-3 rounded-xl border transition-all hover:border-[#3434ef] hover:bg-[#f0f0ff]',
                      adsetTemplate?.id === a.id ? 'border-[#3434ef] bg-[#f0f0ff]' : 'border-[#E5E7EB]')}>
                    <p className="text-sm font-medium text-[#0d0d12] truncate">{a.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {ageRange && <span className="badge-gray text-xs">{ageRange}</span>}
                      {countries && <span className="badge-gray text-xs">{countries}</span>}
                      {a.optimization_goal && <span className="badge-blue text-xs">{a.optimization_goal.replace('_', ' ')}</span>}
                      {pixel && <span className="badge-gray text-xs">Pixel ✓</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Modal>
      )}

      {/* Ad template modal */}
      {adModal && (
        <Modal title="Copier la config d'une pub existante" onClose={() => setAdModal(false)}>
          <p className="text-xs text-gray-400 mb-3">Sélectionnez une annonce pour copier son texte, titre, CTA et URL vers toutes vos nouvelles annonces.</p>
          {loadingMeta ? (
            <div className="flex justify-center py-8"><svg className="animate-spin w-5 h-5 text-[#3434ef]" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
          ) : metaAds.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucune annonce trouvée</p>
          ) : (
            <div className="space-y-1.5">
              {metaAds.map(ad => (
                <button key={ad.id} onClick={() => { setAdTemplate(ad); setAdModal(false); toast.success(`Copies de "${ad.name}" appliquées`) }}
                  className={clsx('w-full text-left p-3 rounded-xl border transition-all hover:border-[#3434ef] hover:bg-[#f0f0ff] flex gap-3',
                    adTemplate?.id === ad.id ? 'border-[#3434ef] bg-[#f0f0ff]' : 'border-[#E5E7EB]')}>
                  {ad._parsed.thumbnail ? (
                    <Image src={ad._parsed.thumbnail} alt="" width={44} height={44} className="w-11 h-11 rounded-lg object-cover flex-shrink-0" unoptimized />
                  ) : (
                    <div className="w-11 h-11 bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#0d0d12] truncate">{ad.name}</p>
                    {ad._parsed.primary_text && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ad._parsed.primary_text}</p>}
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {ad._parsed.headline && <span className="badge-gray text-xs truncate max-w-[140px]">{ad._parsed.headline}</span>}
                      {ad._parsed.cta_type && <span className="badge-blue text-xs">{ad._parsed.cta_type.replace(/_/g, ' ')}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
