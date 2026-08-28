'use client'
import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell,
} from 'recharts'
import { formatMetric, METRIC_BY_KEY } from '@/lib/scalr/metrics'
import {
  construire, libelleCouple, FAMILLES, COUPLE_DEFAUT, ZONES, ORDRE_ZONES,
  type Zone,
} from '@/lib/scalr/fatigue'

/**
 * La matrice de fatigue.
 *
 * Deux axes, deux seuils, quatre quadrants. On y vient avec une hypothèse —
 * « mes créas décrochent-elles quand la fréquence monte ? » — et on déplace
 * les seuils jusqu'à ce que la coupure corresponde à ce qu'on sait du compte.
 *
 * Les seuils partent des médianes : la question est « lesquelles décrochent
 * par rapport aux autres », pas « lesquelles dépassent une valeur absolue »
 * qu'il faudrait connaître d'avance.
 */

/** La dépense sert d'échelle et d'appoint : elle n'est jamais un axe ici. */
const DEF_DEPENSE = METRIC_BY_KEY.get('spend')!

export function MatriceFatigue({ lignes }: { lignes: Record<string, unknown>[] }) {
  const [couple, setCouple] = useState(COUPLE_DEFAUT)
  const [seuils, setSeuils] = useState<{ x: number | null; y: number | null }>({ x: null, y: null })
  const [zone, setZone] = useState<Zone | null>(null)

  // Changer d'axes rend les seuils précédents absurdes : une fréquence de 2,4
  // ne veut rien dire sur un axe de dépense.
  useEffect(() => { setSeuils({ x: null, y: null }); setZone(null) }, [couple])

  const m = useMemo(() => construire(lignes, couple, seuils), [lignes, couple, seuils])

  if (!m || !m.points.length) {
    return (
      <div className="card text-center py-16 text-gray-400 text-sm">
        Aucune publicité diffusée sur cette période.
      </div>
    )
  }

  const visibles = zone ? m.points.filter((p) => p.zone === zone) : m.points
  const pas = (borne: [number, number]) => Math.max((borne[1] - borne[0]) / 200, 0.001)

  return (
    <div className="space-y-3">
      {/* Axes et seuils */}
      <div className="card flex flex-wrap items-end gap-x-5 gap-y-3">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium text-gray-400 leading-none">Croisement</span>
          <select value={couple} onChange={(e) => setCouple(e.target.value)}
            className="text-xs border border-[#E5E7EB] rounded-lg px-2 h-8 bg-white text-[#0d0d12] focus:outline-none focus:border-[#3434ef] min-w-[230px]">
            {FAMILLES.map((f) => (
              <optgroup key={f.titre} label={f.titre}>
                {f.couples.map(([x, y]) => (
                  <option key={`${x}:${y}`} value={`${x}:${y}`}>{libelleCouple(`${x}:${y}`)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {(['x', 'y'] as const).map((axe) => {
          const def = m.defs[axe]
          const borne = m.bornes[axe]
          return (
            <label key={axe} className="flex flex-col gap-0.5 flex-1 min-w-[190px]">
              <span className="text-[10px] font-medium text-gray-400 leading-none">
                Seuil {def.label} <span className="text-gray-300">
                  ({axe === 'x' ? 'exposition' : def.good === 'low' ? 'bon si bas' : 'bon si haut'})
                </span>
              </span>
              <div className="flex items-center gap-2 h-8">
                <input type="range" min={borne[0]} max={borne[1]} step={pas(borne)}
                  value={m.seuils[axe]}
                  onChange={(e) => setSeuils((s) => ({ ...s, [axe]: Number(e.target.value) }))}
                  className="flex-1 accent-[#3434ef]" />
                <span className="text-xs font-semibold text-[#0d0d12] tabular-nums w-[74px] text-right">
                  {formatMetric(m.seuils[axe], def)}
                </span>
              </div>
            </label>
          )
        })}

        <button onClick={() => setSeuils({ x: null, y: null })}
          className="text-xs px-2.5 h-8 rounded-lg border border-[#E5E7EB] text-gray-600 hover:border-gray-300 whitespace-nowrap">
          Médianes
        </button>
      </div>

      {/* Quadrants — cliquables, ils filtrent le nuage et la liste */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {ORDRE_ZONES.map((z) => {
          const info = ZONES[z]
          const actif = zone === z
          return (
            <button key={z} onClick={() => setZone(actif ? null : z)}
              className={clsx('text-left border rounded-xl p-3 transition-all',
                actif ? 'border-[#3434ef] bg-[#3434ef]/5' : 'border-[#E5E7EB] hover:border-gray-300')}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: info.couleur }} />
                <span className="text-xs font-semibold text-[#0d0d12]">{info.label}</span>
                <span className="ml-auto text-sm font-bold tabular-nums" style={{ color: info.couleur }}>
                  {m.comptes[z]}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-snug mt-1">{info.texte}</p>
            </button>
          )
        })}
      </div>

      {/* Le nuage */}
      <div className="card">
        <ResponsiveContainer width="100%" height={380}>
          <ScatterChart margin={{ top: 10, right: 16, bottom: 22, left: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis type="number" dataKey="x" domain={m.bornes.x} name={m.defs.x.label}
              tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false}
              label={{ value: m.defs.x.label, position: 'insideBottom', offset: -12, fontSize: 11, fill: '#6B7280' }} />
            <YAxis type="number" dataKey="y" domain={m.bornes.y} name={m.defs.y.label}
              tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false}
              label={{ value: m.defs.y.label, angle: -90, position: 'insideLeft', fontSize: 11, fill: '#6B7280' }} />
            {/* La taille du point porte la dépense : un point qui compte se voit. */}
            <ZAxis type="number" dataKey="spend" range={[40, 420]} />

            <ReferenceLine x={m.seuils.x} stroke="#9CA3AF" strokeDasharray="4 4" />
            <ReferenceLine y={m.seuils.y} stroke="#9CA3AF" strokeDasharray="4 4" />

            <Tooltip cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as typeof m.points[number]
                return (
                  <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-lg p-2.5 max-w-[260px]">
                    <p className="text-xs font-semibold text-[#0d0d12] leading-snug">{p.name}</p>
                    <p className="text-[11px] mt-1" style={{ color: ZONES[p.zone].couleur }}>
                      {ZONES[p.zone].label}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-1 tabular-nums">
                      {m.defs.x.label} {formatMetric(p.x, m.defs.x)} · {m.defs.y.label} {formatMetric(p.y, m.defs.y)}
                    </p>
                    <p className="text-[11px] text-gray-400 tabular-nums">
                      {formatMetric(p.spend, DEF_DEPENSE)} dépensés
                    </p>
                  </div>
                )
              }} />

            <Scatter data={visibles} fillOpacity={0.75}>
              {visibles.map((p) => <Cell key={p.id} fill={ZONES[p.zone].couleur} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* La liste du quadrant sélectionné */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-2.5 bg-[#f8f9fc] flex items-center justify-between">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            {zone ? ZONES[zone].label : 'Toutes les publicités'}
            <span className="text-gray-300 font-medium normal-case tracking-normal"> · {visibles.length}</span>
          </p>
          {zone && (
            <button onClick={() => setZone(null)} className="text-[11px] text-[#3434ef] hover:underline">
              Tout afficher
            </button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-2 text-left font-semibold">Publicité</th>
                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">{m.defs.x.label}</th>
                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">{m.defs.y.label}</th>
                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Dépense</th>
              </tr>
            </thead>
            <tbody>
              {[...visibles].sort((a, b) => b.spend - a.spend).map((p) => (
                <tr key={p.id} className="border-t border-[#F3F4F6] hover:bg-[#f8f9fc]">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: ZONES[p.zone].couleur }} />
                      <span className="text-[#0d0d12] truncate" title={p.name}>{p.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatMetric(p.x, m.defs.x)}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatMetric(p.y, m.defs.y)}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-gray-500">
                    {p.spend.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
