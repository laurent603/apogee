'use client'
import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ComposedChart, Line,
} from 'recharts'

/**
 * Le détail d'une créa : pourquoi elle marche, ou pas.
 *
 * Le tableau dit qu'une créa performe ; ici on voit **d'où** vient la
 * performance. Un coût flatteur porté par un seul placement ou une seule
 * tranche d'âge ne se décline pas comme un coût réparti.
 *
 * Chaque bloc porte son propre sélecteur de métrique, et certains en portent
 * deux : la lecture qui décide n'est pas une métrique isolée mais un
 * croisement — dépense contre reach, CTR contre impressions.
 */

/* ─── Métriques offertes aux sélecteurs ─────────────────────────────────── */

type Unite = 'eur' | 'nb' | 'pct' | 'ratio'
type Choix = { cle: string; label: string; unite: Unite; inverse?: boolean }

const CHOIX: Choix[] = [
  { cle: 'spend', label: 'Dépensé', unite: 'eur' },
  { cle: 'leads', label: 'Leads', unite: 'nb' },
  { cle: 'resultValue', label: 'Résultats', unite: 'nb' },
  { cle: 'cpl', label: 'CPL', unite: 'eur', inverse: true },
  { cle: 'costPerResult', label: 'Coût / résultat', unite: 'eur', inverse: true },
  { cle: 'convRate', label: 'Taux conv. lead', unite: 'pct' },
  { cle: 'reach', label: 'Reach', unite: 'nb' },
  { cle: 'impressions', label: 'Impressions', unite: 'nb' },
  { cle: 'frequency', label: 'Fréquence', unite: 'ratio', inverse: true },
  { cle: 'ctr', label: 'CTR', unite: 'pct' },
  { cle: 'linkClicks', label: 'Clics lien', unite: 'nb' },
  { cle: 'linkCtr', label: 'Link CTR', unite: 'pct' },
  { cle: 'cpc', label: 'CPC', unite: 'eur', inverse: true },
  { cle: 'cpm', label: 'CPM', unite: 'eur', inverse: true },
  { cle: 'hookRate', label: 'Hook rate', unite: 'pct' },
  { cle: 'holdRate', label: 'Hold rate', unite: 'pct' },
  { cle: 'video3s', label: 'Vues vidéo 3s', unite: 'nb' },
]
const PAR_CLE = new Map(CHOIX.map((c) => [c.cle, c]))

const fmt = (v: number | null | undefined, u: Unite) => {
  if (v == null || !Number.isFinite(v)) return '—'
  if (u === 'eur') return `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
  if (u === 'pct') return `${v.toFixed(2)}%`
  if (u === 'ratio') return v.toFixed(2)
  return Math.round(v).toLocaleString('fr-FR')
}

function Selecteur({ valeur, onChange, exclure }: {
  valeur: string; onChange: (v: string) => void; exclure?: string
}) {
  return (
    <select value={valeur} onChange={(e) => onChange(e.target.value)}
      className="text-[11px] border border-[#E5E7EB] rounded-lg px-2 py-1 bg-white text-gray-600 focus:outline-none focus:border-[#3434ef]">
      {CHOIX.filter((c) => c.cle !== exclure).map((c) => (
        <option key={c.cle} value={c.cle}>{c.label}</option>
      ))}
    </select>
  )
}

/** Une baisse de coût est une bonne nouvelle : le sens dépend de la métrique. */
function Var({ v, inverse }: { v: number | null | undefined; inverse?: boolean }) {
  if (v == null || !Number.isFinite(v)) return null
  const bon = inverse ? v < 0 : v > 0
  const neutre = Math.abs(v) < 1
  return (
    <span className={clsx('text-[10px] font-medium tabular-nums ml-1',
      neutre ? 'text-gray-400' : bon ? 'text-emerald-600' : 'text-red-500')}>
      {v > 0 ? '↑' : '↓'}{Math.abs(v).toFixed(0)}%
    </span>
  )
}

/* ─── Aperçu ────────────────────────────────────────────────────────────── */

const FORMATS = [
  { id: 'MOBILE_FEED_STANDARD', label: 'Fil mobile' },
  { id: 'INSTAGRAM_STANDARD', label: 'Instagram' },
  { id: 'INSTAGRAM_STORY', label: 'Story IG' },
  { id: 'INSTAGRAM_REELS', label: 'Reels IG' },
  { id: 'FACEBOOK_STORY_MOBILE', label: 'Story FB' },
  { id: 'FACEBOOK_REELS_MOBILE', label: 'Reels FB' },
  { id: 'DESKTOP_FEED_STANDARD', label: 'Bureau' },
]

function Apercu({ adId }: { adId: string }) {
  const [format, setFormat] = useState(FORMATS[0].id)
  const [src, setSrc] = useState<string | null>(null)
  const [etat, setEtat] = useState<'charge' | 'absent'>('charge')

  useEffect(() => {
    let vivant = true
    setSrc(null); setEtat('charge')
    fetch(`/api/scalr/preview?adId=${adId}&format=${format}`)
      .then((r) => r.json())
      .then((d) => { if (!vivant) return; if (d.src) setSrc(d.src); else setEtat('absent') })
      .catch(() => { if (vivant) setEtat('absent') })
    return () => { vivant = false }
  }, [adId, format])

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex flex-wrap gap-1">
        {FORMATS.map((f) => (
          <button key={f.id} onClick={() => setFormat(f.id)}
            className={clsx('px-2 py-1 rounded-md text-[11px] font-medium border transition-all',
              format === f.id ? 'bg-[#3434ef] text-white border-[#3434ef]' : 'bg-white text-gray-600 border-[#E5E7EB] hover:border-gray-300')}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="bg-[#f8f9fc] rounded-xl border border-[#E5E7EB] overflow-hidden flex-1 min-h-[420px]">
        {src ? (
          <iframe src={src} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin" title="Aperçu de la publicité" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
            {etat === 'absent' ? 'Aucun aperçu pour ce placement' : 'Chargement…'}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Blocs ─────────────────────────────────────────────────────────────── */

type Vent = Record<string, number | null | string | boolean> & { cle: string; fusionne?: boolean }

const TEINTES = ['#3434ef', '#6366f1', '#818cf8', '#a5b4fc', '#22c55e', '#4ade80', '#f59e0b', '#f97316', '#94a3b8']

function Camembert({ data, titre }: { data: Vent[]; titre: string }) {
  const [cle, setCle] = useState('spend')
  const c = PAR_CLE.get(cle)!
  const rows = data.map((d) => ({ cle: d.cle, v: Number(d[cle] ?? 0) })).filter((r) => r.v > 0)
  const total = rows.reduce((s, r) => s + r.v, 0)

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-[#0d0d12]">{titre}</p>
        <Selecteur valeur={cle} onChange={setCle} />
      </div>
      {rows.length ? (
        <>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={rows} dataKey="v" nameKey="cle" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {rows.map((_, i) => <Cell key={i} fill={TEINTES[i % TEINTES.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }}
                formatter={(v: number, n: string) => [`${fmt(v, c.unite)} · ${((v / total) * 100).toFixed(1)}%`, n]} />
              <Legend verticalAlign="bottom" height={36} iconSize={8}
                formatter={(v) => <span className="text-[11px] text-gray-600">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-gray-400 text-center">Total {fmt(total, c.unite)}</p>
        </>
      ) : (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400">Rien à répartir sur cette métrique</div>
      )}
    </div>
  )
}

/** Deux métriques côte à côte : c'est le croisement qui décide, pas l'une des
 *  deux prise seule. */
function BarresDoubles({ data, titre, note, defaut1, defaut2, horizontal }: {
  data: Vent[]; titre: string; note?: string; defaut1: string; defaut2: string; horizontal?: boolean
}) {
  const [a, setA] = useState(defaut1)
  const [b, setB] = useState(defaut2)
  const ca = PAR_CLE.get(a)!, cb = PAR_CLE.get(b)!
  const rows = data.slice(0, 12).map((d) => ({
    cle: d.cle, a: d[a] == null ? null : Number(d[a]), b: d[b] == null ? null : Number(d[b]),
  }))
  const fusion = data.some((d) => d.fusionne) && (a === 'frequency' || b === 'frequency')

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-[#0d0d12]">{titre}</p>
        <div className="flex items-center gap-1">
          <Selecteur valeur={a} onChange={setA} exclure={b} />
          <span className="text-[10px] text-gray-400">vs</span>
          <Selecteur valeur={b} onChange={setB} exclure={a} />
        </div>
      </div>
      {note && <p className="text-[11px] text-gray-400 mb-1">{note}</p>}
      <ResponsiveContainer width="100%" height={horizontal ? Math.max(180, rows.length * 34) : 240}>
        <ComposedChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 4, right: 12, left: horizontal ? 4 : -18, bottom: 0 }}>
          {horizontal ? <>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="cle" width={150} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          </> : <>
            <XAxis dataKey="cle" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
              tickFormatter={(v) => String(v).slice(5)} minTickGap={20} />
            <YAxis yAxisId="g" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="d" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          </>}
          <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }}
            formatter={(v: number, n: string) => [fmt(v, n === ca.label ? ca.unite : cb.unite), n]} />
          <Legend iconSize={8} formatter={(v) => <span className="text-[11px] text-gray-600">{v}</span>} />
          <Bar dataKey="a" name={ca.label} fill="#3434ef" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            barSize={14} {...(horizontal ? {} : { yAxisId: 'g' })} />
          {horizontal
            ? <Bar dataKey="b" name={cb.label} fill="#22c55e" radius={[0, 4, 4, 0]} barSize={14} />
            : <Line type="monotone" dataKey="b" name={cb.label} stroke="#22c55e" strokeWidth={2} dot={false} yAxisId="d" />}
        </ComposedChart>
      </ResponsiveContainer>
      {fusion && (
        <p className="text-[11px] text-amber-600">
          La fréquence n&apos;est pas affichée sur un découpage recomposé : les mêmes personnes y sont comptées plusieurs fois.
        </p>
      )}
    </div>
  )
}

/* ─── Modale ────────────────────────────────────────────────────────────── */

type Detail = {
  ad: { id: string; name: string | null; status: string | null }
  periode: { since: string; until: string }
  global: Record<string, number | string | null> | null
  variations: Record<string, number | null>
  quotidien: Vent[]
  ventilations: { placement: Vent[]; age: Vent[]; ageGenre: Vent[]; genre: Vent[]; appareil: Vent[] }
}

export function DetailCrea({ adId, periode, attribution, decision, format, onClose }: {
  adId: string; periode: string; attribution: string
  decision?: { kind: string; label: string; reason: string }
  format?: string | null
  onClose: () => void
}) {
  const [d, setD] = useState<Detail | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [analyse, setAnalyse] = useState<string | null>(null)
  const [analyseEnCours, setAnalyseEnCours] = useState(false)

  useEffect(() => {
    let vivant = true
    fetch(`/api/scalr/ad-detail?adId=${adId}&periode=${periode}&attribution=${attribution}`)
      .then((r) => r.json())
      .then((j) => { if (!vivant) return; j.error ? setErreur(j.error) : setD(j) })
      .catch(() => { if (vivant) setErreur('Chargement impossible') })
    return () => { vivant = false }
  }, [adId, periode, attribution])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const g = d?.global
  const v = d?.variations || {}

  const kpis = useMemo(() => {
    if (!g) return []
    return ['cpl', 'leads', 'ctr', 'cpm', 'cpc', 'frequency', 'spend', 'impressions']
      .map((k) => PAR_CLE.get(k)!)
      .map((c) => ({ ...c, valeur: g[c.cle] as number | null, variation: v[c.cle] }))
  }, [g, v])

  async function analyser() {
    setAnalyseEnCours(true)
    try {
      const r = await fetch('/api/ai/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'creativeStrategy', analysisType: 'creative_deep_dive',
          agentRole: 'creative_strategist', deep: true,
          customPrompt: `Analyse cette créa en particulier : « ${d?.ad.name} » (id ${adId}).\n\n`
            + `Chiffres de la période ${d?.periode.since} → ${d?.periode.until} :\n${JSON.stringify(g, null, 2)}\n\n`
            + `Répartition par placement :\n${JSON.stringify(d?.ventilations.placement?.slice(0, 8), null, 2)}\n\n`
            + `Répartition par âge :\n${JSON.stringify(d?.ventilations.age, null, 2)}\n\n`
            + `Dis en quoi cette créa fonctionne ou non, sur quel placement et quelle audience elle porte, `
            + `et comment la décliner. Appuie chaque affirmation sur un chiffre ci-dessus.`,
        }),
      })
      const texte = await r.text()
      setAnalyse(texte || 'Aucune réponse.')
    } catch {
      setAnalyse('L’analyse n’a pas pu aboutir.')
    } finally {
      setAnalyseEnCours(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-[80vw] h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête : le verdict d'abord, les chiffres ensuite — ils le justifient */}
        <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-start justify-between gap-4 flex-shrink-0">
          <div className="min-w-0">
            {decision && (
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                  decision.kind === 'cut' ? 'bg-red-50 text-red-700 border-red-200'
                    : decision.kind === 'scale' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : decision.kind === 'iterate' ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-gray-50 text-gray-600 border-gray-200')}>
                  {decision.label}
                </span>
                <span className="text-[11px] text-gray-500">{decision.reason}</span>
              </div>
            )}
            <h2 className="text-base font-semibold text-[#0d0d12] leading-snug truncate">{d?.ad.name || 'Chargement…'}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {format || '—'} · {d?.ad.status === 'ACTIVE' ? 'active' : (d?.ad.status || '—').toLowerCase()}
              {d && <span className="font-mono"> · {d.periode.since} → {d.periode.until}</span>}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 text-lg flex-shrink-0">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {erreur && <div className="py-16 text-center text-sm text-gray-400">{erreur}</div>}

          {!erreur && (
            <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
              <Apercu adId={adId} />

              <div className="space-y-4 min-w-0">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {kpis.map((k) => (
                    <div key={k.cle} className="border border-[#E5E7EB] rounded-xl px-3 py-2.5">
                      <p className="text-base font-bold text-[#0d0d12] tabular-nums leading-tight">
                        {fmt(k.valeur, k.unite)}
                        <Var v={k.variation} inverse={k.inverse} />
                      </p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{k.label}</p>
                    </div>
                  ))}
                  {!kpis.length && [...Array(8)].map((_, i) => (
                    <div key={i} className="border border-[#E5E7EB] rounded-xl h-16 animate-pulse bg-gray-50" />
                  ))}
                </div>

                {/* Vue globale */}
                {g && (
                  <div className="card p-0 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-[#E5E7EB]">
                      <p className="text-sm font-semibold text-[#0d0d12]">Vue globale</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] text-gray-400 uppercase tracking-wider bg-[#f8f9fc]">
                            <th className="px-4 py-2 text-left font-semibold">Élément</th>
                            {['spend', 'leads', 'cpl', 'convRate', 'reach', 'frequency'].map((k) => (
                              <th key={k} className="px-3 py-2 text-right font-semibold">{PAR_CLE.get(k)!.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t border-[#F3F4F6]">
                            <td className="px-4 py-2.5 font-medium text-[#0d0d12] truncate max-w-[280px]">{d?.ad.name}</td>
                            {['spend', 'leads', 'cpl', 'convRate', 'reach', 'frequency'].map((k) => (
                              <td key={k} className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                                {fmt(g[k] as number | null, PAR_CLE.get(k)!.unite)}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {d && (
                  <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
                    <Camembert data={d.ventilations.age} titre="Répartition des métriques · âge" />
                    <BarresDoubles data={d.ventilations.placement} titre="Répartition par placement"
                      note="Là où le budget part, et ce qu'il touche" defaut1="spend" defaut2="reach" horizontal />
                    <BarresDoubles data={d.quotidien} titre="Évolution des métriques"
                      note="Deux échelles : barres à gauche, courbe à droite" defaut1="impressions" defaut2="ctr" />
                    <Camembert data={d.ventilations.appareil} titre="Répartition des métriques · appareil" />
                  </div>
                )}

                {/* Analyse Claude */}
                {d && (
                  <div className="card">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#0d0d12]">Analyser cette créa</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Claude lit les chiffres ci-dessus et dit sur quoi elle porte, et comment la décliner.
                        </p>
                      </div>
                      <button onClick={analyser} disabled={analyseEnCours} className="btn-primary text-sm disabled:opacity-40">
                        {analyseEnCours ? 'Analyse en cours…' : 'Analyser avec Claude →'}
                      </button>
                    </div>
                    {analyse && (
                      <pre className="mt-3 text-xs text-gray-700 whitespace-pre-wrap bg-[#f8f9fc] border border-[#E5E7EB] rounded-lg p-3 max-h-72 overflow-y-auto">
                        {analyse}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
