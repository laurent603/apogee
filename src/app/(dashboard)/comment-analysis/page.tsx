'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'

interface Comment { message: string; createdTime: string; likeCount: number; author: string }
interface Post { adId: string; adName: string; postId: string | null; thumbnail?: string; comments: Comment[] }

interface Analysis {
  sentiment: { positif: number; neutre: number; negatif: number }
  synthese: string
  pain_points: { theme: string; frequence: string; description: string; exemples: string[] }[]
  signaux_positifs: { theme: string; frequence: string; description: string; exemples: string[] }[]
  objections: { objection: string; frequence: string; reponse_suggeree: string }[]
  angles_creatifs: { angle: string; hook: string; pourquoi: string }[]
  briefs_creation: { type: string; format: string; titre: string; concept: string; script_hook: string; cta: string }[]
}

const FREQ_COLOR: Record<string, string> = {
  haute: 'bg-red-100 text-red-700',
  moyenne: 'bg-amber-100 text-amber-700',
  faible: 'bg-gray-100 text-gray-600',
}

function FreqBadge({ f }: { f: string }) {
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${FREQ_COLOR[f] || 'bg-gray-100 text-gray-600'}`}>
      {f}
    </span>
  )
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="text-[11px] text-[#3434ef] hover:underline shrink-0"
    >
      {copied ? '✓ Copié' : 'Copier'}
    </button>
  )
}

export default function CommentAnalysisPage() {
  const { selectedAccount } = useStore()
  const [step, setStep] = useState<'idle' | 'fetching' | 'analysing' | 'done' | 'error'>('idle')
  const [posts, setPosts] = useState<Post[]>([])
  const [totalComments, setTotalComments] = useState(0)
  const [adsScanned, setAdsScanned] = useState(0)
  const [coverage, setCoverage] = useState({ attributed: 0, silentAds: 0, silentAdsDynamiques: 0 })
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'insights' | 'briefs' | 'comments'>('insights')
  const [rawBuffer, setRawBuffer] = useState('')

  async function run() {
    if (!selectedAccount) return
    setStep('fetching')
    setError('')
    setAnalysis(null)
    setPosts([])
    setRawBuffer('')

    try {
      // Step 1: fetch comments
      const metaId = selectedAccount.metaAccountId || selectedAccount.id
      const res = await fetch(`/api/meta/comments?accountId=${metaId}`)
      if (!res.ok) {
        // Le message de la route porte la cause : la masquer derrière un texte
        // générique a coûté deux allers-retours pour rien.
        const d = await res.json().catch(() => null)
        throw new Error(d?.error
          ? `Récupération des commentaires : ${String(d.error).slice(0, 300)}`
          : `Erreur lors de la récupération des commentaires (HTTP ${res.status})`)
      }
      const data = await res.json()
      setPosts(data.posts)
      setTotalComments(data.totalComments)
      setAdsScanned(data.adsScanned)
      setCoverage({
        attributed: data.attributedComments ?? 0,
        silentAds: data.adsWithUnreadableComments ?? 0,
        silentAdsDynamiques: data.silentAdsDynamiques ?? 0,
      })

      if (data.totalComments === 0) {
        setStep('done')
        return
      }

      // Step 2: stream analysis
      setStep('analysing')
      const analyzeRes = await fetch('/api/ai/comments-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Le compte voyage avec la requête : sans lui, un incident d'analyse
        // remonterait dans les notifications de tous les autres comptes.
        body: JSON.stringify({
          posts: data.posts,
          dbAccountId: selectedAccount.id,
          accountName: selectedAccount.name,
        }),
      })
      if (!analyzeRes.ok) throw new Error("Erreur lors de l'analyse IA")

      const reader = analyzeRes.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        setRawBuffer(buffer)
      }

      // The model sometimes wraps the object in a code fence, and a truncated
      // stream yields a raw "Unterminated string" that means nothing to the user.
      const cleaned = buffer.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
      let parsed: Analysis
      try {
        parsed = JSON.parse(cleaned) as Analysis
      } catch {
        throw new Error(
          "La réponse de l'IA est incomplète et n'a pas pu être lue. Relancez l'analyse — si cela se répète, le compte a trop de commentaires pour un seul passage."
        )
      }
      setAnalysis(parsed)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setStep('error')
    }
  }

  const total = analysis ? analysis.sentiment.positif + analysis.sentiment.neutre + analysis.sentiment.negatif : 0

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Analyse des commentaires</h1>
          <p className="page-subtitle mt-0.5">Transformez les avis clients en angles créatifs et briefs de production</p>
        </div>
        {step === 'done' && analysis && (
          <button onClick={run} className="btn-secondary text-sm shrink-0">
            Relancer l&apos;analyse
          </button>
        )}
      </div>

      {/* No account */}
      {!selectedAccount && (
        <div className="card text-center py-12">
          <p className="text-sm text-gray-400">Sélectionnez un compte publicitaire pour commencer.</p>
        </div>
      )}

      {/* Launch */}
      {selectedAccount && step === 'idle' && (
        <div className="card text-center py-14 space-y-4">
          <div className="w-14 h-14 bg-[#3434ef]/8 rounded-2xl flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 text-[#3434ef]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-[#0d0d12]">Analyser les commentaires de {selectedAccount.name}</p>
            <p className="text-sm text-gray-400 mt-1">L&apos;IA va scanner jusqu&apos;à 100 publicités et analyser tous les commentaires</p>
          </div>
          <button onClick={run} className="btn-primary mx-auto">
            Lancer l&apos;analyse
          </button>
        </div>
      )}

      {/* Loading */}
      {(step === 'fetching' || step === 'analysing') && (
        <div className="card text-center py-14 space-y-4">
          <div className="w-10 h-10 border-2 border-[#3434ef] border-t-transparent rounded-full animate-spin mx-auto" />
          <div>
            <p className="font-semibold text-[#0d0d12]">
              {step === 'fetching' ? 'Récupération des commentaires…' : 'Analyse IA en cours…'}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {step === 'fetching'
                ? 'Scan des publicités du compte'
                : `${totalComments} commentaires analysés par Claude`}
            </p>
            {step === 'analysing' && rawBuffer && (
              <p className="text-xs text-gray-300 mt-3 font-mono max-w-sm mx-auto truncate">{rawBuffer.slice(-80)}</p>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div className="card border border-red-200 bg-red-50 text-center py-10 space-y-3">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button onClick={run} className="btn-primary mx-auto">Réessayer</button>
        </div>
      )}

      {/* No comments */}
      {step === 'done' && totalComments === 0 && (
        <div className="card text-center py-12">
          <p className="font-semibold text-[#0d0d12]">Aucun commentaire trouvé</p>
          <p className="text-sm text-gray-400 mt-1">
            {coverage.silentAds > 0
              ? `${coverage.silentAds} publicités ont reçu des commentaires, mais l'API n'en expose le texte pour aucune.`
              : 'Les publicités du compte n\'ont pas encore de commentaires.'}
          </p>
        </div>
      )}

      {/* Ads that received comments the API will not hand over. The attributed
          figure is not a denominator — it has been seen both above and below the
          readable text — so state the ad count, not a coverage percentage. */}
      {step === 'done' && coverage.silentAds > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.33 16a2 2 0 001.74 3z" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                Analyse incomplète : {coverage.silentAds} publicité{coverage.silentAds > 1 ? 's' : ''} ont des commentaires illisibles
              </p>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                Meta compte des commentaires sur {coverage.silentAds} publicité{coverage.silentAds > 1 ? 's' : ''} dont les publications
                sont vides quand on les interroge{coverage.silentAdsDynamiques
                  ? ` — ${coverage.silentAdsDynamiques} ${coverage.silentAdsDynamiques > 1 ? 'sont' : 'est'} en créa dynamique (Advantage+)`
                  : ''}. Avec la créa dynamique, Meta sert une publication par combinaison
                d&apos;éléments et n&apos;expose aucune d&apos;elles : le Gestionnaire de publicités agrège ces
                commentaires, l&apos;API ne les rend pas. L&apos;analyse porte donc sur {totalComments} commentaire{totalComments > 1 ? 's' : ''} lisible{totalComments > 1 ? 's' : ''}.
                Pour qu&apos;une créa soit analysable, il faut la lancer sans créa dynamique.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {step === 'done' && analysis && (
        <>
          {/* Stats bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card text-center py-5">
              <p className="text-2xl font-bold text-[#0d0d12]">{totalComments}</p>
              <p className="text-xs text-gray-400 mt-0.5">Commentaires analysés</p>
            </div>
            <div className="card text-center py-5">
              <p className="text-2xl font-bold text-[#0d0d12]">{adsScanned}</p>
              <p className="text-xs text-gray-400 mt-0.5">Publicités scannées</p>
            </div>
            <div className="card text-center py-5">
              <p className="text-2xl font-bold text-[#0d0d12]">{analysis.angles_creatifs.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">Angles créatifs identifiés</p>
            </div>
          </div>

          {/* Sentiment bar */}
          <div className="card space-y-3">
            <p className="text-sm font-semibold text-[#0d0d12]">Répartition des sentiments</p>
            <div className="flex h-3 rounded-full overflow-hidden gap-px">
              {total > 0 && (
                <>
                  <div style={{ width: `${(analysis.sentiment.positif / total) * 100}%` }} className="bg-emerald-400" />
                  <div style={{ width: `${(analysis.sentiment.neutre / total) * 100}%` }} className="bg-gray-300" />
                  <div style={{ width: `${(analysis.sentiment.negatif / total) * 100}%` }} className="bg-red-400" />
                </>
              )}
            </div>
            <div className="flex gap-6 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />Positif {analysis.sentiment.positif}%</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" />Neutre {analysis.sentiment.neutre}%</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />Négatif {analysis.sentiment.negatif}%</span>
            </div>
          </div>

          {/* Synthesis */}
          <div className="card bg-[#3434ef]/4 border border-[#3434ef]/15">
            <p className="text-xs font-semibold text-[#3434ef] uppercase tracking-wide mb-2">Synthèse IA</p>
            <p className="text-sm text-[#0d0d12] leading-relaxed">{analysis.synthese}</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-100">
            {([['insights', 'Insights'], ['briefs', 'Briefs de création'], ['comments', 'Commentaires bruts']] as const).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t ? 'border-[#3434ef] text-[#3434ef]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab: Insights */}
          {activeTab === 'insights' && (
            <div className="space-y-6">
              {/* Pain points */}
              {analysis.pain_points.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-[#0d0d12] flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-red-100 flex items-center justify-center text-xs">⚡</span>
                    Pain points prospects
                  </h2>
                  <div className="space-y-2">
                    {analysis.pain_points.map((p, i) => (
                      <div key={i} className="card space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-[#0d0d12]">{p.theme}</p>
                          <FreqBadge f={p.frequence} />
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">{p.description}</p>
                        {p.exemples.length > 0 && (
                          <div className="space-y-1 border-l-2 border-gray-100 pl-3">
                            {p.exemples.map((e, j) => (
                              <p key={j} className="text-xs text-gray-400 italic">&ldquo;{e}&rdquo;</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Positive signals */}
              {analysis.signaux_positifs.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-[#0d0d12] flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-emerald-100 flex items-center justify-center text-xs">✓</span>
                    Signaux positifs
                  </h2>
                  <div className="space-y-2">
                    {analysis.signaux_positifs.map((s, i) => (
                      <div key={i} className="card space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-[#0d0d12]">{s.theme}</p>
                          <FreqBadge f={s.frequence} />
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">{s.description}</p>
                        {s.exemples.length > 0 && (
                          <div className="space-y-1 border-l-2 border-emerald-100 pl-3">
                            {s.exemples.map((e, j) => (
                              <p key={j} className="text-xs text-gray-400 italic">&ldquo;{e}&rdquo;</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Objections */}
              {analysis.objections.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-[#0d0d12] flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-amber-100 flex items-center justify-center text-xs">?</span>
                    Objections &amp; questions
                  </h2>
                  <div className="space-y-2">
                    {analysis.objections.map((o, i) => (
                      <div key={i} className="card space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-[#0d0d12]">{o.objection}</p>
                          <FreqBadge f={o.frequence} />
                        </div>
                        <div className="bg-[#3434ef]/4 rounded-lg px-3 py-2">
                          <p className="text-[11px] text-[#3434ef] font-medium mb-0.5">Réponse suggérée</p>
                          <p className="text-xs text-gray-600 leading-relaxed">{o.reponse_suggeree}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Creative angles */}
              {analysis.angles_creatifs.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-[#0d0d12] flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-[#3434ef]/10 flex items-center justify-center text-xs text-[#3434ef]">→</span>
                    Angles créatifs suggérés
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {analysis.angles_creatifs.map((a, i) => (
                      <div key={i} className="card border border-[#3434ef]/10 space-y-3">
                        <p className="text-sm font-semibold text-[#0d0d12]">{a.angle}</p>
                        <div className="bg-gray-50 rounded-lg px-3 py-2">
                          <p className="text-[11px] text-gray-400 font-medium mb-1 uppercase tracking-wide">Hook</p>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs text-[#0d0d12] font-medium leading-relaxed flex-1">{a.hook}</p>
                            <CopyBtn text={a.hook} />
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed">{a.pourquoi}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Briefs */}
          {activeTab === 'briefs' && (
            <div className="space-y-4">
              {analysis.briefs_creation.length === 0 ? (
                <div className="card text-center py-10">
                  <p className="text-sm text-gray-400">Aucun brief généré.</p>
                </div>
              ) : (
                analysis.briefs_creation.map((b, i) => (
                  <div key={i} className="card space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${b.type === 'video' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {b.type === 'video' ? '▶ Vidéo' : '⬜ Image'}
                        </span>
                        <span className="text-xs text-gray-400 capitalize">{b.format}</span>
                      </div>
                      <CopyBtn text={`BRIEF : ${b.titre}\n\nConcept : ${b.concept}\n\nHook/Script : ${b.script_hook}\n\nCTA : ${b.cta}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#0d0d12]">{b.titre}</p>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{b.concept}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                        {b.type === 'video' ? 'Script / Hook d\'ouverture' : 'Texte principal'}
                      </p>
                      <p className="text-xs text-[#0d0d12] leading-relaxed">{b.script_hook}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">CTA</span>
                      <span className="text-xs font-medium text-[#3434ef]">{b.cta}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab: Raw comments */}
          {activeTab === 'comments' && (
            <div className="space-y-4">
              {posts.map((post) => (
                <div key={post.adId} className="card space-y-3">
                  <div className="flex items-center gap-2">
                    {post.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.thumbnail} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                    )}
                    <div>
                      <p className="text-xs font-semibold text-[#0d0d12] truncate max-w-xs">{post.adName}</p>
                      <p className="text-[11px] text-gray-400">{post.comments.length} commentaire{post.comments.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {post.comments.map((c, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-[10px] font-medium text-gray-500">
                          {c.author.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-medium text-gray-500">{c.author}</span>
                          {c.likeCount > 0 && <span className="text-[11px] text-gray-300 ml-1">· {c.likeCount}❤️</span>}
                          <p className="text-xs text-gray-600 leading-relaxed">{c.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
