'use client'
import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { markdownToHtml } from '@/lib/markdown'
import { separerRapport, extraireRapportHtml } from '@/lib/scalr/rapportHtml'

/**
 * Un rapport d'agent, en onglets plutôt qu'en rouleau.
 *
 * Le fond des rapports est bon ; c'est leur lecture qui ne l'était pas. Dix
 * mille caractères d'un seul tenant, la conclusion perdue au milieu, aucun
 * moyen de revenir à la section qu'on cherche : personne ne lit ça deux fois.
 *
 * Les onglets se déduisent des titres `##` du Markdown, pas d'un format que le
 * modèle devrait apprendre. La discipline de rédaction les impose déjà, et
 * surtout : les rapports **déjà en base** en profitent sans être régénérés.
 */

export type Kpi = { libelle: string; valeur: string; evolution?: number | null; sens?: 'haut' | 'bas' }

type Section = { titre: string; corps: string }

/** Découpe sur les titres de niveau 2. Ce qui précède le premier est l'entrée. */
function decouper(md: string): { entree: string; sections: Section[] } {
  const lignes = (md || '').split('\n')
  const entree: string[] = []
  const sections: Section[] = []
  let courante: Section | null = null

  for (const ligne of lignes) {
    const titre = /^##\s+(?!#)(.+?)\s*$/.exec(ligne)
    if (titre) {
      courante = { titre: titre[1].replace(/[*_`]/g, '').trim(), corps: '' }
      sections.push(courante)
    } else if (courante) {
      courante.corps += ligne + '\n'
    } else {
      entree.push(ligne)
    }
  }
  return { entree: entree.join('\n').trim(), sections }
}

/** Le libellé d'onglet : court, sinon la barre déborde sur un téléphone. */
const abrege = (t: string) => {
  const sansNumero = t.replace(/^(section\s*)?\d+\s*[—\-.:)]\s*/i, '')
  return sansNumero.length > 28 ? sansNumero.slice(0, 27).trimEnd() + '…' : sansNumero
}

/**
 * Un rapport écrit en HTML, dans un cadre isolé.
 *
 * Le document vient d'un modèle, pas de nous : `sandbox` sans la moindre
 * permission le prive de scripts, de stockage, de cookies, de formulaires et
 * de toute lecture du DOM de l'application. Il ne peut qu'être regardé.
 *
 * D'où l'exigence, côté prompt, que ses onglets fonctionnent **en CSS seul**.
 * Un premier essai s'appuyait sur un script pour les onglets et pour annoncer
 * sa hauteur : dans un cadre sandboxé le script ne s'exécute pas, les onglets
 * étaient morts et seule la première section restait visible.
 *
 * La hauteur est donc fixe et le document défile à l'intérieur — comme un
 * document consulté en plein écran, ce qu'il est.
 */
function CadreHtml({ html }: { html: string }) {
  /**
   * Le document est servi par une adresse blob, pas par l'attribut `srcdoc`.
   *
   * Un document de quarante mille signes passé en attribut arrivait vide :
   * le cadre s'affichait, l'attribut portait bien le texte, et rien ne se
   * peignait. Le même document ouvert seul se rendait parfaitement. Une
   * adresse blob évite l'attribut, et le bac à sable garde son origine opaque.
   */
  const [adresse, setAdresse] = useState<string | null>(null)
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    setAdresse(url)
    return () => URL.revokeObjectURL(url)
  }, [html])

  return (
    <iframe
      src={adresse ?? undefined}
      sandbox=""
      title="Rapport"
      className="w-full rounded-xl border border-[#E5E7EB] bg-[#0d0d1a]"
      style={{ height: 'min(82vh, 1100px)' }}
    />
  )
}

/**
 * La synthèse qui précède le document, et les suites qu'elle propose.
 *
 * Les dernières lignes d'une synthèse énumèrent ce qu'on peut enchaîner —
 * « analyser la fatigue de C1B », « briefer les 3 créas en détail ». Les
 * laisser en texte oblige à les retaper ; on les rend cliquables, et un clic
 * relance la demande telle qu'elle est écrite.
 */
const RE_SUITES = /^[ \t]*(?:#{1,4}\s*)?(?:\*\*)?\s*(?:👉\s*)?prochaine[s]?\s+étape[^\n]*$/im

/** Une puce ou un numéro en tête de ligne, débarrassé de son balisage. */
const RE_PUCE = /^\s*(?:\d+[.)]|[-*])\s+(.+?)\s*$/

function Synthese({ texte, onAction }: { texte: string; onAction?: (demande: string) => void }) {
  const coupe = onAction ? RE_SUITES.exec(texte) : null
  const queue = coupe ? texte.slice(coupe.index + coupe[0].length) : ''
  const trouvees = queue.split('\n')
    .map((l) => RE_PUCE.exec(l)?.[1])
    .filter((t): t is string => !!t)
    .map((t) => t.replace(/\*\*/g, '').replace(/^`|`$/g, '').trim())

  // Deux suites au minimum, et rien d'autre que des puces après le titre :
  // sinon on découperait une phrase au milieu et on perdrait la fin du texte.
  const enPuces = trouvees.length >= 2
    && queue.split('\n').every((l) => !l.trim() || RE_PUCE.test(l))
  const avant = coupe && enPuces ? texte.slice(0, coupe.index).trimEnd() : texte
  const suites = enPuces ? trouvees : []

  return (
    <>
      <div className="chat-report" dangerouslySetInnerHTML={{ __html: markdownToHtml(avant) }} />
      {suites.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Prochaines étapes</p>
          <div className="flex flex-col gap-1.5">
            {suites.map((s, i) => (
              <button
                key={i}
                onClick={() => onAction?.(s)}
                className="group text-left text-xs text-[#0d0d12] border border-[#E5E7EB] rounded-lg px-3 py-2 hover:border-[#3434ef] hover:bg-[#f5f5ff] transition-colors flex gap-2 items-start"
              >
                <span className="text-gray-300 tabular-nums group-hover:text-[#3434ef]">{i + 1}</span>
                <span>{s}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export function RapportSections({ markdown, kpis, enCours, onAction }: {
  markdown: string
  kpis?: Kpi[]
  /** La génération n'est pas terminée : le document est encore incomplet. */
  enCours?: boolean
  onAction?: (demande: string) => void
}) {
  const { entree, sections } = decouper(markdown)
  const [actif, setActif] = useState(0)

  // Un document HTML se rend tel quel : il porte déjà ses onglets, ses cartes
  // et ses chiffres. Le bandeau de KPI ferait doublon avec le sien. La synthèse
  // qui le précède, elle, se lit dans le fil.
  const { synthese, document: doc } = separerRapport(markdown)
  if (doc !== null) {
    return (
      <>
        {synthese && <Synthese texte={synthese} onAction={enCours ? undefined : onAction} />}
        {enCours
          ? <p className="text-gray-400 text-sm mt-4">Mise en page du rapport en cours…</p>
          : <div className={synthese ? 'mt-5' : ''}><CadreHtml html={extraireRapportHtml(doc)} /></div>}
      </>
    )
  }

  const bandeau = !!kpis?.length && (
    <div className="flex flex-wrap gap-2 mb-4">
      {kpis.map((k) => (
        <div key={k.libelle} className="border border-[#E5E7EB] rounded-xl px-3 py-2 bg-white min-w-[7rem]">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">{k.libelle}</p>
          <p className="text-lg font-semibold text-[#0d0d12] tabular-nums leading-tight">{k.valeur}</p>
          {typeof k.evolution === 'number' && (
            // Une hausse de coût n'est pas une bonne nouvelle : la couleur suit
            // le sens de l'indicateur, jamais le signe du nombre.
            <p className={clsx('text-[11px] tabular-nums',
              k.evolution === 0 ? 'text-gray-400'
                : (k.evolution > 0) === (k.sens !== 'bas') ? 'text-green-600' : 'text-red-500')}>
              {k.evolution > 0 ? '+' : ''}{k.evolution} %
            </p>
          )}
        </div>
      ))}
    </div>
  )

  // Deux sections ne valent pas une barre d'onglets : on rend le rapport tel quel.
  if (sections.length < 3) {
    return (
      <>
        {bandeau}
        <div className="chat-report" dangerouslySetInnerHTML={{ __html: markdownToHtml(markdown) }} />
      </>
    )
  }

  const vue = sections[Math.min(actif, sections.length - 1)]

  return (
    <>
      {bandeau}

      {/* L'entrée reste visible sous les onglets : c'est le titre du rapport et,
          quand il y en a une, la phrase qui le résume. */}
      {entree && (
        <div className="chat-report mb-3" dangerouslySetInnerHTML={{ __html: markdownToHtml(entree) }} />
      )}

      <div className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1 border-b border-[#E5E7EB]">
        {sections.map((s, i) => (
          <button
            key={i}
            onClick={() => setActif(i)}
            title={s.titre}
            className={clsx('text-xs font-medium px-3 py-1.5 rounded-t-lg whitespace-nowrap transition-colors border-b-2 -mb-[1px]',
              i === actif
                ? 'text-[#3434ef] border-[#3434ef]'
                : 'text-gray-500 border-transparent hover:text-[#0d0d12]')}
          >
            <span className="text-gray-300 mr-1.5 tabular-nums">{i + 1}</span>
            {abrege(s.titre)}
          </button>
        ))}
      </div>

      <div className="pt-4">
        <h3 className="text-sm font-semibold text-[#0d0d12] mb-2">{vue.titre}</h3>
        <div className="chat-report" dangerouslySetInnerHTML={{ __html: markdownToHtml(vue.corps) }} />
      </div>
    </>
  )
}
