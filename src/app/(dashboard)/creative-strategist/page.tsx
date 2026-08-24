'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '@/lib/store'
import toast from 'react-hot-toast'

const COPY_MODES = [
  { id: 'direct', label: 'Direct Response', desc: 'Copy orientée conversion directe' },
  { id: 'native', label: 'Native Ads', desc: 'Copy naturelle, non-publicitaire' },
  { id: 'tofu', label: 'TOFU — Awareness', desc: 'Capter l\'attention froide' },
  { id: 'mofu', label: 'MOFU — Consideration', desc: 'Nourrir l\'intérêt' },
  { id: 'bofu', label: 'BOFU — Conversion', desc: 'Déclencher l\'achat' },
]

const CTAS = ['En savoir plus', 'Acheter maintenant', 'S\'inscrire', 'Découvrir', 'Essayer gratuitement', 'Commander', 'Obtenir un devis']

/* Schwartz levels, to match the taxonomy used in the account's own copy library
   — TOFU/MOFU/BOFU alone cannot line up with it. */
const AWARENESS = [
  { id: '', label: 'Non précisé' },
  { id: 'unaware', label: 'Unaware — ignore le problème' },
  { id: 'problem', label: 'Problem Aware — ressent le problème' },
  { id: 'solution', label: 'Solution Aware — cherche une solution' },
  { id: 'product', label: 'Product Aware — compare les offres' },
  { id: 'most', label: 'Most Aware — prêt à acheter' },
]

interface Generation {
  id: string
  mode: string
  awareness: string | null
  product: string
  offer: string | null
  result: string
  createdAt: string
}

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
  const [error, setError] = useState('')
  const [awareness, setAwareness] = useState('')
  const [prefilled, setPrefilled] = useState(false)
  const [generations, setGenerations] = useState<Generation[]>([])
  const [openGen, setOpenGen] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Brand Settings already holds the product, audience and positioning — no
  // reason to retype them, differently, on every generation
  useEffect(() => {
    if (!selectedAccount?.id) return
    setPrefilled(false)
    fetch(`/api/brand-settings?dbAccountId=${selectedAccount.id}`)
      .then(r => r.json())
      .then(d => {
        const b = d.settings
        if (!b) return
        let used = false
        setProduct(p => { if (p || !b.productDescription) return p; used = true; return b.productDescription })
        setAudience(a => {
          const v = b.targetPersona || b.targetAudience
          if (a || !v) return a; used = true; return v
        })
        setTone(t => { if (t || !b.marketPositioning) return t; used = true; return b.marketPositioning })
        if (used) setPrefilled(true)
      })
      .catch(() => {})
  }, [selectedAccount?.id])

  const loadGenerations = useCallback(async () => {
    if (!selectedAccount?.id) { setGenerations([]); return }
    const res = await fetch(`/api/copy-generations?dbAccountId=${selectedAccount.id}`)
    const data = await res.json()
    setGenerations(data.generations || [])
  }, [selectedAccount?.id])

  useEffect(() => { loadGenerations() }, [loadGenerations])

  async function removeGeneration(id: string) {
    await fetch(`/api/copy-generations?id=${id}`, { method: 'DELETE' })
    setGenerations(g => g.filter(x => x.id !== id))
  }

  async function generate() {
    if (!product) return
    setLoading(true)
    setResult(null)
    setRawStream('')
    setError('')

    const awarenessLabel = AWARENESS.find(a => a.id === awareness)?.label

    const prompt = `Tu es un copywriter publicitaire Meta Ads. Écris des copies prêtes à diffuser.

## Brief
Mode : ${COPY_MODES.find(m => m.id === mode)?.label}
Produit / Service : ${product}
Offre : ${offer || 'Non précisée'}
Audience cible : ${audience || 'Non précisée'}
Ton : ${tone || 'Professionnel et persuasif'}
CTA : ${cta}
${awareness ? `Niveau de conscience visé : ${awarenessLabel}` : ''}
${examples ? `\nExemples fournis par l'utilisateur :\n${examples}` : ''}

## Ce sur quoi tu dois t'appuyer
Les données du compte te sont fournies plus haut. Utilise-les vraiment :
- **Le champ _copy des publicités** contient le texte réel actuellement diffusé, avec ses résultats dans _computed. Repère les accroches qui obtiennent le meilleur coût par résultat et décline ce qui fonctionne — ne pars pas d'une page blanche.
- **Le référentiel créatif du compte**, s'il est présent, fixe le style et la taxonomie. Tes textes doivent pouvoir s'y insérer sans détonner.
- **Les Brand Settings** donnent le positionnement, la proposition de valeur et les objections connues. Réponds aux objections dans le corps du texte.

N'invente aucun chiffre, aucune promesse et aucun élément de preuve qui ne figure pas dans ces données.
${awareness ? `Chaque texte doit s'adresser à une audience « ${awarenessLabel} » — ni plus avancée, ni moins.` : ''}

## Sortie
Exactement ${nbPrimary} Primary Texts (125 caractères max), ${nbHeadline} Headlines (40 caractères max) et 2 Descriptions (25 caractères max).
Varie les angles entre les propositions : elles ne doivent pas être des reformulations les unes des autres.

Réponds UNIQUEMENT avec ce JSON, sans texte ni balises autour :
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
          // Pulls in the real ad copy and the account's Notion library, and
          // routes to the reasoning model — writing in a constrained style
          // against performance data is not a quick-recall task
          agentRole: 'copywriter',
          deep: true,
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

      // Take the outermost object and strip any fence — a truncated stream
      // otherwise fails silently and leaves a blank panel
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
      const start = cleaned.indexOf('{')
      const end = cleaned.lastIndexOf('}')
      let parsed: GeneratedCopy | null = null
      if (start !== -1 && end > start) {
        try { parsed = JSON.parse(cleaned.slice(start, end + 1)) } catch { parsed = null }
      }

      if (!parsed?.primary_texts?.length) {
        setError("La réponse de l'IA n'a pas pu être lue. Relancez la génération.")
      } else {
        setResult(parsed)
        // Kept here rather than in the reports history, which is for reports
        const saved = await fetch('/api/copy-generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dbAccountId: selectedAccount?.id, mode, awareness, product,
            offer, audience, tone, cta, result: JSON.stringify(parsed),
          }),
        }).then(r => r.json()).catch(() => null)
        if (saved?.generation) setGenerations(g => [saved.generation, ...g])
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setError('La génération a échoué. Réessayez.')
    }
    setLoading(false)
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    toast.success('Copié !')
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="page-title">Creative Strategist</h1>
        <p className="page-subtitle mt-0.5">
          Génération de copies publicitaires, ancrée sur vos créas en cours et votre référentiel
        </p>
      </div>

      {prefilled && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 flex items-center gap-2.5">
          <svg className="w-4 h-4 text-[#3434ef] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <p className="text-xs text-[#1e3a8a]">
            Brief pré-rempli depuis vos <strong>Brand Settings</strong> — modifiez librement, rien n&apos;est écrasé.
          </p>
        </div>
      )}

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

          {/* Générations précédentes — gardées ici, pas dans l'Historique des rapports */}
          {generations.length > 0 && (
            <div className="card space-y-2">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Générations ({generations.length})
              </h2>
              <div className="space-y-1 max-h-[340px] overflow-y-auto -mx-1 px-1">
                {generations.map((g) => {
                  const open = openGen === g.id
                  let saved: GeneratedCopy | null = null
                  try { saved = JSON.parse(g.result) } catch { saved = null }
                  return (
                    <div key={g.id} className="border border-[#E5E7EB] rounded-lg overflow-hidden">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setOpenGen(open ? null : g.id)}
                          className="flex-1 text-left px-2.5 py-2 hover:bg-[#f8f9fc] transition-colors min-w-0"
                        >
                          <p className="text-xs font-medium text-[#0d0d12] truncate">{g.product}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {COPY_MODES.find(m => m.id === g.mode)?.label || g.mode}
                            {' · '}
                            {new Date(g.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </button>
                        <button
                          onClick={() => removeGeneration(g.id)}
                          title="Supprimer"
                          className="p-1.5 mr-1 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </div>
                      {open && saved && (
                        <div className="border-t border-[#E5E7EB] px-2.5 py-2 space-y-2 bg-[#f8f9fc]">
                          {([
                            ['Primary', saved.primary_texts],
                            ['Headlines', saved.headlines],
                            ['Descriptions', saved.descriptions],
                          ] as [string, string[]][]).map(([label, list]) => (
                            list?.length ? (
                              <div key={label}>
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                                {list.map((t, i) => (
                                  <button
                                    key={i}
                                    onClick={() => copy(t)}
                                    title="Copier"
                                    className="w-full text-left text-[11px] text-gray-600 leading-snug py-1 hover:text-[#3434ef] transition-colors"
                                  >
                                    {t}
                                  </button>
                                ))}
                              </div>
                            ) : null
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Call to Action</label>
                <select className="select" value={cta} onChange={e => setCta(e.target.value)}>
                  {CTAS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Niveau de conscience</label>
                <select className="select" value={awareness} onChange={e => setAwareness(e.target.value)}>
                  {AWARENESS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Exemples de référence (optionnel)</label>
              <textarea className="input resize-none" rows={3} placeholder="Ponctuellement, une copie précise à imiter…" value={examples} onChange={e => setExamples(e.target.value)} />
              <p className="text-[11px] text-gray-400 mt-1">
                Inutile de recoller votre bibliothèque : le référentiel Notion synchronisé dans Brand Settings est déjà transmis.
              </p>
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
          {error && (
            <div className="card border-red-200 bg-red-50">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

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
