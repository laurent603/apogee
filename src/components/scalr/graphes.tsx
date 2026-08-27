'use client'
import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Line, CartesianGrid, Legend,
} from 'recharts'

/**
 * Les graphes du détail créa.
 *
 * Trois partis pris :
 *
 * - **Les libellés Meta sont réécrits.** `facebook_facebook_profile_feed` est
 *   un identifiant technique, pas un nom de placement. Le lire coûte une
 *   seconde à chaque coup d'œil, et sur un axe incliné il devient illisible.
 * - **Le camembert choisit sa dimension**, pas seulement sa métrique : la même
 *   question — d'où viennent mes leads — se pose par âge, par placement ou par
 *   appareil.
 * - **Rien n'est peint en vert par défaut.** Une hausse de coût est une
 *   mauvaise nouvelle : la couleur suit le sens de la métrique.
 */

export type Unite = 'eur' | 'nb' | 'pct' | 'ratio'
export type Choix = { cle: string; label: string; unite: Unite; inverse?: boolean }

export const CHOIX: Choix[] = [
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
export const PAR_CLE = new Map(CHOIX.map((c) => [c.cle, c]))

export const fmt = (v: number | null | undefined, u: Unite) => {
  if (v == null || !Number.isFinite(v)) return '—'
  if (u === 'eur') return `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
  if (u === 'pct') return `${v.toFixed(2)}%`
  if (u === 'ratio') return v.toFixed(2)
  return Math.round(v).toLocaleString('fr-FR')
}

/** Format compact pour les axes : 12 480 devient 12,5 k. */
const court = (v: number, u: Unite) => {
  if (u === 'pct') return `${v}%`
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',')} k`
  return u === 'eur' ? `${v} €` : String(v)
}

/**
 * Réécrit les placements Meta en noms lisibles.
 * `facebook_facebook_profile_feed` → `Facebook · Fil profil`.
 */
const POSITIONS: Record<string, string> = {
  feed: 'Fil', facebook_reels: 'Reels', facebook_stories: 'Stories',
  instant_article: 'Article instantané', marketplace: 'Marketplace',
  video_feeds: 'Fil vidéo', search: 'Recherche', right_hand_column: 'Colonne droite',
  facebook_profile_feed: 'Fil profil', profile_feed: 'Fil profil',
  instagram_stories: 'Stories', instagram_reels: 'Reels', story: 'Stories',
  stream: 'Fil', explore: 'Explorer', explore_home: 'Explorer', reels: 'Reels',
  ig_search: 'Recherche', profile_reels: 'Reels profil',
  messenger_inbox: 'Boîte de réception', an_classic: 'Audience Network',
  rewarded_video: 'Vidéo récompensée', biz_disco_feed: 'Découverte',
}
/** Les appareils arrivent en minuscules : une capitalisation automatique
 *  écrirait « Iphone ». */
const APPAREILS: Record<string, string> = {
  iphone: 'iPhone', ipad: 'iPad', ipod: 'iPod',
  android_smartphone: 'Smartphone Android', android_tablet: 'Tablette Android',
  desktop: 'Ordinateur', other: 'Autre',
}
const PLATEFORMES: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger',
  audience_network: 'Audience Network', threads: 'Threads', unknown: 'Inconnu',
}

export function lisible(cle: string): string {
  if (!cle) return 'Inconnu'
  // Les clés arrivent en « plateforme · position », ou brutes selon la source.
  const parts = cle.includes(' · ') ? cle.split(' · ') : [cle]
  if (parts.length === 2) {
    const [pf, pos] = parts
    const p = PLATEFORMES[pf] || pf
    // Meta préfixe souvent la position du nom de la plateforme : on l'enlève.
    const posNet = pos.startsWith(`${pf}_`) ? pos.slice(pf.length + 1) : pos
    return `${p} · ${POSITIONS[pos] || POSITIONS[posNet] || posNet.replace(/_/g, ' ')}`
  }
  const seul = parts[0]
  if (APPAREILS[seul]) return APPAREILS[seul]
  if (PLATEFORMES[seul]) return PLATEFORMES[seul]
  if (seul === 'male') return 'Hommes'
  if (seul === 'female') return 'Femmes'
  if (seul === 'unknown') return 'Inconnu'
  return seul.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

/* ─── Sélecteur ─────────────────────────────────────────────────────────── */

export function Selecteur({ valeur, onChange, exclure, options }: {
  valeur: string; onChange: (v: string) => void; exclure?: string
  options?: { cle: string; label: string }[]
}) {
  const liste = options || CHOIX
  return (
    <select value={valeur} onChange={(e) => onChange(e.target.value)}
      className="text-[11px] border border-[#E5E7EB] rounded-lg px-2 py-1 bg-white text-gray-600 focus:outline-none focus:border-[#3434ef] max-w-[150px]">
      {liste.filter((c) => c.cle !== exclure).map((c) => (
        <option key={c.cle} value={c.cle}>{c.label}</option>
      ))}
    </select>
  )
}

type Vent = Record<string, number | null | string | boolean> & { cle: string; fusionne?: boolean }

const TEINTES = ['#3434ef', '#22c55e', '#f97316', '#06b6d4', '#8b5cf6', '#eab308', '#ec4899', '#64748b', '#14b8a6']

/* ─── Camembert ─────────────────────────────────────────────────────────── */

export function Camembert({ dimensions, titre }: {
  titre: string
  dimensions: { cle: string; label: string; data: Vent[] }[]
}) {
  const [metrique, setMetrique] = useState('leads')
  const [dim, setDim] = useState(dimensions[0]?.cle)
  const c = PAR_CLE.get(metrique)!
  const source = dimensions.find((d) => d.cle === dim) || dimensions[0]

  const rows = useMemo(() => (source?.data || [])
    .map((d) => ({ nom: lisible(d.cle), v: Number(d[metrique] ?? 0) }))
    .filter((r) => r.v > 0)
    .sort((a, b) => b.v - a.v), [source, metrique])

  const total = rows.reduce((s, r) => s + r.v, 0)

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-[#0d0d12]">{titre}</p>
        <div className="flex gap-1">
          <Selecteur valeur={metrique} onChange={setMetrique} />
          <Selecteur valeur={dim} onChange={setDim} options={dimensions} />
        </div>
      </div>

      {rows.length ? (
        <>
          <div className="relative">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={rows} dataKey="v" nameKey="nom" innerRadius={62} outerRadius={95} paddingAngle={2} stroke="none">
                  {rows.map((_, i) => <Cell key={i} fill={TEINTES[i % TEINTES.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }}
                  formatter={(v: number, n: string) => [`${fmt(v, c.unite)} · ${((v / total) * 100).toFixed(1)}%`, n]} />
              </PieChart>
            </ResponsiveContainer>
            {/* Le total au centre : sans lui chaque part reste une proportion sans échelle */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] text-gray-400 uppercase tracking-wide">Total {c.label.toLowerCase()}</span>
              <span className="text-xl font-bold text-[#0d0d12] tabular-nums">{fmt(total, c.unite)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 justify-center mt-1">
            {rows.map((r, i) => (
              <div key={r.nom} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TEINTES[i % TEINTES.length] }} />
                <span className="text-[11px] text-gray-500">{r.nom}</span>
                <span className="text-xs font-bold text-[#0d0d12] tabular-nums">{fmt(r.v, c.unite)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400">
          Rien à répartir sur cette métrique
        </div>
      )}
    </div>
  )
}

/* ─── Deux métriques, barres groupées ───────────────────────────────────── */

export function BarresDoubles({ data, titre, note, defaut1, defaut2, courbe }: {
  data: Vent[]; titre: string; note?: string; defaut1: string; defaut2: string
  /** La seconde série en courbe plutôt qu'en barres — utile sur une série
   *  temporelle, où deux jeux de barres se gênent. */
  courbe?: boolean
}) {
  const [a, setA] = useState(defaut1)
  const [b, setB] = useState(defaut2)
  const ca = PAR_CLE.get(a)!, cb = PAR_CLE.get(b)!

  const rows = data.slice(0, 12).map((d) => ({
    nom: lisible(String(d.cle)),
    court: String(d.cle).length === 10 && String(d.cle).includes('-') ? String(d.cle).slice(5) : lisible(String(d.cle)),
    a: d[a] == null ? null : Number(d[a]),
    b: d[b] == null ? null : Number(d[b]),
  }))
  const fusion = data.some((d) => d.fusionne) && (a === 'frequency' || b === 'frequency')

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-[#0d0d12]">{titre}</p>
        <div className="flex items-center gap-1">
          <Selecteur valeur={a} onChange={setA} exclure={b} />
          <Selecteur valeur={b} onChange={setB} exclure={a} />
        </div>
      </div>
      {note && <p className="text-[11px] text-gray-400 mb-1">{note}</p>}

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={rows} margin={{ top: 8, right: 4, left: -14, bottom: courbe ? 4 : 58 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis dataKey="court" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
            interval={0} angle={courbe ? 0 : -35} textAnchor={courbe ? 'middle' : 'end'} height={courbe ? 20 : 70} />
          <YAxis yAxisId="g" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
            tickFormatter={(v) => court(v, ca.unite)} width={52} />
          <YAxis yAxisId="d" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
            tickFormatter={(v) => court(v, cb.unite)} width={52} />
          <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }}
            labelFormatter={(_, p) => (p?.[0]?.payload as { nom?: string })?.nom || ''}
            formatter={(v: number, n: string) => [fmt(v, n === ca.label ? ca.unite : cb.unite), n]} />
          <Legend iconSize={8} verticalAlign="top" height={26}
            formatter={(v) => <span className="text-[11px] text-gray-600">{v}</span>} />
          <Bar yAxisId="g" dataKey="a" name={ca.label} fill="#3434ef" radius={[4, 4, 0, 0]} maxBarSize={28} />
          {courbe
            ? <Line yAxisId="d" type="monotone" dataKey="b" name={cb.label} stroke="#f97316" strokeWidth={2} dot={false} />
            : <Bar yAxisId="d" dataKey="b" name={cb.label} fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={28} />}
        </ComposedChart>
      </ResponsiveContainer>

      {fusion && (
        <p className="text-[11px] text-amber-600">
          Fréquence masquée sur un découpage recomposé : les mêmes personnes y seraient comptées plusieurs fois.
        </p>
      )}
    </div>
  )
}

/* ─── Âge × genre ───────────────────────────────────────────────────────── */

const ORDRE_AGE = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+']

/** Hommes et femmes côte à côte par tranche : c'est l'écart entre les deux qui
 *  se lit, pas leur somme. */
export function AgeGenre({ data }: { data: Vent[] }) {
  const [metrique, setMetrique] = useState('impressions')
  const c = PAR_CLE.get(metrique)!

  const rows = useMemo(() => {
    const parAge = new Map<string, { age: string; homme: number | null; femme: number | null }>()
    for (const d of data) {
      const [age, genre] = String(d.cle).split(' · ')
      if (!age) continue
      const e = parAge.get(age) ?? { age, homme: null, femme: null }
      const v = d[metrique] == null ? null : Number(d[metrique])
      if (genre === 'male') e.homme = v
      else if (genre === 'female') e.femme = v
      parAge.set(age, e)
    }
    return [...parAge.values()].sort((a, b) => {
      const ia = ORDRE_AGE.indexOf(a.age), ib = ORDRE_AGE.indexOf(b.age)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
  }, [data, metrique])

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-[#0d0d12]">Répartition âge &amp; genre</p>
        <Selecteur valeur={metrique} onChange={setMetrique} />
      </div>
      {rows.length ? (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={rows} margin={{ top: 8, right: 4, left: -14, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis dataKey="age" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
              tickFormatter={(v) => court(v, c.unite)} width={52} />
            <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }}
              formatter={(v: number, n: string) => [fmt(v, c.unite), n]} />
            <Legend iconSize={8} verticalAlign="top" height={26}
              formatter={(v) => <span className="text-[11px] text-gray-600">{v}</span>} />
            <Bar dataKey="homme" name="Hommes" fill="#3434ef" radius={[4, 4, 0, 0]} maxBarSize={26} />
            <Bar dataKey="femme" name="Femmes" fill="#ec4899" radius={[4, 4, 0, 0]} maxBarSize={26} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400">Pas de découpage disponible</div>
      )}
    </div>
  )
}

export type { Vent }
export { clsx }
