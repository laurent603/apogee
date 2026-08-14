'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
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
  daily_budget?: string; budget_rebalance_flag?: boolean; _isNew?: boolean
}
interface MetaAdset {
  id: string; name: string; campaign_id: string; status: string
  optimization_goal: string; daily_budget?: string
  targeting?: { age_min?: number; age_max?: number; genders?: number[]; geo_locations?: { countries?: string[] }; custom_audiences?: { id: string; name: string }[] }
  promoted_object?: { pixel_id?: string; custom_event_type?: string }
  _isNew?: boolean
}
interface MetaAd {
  id: string; name: string; adset_id: string
  _parsed: { primary_text: string; headline: string; description: string; cta_type: string; destination_url: string; thumbnail: string | null }
  _isNew?: boolean
  _pageId?: string
}
interface MetaPage { id: string; name: string }
interface MetaPixel { id: string; name: string }
interface MetaAudience { id: string; name: string; approximate_count_lower_bound?: number }

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
  for (const f of files) { const k = f.concept || 'Sans concept'; map.set(k, [...(map.get(k) ?? []), f]) }
  return Array.from(map.entries()).map(([concept, iterations]) => ({ concept, iterations }))
}

interface AdGroup {
  adName: string
  concept: string
  iteration: string
  assets: UploadedFile[]
}

function groupByAd(files: UploadedFile[]): AdGroup[] {
  const map = new Map<string, UploadedFile[]>()
  for (const f of files) {
    const key = [f.concept, f.iteration].filter(Boolean).join('_') || f.file.name
    map.set(key, [...(map.get(key) ?? []), f])
  }
  return Array.from(map.entries()).map(([adName, assets]) => ({
    adName, concept: assets[0].concept, iteration: assets[0].iteration, assets,
  }))
}

function badgeObjective(obj: string) {
  const map: Record<string, string> = { OUTCOME_SALES: 'SALES', OUTCOME_LEADS: 'LEADS', OUTCOME_TRAFFIC: 'TRAFFIC', OUTCOME_AWARENESS: 'AWARENESS' }
  return map[obj] || obj.replace('OUTCOME_', '')
}

/* ─── Confetti ───────────────────────────────────────────────────────────────── */

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
      color: colors[Math.floor(Math.random() * colors.length)], size: Math.random() * 9 + 4,
      angle: Math.random() * Math.PI * 2, va: (Math.random() - 0.5) * 0.2,
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

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className={clsx('bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]', wide ? 'w-[780px]' : 'w-[640px]')} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB] flex-shrink-0">
          <h2 className="text-sm font-semibold text-[#0d0d12]">{title}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 text-lg">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  )
}

/* ─── Create Campaign Modal ──────────────────────────────────────────────────── */

const BID_STRATEGIES = ['Lowest cost', 'Cost cap', 'Bid cap', 'ROAS goal']
const SPECIAL_AD_CATEGORIES = ['None', 'Credit', 'Employment', 'Housing', 'Social Issues, Elections or Politics']

function CreateCampaignModal({ onSave, onClose }: { onSave: (c: MetaCampaign) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [objective, setObjective] = useState<'OUTCOME_SALES' | 'OUTCOME_LEADS'>('OUTCOME_SALES')
  const [isCBO, setIsCBO] = useState(false)
  const [budget, setBudget] = useState('')
  const [bidStrategy, setBidStrategy] = useState('Lowest cost')
  const [specialCat, setSpecialCat] = useState('None')
  const [status, setStatus] = useState<'PAUSED' | 'ACTIVE'>('PAUSED')

  function handleSave() {
    if (!name.trim()) { toast.error('Nom de campagne requis'); return }
    onSave({ id: `new_${Date.now()}`, name: name.trim(), status, objective, budget_rebalance_flag: isCBO, daily_budget: isCBO ? undefined : budget, _isNew: true })
  }

  const OBJECTIVES = [
    { id: 'OUTCOME_SALES' as const, label: 'Sales', desc: 'Drive purchases, sign-ups, or other valuable actions on your website or app', icon: '🛒' },
    { id: 'OUTCOME_LEADS' as const, label: 'Leads', desc: 'Collect leads for your business through forms, calls, or messaging', icon: '👥' },
  ]

  return (
    <Modal title="Create New Campaign" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-5">
          <div>
            <label className="label">Campaign Name <span className="text-red-500">*</span></label>
            <input className="input" placeholder="Enter campaign name" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">Campaign Objective <span className="text-red-500">*</span></label>
            <div className="space-y-2">
              {OBJECTIVES.map(o => (
                <button key={o.id} onClick={() => setObjective(o.id)}
                  className={clsx('w-full text-left p-3.5 rounded-xl border-2 flex items-start gap-3 transition-all', objective === o.id ? 'border-[#3434ef] bg-[#f0f0ff]' : 'border-[#E5E7EB] hover:border-gray-300')}>
                  <span className="text-2xl mt-0.5 flex-shrink-0">{o.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className={clsx('text-sm font-semibold', objective === o.id ? 'text-[#3434ef]' : 'text-[#0d0d12]')}>{o.label}</p>
                      {objective === o.id && <div className="w-5 h-5 bg-[#3434ef] rounded-full flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></div>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{o.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Special Ad Category</label>
            <select className="select" value={specialCat} onChange={e => setSpecialCat(e.target.value)}>
              {SPECIAL_AD_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">Required if your ads relate to credit, employment, housing, or social issues</p>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className="label">Budget Optimization</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ val: false, label: 'CBO', sub: 'Campaign Budget' }, { val: true, label: 'ABO', sub: 'Ad Set Budget' }].map(o => (
                <button key={String(o.val)} onClick={() => setIsCBO(!o.val)}
                  className={clsx('p-3.5 rounded-xl border-2 text-center transition-all', isCBO === !o.val ? 'border-[#3434ef] bg-[#f0f0ff]' : 'border-[#E5E7EB] hover:border-gray-300')}>
                  <p className={clsx('text-sm font-bold', isCBO === !o.val ? 'text-[#3434ef]' : 'text-[#0d0d12]')}>{o.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{o.sub}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Budget</label>
            {isCBO
              ? <div className="input bg-gray-50 text-gray-400 text-sm cursor-not-allowed">Budget will be set at ad set level</div>
              : <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span><input className="input pl-7" placeholder="50" type="number" value={budget} onChange={e => setBudget(e.target.value)} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">/ jour</span></div>
            }
          </div>
          <div>
            <label className="label">Bid Strategy</label>
            <select className="select" value={bidStrategy} onChange={e => setBidStrategy(e.target.value)}>
              {BID_STRATEGIES.map(s => <option key={s}>{s}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">Get the most results for your budget</p>
          </div>
          <div>
            <label className="label">Campaign Status</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ id: 'PAUSED' as const, label: 'Paused' }, { id: 'ACTIVE' as const, label: 'Active' }].map(s => (
                <button key={s.id} onClick={() => setStatus(s.id)}
                  className={clsx('p-3 rounded-xl border-2 text-center transition-all', status === s.id ? 'border-[#3434ef] bg-[#f0f0ff]' : 'border-[#E5E7EB] hover:border-gray-300')}>
                  <p className={clsx('text-sm font-semibold', status === s.id ? 'text-[#3434ef]' : 'text-[#0d0d12]')}>{s.label}</p>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">{status === 'PAUSED' ? "Campaign will be created but won't spend" : 'Campaign will start spending immediately'}</p>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[#E5E7EB]">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={handleSave} className="btn-primary px-6">Create Campaign</button>
      </div>
    </Modal>
  )
}

/* ─── Create Adset Modal ─────────────────────────────────────────────────────── */

const PERF_GOALS = ['Maximize number of conversions', 'Maximize conversion value', 'Maximize number of leads', 'Maximize number of link clicks', 'Maximize reach']
const CONV_EVENTS = ['Purchase', 'Lead', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'CompleteRegistration', 'Contact', 'Subscribe']
const COUNTRIES = [
  { code: 'FR', flag: '🇫🇷', name: 'France' }, { code: 'BE', flag: '🇧🇪', name: 'Belgique' },
  { code: 'CH', flag: '🇨🇭', name: 'Suisse' }, { code: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: 'US', flag: '🇺🇸', name: 'États-Unis' }, { code: 'GB', flag: '🇬🇧', name: 'Royaume-Uni' },
  { code: 'DE', flag: '🇩🇪', name: 'Allemagne' }, { code: 'ES', flag: '🇪🇸', name: 'Espagne' },
  { code: 'IT', flag: '🇮🇹', name: 'Italie' }, { code: 'LU', flag: '🇱🇺', name: 'Luxembourg' },
]
const AGES = [13, 15, 18, 21, 25, 30, 35, 40, 45, 50, 55, 60, 65]

function CreateAdsetModal({ onSave, onClose, isCBO, pixels, audiences }: {
  onSave: (a: MetaAdset) => void; onClose: () => void
  isCBO: boolean; pixels: MetaPixel[]; audiences: MetaAudience[]
}) {
  const [perfGoal, setPerfGoal] = useState('Maximize number of conversions')
  const [pixelId, setPixelId] = useState(pixels[0]?.id || '')
  const [convEvent, setConvEvent] = useState('Purchase')
  const [budget, setBudget] = useState('')
  const [ageMin, setAgeMin] = useState(18)
  const [ageMax, setAgeMax] = useState(0)
  const [gender, setGender] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL')
  const [locations, setLocations] = useState<string[]>(['FR'])
  const [locSearch, setLocSearch] = useState('')
  const [advantagePlus, setAdvantagePlus] = useState(true)
  const [audienceTab, setAudienceTab] = useState<'include' | 'exclude'>('include')
  const [audienceSearch, setAudienceSearch] = useState('')
  const [includedAudiences, setIncludedAudiences] = useState<string[]>([])
  const [excludedAudiences, setExcludedAudiences] = useState<string[]>([])
  const [spendingLimit, setSpendingLimit] = useState(false)

  const filteredCountries = COUNTRIES.filter(c => c.name.toLowerCase().includes(locSearch.toLowerCase()) || c.code.toLowerCase().includes(locSearch.toLowerCase()))
  const filteredAudiences = audiences.filter(a => a.name.toLowerCase().includes(audienceSearch.toLowerCase()))

  function toggleLocation(code: string) { setLocations(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]) }
  function toggleAudience(id: string) {
    if (audienceTab === 'include') setIncludedAudiences(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    else setExcludedAudiences(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function handleSave() {
    onSave({
      id: `new_${Date.now()}`, name: 'Nouvel adset', campaign_id: '', status: 'PAUSED',
      optimization_goal: perfGoal.toUpperCase().replace(/ /g, '_'),
      targeting: {
        age_min: ageMin, age_max: ageMax || 65,
        genders: gender === 'ALL' ? [1, 2] : gender === 'MALE' ? [1] : [2],
        geo_locations: { countries: locations },
        custom_audiences: includedAudiences.map(id => ({ id, name: audiences.find(a => a.id === id)?.name || id })),
      },
      promoted_object: { pixel_id: pixelId, custom_event_type: convEvent.toUpperCase() },
      daily_budget: isCBO ? undefined : budget,
      _isNew: true,
    })
    toast.success('Configuration adset enregistrée')
  }

  return (
    <Modal title="Configurer l'adset" onClose={onClose} wide>
      <div className="space-y-6">
        {/* CONVERSION */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            Conversion
          </p>
          <div>
            <label className="label">Performance Goal</label>
            <select className="select" value={perfGoal} onChange={e => setPerfGoal(e.target.value)}>
              {PERF_GOALS.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Dataset (Pixel) <span className="text-red-500">*</span></label>
              {pixels.length > 0
                ? <select className="select" value={pixelId} onChange={e => setPixelId(e.target.value)}>{pixels.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                : <input className="input" placeholder="Pixel ID" value={pixelId} onChange={e => setPixelId(e.target.value)} />
              }
            </div>
            <div>
              <label className="label">Conversion Event <span className="text-red-500">*</span></label>
              <select className="select" value={convEvent} onChange={e => setConvEvent(e.target.value)}>
                {CONV_EVENTS.map(e => <option key={e}>{e}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Bid Strategy</label>
            <div className="input bg-gray-50 text-gray-500 text-sm cursor-not-allowed">Highest volume or value</div>
          </div>
        </div>

        {/* BUDGET */}
        <div className="space-y-3 pt-3 border-t border-[#F3F4F6]">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Budget</p>
          {isCBO
            ? <div className="flex items-center gap-2.5 p-3 bg-[#f0f0ff] border border-[#c5c5ff] rounded-xl text-sm text-[#3434ef]">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Budget is managed at campaign level (CBO)
              </div>
            : <div><label className="label">Daily budget (€)</label><input className="input" placeholder="Budget journalier" type="number" value={budget} onChange={e => setBudget(e.target.value)} /></div>
          }
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={spendingLimit} onChange={e => setSpendingLimit(e.target.checked)} className="w-4 h-4 rounded border-gray-300 accent-[#3434ef]" />
            <span className="text-sm text-[#0d0d12]">Set spending limit for this ad set</span>
          </label>
        </div>

        {/* AUDIENCE */}
        <div className="space-y-4 pt-3 border-t border-[#F3F4F6]">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Audience
          </p>

          {/* Locations */}
          <div>
            <label className="label">Locations <span className="text-red-500">*</span></label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input className="input pl-9" placeholder="Search locations..." value={locSearch} onChange={e => setLocSearch(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {locations.map(code => {
                const c = COUNTRIES.find(x => x.code === code)
                return c ? <span key={code} className="flex items-center gap-1 text-xs bg-[#f0f0ff] border border-[#c5c5ff] text-[#3434ef] rounded-full px-2.5 py-1">{c.flag} {c.name}<button onClick={() => toggleLocation(code)} className="ml-0.5 hover:text-red-500">×</button></span> : null
              })}
            </div>
            {locSearch && (
              <div className="border border-[#E5E7EB] rounded-xl overflow-hidden mt-2">
                {filteredCountries.map(c => (
                  <button key={c.code} onClick={() => { toggleLocation(c.code); setLocSearch('') }}
                    className={clsx('w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-[#f8f9fc] border-b border-[#F3F4F6] last:border-0', locations.includes(c.code) && 'bg-[#f0f0ff] text-[#3434ef]')}>
                    <span>{c.flag}</span> {c.name}
                    {locations.includes(c.code) && <svg className="w-3.5 h-3.5 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Age & Gender */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Age Range</label>
              <div className="flex items-center gap-2">
                <select className="select flex-1" value={ageMin} onChange={e => setAgeMin(Number(e.target.value))}>
                  {AGES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <span className="text-gray-400 text-sm flex-shrink-0">to</span>
                <select className="select flex-1" value={ageMax} onChange={e => setAgeMax(Number(e.target.value))}>
                  <option value={0}>65+</option>
                  {AGES.filter(a => a > ageMin).map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Gender</label>
              <div className="grid grid-cols-3 gap-1">
                {(['ALL', 'MALE', 'FEMALE'] as const).map(g => (
                  <button key={g} onClick={() => setGender(g)}
                    className={clsx('py-2 rounded-lg border text-xs font-medium transition-all', gender === g ? 'border-[#3434ef] bg-[#f0f0ff] text-[#3434ef]' : 'border-[#E5E7EB] text-gray-600 hover:border-gray-300')}>
                    {g === 'ALL' ? 'All' : g === 'MALE' ? 'Men' : 'Women'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Custom Audiences */}
          {audiences.length > 0 && (
            <div>
              <label className="label">Custom Audiences</label>
              <div className="flex border border-[#E5E7EB] rounded-lg overflow-hidden mb-2">
                <button onClick={() => setAudienceTab('include')} className={clsx('flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1', audienceTab === 'include' ? 'bg-[#f0f0ff] text-[#3434ef]' : 'text-gray-500')}>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Include
                </button>
                <button onClick={() => setAudienceTab('exclude')} className={clsx('flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1', audienceTab === 'exclude' ? 'bg-red-50 text-red-600' : 'text-gray-500')}>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg> Exclude
                </button>
              </div>
              <input className="input mb-2" placeholder="Search audiences..." value={audienceSearch} onChange={e => setAudienceSearch(e.target.value)} />
              {audienceSearch && filteredAudiences.length > 0 && (
                <div className="border border-[#E5E7EB] rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                  {filteredAudiences.map(a => {
                    const active = audienceTab === 'include' ? includedAudiences.includes(a.id) : excludedAudiences.includes(a.id)
                    return (
                      <button key={a.id} onClick={() => toggleAudience(a.id)}
                        className={clsx('w-full text-left px-3 py-2 flex items-center gap-2 text-xs hover:bg-[#f8f9fc] border-b border-[#F3F4F6] last:border-0', active && 'bg-[#f0f0ff]')}>
                        <span className="flex-1 font-medium text-[#0d0d12]">{a.name}</span>
                        {a.approximate_count_lower_bound && <span className="text-gray-400">{(a.approximate_count_lower_bound / 1000).toFixed(0)}k</span>}
                        {active && <svg className="w-3.5 h-3.5 text-[#3434ef]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {includedAudiences.map(id => <span key={id} className="text-xs bg-[#f0f0ff] border border-[#c5c5ff] text-[#3434ef] rounded-full px-2.5 py-1">{audiences.find(a => a.id === id)?.name}</span>)}
                {excludedAudiences.map(id => <span key={id} className="text-xs bg-red-50 border border-red-200 text-red-600 rounded-full px-2.5 py-1 line-through">{audiences.find(a => a.id === id)?.name}</span>)}
              </div>
            </div>
          )}

          {/* Placements */}
          <div>
            <label className="label">Placements</label>
            <label className="flex items-start gap-2.5 p-3 border border-[#E5E7EB] rounded-xl cursor-pointer hover:border-[#3434ef] transition-all">
              <input type="checkbox" checked={advantagePlus} onChange={e => setAdvantagePlus(e.target.checked)} className="w-4 h-4 mt-0.5 rounded accent-[#3434ef]" />
              <div>
                <p className="text-sm font-medium text-[#0d0d12]">Use Advantage+ Placements</p>
                <p className="text-xs text-gray-400 mt-0.5">Meta picks the best-performing placements automatically (recommended).</p>
              </div>
            </label>
          </div>

          {!advantagePlus && (
            <div>
              <label className="label">Detailed Targeting</label>
              <input className="input" placeholder="Search interests, behaviors, demographics..." />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-6 pt-4 border-t border-[#E5E7EB]">
        <button onClick={() => { handleSave(); onClose() }} className="btn-primary flex items-center gap-2 px-5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          Save
        </button>
        <button onClick={() => { handleSave(); onClose() }} className="px-4 py-2 text-sm font-medium text-gray-600 border border-[#E5E7EB] rounded-lg hover:border-gray-300">Apply to all</button>
        <button className="px-4 py-2 text-sm font-medium text-gray-600 border border-[#E5E7EB] rounded-lg hover:border-gray-300">Apply to other</button>
        <button onClick={onClose} className="ml-auto btn-secondary">Cancel</button>
      </div>
    </Modal>
  )
}

/* ─── Create Ad Modal ────────────────────────────────────────────────────────── */

const CTA_OPTIONS: { value: string; label: string }[] = [
  { value: 'LEARN_MORE', label: 'Learn More' }, { value: 'SHOP_NOW', label: 'Shop Now' },
  { value: 'SIGN_UP', label: 'Sign Up' }, { value: 'DOWNLOAD', label: 'Download' },
  { value: 'GET_QUOTE', label: 'Get Quote' }, { value: 'CONTACT_US', label: 'Contact Us' },
  { value: 'SUBSCRIBE', label: 'Subscribe' }, { value: 'ORDER_NOW', label: 'Order Now' },
  { value: 'WATCH_MORE', label: 'Watch More' }, { value: 'BOOK_TRAVEL', label: 'Book Travel' },
]

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className={clsx('w-10 h-6 rounded-full transition-colors relative flex-shrink-0', value ? 'bg-[#3434ef]' : 'bg-gray-200')}>
      <span className={clsx('absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform', value ? 'left-5' : 'left-1')} />
    </button>
  )
}

function CreateAdModal({ onSave, onClose, pages }: {
  onSave: (a: MetaAd) => void; onClose: () => void; pages: MetaPage[]
}) {
  const [pageId, setPageId] = useState(pages[0]?.id || '')
  const [igAccount, setIgAccount] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [useDisplayLink, setUseDisplayLink] = useState(false)
  const [displayLink, setDisplayLink] = useState('')
  const [format, setFormat] = useState<'SINGLE' | 'COLLECTION'>('SINGLE')
  const [primaryTexts, setPrimaryTexts] = useState([''])
  const [headlines, setHeadlines] = useState([''])
  const [description, setDescription] = useState('')
  const [cta, setCta] = useState('LEARN_MORE')
  const [partnershipAd, setPartnershipAd] = useState(false)

  function handleSave() {
    onSave({
      id: `new_${Date.now()}`,
      name: `Ad — ${primaryTexts[0]?.slice(0, 30) || 'Nouveau'}`,
      adset_id: '',
      _parsed: {
        primary_text: primaryTexts.filter(Boolean)[0] || '',
        headline: headlines.filter(Boolean)[0] || '',
        description, cta_type: cta,
        destination_url: websiteUrl, thumbnail: null,
      },
      _isNew: true,
      _pageId: pageId,
    })
    toast.success('Configuration ad enregistrée')
  }

  return (
    <Modal title="Configurer l'annonce" onClose={onClose} wide>
      {/* Tabs */}
      <div className="flex border-b border-[#E5E7EB] mb-5 -mx-5 px-5 gap-1">
        {['Create New', 'Select from Meta', 'Select Template'].map((t, i) => (
          <button key={t} className={clsx('pb-2.5 px-3 text-xs font-medium border-b-2 -mb-px transition-all', i === 0 ? 'border-[#3434ef] text-[#3434ef]' : 'border-transparent text-gray-400 hover:text-gray-600')}>{t}</button>
        ))}
        <button className="pb-2.5 px-3 text-xs font-medium text-gray-400 border-b-2 border-transparent -mb-px ml-auto flex items-center gap-1.5 hover:text-[#3434ef]">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          Generate AI
        </button>
      </div>

      <div className="space-y-6">
        {/* IDENTITY */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Identity</p>
          <div>
            <label className="label">Facebook Page <span className="text-red-500">*</span></label>
            {pages.length > 0
              ? <select className="select" value={pageId} onChange={e => setPageId(e.target.value)}>{pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              : <input className="input" placeholder="Nom de la Page Facebook" value={pageId} onChange={e => setPageId(e.target.value)} />
            }
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Instagram Account</label>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span><input className="input pl-7" placeholder="compte instagram" value={igAccount} onChange={e => setIgAccount(e.target.value)} /></div>
            </div>
            <div>
              <label className="label">Threads</label>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span><input className="input pl-7" placeholder="profil threads" /></div>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 border border-[#E5E7EB] rounded-xl">
            <span className="text-sm text-[#0d0d12]">Partnership Ad</span>
            <Toggle value={partnershipAd} onChange={setPartnershipAd} />
          </div>
        </div>

        {/* DESTINATION */}
        <div className="space-y-3 pt-3 border-t border-[#F3F4F6]">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Destination</p>
          <div>
            <label className="label">Website URL <span className="text-red-500">*</span></label>
            <input className="input" placeholder="https://www.example.com/" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} />
          </div>
          <div className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-[#0d0d12]">Use a display link</span>
            <Toggle value={useDisplayLink} onChange={setUseDisplayLink} />
          </div>
          {useDisplayLink && (
            <div>
              <label className="label">Display Link</label>
              <input className="input" placeholder="www.example.com" value={displayLink} onChange={e => setDisplayLink(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Shown instead of the full URL in your ad</p>
            </div>
          )}
        </div>

        {/* AD CREATIVE */}
        <div className="space-y-4 pt-3 border-t border-[#F3F4F6]">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Ad Creative</p>

          <div>
            <label className="label">Ad format</label>
            <p className="text-xs text-gray-400 mb-2">Collection uses a hero image plus product tiles from your catalog. Default runs a single-media ad.</p>
            <div className="flex gap-4">
              {[{ id: 'SINGLE' as const, label: 'Single media' }, { id: 'COLLECTION' as const, label: 'Collection' }].map(f => (
                <label key={f.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="format" checked={format === f.id} onChange={() => setFormat(f.id)} className="accent-[#3434ef]" />
                  <span className="text-sm text-[#0d0d12]">{f.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Primary Texts */}
          <div>
            <label className="label">Primary Text <span className="text-red-500">*</span> <span className="text-gray-400 font-normal">({primaryTexts.length}/5)</span></label>
            <div className="space-y-2">
              {primaryTexts.map((t, i) => (
                <div key={i} className="relative">
                  <textarea className="input resize-none pr-8" rows={3} placeholder="Votre texte principal..." value={t}
                    onChange={e => setPrimaryTexts(prev => prev.map((x, j) => j === i ? e.target.value : x))} />
                  {primaryTexts.length > 1 && <button onClick={() => setPrimaryTexts(prev => prev.filter((_, j) => j !== i))} className="absolute top-2 right-2 w-5 h-5 text-gray-400 hover:text-red-500">×</button>}
                </div>
              ))}
              {primaryTexts.length < 5 && (
                <button onClick={() => setPrimaryTexts(prev => [...prev, ''])} className="text-xs text-[#3434ef] hover:underline flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add another primary text
                </button>
              )}
            </div>
          </div>

          {/* Headlines */}
          <div>
            <label className="label">Headline <span className="text-red-500">*</span> <span className="text-gray-400 font-normal">({headlines.length}/5)</span></label>
            <div className="space-y-2">
              {headlines.map((h, i) => (
                <div key={i} className="relative">
                  <input className="input pr-16" placeholder="Titre de l'annonce..." value={h}
                    onChange={e => setHeadlines(prev => prev.map((x, j) => j === i ? e.target.value : x))} />
                  <span className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-gray-400">{h.length}/40</span>
                  {headlines.length > 1 && <button onClick={() => setHeadlines(prev => prev.filter((_, j) => j !== i))} className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 hover:text-red-500">×</button>}
                </div>
              ))}
              {headlines.length < 5 && (
                <button onClick={() => setHeadlines(prev => [...prev, ''])} className="text-xs text-[#3434ef] hover:underline flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add another headline
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <input className="input" placeholder="Description courte..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <div>
            <label className="label">Call to Action</label>
            <select className="select" value={cta} onChange={e => setCta(e.target.value)}>
              {CTA_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-6 pt-4 border-t border-[#E5E7EB]">
        <button onClick={() => { handleSave(); onClose() }} className="btn-primary flex items-center gap-2 px-5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          Save
        </button>
        <button onClick={() => { handleSave(); onClose() }} className="px-4 py-2 text-sm font-medium text-gray-600 border border-[#E5E7EB] rounded-lg hover:border-gray-300">Apply to all</button>
        <button className="px-4 py-2 text-sm font-medium text-gray-600 border border-[#E5E7EB] rounded-lg hover:border-gray-300">Apply to adset</button>
        <button className="px-4 py-2 text-sm font-medium text-gray-600 border border-[#E5E7EB] rounded-lg hover:border-gray-300">Import to other</button>
        <button onClick={onClose} className="ml-auto btn-secondary">Cancel</button>
      </div>
    </Modal>
  )
}

/* ─── Step constants ─────────────────────────────────────────────────────────── */

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
const LAUNCH_STATUSES: { id: LaunchStatus; label: string }[] = [
  { id: 'SCHEDULED_PAUSED', label: 'Scheduled & Paused' },
  { id: 'SCHEDULED_LIVE', label: 'Scheduled & Live' },
  { id: 'CREATED_PAUSED', label: 'Created Paused' },
  { id: 'LIVE_NOW', label: 'Live Now' },
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

  const [testStructure, setTestStructure] = useState<TestStructure>('one-ad-one-adset')
  const [launchStatus, setLaunchStatus] = useState<LaunchStatus>('SCHEDULED_PAUSED')
  const [launchDate, setLaunchDate] = useState('')
  const [launchTime, setLaunchTime] = useState('06:00')
  const [campaignBudget, setCampaignBudget] = useState('50')
  const [prefixOpen, setPrefixOpen] = useState(false)
  const [adsetPrefix, setAdsetPrefix] = useState('')
  const [adsetSuffix, setAdsetSuffix] = useState('')

  const [selectedCampaign, setSelectedCampaign] = useState<MetaCampaign | null>(null)
  const [adsetTemplate, setAdsetTemplate] = useState<MetaAdset | null>(null)
  const [adTemplate, setAdTemplate] = useState<MetaAd | null>(null)

  // Selection modals
  const [campaignModal, setCampaignModal] = useState(false)
  const [adsetModal, setAdsetModal] = useState(false)
  const [adModal, setAdModal] = useState(false)

  // Creation modals
  const [createCampaignModal, setCreateCampaignModal] = useState(false)
  const [createAdsetModal, setCreateAdsetModal] = useState(false)
  const [createAdModal, setCreateAdModal] = useState(false)

  const [metaCampaigns, setMetaCampaigns] = useState<MetaCampaign[]>([])
  const [metaAdsets, setMetaAdsets] = useState<MetaAdset[]>([])
  const [metaAds, setMetaAds] = useState<MetaAd[]>([])
  const [metaAdsError, setMetaAdsError] = useState<string | null>(null)
  const [metaPages, setMetaPages] = useState<MetaPage[]>([])
  const [metaPixels, setMetaPixels] = useState<MetaPixel[]>([])
  const [metaAudiences, setMetaAudiences] = useState<MetaAudience[]>([])
  const [loadingMeta, setLoadingMeta] = useState(false)

  const [launching, setLaunching] = useState(false)
  const [launched, setLaunched] = useState(false)
  const [confetti, setConfetti] = useState(false)
  const [journal, setJournal] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const metaId = selectedAccount?.metaAccountId || selectedAccount?.id || ''
  const isCBO = selectedCampaign?.budget_rebalance_flag ?? false

  async function fetchCampaigns() {
    if (!metaId) return; setLoadingMeta(true)
    try { const r = await fetch(`/api/meta/configure?accountId=${metaId}&type=campaigns`); setMetaCampaigns(await r.json() || []) } catch {}
    setLoadingMeta(false)
  }
  async function fetchAdsets(campaignId?: string) {
    if (!metaId) return; setLoadingMeta(true)
    try { const r = await fetch(`/api/meta/configure?accountId=${metaId}&type=adsets${campaignId ? `&campaignId=${campaignId}` : ''}`); const d = await r.json(); setMetaAdsets(Array.isArray(d) ? d : []) } catch {}
    setLoadingMeta(false)
  }
  async function fetchAds(campaignId?: string, adsetId?: string) {
    if (!metaId) return
    setLoadingMeta(true)
    setMetaAdsError(null)
    setMetaAds([])
    try {
      const params = new URLSearchParams({ accountId: metaId, type: 'ads' })
      if (adsetId) params.set('adsetId', adsetId)
      else if (campaignId) params.set('campaignId', campaignId)
      const r = await fetch(`/api/meta/configure?${params}`)
      const d = await r.json()
      if (Array.isArray(d)) {
        setMetaAds(d)
      } else if (d?._error) {
        setMetaAdsError(d._error)
      }
    } catch (e) {
      setMetaAdsError(e instanceof Error ? e.message : 'Erreur réseau')
    }
    setLoadingMeta(false)
  }
  async function fetchPages() {
    if (!metaId || metaPages.length > 0) return
    try { const r = await fetch(`/api/meta/configure?accountId=${metaId}&type=pages`); const d = await r.json(); setMetaPages(Array.isArray(d) ? d : []) } catch {}
  }
  async function fetchPixels() {
    if (!metaId || metaPixels.length > 0) return
    try { const r = await fetch(`/api/meta/configure?accountId=${metaId}&type=pixels`); const d = await r.json(); setMetaPixels(Array.isArray(d) ? d : []) } catch {}
  }
  async function fetchAudiences() {
    if (!metaId || metaAudiences.length > 0) return
    try { const r = await fetch(`/api/meta/configure?accountId=${metaId}&type=audiences`); const d = await r.json(); setMetaAudiences(Array.isArray(d) ? d : []) } catch {}
  }

  function openCreateAdset() { fetchPixels(); fetchAudiences(); setCreateAdsetModal(true) }
  function openCreateAd() { fetchPages(); setCreateAdModal(true) }

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

  const adGroups = groupByAd(files)

  const treeNodes: { adsetName: string; adGroups: AdGroup[] }[] = (() => {
    if (testStructure === 'one-ad-one-adset') return adGroups.map(g => ({ adsetName: g.adName, adGroups: [g] }))
    if (testStructure === 'one-concept-one-adset') return groups.map(g => ({ adsetName: g.concept, adGroups: groupByAd(g.iterations) }))
    if (testStructure === 'all-in-one') return adGroups.length ? [{ adsetName: 'Adset_1', adGroups }] : []
    return adGroups.length ? [{ adsetName: 'Adset existant', adGroups }] : []
  })()

  const totalAds = adGroups.length
  const adsetConfigured = adsetTemplate !== null
  const adConfigured = adTemplate !== null

  async function simulateLaunch() {
    setLaunching(true); setJournal([])
    const addLog = (msg: string) => setJournal(prev => [...prev, msg])

    // Phase 1: upload image assets to Meta
    const fileHashes = new Map<string, string>() // fileId → hash
    const imageFiles = files.filter(f => f.type === 'image')
    addLog(`[diag] ${files.length} fichier(s) chargé(s) — ${imageFiles.length} image(s), ${files.filter(f => f.type === 'video').length} vidéo(s)`)
    if (imageFiles.length > 0) {
      addLog(`Upload de ${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} vers Meta...`)
      for (const uf of imageFiles) {
        try {
          const fd = new FormData()
          fd.append('file', uf.file)
          fd.append('accountId', metaId)
          const res = await fetch('/api/meta/upload-asset', { method: 'POST', body: fd })
          const data = await res.json()
          if (data.hash) {
            fileHashes.set(uf.id, data.hash)
            addLog(`✓ ${uf.file.name} uploadé`)
          } else {
            addLog(`⚠ ${uf.file.name} : ${data.error || 'upload échoué'}`)
          }
        } catch {
          addLog(`⚠ ${uf.file.name} : erreur réseau`)
        }
      }
    }

    // Phase 2: build enriched treeNodes with hashes
    const enrichedNodes = treeNodes.map(node => ({
      adsetName: node.adsetName,
      adGroups: node.adGroups.map(ag => ({
        adName: ag.adName,
        assets: ag.assets.map(a => ({
          id: a.id, ratio: a.ratio ?? null,
          hash: fileHashes.get(a.id) ?? null,
        })),
      })),
    }))

    // Phase 3: call real Meta launch API
    try {
      const res = await fetch('/api/meta/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: metaId,
          campaign: selectedCampaign,
          adsetTemplate,
          adTemplate,
          treeNodes: enrichedNodes,
          testStructure,
          launchStatus,
          launchDate,
          launchTime,
          budget: campaignBudget,
        }),
      })
      if (!res.body) throw new Error('Réponse vide du serveur')

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = dec.decode(value)
        const lines = text.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          const msg = line.slice(6).trim()
          if (!msg) continue
          addLog(msg)
          if (msg.includes('🎉')) {
            setLaunched(true); setConfetti(true)
            toast.success('Campagne publiée dans Meta !')
            setTimeout(() => setConfetti(false), 5000)
          }
        }
      }
    } catch (err) {
      addLog(`❌ Erreur : ${err instanceof Error ? err.message : String(err)}`)
    }

    setLaunching(false)
  }

  function resetAll() {
    setStep(1); setFiles([]); setGroups([]); setLaunched(false); setJournal([])
    setSelectedCampaign(null); setAdsetTemplate(null); setAdTemplate(null); setConfetti(false)
  }

  const Spinner = () => <div className="flex justify-center py-8"><svg className="animate-spin w-5 h-5 text-[#3434ef]" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <Confetti active={confetti} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Upload de créatifs</h1>
          <p className="page-subtitle mt-0.5">Importez, configurez et lancez vos créatifs Meta Ads</p>
        </div>
        {step === 3 && (
          <div className="flex items-center gap-3">
            {!adsetConfigured && <span className="text-xs text-red-500 font-medium">Paramètres d&apos;adset manquants</span>}
            <button onClick={() => setStep(2)} className="btn-secondary flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Previous
            </button>
            <button onClick={() => setStep(4)} disabled={!adsetConfigured} className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">Continue</button>
          </div>
        )}
      </div>

      {/* Progress */}
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
              {i < STEPS.length - 1 && <div className={clsx('flex-1 h-0.5 mx-3', step > s.id ? 'bg-[#3434ef]' : 'bg-[#E5E7EB]')} />}
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <div className="space-y-4">
          <div className={clsx('drop-zone', dragging && 'active')}
            onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}>
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
                  <p className="text-xs text-[#3434ef]">L&apos;IA va détecter concept / itération / format</p>
                </div>
                <button onClick={goToNomenclature} disabled={aiParsing} className="btn-primary flex items-center gap-2 whitespace-nowrap">
                  {aiParsing ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyse...</> : 'Nomenclature IA →'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* STEP 2 */}
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
                    <input className="flex-1 text-sm font-semibold text-[#0d0d12] bg-transparent border-0 outline-none focus:bg-[#f8f9fc] focus:px-2 rounded"
                      value={g.concept} onChange={e => renameConcept(g.concept, e.target.value)} />
                    <span className="badge-blue">{g.iterations.length} créatif{g.iterations.length > 1 ? 's' : ''}</span>
                  </div>
                  {g.iterations.map(f => (
                    <div key={f.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[#f8f9fc]">
                      {f.type === 'image'
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={f.preview} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                        : <div className="w-8 h-8 bg-gray-200 rounded flex-shrink-0 flex items-center justify-center"><svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg></div>
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
                  <input className="input py-1 text-xs" value={f.concept} onChange={e => updateFileField(f.id, 'concept', e.target.value)} />
                  <input className="input py-1 text-xs" value={f.iteration} onChange={e => updateFileField(f.id, 'iteration', e.target.value)} />
                  <input className="input py-1 text-xs" value={f.format} onChange={e => updateFileField(f.id, 'format', e.target.value)} />
                </div>
              ))}
            </div>
          )}
          {nomenclatureMode === 'bulk' && (
            <div className="card space-y-3">
              <p className="text-xs text-gray-500">Collez les noms (un par ligne) :</p>
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

      {/* STEP 3 */}
      {step === 3 && (
        <div className="flex gap-0 border border-[#E5E7EB] rounded-xl overflow-hidden bg-white min-h-[600px]">
          {/* LEFT */}
          <div className="w-60 border-r border-[#E5E7EB] p-4 space-y-5 flex-shrink-0">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#0d0d12] uppercase tracking-wider">Upload Structure</p>
              <div className="grid grid-cols-2 gap-1.5">
                {TEST_STRUCTURES.map(s => (
                  <button key={s.id} onClick={() => setTestStructure(s.id)}
                    className={clsx('text-left p-2.5 rounded-lg border transition-all', testStructure === s.id ? 'border-[#3434ef] bg-[#f0f0ff]' : 'border-[#E5E7EB] hover:border-gray-300')}>
                    <p className={clsx('text-xs font-semibold leading-tight', testStructure === s.id ? 'text-[#3434ef]' : 'text-[#0d0d12]')}>{s.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-tight">{s.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#0d0d12] uppercase tracking-wider">Budget & Schedule</p>
              {isCBO && <div className="text-xs text-[#3434ef] bg-[#f0f0ff] rounded-lg p-2.5">Budget géré au niveau campagne (CBO)</div>}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Daily budget (€)</label>
                <input className={clsx('input py-1.5 text-sm', isCBO && 'opacity-40 pointer-events-none')}
                  value={isCBO ? 'CBO' : campaignBudget} onChange={e => setCampaignBudget(e.target.value)} disabled={isCBO} />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#0d0d12] uppercase tracking-wider">Launch Status</p>
              <div className="grid grid-cols-2 gap-1.5">
                {LAUNCH_STATUSES.map(s => (
                  <button key={s.id} onClick={() => setLaunchStatus(s.id)}
                    className={clsx('text-left p-2.5 rounded-lg border transition-all', launchStatus === s.id ? 'border-[#3434ef] bg-[#f0f0ff]' : 'border-[#E5E7EB] hover:border-gray-300')}>
                    <p className={clsx('text-xs font-semibold leading-tight', launchStatus === s.id ? 'text-[#3434ef]' : 'text-[#0d0d12]')}>{s.label}</p>
                  </button>
                ))}
              </div>
              {(launchStatus === 'SCHEDULED_PAUSED' || launchStatus === 'SCHEDULED_LIVE') && (
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500 mb-1 block">Date</label><input type="date" className="input py-1.5 text-xs" value={launchDate} onChange={e => setLaunchDate(e.target.value)} /></div>
                  <div><label className="text-xs text-gray-500 mb-1 block">Heure</label><input type="time" className="input py-1.5 text-xs" value={launchTime} onChange={e => setLaunchTime(e.target.value)} /></div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex-1 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#0d0d12] uppercase tracking-wider">Campaign Structure</p>
              <a href="/creative-strategist" target="_blank" className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                Copywriting Agent
              </a>
            </div>

            {/* Campaign row */}
            <div className="border border-[#E5E7EB] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                {selectedCampaign ? (
                  <>
                    <span className="text-sm font-medium text-[#0d0d12] flex-1 truncate">{selectedCampaign.name}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {selectedCampaign._isNew && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">Nouvelle</span>}
                      {selectedCampaign.budget_rebalance_flag && <span className="badge-blue text-xs">CBO</span>}
                      <span className="badge-blue text-xs">{badgeObjective(selectedCampaign.objective)}</span>
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium border', selectedCampaign.status === 'ACTIVE' ? 'text-green-700 bg-green-50 border-green-200' : 'text-gray-600 bg-gray-50 border-gray-200')}>{selectedCampaign.status}</span>
                    </div>
                  </>
                ) : (
                  <span className="text-sm text-gray-400 flex-1">Aucune campagne sélectionnée</span>
                )}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => { setCampaignModal(true); fetchCampaigns() }} className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                    {selectedCampaign ? 'Change' : 'Select'}
                  </button>
                  <button onClick={() => setCreateCampaignModal(true)} className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Créer
                  </button>
                </div>
              </div>

              {/* Quick Bulk Edit */}
              <div className="border-t border-[#F3F4F6] pt-3 space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Quick Bulk Edit</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-24 flex-shrink-0">Adset params :</span>
                  <button onClick={() => { setAdsetModal(true); fetchAdsets(selectedCampaign?.id) }} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg hover:border-[#3434ef] hover:text-[#3434ef] hover:bg-[#f0f0ff] transition-all">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                    Select from Meta
                  </button>
                  <button onClick={openCreateAdset} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg hover:border-[#3434ef] hover:text-[#3434ef] hover:bg-[#f0f0ff] transition-all">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    New
                  </button>
                  {adsetConfigured && <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>{treeNodes.length}/{treeNodes.length} ok</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-24 flex-shrink-0">Ad params :</span>
                  <button onClick={() => { setAdModal(true); fetchAds(selectedCampaign?.id, (!adsetTemplate?._isNew && adsetTemplate?.id) ? adsetTemplate.id : undefined) }} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg hover:border-[#3434ef] hover:text-[#3434ef] hover:bg-[#f0f0ff] transition-all">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                    Select from Meta
                  </button>
                  <button onClick={openCreateAd} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg hover:border-[#3434ef] hover:text-[#3434ef] hover:bg-[#f0f0ff] transition-all">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    New
                  </button>
                  {adConfigured && <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>{totalAds}/{totalAds} ok</span>}
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
                    <div><label className="text-xs text-gray-500 mb-1 block">Préfixe</label><input className="input py-1.5 text-xs" placeholder="[TEST]_" value={adsetPrefix} onChange={e => setAdsetPrefix(e.target.value)} /></div>
                    <div><label className="text-xs text-gray-500 mb-1 block">Suffixe</label><input className="input py-1.5 text-xs" placeholder="_2025" value={adsetSuffix} onChange={e => setAdsetSuffix(e.target.value)} /></div>
                  </div>
                )}
              </div>
            </div>

            {/* Tree */}
            {treeNodes.length > 0 && (
              <div className="border border-[#E5E7EB] rounded-xl overflow-hidden">
                {treeNodes.map((node, ni) => (
                  <div key={ni} className="border-b border-[#F3F4F6] last:border-0">
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-[#fafafa]">
                      <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      <span className="text-xs font-medium text-[#0d0d12] flex-1 truncate">{adsetPrefix}{node.adsetName}{adsetSuffix}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isCBO && <span className="badge-blue text-xs">CBO</span>}
                        <span className="text-xs text-gray-400">{node.adGroups.length} ad{node.adGroups.length > 1 ? 's' : ''}</span>
                        <button onClick={openCreateAdset} className={clsx('flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all', adsetConfigured ? 'border-green-200 bg-green-50 text-green-700' : 'border-orange-200 bg-orange-50 text-orange-600')}>
                          {adsetConfigured ? <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>Adset params</> : <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Adset params</>}
                        </button>
                      </div>
                    </div>
                    {node.adGroups.map((ag, ai) => (
                      <div key={ai} className="flex items-center gap-3 px-4 py-2.5 pl-10 bg-[#fafafa] border-t border-[#F3F4F6]">
                        {/* Stacked thumbnails for each format asset */}
                        <div className="flex -space-x-2 flex-shrink-0">
                          {ag.assets.slice(0, 3).map((asset, si) => (
                            asset.type === 'image'
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img key={si} src={asset.preview} alt="" className="w-7 h-7 rounded object-cover border-2 border-white" />
                              : <div key={si} className="w-7 h-7 bg-gray-200 rounded border-2 border-white flex items-center justify-center"><svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg></div>
                          ))}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-[#0d0d12] truncate block">{ag.adName}</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            {ag.assets.map((a, fi) => a.ratio && (
                              <span key={fi} className="badge-blue text-xs py-0">{a.ratio}</span>
                            ))}
                            <span className="text-xs text-gray-400">{ag.assets.length} format{ag.assets.length > 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <button onClick={openCreateAd} className={clsx('flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all flex-shrink-0', adConfigured ? 'border-green-200 bg-green-50 text-green-700' : 'border-orange-200 bg-orange-50 text-orange-600')}>
                          {adConfigured
                            ? <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>Ad Params</>
                            : <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Ad Params</>
                          }
                        </button>
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

      {/* STEP 4 */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-[#0d0d12]">Récapitulatif</h3>
            <div className="grid grid-cols-4 gap-3">
              {[{ label: 'Ads', value: totalAds }, { label: 'Adsets', value: treeNodes.length }, { label: 'Assets', value: files.length }, { label: 'Formats', value: [...new Set(files.map(f => f.ratio).filter(Boolean))].length }].map(s => (
                <div key={s.label} className="bg-[#f8f9fc] rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-[#3434ef]">{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {[
                { label: 'Campagne', value: selectedCampaign ? `${selectedCampaign._isNew ? '(Nouvelle) ' : ''}${selectedCampaign.name}` : '—' },
                { label: 'Structure', value: TEST_STRUCTURES.find(s => s.id === testStructure)?.label || '' },
                { label: 'Adset template', value: adsetTemplate ? `${adsetTemplate._isNew ? '(Nouveau) ' : ''}${adsetTemplate.name}` : '⚠ Non configuré' },
                { label: 'Ad template', value: adTemplate ? `${adTemplate._isNew ? '(Nouveau) ' : ''}${adTemplate.name}` : '⚠ Non configuré' },
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
          <div className="card border-amber-200 bg-amber-50 flex gap-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            <p className="text-xs text-amber-700">Le budget sera débité dès la mise en ligne. Vérifiez vos paramètres avant de lancer.</p>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="btn-secondary">← Retour</button>
            <button onClick={() => setStep(5)} className="btn-primary">Lancer →</button>
          </div>
        </div>
      )}

      {/* STEP 5 */}
      {step === 5 && (
        <div className="space-y-4">
          {!launched && !launching && journal.length === 0 && (
            <div className="card text-center py-12">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[#3434ef]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              </div>
              <h3 className="text-lg font-bold text-[#0d0d12] mb-2">Prêt à lancer</h3>
              <p className="text-sm text-gray-500 mb-6">{totalAds} ad{totalAds > 1 ? 's' : ''} ({files.length} assets) · {treeNodes.length} adset{treeNodes.length > 1 ? 's' : ''} · {LAUNCH_STATUSES.find(s => s.id === launchStatus)?.label}</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setStep(4)} className="btn-secondary">← Retour</button>
                <button onClick={simulateLaunch} className="btn-primary px-8 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  Lancer maintenant
                </button>
              </div>
            </div>
          )}
          {(launching || launched || journal.length > 0) && (
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-[#0d0d12]">Journal de lancement</h3>
              <div className="space-y-2">
                {journal.map((line, i) => (
                  <div key={i} className={clsx('flex items-start gap-2 text-sm', line.startsWith('❌') ? 'text-red-600' : line.startsWith('⚠') ? 'text-amber-600' : 'text-[#0d0d12]')}>
                    {line.startsWith('❌')
                      ? <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      : line.startsWith('⚠')
                        ? <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                        : <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    }
                    {line}
                  </div>
                ))}
                {launching && <div className="flex items-center gap-2 text-sm text-gray-400"><svg className="animate-spin w-4 h-4 text-[#3434ef]" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>En cours...</div>}
              </div>
              {launched && (
                <div className="mt-4 p-5 bg-green-50 border border-green-200 rounded-xl text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p className="text-base font-bold text-green-800 mb-1">Campagne lancée !</p>
                  <div className="flex gap-2 justify-center mt-4">
                    <a href="/dashboard" className="btn-secondary text-xs">Voir le Dashboard</a>
                    <button onClick={resetAll} className="btn-primary text-xs">Nouveau upload</button>
                  </div>
                </div>
              )}
              {!launched && !launching && journal.length > 0 && (
                <div className="mt-4 flex items-center gap-3 pt-3 border-t border-[#F3F4F6]">
                  <button onClick={() => { setJournal([]); simulateLaunch() }} className="btn-primary text-xs flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Réessayer
                  </button>
                  <button onClick={() => setJournal([])} className="btn-secondary text-xs">Annuler</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SELECTION MODALS */}
      {campaignModal && (
        <Modal title="Choisir une campagne Meta" onClose={() => setCampaignModal(false)}>
          {loadingMeta ? <Spinner /> : metaCampaigns.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">Aucune campagne active trouvée</p> : (
            <div className="space-y-1.5">{metaCampaigns.map(c => (
              <button key={c.id} onClick={() => { setSelectedCampaign(c); setCampaignModal(false) }}
                className={clsx('w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 hover:border-[#3434ef] hover:bg-[#f0f0ff]', selectedCampaign?.id === c.id ? 'border-[#3434ef] bg-[#f0f0ff]' : 'border-[#E5E7EB]')}>
                <div className="flex-1 min-w-0"><p className="text-sm font-medium text-[#0d0d12] truncate">{c.name}</p><p className="text-xs text-gray-400 mt-0.5">{badgeObjective(c.objective)}</p></div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {c.budget_rebalance_flag && <span className="badge-blue text-xs">CBO</span>}
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', c.status === 'ACTIVE' ? 'text-green-700 bg-green-50' : 'text-gray-600 bg-gray-100')}>{c.status}</span>
                </div>
              </button>
            ))}</div>
          )}
        </Modal>
      )}

      {adsetModal && (
        <Modal title="Copier la config d'un adset existant" onClose={() => setAdsetModal(false)}>
          <p className="text-xs text-gray-400 mb-3">Sélectionnez un adset pour copier son ciblage, pixel et objectif.</p>
          {loadingMeta ? <Spinner /> : metaAdsets.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">Aucun adset actif trouvé</p> : (
            <div className="space-y-1.5">{metaAdsets.map(a => {
              const countries = (a.targeting?.geo_locations?.countries || []).join(', ')
              const pixel = a.promoted_object?.pixel_id
              return (
                <button key={a.id} onClick={() => { setAdsetTemplate(a); setAdsetModal(false); toast.success(`Config "${a.name}" appliquée`) }}
                  className={clsx('w-full text-left p-3 rounded-xl border transition-all hover:border-[#3434ef] hover:bg-[#f0f0ff]', adsetTemplate?.id === a.id ? 'border-[#3434ef] bg-[#f0f0ff]' : 'border-[#E5E7EB]')}>
                  <p className="text-sm font-medium text-[#0d0d12] truncate">{a.name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {countries && <span className="badge-gray text-xs">{countries}</span>}
                    {a.optimization_goal && <span className="badge-blue text-xs">{a.optimization_goal.replace(/_/g, ' ')}</span>}
                    {pixel && <span className="badge-gray text-xs">Pixel ✓</span>}
                  </div>
                </button>
              )
            })}</div>
          )}
        </Modal>
      )}

      {adModal && (
        <Modal title="Copier la config d'une pub existante" onClose={() => setAdModal(false)}>
          <p className="text-xs text-gray-400 mb-3">Sélectionnez une annonce pour copier texte, titre, CTA et URL.</p>
          {loadingMeta ? <Spinner /> : metaAdsError ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-sm text-red-500 font-medium">Erreur Meta API</p>
              <p className="text-xs text-gray-500 break-all">{metaAdsError}</p>
            </div>
          ) : metaAds.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">Aucune annonce trouvée</p> : (
            <div className="space-y-1.5">{metaAds.map(ad => (
              <button key={ad.id} onClick={() => { setAdTemplate(ad); setAdModal(false); toast.success(`Copies de "${ad.name}" appliquées`) }}
                className={clsx('w-full text-left p-3 rounded-xl border transition-all hover:border-[#3434ef] hover:bg-[#f0f0ff] flex gap-3', adTemplate?.id === ad.id ? 'border-[#3434ef] bg-[#f0f0ff]' : 'border-[#E5E7EB]')}>
                {ad._parsed.thumbnail
                  ? <Image src={ad._parsed.thumbnail} alt="" width={44} height={44} className="w-11 h-11 rounded-lg object-cover flex-shrink-0" unoptimized />
                  : <div className="w-11 h-11 bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center"><svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#0d0d12] truncate">{ad.name}</p>
                  {ad._parsed.primary_text && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ad._parsed.primary_text}</p>}
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {ad._parsed.headline && <span className="badge-gray text-xs truncate max-w-[140px]">{ad._parsed.headline}</span>}
                    {ad._parsed.cta_type && <span className="badge-blue text-xs">{ad._parsed.cta_type.replace(/_/g, ' ')}</span>}
                  </div>
                </div>
              </button>
            ))}</div>
          )}
        </Modal>
      )}

      {/* CREATION MODALS */}
      {createCampaignModal && (
        <CreateCampaignModal
          onSave={c => { setSelectedCampaign(c); setCreateCampaignModal(false) }}
          onClose={() => setCreateCampaignModal(false)}
        />
      )}

      {createAdsetModal && (
        <CreateAdsetModal
          onSave={a => { setAdsetTemplate(a); setCreateAdsetModal(false) }}
          onClose={() => setCreateAdsetModal(false)}
          isCBO={isCBO}
          pixels={metaPixels}
          audiences={metaAudiences}
        />
      )}

      {createAdModal && (
        <CreateAdModal
          onSave={a => { setAdTemplate(a); setCreateAdModal(false) }}
          onClose={() => setCreateAdModal(false)}
          pages={metaPages}
        />
      )}
    </div>
  )
}
