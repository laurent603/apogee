'use client'
import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts'

/**
 * Le détail d'une créa : pourquoi elle marche, ou pas.
 *
 * Le tableau dit qu'une créa performe ; ici on voit **d'où** vient la
 * performance. Un CPL flatteur porté par un seul placement ou une seule
 * tranche d'âge ne se décline pas de la même façon qu'un CPL réparti.
 */

const FORMATS = [
  { id: 'MOBILE_FEED_STANDARD', label: 'Fil mobile' },
  { id: 'INSTAGRAM_STANDARD', label: 'Instagram' },
  { id: 'INSTAGRAM_STORY', label: 'Story IG' },
  { id: 'INSTAGRAM_REELS', label: 'Reels IG' },
  { id: 'FACEBOOK_STORY_MOBILE', label: 'Story FB' },
  { id: 'FACEBOOK_REELS_MOBILE', label: 'Reels FB' },
  { id: 'DESKTOP_FEED_STANDARD', label: 'Bureau' },
]

type Ventilation = {
  cle: string; spend: number; impressions: number; clicks: number
  resultValue: number; costPerResult: number | null; ctr: number | null
}

type Detail = {
  ad: { id: string; name: string | null; status: string | null }
  periode: { since: string; until: string }
  global: Record<string, number | string | null> | null
  quotidien: { date: string; spend: number; resultValue: number; costPerResult: number | null }[]
  ventilations: { placement: Ventilation[]; age: Ventilation[]; ageGenre: Ventilation[]; appareil: Ventilation[] }
}

const eur = (n: number | null | undefined, d = 2) =>
  n == null ? '—' : `${n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`
const nb = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('fr-FR'))
const pct = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(2)}%`)

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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {FORMATS.map((f) => (
          <button key={f.id} onClick={() => setFormat(f.id)}
            className={clsx('px-2 py-1 rounded-md text-[11px] font-medium border transition-all',
              format === f.id ? 'bg-[#3434ef] text-white border-[#3434ef]' : 'bg-white text-gray-600 border-[#E5E7EB] hover:border-gray-300')}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="bg-[#f8f9fc] rounded-xl border border-[#E5E7EB] overflow-hidden" style={{ height: 560 }}>
        {src ? (
          <iframe src={src} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin"
            title="Aperçu de la publicité" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
            {etat === 'absent' ? 'Aucun aperçu pour ce placement' : 'Chargement…'}
          </div>
        )}
      </div>
    </div>
  )
}

function Graphe({ titre, note, data, cle = 'spend', unite = 'eur' }: {
  titre: string; note?: string; data: Ventilation[]; cle?: string; unite?: 'eur' | 'nb'
}) {
  if (!data.length) return null
  const rows = data.slice(0, 10)
  return (
    <div className="card">
      <p className="text-sm font-semibold text-[#0d0d12]">{titre}</p>
      {note && <p className="text-[11px] text-gray-400 mt-0.5 mb-2">{note}</p>}
      <ResponsiveContainer width="100%" height={Math.max(140, rows.length * 30)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="cle" width={150} tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }}
            formatter={(v: number) => [unite === 'eur' ? eur(v) : nb(v), titre]}
          />
          <Bar dataKey={cle} fill="#3434ef" radius={[0, 4, 4, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function DetailCrea({ adId, periode, attribution, onClose }: {
  adId: string; periode: string; attribution: string; onClose: () => void
}) {
  const [d, setD] = useState<Detail | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let vivant = true
    fetch(`/api/scalr/ad-detail?adId=${adId}&periode=${periode}&attribution=${attribution}`)
      .then((r) => r.json())
      .then((j) => { if (!vivant) return; j.error ? setErreur(j.error) : setD(j) })
      .catch(() => { if (vivant) setErreur('Chargement impossible') })
    return () => { vivant = false }
  }, [adId, periode, attribution])

  // La touche Échap ferme : une modale qui piège l'utilisateur est une faute.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const g = d?.global
  const kpis: [string, string][] = g ? [
    ['Dépense', eur(g.spend as number)],
    [String(g.resultLabel ?? 'Résultats'), nb(g.resultValue as number)],
    ['Coût / rés.', eur(g.costPerResult as number | null)],
    ['CTR', pct(g.ctr as number | null)],
    ['CPM', eur(g.cpm as number | null)],
    ['CPC', eur(g.cpc as number | null)],
    ['Hook rate', pct(g.hookRate as number | null)],
    ['Hold rate', pct(g.holdRate as number | null)],
  ] : []

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[1200px] my-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[#E5E7EB] sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#0d0d12] leading-snug">{d?.ad.name || 'Chargement…'}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5 font-mono">
              ID {adId}{d && ` · ${d.periode.since} → ${d.periode.until}`}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 text-lg flex-shrink-0">×</button>
        </div>

        {erreur && <div className="px-5 py-12 text-center text-sm text-gray-400">{erreur}</div>}

        {!erreur && (
          <div className="p-5 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
            <Apercu adId={adId} />

            <div className="space-y-4 min-w-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {kpis.map(([l, v]) => (
                  <div key={l} className="border border-[#E5E7EB] rounded-xl px-3 py-2.5">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">{l}</p>
                    <p className="text-sm font-bold text-[#0d0d12] tabular-nums mt-0.5">{v}</p>
                  </div>
                ))}
                {!kpis.length && [...Array(8)].map((_, i) => (
                  <div key={i} className="border border-[#E5E7EB] rounded-xl h-16 animate-pulse bg-gray-50" />
                ))}
              </div>

              {d && d.quotidien.length > 1 && (
                <div className="card">
                  <p className="text-sm font-semibold text-[#0d0d12] mb-2">Évolution journalière</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={d.quotidien} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="detSpend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3434ef" stopOpacity={0.16} />
                          <stop offset="95%" stopColor="#3434ef" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false}
                        tickLine={false} tickFormatter={(v) => String(v).slice(5)} minTickGap={24} />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                        tickFormatter={(v) => `${v}€`} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }}
                        formatter={(v: number) => [eur(v), 'Dépense']} />
                      <Area type="monotone" dataKey="spend" stroke="#3434ef" strokeWidth={2} fill="url(#detSpend)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {d && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <Graphe titre="Dépense par placement" data={d.ventilations.placement}
                    note="Là où le budget part réellement" />
                  <Graphe titre="Dépense par tranche d'âge" data={d.ventilations.age}
                    note="Genres additionnés" />
                  <Graphe titre="Dépense par appareil" data={d.ventilations.appareil} />
                  <Graphe titre="Résultats par placement" data={d.ventilations.placement}
                    cle="resultValue" unite="nb" note="À croiser avec la dépense : le placement le plus cher n'est pas toujours le plus productif" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
