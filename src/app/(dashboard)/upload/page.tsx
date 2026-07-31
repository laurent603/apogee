'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface UploadedFile {
  id: string
  file: File
  preview: string
  type: 'image' | 'video'
  ratio?: string
  concept: string
  iteration: string
  format: string
  aiConfidence?: number
}

interface NomenclatureGroup {
  concept: string
  iterations: UploadedFile[]
  editing?: boolean
}

type TestStructure = 'one-ad-one-adset' | 'one-concept-one-adset' | 'all-in-one' | 'insert-in-adset'

interface Config {
  campaignName: string
  objective: string
  budget: string
  budgetType: 'daily' | 'lifetime'
  structure: TestStructure
  startDate: string
  destinationUrl: string
  pixelId: string
  optimizationGoal: string
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function detectRatio(w: number, h: number): string {
  const r = w / h
  if (Math.abs(r - 1) < 0.05) return '1:1'
  if (Math.abs(r - 9 / 16) < 0.06) return '9:16'
  if (Math.abs(r - 16 / 9) < 0.06) return '16:9'
  if (Math.abs(r - 4 / 5) < 0.05) return '4:5'
  if (Math.abs(r - 1.91) < 0.06) return '1.91:1'
  return `${w}×${h}`
}

function formatSize(b: number) {
  return b < 1048576 ? `${(b / 1024).toFixed(0)} Ko` : `${(b / 1048576).toFixed(1)} Mo`
}

const ITERATION_RE = /^([HhVvAa]\d+|v\d+|\d+|angle\d+|version\d+|iter\d+|it\d+|var\d+)$/i
const FORMAT_RE = /^(\d+[x:]\d+|square|portrait|landscape|story|reel|banner|feed|carousel)$/i
const SEPARATORS = /[_\-\.]/

function parseFilename(filename: string): { concept: string; iteration: string; format: string } {
  const noExt = filename.replace(/\.[^/.]+$/, '')
  const parts = noExt.split(SEPARATORS).filter(Boolean)

  if (parts.length === 0) return { concept: noExt, iteration: '', format: '' }

  let iteration = ''
  let format = ''
  const remaining: string[] = []

  for (const p of parts) {
    if (!format && FORMAT_RE.test(p)) { format = p; continue }
    if (!iteration && ITERATION_RE.test(p)) { iteration = p; continue }
    remaining.push(p)
  }

  const concept = remaining.join('_') || parts[0]
  return { concept, iteration, format }
}

function groupByConceptsFrom(files: UploadedFile[]): NomenclatureGroup[] {
  const map = new Map<string, UploadedFile[]>()
  for (const f of files) {
    const key = f.concept || 'Sans concept'
    const group = map.get(key) ?? []
    group.push(f)
    map.set(key, group)
  }
  return Array.from(map.entries()).map(([concept, iterations]) => ({ concept, iterations }))
}

/* ─── Test structure cards ──────────────────────────────────────────────────── */

const TEST_STRUCTURES: { id: TestStructure; label: string; desc: string; icon: string; detail: string }[] = [
  {
    id: 'one-ad-one-adset',
    label: 'One Ad · One Adset',
    desc: 'Chaque créatif dans son propre adset',
    icon: '⬛',
    detail: 'Idéal pour isoler les performances créatif par créatif sans biais de rotation.',
  },
  {
    id: 'one-concept-one-adset',
    label: 'One Concept · One Adset',
    desc: 'Toutes les itérations d\'un concept ensemble',
    icon: '🗂',
    detail: 'Teste concept vs concept. Meta optimise entre les itérations d\'un même concept.',
  },
  {
    id: 'all-in-one',
    label: 'All in One',
    desc: 'Tous les créatifs dans un seul adset',
    icon: '🔢',
    detail: 'Meta gère la rotation automatiquement. Moins de contrôle, mais moins de fragmentation de budget.',
  },
  {
    id: 'insert-in-adset',
    label: 'Insert in Adset',
    desc: 'Insérer dans un adset existant',
    icon: '➕',
    detail: 'Ajoute les créatifs à une campagne en cours sans créer de structure.',
  },
]

/* ─── Confetti ──────────────────────────────────────────────────────────────── */

function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number>(0)
  const pieces = useRef<{ x: number; y: number; vx: number; vy: number; color: string; size: number; angle: number; va: number }[]>([])

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W
    canvas.height = H

    const colors = ['#3434ef', '#ffffff', '#ffd700', '#ff6b6b', '#6b5cff', '#22c55e', '#f59e0b']
    pieces.current = Array.from({ length: 150 }, () => ({
      x: Math.random() * W,
      y: -20,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 4 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      angle: Math.random() * Math.PI * 2,
      va: (Math.random() - 0.5) * 0.2,
    }))

    let frame = 0
    function animate() {
      ctx.clearRect(0, 0, W, H)
      for (const p of pieces.current) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.05
        p.angle += p.va
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.fillStyle = p.color
        ctx.globalAlpha = Math.max(0, 1 - p.y / H)
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      frame++
      if (frame < 240) frameRef.current = requestAnimationFrame(animate)
      else ctx.clearRect(0, 0, W, H)
    }
    animate()
    return () => cancelAnimationFrame(frameRef.current)
  }, [active])

  if (!active) return null
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-50" />
}

/* ─── Steps ──────────────────────────────────────────────────────────────── */

const STEPS = [
  { id: 1, label: 'Import', desc: 'Médias & fichiers' },
  { id: 2, label: 'Nomenclature', desc: 'Détection IA' },
  { id: 3, label: 'Structure', desc: '4 modes de test' },
  { id: 4, label: 'Configuration', desc: 'Campagne & ciblage' },
  { id: 5, label: 'Lancement', desc: 'Publication Meta' },
]

const DEFAULT_CONFIG: Config = {
  campaignName: '',
  objective: 'OUTCOME_SALES',
  budget: '50',
  budgetType: 'daily',
  structure: 'one-ad-one-adset',
  startDate: '',
  destinationUrl: '',
  pixelId: '',
  optimizationGoal: 'OFFSITE_CONVERSIONS',
}

/* ─── Main component ────────────────────────────────────────────────────────── */

export default function UploadPage() {
  const [step, setStep] = useState(1)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [groups, setGroups] = useState<NomenclatureGroup[]>([])
  const [aiParsing, setAiParsing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [testStructure, setTestStructure] = useState<TestStructure>('one-ad-one-adset')
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [launching, setLaunching] = useState(false)
  const [launched, setLaunched] = useState(false)
  const [confetti, setConfetti] = useState(false)
  const [journal, setJournal] = useState<{ text: string; ok: boolean }[]>([])
  const [nomenclatureMode, setNomenclatureMode] = useState<'auto' | 'manual' | 'bulk'>('auto')
  const [bulkPaste, setBulkPaste] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* --- File processing --- */

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    const newFiles: UploadedFile[] = []

    for (const f of arr) {
      const isVideo = f.type.startsWith('video/')
      const preview = URL.createObjectURL(f)
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const parsed = parseFilename(f.name)

      if (!isVideo) {
        await new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = () => {
            const ratio = detectRatio(img.naturalWidth, img.naturalHeight)
            newFiles.push({ id, file: f, preview, type: 'image', ratio, ...parsed, aiConfidence: 85 })
            resolve()
          }
          img.src = preview
        })
      } else {
        newFiles.push({ id, file: f, preview, type: 'video', ...parsed, aiConfidence: 80 })
      }
    }

    setFiles(prev => [...prev, ...newFiles])
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    processFiles(e.dataTransfer.files)
  }, [processFiles])

  /* --- Go to step 2: build nomenclature groups --- */

  function goToNomenclature() {
    setAiParsing(true)
    setTimeout(() => {
      setGroups(groupByConceptsFrom(files))
      setAiParsing(false)
      setStep(2)
    }, 800)
  }

  /* --- Update a file's concept/iteration/format --- */

  function updateFileField(id: string, field: 'concept' | 'iteration' | 'format', value: string) {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f))
    setGroups(groupByConceptsFrom(files.map(f => f.id === id ? { ...f, [field]: value } : f)))
  }

  /* --- Rename a whole concept group --- */

  function renameConcept(oldName: string, newName: string) {
    setFiles(prev => prev.map(f => f.concept === oldName ? { ...f, concept: newName } : f))
    setGroups(prev => prev.map(g => g.concept === oldName ? { ...g, concept: newName } : g))
  }

  /* --- Apply bulk paste --- */

  function applyBulkPaste() {
    const lines = bulkPaste.trim().split('\n').filter(Boolean)
    const updated = [...files]
    for (let i = 0; i < Math.min(lines.length, updated.length); i++) {
      const parsed = parseFilename(lines[i])
      updated[i] = { ...updated[i], ...parsed }
    }
    setFiles(updated)
    setGroups(groupByConceptsFrom(updated))
    setNomenclatureMode('auto')
    setBulkPaste('')
  }

  /* --- Launch --- */

  async function simulateLaunch() {
    setLaunching(true)
    setJournal([])

    const steps = [
      { text: 'Connexion à Meta Ads API...', delay: 600 },
      { text: `Création de la campagne "${config.campaignName || 'Test Metanalyzer'}"...`, delay: 900 },
      { text: `Structure : ${TEST_STRUCTURES.find(s => s.id === testStructure)?.label}`, delay: 600 },
      { text: `Upload de ${files.length} créatif${files.length > 1 ? 's' : ''}...`, delay: 1200 },
      { text: 'Création des ad creatives Meta...', delay: 1000 },
      { text: `Création de ${groups.length} adset${groups.length > 1 ? 's' : ''}...`, delay: 800 },
      { text: 'Publication des annonces...', delay: 700 },
      { text: '🎉 Campagne lancée avec succès !', delay: 500 },
    ]

    for (const s of steps) {
      await new Promise(r => setTimeout(r, s.delay))
      setJournal(prev => [...prev, { text: s.text, ok: true }])
    }

    setLaunching(false)
    setLaunched(true)
    setConfetti(true)
    toast.success('Campagne lancée !')
    setTimeout(() => setConfetti(false), 5000)
  }

  function resetAll() {
    setStep(1); setFiles([]); setGroups([]); setLaunched(false)
    setJournal([]); setConfig(DEFAULT_CONFIG); setConfetti(false)
  }

  /* ─── Render ───────────────────────────────────────────────────────────────── */

  const concepts = [...new Set(files.map(f => f.concept).filter(Boolean))]
  const formats = [...new Set(files.map(f => f.ratio).filter(Boolean))]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Confetti active={confetti} />

      {/* Header */}
      <div>
        <h1 className="page-title">Upload de créatifs</h1>
        <p className="page-subtitle mt-0.5">Importez, nommez et lancez vos créatifs Meta Ads en 5 étapes</p>
      </div>

      {/* Progress bar */}
      <div className="card p-4">
        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1">
              <button
                onClick={() => step > s.id && setStep(s.id)}
                className={clsx('flex items-center gap-2.5 min-w-0', step > s.id && 'cursor-pointer')}
              >
                <div className={clsx('step-dot flex-shrink-0', {
                  done: step > s.id,
                  active: step === s.id,
                  pending: step < s.id,
                })}>
                  {step > s.id ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : s.id}
                </div>
                <div className="hidden sm:block text-left min-w-0">
                  <div className={clsx('text-xs font-semibold truncate', {
                    'text-[#3434ef]': step === s.id,
                    'text-[#0d0d12]': step > s.id,
                    'text-gray-400': step < s.id,
                  })}>{s.label}</div>
                  <div className="text-xs text-gray-400 truncate">{s.desc}</div>
                </div>
              </button>
              {i < STEPS.length - 1 && (
                <div className={clsx('flex-1 h-0.5 mx-3 transition-colors', step > s.id ? 'bg-[#3434ef]' : 'bg-[#E5E7EB]')} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ─── Step 1 : Import ─────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <div
            className={clsx('drop-zone', dragging && 'active')}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden"
              onChange={e => e.target.files && processFiles(e.target.files)} />
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
                <svg className="w-7 h-7 text-[#3434ef]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div className="text-center">
                <p className="font-semibold text-[#0d0d12]">Glissez-déposez vos médias ici</p>
                <p className="text-sm text-gray-400 mt-0.5">ou cliquez pour parcourir — Images & vidéos</p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                {['JPG', 'PNG', 'MP4', 'MOV', 'GIF', 'WEBP'].map(f => (
                  <span key={f} className="badge-gray">{f}</span>
                ))}
              </div>
            </div>
          </div>

          {files.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {files.map(f => (
                  <div key={f.id} className="card p-2 relative group">
                    <button
                      onClick={e => { e.stopPropagation(); setFiles(prev => prev.filter(x => x.id !== f.id)) }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs z-10"
                    >×</button>
                    {f.type === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.preview} alt={f.file.name} className="w-full h-28 object-cover rounded-lg" />
                    ) : (
                      <div className="w-full h-28 bg-gray-100 rounded-lg flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                        </svg>
                      </div>
                    )}
                    <div className="mt-1.5 px-0.5">
                      <p className="text-xs font-medium text-[#0d0d12] truncate">{f.file.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-xs text-gray-400">{formatSize(f.file.size)}</span>
                        {f.ratio && <span className="badge-blue py-0 text-xs">{f.ratio}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card bg-[#f0f0ff] border-[#c5c5ff]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#3434ef] rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#0d0d12]">{files.length} fichier{files.length > 1 ? 's' : ''} importé{files.length > 1 ? 's' : ''}</p>
                    <p className="text-xs text-[#3434ef]">L&apos;IA va analyser les noms pour détecter concept / itération / format</p>
                  </div>
                  <button onClick={goToNomenclature} disabled={aiParsing} className="btn-primary flex items-center gap-2 whitespace-nowrap">
                    {aiParsing ? (
                      <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyse...</>
                    ) : (
                      <>Nomenclature IA →</>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Step 2 : Nomenclature IA ────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Mode tabs */}
          <div className="card p-1 flex gap-1">
            {[
              { id: 'auto', label: 'Détection auto' },
              { id: 'manual', label: 'Édition manuelle' },
              { id: 'bulk', label: 'Bulk paste' },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setNomenclatureMode(m.id as 'auto' | 'manual' | 'bulk')}
                className={clsx('flex-1 py-2 text-xs font-medium rounded-lg transition-all', {
                  'bg-[#3434ef] text-white': nomenclatureMode === m.id,
                  'text-gray-500 hover:text-gray-700': nomenclatureMode !== m.id,
                })}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Auto mode — grouped by concept */}
          {nomenclatureMode === 'auto' && (
            <div className="space-y-3">
              {groups.map(g => (
                <div key={g.concept} className="card space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#3434ef]" />
                    <input
                      className="flex-1 text-sm font-semibold text-[#0d0d12] bg-transparent border-0 outline-none focus:bg-[#f8f9fc] focus:px-2 rounded transition-all"
                      value={g.concept}
                      onChange={e => renameConcept(g.concept, e.target.value)}
                    />
                    <span className="badge-blue">{g.iterations.length} créatif{g.iterations.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-1.5">
                    {g.iterations.map(f => (
                      <div key={f.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[#f8f9fc]">
                        {f.type === 'image' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.preview} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                          </div>
                        )}
                        <p className="text-xs text-gray-500 truncate flex-1 min-w-0">{f.file.name}</p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {f.iteration && (
                            <span className="badge-blue">{f.iteration}</span>
                          )}
                          {f.ratio && (
                            <span className="badge-gray">{f.ratio}</span>
                          )}
                          {f.aiConfidence && (
                            <span className="text-xs text-green-600 font-medium">{f.aiConfidence}%</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {groups.length === 0 && (
                <div className="card text-center py-8 text-gray-400 text-sm">
                  Aucun groupe détecté. Passez en mode &quot;Édition manuelle&quot;.
                </div>
              )}
            </div>
          )}

          {/* Manual mode */}
          {nomenclatureMode === 'manual' && (
            <div className="card space-y-2">
              <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 pb-1 border-b border-[#E5E7EB]">
                <span>Fichier</span><span>Concept</span><span>Itération</span><span>Format</span>
              </div>
              {files.map(f => (
                <div key={f.id} className="grid grid-cols-4 gap-2 items-center p-2 rounded-lg hover:bg-[#f8f9fc]">
                  <p className="text-xs text-gray-600 truncate">{f.file.name}</p>
                  <input className="input py-1 text-xs" value={f.concept}
                    onChange={e => updateFileField(f.id, 'concept', e.target.value)} placeholder="Concept" />
                  <input className="input py-1 text-xs" value={f.iteration}
                    onChange={e => updateFileField(f.id, 'iteration', e.target.value)} placeholder="H1" />
                  <input className="input py-1 text-xs" value={f.format}
                    onChange={e => updateFileField(f.id, 'format', e.target.value)} placeholder="9x16" />
                </div>
              ))}
            </div>
          )}

          {/* Bulk paste */}
          {nomenclatureMode === 'bulk' && (
            <div className="card space-y-3">
              <p className="text-xs text-gray-500">Collez une liste de noms (un par ligne) dans l&apos;ordre des fichiers importés :</p>
              <textarea
                className="input resize-none font-mono text-xs"
                rows={10}
                value={bulkPaste}
                onChange={e => setBulkPaste(e.target.value)}
                placeholder={'HeroVideo_H1_9x16.mp4\nHeroVideo_H2_9x16.mp4\nProductShot_V1_1x1.jpg\n...'}
              />
              <button onClick={applyBulkPaste} className="btn-primary text-sm">
                Appliquer la nomenclature
              </button>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="btn-secondary">← Retour</button>
            <button onClick={() => setStep(3)} className="btn-primary">Structure de test →</button>
          </div>
        </div>
      )}

      {/* ─── Step 3 : Structure de test ──────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {TEST_STRUCTURES.map(s => (
              <button
                key={s.id}
                onClick={() => { setTestStructure(s.id); setConfig(c => ({ ...c, structure: s.id })) }}
                className={clsx(
                  'text-left p-4 rounded-xl border-2 transition-all space-y-2',
                  testStructure === s.id
                    ? 'border-[#3434ef] bg-[#f0f0ff]'
                    : 'border-[#E5E7EB] hover:border-gray-300 bg-white'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{s.icon}</span>
                  <span className={clsx('text-sm font-semibold', testStructure === s.id ? 'text-[#3434ef]' : 'text-[#0d0d12]')}>
                    {s.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{s.desc}</p>
                <p className="text-xs text-gray-400 leading-relaxed">{s.detail}</p>
              </button>
            ))}
          </div>

          {/* Preview of what the structure will produce */}
          {files.length > 0 && groups.length > 0 && (
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-[#0d0d12]">Aperçu de la structure</h3>
              <div className="text-xs text-gray-500 space-y-1">
                {testStructure === 'one-ad-one-adset' && (
                  <div className="space-y-1">
                    <p className="font-medium text-[#0d0d12]">{files.length} adsets seront créés :</p>
                    {files.slice(0, 4).map((f, i) => (
                      <div key={f.id} className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-[#3434ef]" />
                        <span>Adset {i + 1} — {f.concept} {f.iteration}</span>
                      </div>
                    ))}
                    {files.length > 4 && <p className="text-gray-400">+{files.length - 4} adsets...</p>}
                  </div>
                )}
                {testStructure === 'one-concept-one-adset' && (
                  <div className="space-y-1">
                    <p className="font-medium text-[#0d0d12]">{groups.length} adsets seront créés :</p>
                    {groups.map(g => (
                      <div key={g.concept} className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-[#3434ef]" />
                        <span>Adset &quot;{g.concept}&quot; — {g.iterations.length} créatif{g.iterations.length > 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
                {testStructure === 'all-in-one' && (
                  <p className="font-medium text-[#0d0d12]">1 adset avec {files.length} créatifs — rotation Meta automatique.</p>
                )}
                {testStructure === 'insert-in-adset' && (
                  <p className="font-medium text-[#0d0d12]">{files.length} créatifs seront insérés dans un adset existant à choisir.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="btn-secondary">← Retour</button>
            <button onClick={() => setStep(4)} className="btn-primary">Configuration →</button>
          </div>
        </div>
      )}

      {/* ─── Step 4 : Configuration ──────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-[#0d0d12]">Campagne</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Nom de la campagne</label>
                <input className="input" placeholder="Ex: TEST — Créatifs Août 2025" value={config.campaignName}
                  onChange={e => setConfig(c => ({ ...c, campaignName: e.target.value }))} />
              </div>
              <div>
                <label className="label">Objectif</label>
                <select className="select" value={config.objective} onChange={e => setConfig(c => ({ ...c, objective: e.target.value }))}>
                  <option value="OUTCOME_SALES">Ventes</option>
                  <option value="OUTCOME_LEADS">Leads</option>
                  <option value="OUTCOME_TRAFFIC">Trafic</option>
                  <option value="OUTCOME_AWARENESS">Notoriété</option>
                  <option value="OUTCOME_ENGAGEMENT">Engagement</option>
                </select>
              </div>
              <div>
                <label className="label">Optimisation</label>
                <select className="select" value={config.optimizationGoal} onChange={e => setConfig(c => ({ ...c, optimizationGoal: e.target.value }))}>
                  <option value="OFFSITE_CONVERSIONS">Conversions</option>
                  <option value="LINK_CLICKS">Clics sur le lien</option>
                  <option value="LANDING_PAGE_VIEWS">Vues LP</option>
                  <option value="REACH">Portée</option>
                  <option value="IMPRESSIONS">Impressions</option>
                </select>
              </div>
              <div>
                <label className="label">Budget</label>
                <div className="flex gap-1">
                  <div className="flex bg-[#f8f9fc] border border-[#E5E7EB] rounded-lg p-0.5">
                    <button onClick={() => setConfig(c => ({ ...c, budgetType: 'daily' }))}
                      className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-all', config.budgetType === 'daily' ? 'bg-white shadow-sm text-[#0d0d12]' : 'text-gray-500')}>
                      Quotidien
                    </button>
                    <button onClick={() => setConfig(c => ({ ...c, budgetType: 'lifetime' }))}
                      className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-all', config.budgetType === 'lifetime' ? 'bg-white shadow-sm text-[#0d0d12]' : 'text-gray-500')}>
                      Total
                    </button>
                  </div>
                  <div className="relative flex-1">
                    <input type="number" className="input pr-6" value={config.budget}
                      onChange={e => setConfig(c => ({ ...c, budget: e.target.value }))} min="1" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="label">Date de début (optionnel)</label>
                <input type="date" className="input" value={config.startDate}
                  onChange={e => setConfig(c => ({ ...c, startDate: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-[#0d0d12]">Tracking & Destination</h3>
            <div>
              <label className="label">URL de destination</label>
              <input type="url" className="input" placeholder="https://votresite.com/produit"
                value={config.destinationUrl} onChange={e => setConfig(c => ({ ...c, destinationUrl: e.target.value }))} />
            </div>
            <div>
              <label className="label">Pixel Meta ID</label>
              <input className="input" placeholder="123456789012345"
                value={config.pixelId} onChange={e => setConfig(c => ({ ...c, pixelId: e.target.value }))} />
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="btn-secondary">← Retour</button>
            <button onClick={() => setStep(5)} className="btn-primary">Aperçu & Lancement →</button>
          </div>
        </div>
      )}

      {/* ─── Step 5 : Launch ─────────────────────────────────────────────────── */}
      {step === 5 && (
        <div className="space-y-4">
          {!launched && !launching && (
            <>
              {/* Summary */}
              <div className="card space-y-4">
                <h3 className="text-sm font-semibold text-[#0d0d12]">Récapitulatif</h3>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Créatifs', value: files.length.toString() },
                    { label: 'Concepts', value: concepts.length.toString() },
                    { label: 'Formats', value: formats.length.toString() },
                    { label: 'Adsets', value: testStructure === 'one-ad-one-adset' ? files.length.toString() : testStructure === 'one-concept-one-adset' ? groups.length.toString() : '1' },
                  ].map(s => (
                    <div key={s.label} className="bg-[#f8f9fc] rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-[#3434ef]">{s.value}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  {[
                    { label: 'Campagne', value: config.campaignName || 'Sans nom' },
                    { label: 'Structure', value: TEST_STRUCTURES.find(s => s.id === testStructure)?.label || '' },
                    { label: 'Budget', value: `${config.budget}€ ${config.budgetType === 'daily' ? '/ jour' : 'total'}` },
                    { label: 'Objectif', value: config.objective.replace('OUTCOME_', '') },
                    { label: 'URL', value: config.destinationUrl || '—' },
                    { label: 'Pixel', value: config.pixelId || '—' },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center text-sm py-1.5 border-b border-[#F3F4F6] last:border-0">
                      <span className="text-gray-500">{row.label}</span>
                      <span className="font-medium text-[#0d0d12] text-right max-w-xs truncate">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Warning */}
              <div className="card border-amber-200 bg-amber-50">
                <div className="flex gap-3">
                  <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Vérification avant lancement</p>
                    <p className="text-xs text-amber-700 mt-0.5">Le budget sera débité dès la mise en ligne. Assurez-vous que le pixel et l&apos;URL de destination sont corrects.</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep(4)} className="btn-secondary">← Retour</button>
                <button onClick={simulateLaunch} className="btn-primary px-8 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  Lancer maintenant
                </button>
              </div>
            </>
          )}

          {(launching || launched) && (
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-[#0d0d12]">Journal de lancement</h3>
              <div className="space-y-2">
                {journal.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-[#0d0d12]">
                    <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {entry.text}
                  </div>
                ))}
                {launching && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <svg className="animate-spin w-4 h-4 text-[#3434ef]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    En cours...
                  </div>
                )}
              </div>

              {launched && (
                <div className="mt-4 p-5 bg-green-50 border border-green-200 rounded-xl text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-base font-bold text-green-800 mb-1">Campagne lancée !</p>
                  <p className="text-xs text-green-700">Vos {files.length} créatifs sont en cours de révision par Meta Ads.</p>
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
    </div>
  )
}
