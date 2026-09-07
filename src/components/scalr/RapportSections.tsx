'use client'
import { useState } from 'react'
import { clsx } from 'clsx'
import { markdownToHtml } from '@/lib/markdown'

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

export function RapportSections({ markdown, kpis }: { markdown: string; kpis?: Kpi[] }) {
  const { entree, sections } = decouper(markdown)
  const [actif, setActif] = useState(0)

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
