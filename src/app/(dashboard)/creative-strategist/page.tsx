'use client'
import { useState, useRef } from 'react'
import { useStore } from '@/lib/store'

const COPY_MODES = [
  { id: 'direct', label: 'Direct Response', desc: 'Copy orientée conversion directe' },
  { id: 'native', label: 'Native Ads', desc: 'Copy naturelle, non-publicitaire' },
  { id: 'tofu', label: 'TOFU — Awareness', desc: 'Capter l\'attention froide' },
  { id: 'mofu', label: 'MOFU — Consideration', desc: 'Nourrir l\'intérêt' },
  { id: 'bofu', label: 'BOFU — Conversion', desc: 'Déclencher l\'achat' },
]

const CTAS = ['En savoir plus', 'Acheter maintenant', 'S\'inscrire', 'Découvrir', 'Essayer gratuitement', 'Commander', 'Obtenir un devis']

interface GeneratedCopy {
  primary_texts: string[]
  headlines: string[]
  descriptions: string[]
}

export default function CreativeStrategistPage() {
  const { selectedAccount } = useStore()
  const [mode, setMode] = useState('direct')
  const [product, setProduct] = useState('')
  const [offer, setOffer] = useState('')
  const [audience, setAudience] = useState('')
  const [tone, setTone] = useState('')
  const [cta, setCta] = useState('En savoir plus')
  const [nbPrimary, setNbPrimary] = useState(3)
  const [nbHeadline, setNbHeadline] = useState(3)
  const [examples, setExamples] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GeneratedCopy | null>(null)
  const [rawStream, setRawStream] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  async function generate() {
    if (!product) return
    setLoading(true)
    setResult(null)
    setRawStream('')

    const prompt = `Tu es un expert en copywriting publicitaire Meta Ads. Génère des copies publicitaires de haute qualité.

Mode : ${COPY_MODES.find(m => m.id === mode)?.label}
Produit/Service : ${product}
Offre : ${offer || 'Non précisé'}
Audience cible : ${audience || 'Non précisée'}
Ton : ${tone || 'Professionnel et persuasif'}
CTA : ${cta}
${examples ? `\nExemples de référence :\n${examples}` : ''}

Génère exactement ${nbPrimary} Primary Texts (accroche principale, 125 caractères max), ${nbHeadline} Headlines (titre court, 40 caractères max), et 2 Descriptions (25 caractères max).

Réponds UNIQUEMENT avec ce JSON (pas de texte avant ou après) :
{
  "primary_texts": ["...", "...", "..."],
  "headlines": ["...", "...", "..."],
  "descriptions": ["...", "..."]
}`

    abortRef.current = new AbortController()
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: (selectedAccount?.metaAccountId || selectedAccount?.id || 'none'),
          dbAccountId: selectedAccount?.id || null,
          category: 'creative',
          analysisType: 'copy',
          customPrompt: prompt,
        }),
        signal: abortRef.current.signal,
      })

      let text = ''
      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += dec.decode(value)
        setRawStream(text)
      }

      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          setResult(JSON.parse(jsonMatch[0]))
        } catch {
          setResult(null)
        }
      }
    } catch {}
    setLoading(false)
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="page-title">Creative Strategist</h1>
        <p className="page-subtitle mt-0.5">Génération de copies publicitaires par IA</p>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Config panel */}
        <div className="col-span-1 space-y-4">
          {/* Mode */}
          <div className="card space-y-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mode</h2>
            <div className="space-y-1.5">
              {COPY_MODES.map(m => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all ${
                    mode === m.id ? 'border-[#3434ef] bg-[#f0f0ff]' : 'border-[#E5E7EB] hover:border-gray-300'
                  }`}
                >
                  <p className={`font-medium ${mode === m.id ? 'text-[#3434ef]' : 'text-[#0d0d12]'}`}>{m.label}</p>
                  <p className="text-gray-400 mt-0.5">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Quantities */}
          <div className="card space-y-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantités</h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-600">Primary Texts</label>
                <div className="flex items-center gap-1">
                  <button onClick={() => setNbPrimary(Math.max(1, nbPrimary - 1))} className="w-6 h-6 rounded border border-[#E5E7EB] text-gray-500 hover:border-gray-400 text-sm">-</button>
                  <span className="w-6 text-center text-sm font-medium">{nbPrimary}</span>
                  <button onClick={() => setNbPrimary(Math.min(5, nbPrimary + 1))} className="w-6 h-6 rounded border border-[#E5E7EB] text-gray-500 hover:border-gray-400 text-sm">+</button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-600">Headlines</label>
                <div className="flex items-center gap-1">
                  <button onClick={() => setNbHeadline(Math.max(1, nbHeadline - 1))} className="w-6 h-6 rounded border border-[#E5E7EB] text-gray-500 hover:border-gray-400 text-sm">-</button>
                  <span className="w-6 text-center text-sm font-medium">{nbHeadline}</span>
                  <button onClick={() => setNbHeadline(Math.min(5, nbHeadline + 1))} className="w-6 h-6 rounded border border-[#E5E7EB] text-gray-500 hover:border-gray-400 text-sm">+</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main form + output */}
        <div className="col-span-2 space-y-4">
          <div className="card space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Brief</h2>
            <div>
              <label className="label">Produit / Service <span className="text-red-500">*</span></label>
              <input className="input" placeholder="ex: Chaussures de running haut de gamme" value={product} onChange={e => setProduct(e.target.value)} />
            </div>
            <div>
              <label className="label">Offre / Proposition de valeur</label>
              <input className="input" placeholder="ex: -30% ce week-end · Livraison gratuite" value={offer} onChange={e => setOffer(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Audience cible</label>
                <input className="input" placeholder="ex: Femmes 25-45 ans, sportives" value={audience} onChange={e => setAudience(e.target.value)} />
              </div>
              <div>
                <label className="label">Ton de voix</label>
                <input className="input" placeholder="ex: Inspirant, premium, direct" value={tone} onChange={e => setTone(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Call to Action</label>
              <select className="select" value={cta} onChange={e => setCta(e.target.value)}>
                {CTAS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Exemples de référence (optionnel)</label>
              <textarea className="input resize-none" rows={3} placeholder="Collez ici vos meilleures copies existantes pour guider le ton..." value={examples} onChange={e => setExamples(e.target.value)} />
            </div>
            <button
              onClick={generate}
              disabled={loading || !product}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Génération en cours...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Générer les copies IA
                </>
              )}
            </button>
          </div>

          {/* Results */}
          {loading && !result && rawStream && (
            <div className="card">
              <p className="text-xs text-gray-400 mb-2">Génération en cours...</p>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#3434ef] rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {/* Primary Texts */}
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#0d0d12]">Primary Texts</h3>
                  <span className="badge-blue">{result.primary_texts?.length || 0} copies</span>
                </div>
                <div className="space-y-2">
                  {(result.primary_texts || []).map((text, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 bg-[#f8f9fc] rounded-lg group">
                      <p className="text-sm text-[#0d0d12] flex-1 leading-relaxed">{text}</p>
                      <button onClick={() => copy(text)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 rounded">
                        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Headlines */}
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#0d0d12]">Headlines</h3>
                  <span className="badge-blue">{result.headlines?.length || 0} headlines</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {(result.headlines || []).map((h, i) => (
                    <div key={i} className="flex items-center gap-2 p-3 bg-[#f8f9fc] rounded-lg group">
                      <p className="text-sm font-semibold text-[#0d0d12] flex-1">{h}</p>
                      <span className="text-xs text-gray-400 tabular-nums">{h.length}/40</span>
                      <button onClick={() => copy(h)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 rounded">
                        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Descriptions */}
              {result.descriptions && result.descriptions.length > 0 && (
                <div className="card space-y-3">
                  <h3 className="text-sm font-semibold text-[#0d0d12]">Descriptions</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {result.descriptions.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 p-3 bg-[#f8f9fc] rounded-lg group">
                        <p className="text-sm text-[#0d0d12] flex-1">{d}</p>
                        <button onClick={() => copy(d)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 rounded">
                          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
