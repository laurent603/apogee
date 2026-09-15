/**
 * Comment se nomment et se colorent les types de rapport.
 *
 * Les deux historiques les affichaient chacun à leur façon — l'un avec des
 * badges teintés, l'autre sans rien. Une seule table, donc, pour que le même
 * rapport se reconnaisse au même endroit quel que soit l'écran qui le montre.
 *
 * Le violet 700 plutôt que 600 sur « Analyse créa » : sur fond violet 50, le
 * 600 passe mal.
 */
const NOMS: Record<string, string> = {
  creativeStrategy: 'Analyse créa',
  creative: 'Analyse créa',
  audit: 'Audit technique',
  autopilot: 'Autopilot',
  session: 'Discussion',
  mediaBuying: 'Média buying',
  performance: 'Performance',
}

const TEINTES: Record<string, string> = {
  creativeStrategy: 'bg-violet-50 text-violet-700 border-violet-200',
  creative: 'bg-violet-50 text-violet-700 border-violet-200',
  audit: 'bg-amber-50 text-amber-700 border-amber-200',
  autopilot: 'bg-blue-50 text-blue-700 border-blue-200',
  session: 'bg-gray-100 text-gray-600 border-gray-200',
  mediaBuying: 'bg-teal-50 text-teal-700 border-teal-200',
  performance: 'bg-teal-50 text-teal-700 border-teal-200',
}

/** Un rapport sans type reste affichable : il se dit « Rapport ». */
export const nomType = (t: string | null | undefined) => (t && NOMS[t]) || t || 'Rapport'
export const teinteType = (t: string | null | undefined) =>
  (t && TEINTES[t]) || 'bg-gray-50 text-gray-600 border-gray-200'

/** Les classes complètes d'un badge de type, prêtes à poser sur un span. */
export const badgeType = (t: string | null | undefined) =>
  `inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${teinteType(t)}`
