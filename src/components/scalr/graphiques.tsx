'use client'
import { CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer, Legend } from 'recharts'

/**
 * Les primitives des graphiques, reprises de Scalr au pixel.
 *
 * Les valeurs ci-dessous ne sont pas des approximations : ce sont celles de sa
 * feuille de style, relevées une à une — panneau à 14 px de rayon sur bordure
 * `#e4e7ef`, en-tête à 13/17 px, titre de 20 px en graisse 500, corps à 17 px,
 * surface de tracé de 185 px de haut sur fond `#f8f9fc` cerné de `#edf0f6`,
 * grille sur les deux axes, graduations de 10 px en `#74778a`.
 *
 * Seules les teintes changent, rôle pour rôle : l'accent orange de Scalr
 * devient le bleu d'Apogée, et les autres suivent le même déplacement.
 */

export const TEINTES = {
  /** L'accent — coût, dépense, saturation. Orange chez Scalr. */
  accent: '#3434ef',
  /** Le bleu de Scalr — prospects, personnes déjà exposées. */
  secondaire: '#eb6834',
  /** Le vert de Scalr — CTR, nouvelles personnes. */
  vert: '#1baf7a',
  /** Le jaune de Scalr — part de nouvelles personnes. */
  jaune: '#eda100',
  /** Le violet et le rose de Scalr — CPM et CPC. */
  violet: '#4a3aa7',
  rose: '#e87ba4',

  /** `#edf0f6` : la grille et le filet des surfaces de tracé. */
  grille: '#edf0f6',
  /** `#74778a` : graduations, légendes, titres d'axe. */
  axe: '#74778a',
  /** `#e4e7ef` : la bordure des panneaux. */
  bordure: '#e4e7ef',
  encre: '#1f2433',
} as const

export const ETAT = { bon: '#1baf7a', attention: '#eda100', critique: '#e34948' } as const

/** Graduations : 10 px, `#74778a`, sans axe ni traits de graduation. */
export const AXE = {
  tick: { fontSize: 10, fill: TEINTES.axe },
  tickLine: false,
  axisLine: false,
} as const

/**
 * Le `compact()` de Scalr, porté à l'identique.
 *
 * Les seuils de décimales sont les siens et comptent : il garde une décimale
 * jusqu'à cent mille, d'où les « 5,0K » et « 15,0K » de ses axes — pas des
 * « 5K » et « 15K ».
 */
export const court = (v: number) => {
  const n = Number(v) || 0
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2).replace('.', ',')}M`
  if (a >= 1000) return `${(n / 1000).toFixed(a >= 100_000 ? 0 : 1).replace('.', ',')}K`
  return Math.round(n).toLocaleString('fr-FR')
}

export const eur = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—'
    : `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

/** `07-29` : Scalr coupe la date au mois-jour. */
export const jourCourt = (d: string) => (typeof d === 'string' && d.length >= 10 ? d.slice(5) : d)

/**
 * La légende de Scalr : en haut, centrée, dans la surface de tracé.
 *
 * Le témoin d'une courbe y est un rectangle **évidé**, celui d'une barre un
 * rectangle plein — c'est ce que dessine Chart.js, et ce qui distingue les
 * deux d'un coup d'œil. Recharts ne sait pas le faire seul.
 */
function Temoin({ couleur, ligne }: { couleur: string; ligne: boolean }) {
  return (
    <span className="inline-block w-[26px] h-[11px] rounded-[2px] align-middle"
      style={ligne ? { border: `2px solid ${couleur}` } : { background: couleur }} />
  )
}

export function LegendeScalr({ payload }: { payload?: { value?: string; color?: string; type?: string }[] }) {
  if (!payload?.length) return null
  return (
    <div className="flex items-center justify-center gap-4 flex-wrap pb-1">
      {payload.map((e, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <Temoin couleur={e.color || TEINTES.axe} ligne={e.type === 'line'} />
          <span className="text-[11px]" style={{ color: TEINTES.axe }}>{e.value}</span>
        </span>
      ))}
    </div>
  )
}

/** L'infobulle. Chart.js en pose une par défaut ; Recharts demande la sienne. */
export function Bulle({ actif, charge, titre, format }: {
  actif?: boolean
  charge?: { name?: string; value?: number; color?: string; dataKey?: string }[]
  titre?: string
  format?: (v: number, cle: string) => string
}) {
  if (!actif || !charge?.length) return null
  return (
    <div className="bg-white border rounded-lg shadow-md px-3 py-2" style={{ borderColor: TEINTES.bordure }}>
      {titre && <p className="text-[11px] mb-1 tabular-nums" style={{ color: TEINTES.axe }}>{titre}</p>}
      {charge.map((s, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: s.color }} />
          <span style={{ color: TEINTES.axe }}>{s.name}</span>
          <span className="ml-auto font-semibold tabular-nums" style={{ color: TEINTES.encre }}>
            {format ? format(Number(s.value), String(s.dataKey)) : court(Number(s.value))}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Le panneau de Scalr : un cadre blanc, un en-tête souligné, un corps.
 *
 * `.panel` + `.panel-header` + `.panel-title` + `.panel-body` + `.chart-wrap`,
 * aux mesures d'origine.
 */
export function Panneau({ titre, hauteur = 185, children }: {
  titre: string; hauteur?: number; children: React.ReactElement
}) {
  return (
    <div className="bg-white rounded-[14px] overflow-hidden border" style={{ borderColor: TEINTES.bordure }}>
      <div className="px-[17px] py-[13px] border-b" style={{ borderColor: TEINTES.bordure }}>
        <p className="text-[20px] font-medium tracking-[-0.02em]" style={{ color: TEINTES.encre }}>{titre}</p>
      </div>
      <div className="p-[17px]">
        <div className="rounded-[10px] border"
          style={{ height: hauteur, background: '#f8f9fc', borderColor: TEINTES.grille }}>
          <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

/**
 * La surface de tracé de la saturation : pas de panneau, un titre au-dessus.
 *
 * `.ad-analysis-title` puis `.sat-chart-wrap` — 300 px de haut, 12 px de rayon
 * et de rembourrage.
 */
export function SurfaceSat({ titre, hauteur = 300, children }: {
  titre: string; hauteur?: number; children: React.ReactElement
}) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-extrabold mb-[10px]" style={{ color: '#171827' }}>{titre}</p>
      <div className="rounded-[12px] border p-[12px]"
        style={{ height: hauteur, background: '#f8f9fc', borderColor: TEINTES.grille }}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  )
}

/** La grille de Scalr : deux colonnes, 14 px d'écart. `compact` en fait trois. */
export function GrilleGraphiques({ compact, children }: { compact?: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid grid-cols-1 gap-[14px] ${compact ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
      {children}
    </div>
  )
}

/**
 * Grille et axes d'une série de jours.
 *
 * Scalr trace la grille sur les deux axes et ne met d'unité que là où elle est
 * indispensable — le reste vit dans sa légende. Le titre d'axe et l'unité sur
 * les graduations sont ici systématiques : un graphique doit se lire sans
 * remonter à sa légende pour savoir de quoi il parle.
 */
export function AxesJour({ unite, titreY, largeurY = 44 }: {
  unite?: string; titreY?: string; largeurY?: number
}) {
  return (
    <>
      <CartesianGrid stroke={TEINTES.grille} />
      <XAxis dataKey="date" tickFormatter={jourCourt} {...AXE} minTickGap={4} interval="preserveStartEnd" />
      <YAxis {...AXE} width={titreY ? largeurY + 18 : largeurY}
        tickFormatter={(v: number) => court(v) + (unite || '')}
        label={titreY ? {
          value: titreY, angle: -90, position: 'insideLeft',
          fontSize: 11, fill: TEINTES.axe, style: { textAnchor: 'middle' },
        } : undefined} />
    </>
  )
}

export { Tooltip, Legend }
