'use client'
import { clsx } from 'clsx'
import type { EntreeBanque } from '@/lib/prompts/banque'

/**
 * Une entrée de la bibliothèque.
 *
 * Les emplacements vides sont affichés, grisés, avec la raison de leur vide.
 * Les cacher les ferait retomber dans l'oubli d'où ils sortent : c'est
 * précisément parce qu'aucun écran ne montrait ces manques qu'ils ont duré.
 */
const PASTILLE: Record<string, { texte: string; classe: string }> = {
  aAdapter: { texte: 'à adapter', classe: 'text-[#b45309] bg-[#fef3c7]' },
  aEcrire:  { texte: 'à écrire',  classe: 'text-gray-500 bg-gray-100' },
  outil:    { texte: 'outil',     classe: 'text-[#3434ef] bg-[#3434ef]/10' },
}

export function LigneEntree({ entree, chemin, onChoisir, onOuvrirOutil }: {
  entree: EntreeBanque
  chemin?: string
  onChoisir: (prompt: string) => void
  onOuvrirOutil: (lien: string) => void
}) {
  const vide = entree.etat === 'aEcrire'
  const pastille = PASTILLE[entree.etat]
  return (
    <button
      disabled={vide}
      onClick={() => {
        if (vide) return
        if (entree.etat === 'outil' && entree.lien) onOuvrirOutil(entree.lien)
        else onChoisir(entree.prompt)
      }}
      className={clsx(
        'w-full text-left px-3 py-2 transition-colors',
        vide ? 'cursor-default opacity-60' : 'hover:bg-[#f8f9fc]',
      )}
    >
      <span className="flex items-center gap-2">
        <span className={clsx('text-sm flex-1', vide ? 'text-gray-400' : 'text-[#0d0d12]')}>
          {entree.label}
        </span>
        {pastille && (
          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0', pastille.classe)}>
            {pastille.texte}
          </span>
        )}
      </span>
      {(chemin || entree.note) && (
        <span className="block text-[10px] text-gray-400 mt-0.5 leading-snug">
          {chemin && <span className="text-gray-300">{chemin} — </span>}
          {entree.note}
        </span>
      )}
    </button>
  )
}

