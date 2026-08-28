'use client'
import { CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer } from 'recharts'

/**
 * Les primitives communes aux graphiques.
 *
 * Deux règles portent tout le reste.
 *
 * **Jamais deux axes verticaux sur un même graphique.** Leur alignement est
 * arbitraire : superposer une dépense et un nombre de prospects invente une
 * corrélation qui n'est pas dans les données. Deux mesures d'échelles
 * différentes font deux graphiques, côte à côte, chacun avec son axe.
 *
 * **Les couleurs sont vérifiées, pas choisies à l'œil.** Le jeu ci-dessous a
 * passé les contrôles de séparation pour les daltonismes protan, deutan et
 * tritan sur fond blanc — l'écart le plus faible entre deux teintes voisines
 * y est de 9,1, au-dessus du seuil de 8. Les deux premières suffisent à
 * presque tous nos graphiques.
 */

/**
 * Les teintes, reprises rôle pour rôle de Scalr.
 *
 * Scalr construit ses graphiques autour de son orange de marque et décline
 * bleu, vert, jaune, violet et rose autour. Le rôle est conservé, la teinte
 * change : l'accent devient le bleu d'Apogée, et les autres sont les pas
 * correspondants d'un jeu vérifié — séparation daltonienne la plus faible à
 * 9,1 entre voisines sur fond blanc, pour un seuil de 8.
 */
export const TEINTES = {
  /** L'accent de Scalr, devenu celui d'Apogée : coût, dépense, saturation. */
  accent: '#3434ef',
  /** Le bleu de Scalr : prospects, personnes déjà exposées. */
  secondaire: '#eb6834',
  /** Le vert de Scalr : CTR, personnes fraîches. */
  vert: '#1baf7a',
  /** Le jaune de Scalr : la part de nouvelles personnes. */
  jaune: '#eda100',
  /** Le violet et le rose de Scalr : CPM et CPC. */
  violet: '#4a3aa7',
  rose: '#e87ba4',

  /** Scalr : `#edf0f6` sur les deux axes. */
  grille: '#edf0f6',
  /** Scalr : `#74778a` pour les graduations et les légendes. */
  axe: '#74778a',
  encre: '#0d0d12',
} as const

/** Scalr remplit sous ses courbes d'un aplat très clair de la même teinte,
 *  pas d'un dégradé. On reprend ses opacités. */
export const APLAT = (teinte: string, opacite: number) => ({ fill: teinte, fillOpacity: opacite })

/** Les seuils de fréquence sont un état, pas une catégorie : leur couleur
 *  vient du registre d'état, jamais du jeu catégoriel. */
export const ETAT = { bon: '#1baf7a', attention: '#eda100', critique: '#e34948' } as const

/** Graduations de Scalr : 10 px, `#74778a`. */
export const AXE = {
  tick: { fontSize: 10, fill: TEINTES.axe },
  tickLine: false,
  axisLine: false,
} as const

/** Légende de Scalr : 11 px, même gris. */
export const LEGENDE = {
  wrapperStyle: { fontSize: 11, color: TEINTES.axe, paddingTop: 4 },
  iconType: 'circle' as const,
  iconSize: 8,
}

/** Format court : 12 480 devient 12,5 k, et l'axe reste lisible. */
export const court = (v: number) => {
  if (!Number.isFinite(v)) return ''
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} M`
  if (a >= 1000) return `${(v / 1000).toFixed(a >= 10_000 ? 0 : 1).replace('.', ',')} k`
  return String(Math.round(v * 100) / 100).replace('.', ',')
}

export const eur = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—'
    : `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

const jour = (d: string) => (typeof d === 'string' && d.length >= 10 ? d.slice(8, 10) + '/' + d.slice(5, 7) : d)

/**
 * L'infobulle.
 *
 * Présente sur tous les graphiques : un graphique HTML est interactif par
 * nature, et lire une valeur exacte ne doit pas obliger à viser un axe.
 */
export function Bulle({ actif, charge, titre, format }: {
  actif?: boolean
  charge?: { name?: string; value?: number; color?: string; dataKey?: string }[]
  titre?: string
  format?: (v: number, cle: string) => string
}) {
  if (!actif || !charge?.length) return null
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-lg px-3 py-2">
      {titre && <p className="text-[11px] text-gray-400 mb-1 tabular-nums">{jour(titre)}</p>}
      {charge.map((s, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
          <span className="text-gray-500">{s.name}</span>
          <span className="ml-auto font-semibold text-[#0d0d12] tabular-nums">
            {format ? format(Number(s.value), String(s.dataKey)) : court(Number(s.value))}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Le cadre d'un graphique.
 *
 * La surface de tracé est posée sur le gris de fond de l'application plutôt
 * que sur du blanc : une courbe fine sur blanc n'a rien pour s'appuyer, et le
 * graphique flotte. Le panneau lui donne une assise, et reprend le vocabulaire
 * des cartes — même gris, même rayon, même filet.
 */
export function Cadre({ titre, note, valeur, hauteur = 210, children }: {
  titre: string
  note?: string
  /** Un chiffre de tête, quand une valeur résume le graphique. */
  valeur?: string
  hauteur?: number
  children: React.ReactElement
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <p className="text-xs font-semibold text-[#0d0d12] truncate">{titre}</p>
          {valeur && <p className="text-sm font-bold text-[#0d0d12] tabular-nums">{valeur}</p>}
        </div>
        {note && <p className="text-[11px] text-gray-400 whitespace-nowrap">{note}</p>}
      </div>
      <ResponsiveContainer width="100%" height={hauteur}>{children}</ResponsiveContainer>
    </div>
  )
}

/** Grille et axes d'une série temporelle — horizontale seule, en retrait. */
export function AxesJour({ unite, largeurY = 44 }: { unite?: string; largeurY?: number }) {
  return (
    <>
      {/* Scalr trace la grille sur les deux axes, en trait plein très clair. */}
      <CartesianGrid stroke={TEINTES.grille} />
      <XAxis dataKey="date" tickFormatter={jour} {...AXE} minTickGap={24} />
      <YAxis {...AXE} width={largeurY} tickFormatter={(v: number) => court(v) + (unite || '')} />
    </>
  )
}

export { Tooltip, jour }
