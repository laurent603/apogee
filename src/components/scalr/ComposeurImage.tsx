'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import type { Feuille } from '@/lib/scalr/feuilleTournage'
import { dispositifsDeLaFeuille, motsAccentues, type Marque } from '@/lib/scalr/dispositifs'
import { dessinerCrea, FORMATS } from '@/lib/scalr/rendu'

/**
 * La créa composée : photo, dispositifs, couleurs du compte.
 *
 * Le générateur d'images dessine le texte au lieu de le composer — lettres
 * déformées, polices qui changent, bandeau posé sur le sujet. Ici le texte
 * reste du texte, et surtout la créa reprend les **dispositifs que le brief a
 * conçus** : pastille de verbatim, comparatif deux colonnes, liste à coches,
 * bloc prix, bouton. Poser une accroche sur une photo n'était que le tiers du
 * travail, et pas celui qui vend.
 *
 * Chaque dispositif se coupe indépendamment : une composition se juge à
 * l'écran, et ce qui alourdit doit pouvoir disparaître sans régénérer la
 * photo.
 */

const NOMS: Record<string, string> = {
  pastille: 'Pastille', accroche: 'Accroche', sous: 'Sous-accroche',
  comparatif: 'Comparatif', puces: 'Puces', prix: 'Prix',
  bouton: 'Bouton', mention: 'Mention',
}

/** La famille nommée dans l'ADN passe en tête, le repli garantit le rendu. */
function familles(description: string | undefined, repli: string): string {
  const connues = ['Poppins', 'Montserrat', 'Inter', 'Roboto', 'Lato', 'Open Sans',
    'Source Sans', 'Helvetica', 'Arial', 'DM Sans', 'Work Sans', 'Nunito']
  const trouvee = connues.find((f) => new RegExp(f, 'i').test(description || ''))
  return [trouvee, repli, 'system-ui', '-apple-system', 'sans-serif']
    .filter(Boolean).map((f) => `"${f}"`).join(', ')
}

const hex = (v: unknown, repli: string) =>
  /^#[0-9a-f]{6}$/i.test(String(v ?? '')) ? String(v) : repli

export function ComposeurImage({ src, feuille, ratioInitial = '9:16', nom, adn }: {
  src: string
  feuille: Feuille | null
  ratioInitial?: string
  nom: string
  /** L'ADN du compte tel qu'enregistré : couleurs, polices, bouton. */
  adn?: Record<string, unknown> | null
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ratio, setRatio] = useState(FORMATS[ratioInitial] ? ratioInitial : '9:16')
  const [position, setPosition] = useState<'bas' | 'haut'>('bas')
  const [actifs, setActifs] = useState<Record<number, boolean>>({})
  const [accentChoisi, setAccentChoisi] = useState('')
  const [pret, setPret] = useState(false)

  const dispositifs = useMemo(() => dispositifsDeLaFeuille(feuille), [feuille])

  const marque: Marque = useMemo(() => {
    const v = (adn?.systeme_visuel ?? {}) as Record<string, unknown>
    const b = (adn?.bouton ?? {}) as Record<string, unknown>
    const accent = hex(v.couleur_accent, '#3434ef')
    return {
      accent,
      principale: hex(v.couleur_principale, '#0d0d12'),
      policeTitre: familles(v.police_titre as string, 'DM Sans'),
      policeTexte: familles(v.police_texte as string, 'DM Sans'),
      boutonFond: hex(b.fond, accent),
      boutonTexte: hex(b.texte, '#ffffff'),
      boutonPilule: String(b.forme ?? '').includes('pilule'),
    }
  }, [adn])

  const accroche = dispositifs.find((d) => d.type === 'accroche')
  const mots = useMemo(
    () => motsAccentues(accroche && 'texte' in accroche ? accroche.texte : '', accentChoisi),
    [accroche, accentChoisi],
  )

  const dessiner = useCallback(async () => {
    const c = canvas.current
    if (!c) return
    const ok = await dessinerCrea(c, src, dispositifs, marque,
      { ratio, position, actifs, accentChoisi }, mots)
    setPret(ok)
  }, [src, dispositifs, marque, ratio, position, actifs, accentChoisi, mots])

  useEffect(() => { dessiner() }, [dessiner])

  function telecharger() {
    canvas.current?.toBlob((b) => {
      if (!b) return
      const url = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = url
      a.download = `${nom.replace(/[^\w\sÀ-ÿ-]/g, '').slice(0, 50).trim() || 'crea'} ${ratio.replace(':', 'x')}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    }, 'image/png')
  }

  const pastille = 'text-[11px] px-2.5 py-1 rounded-lg border transition-colors'

  return (
    <div className="mt-2 border border-[#E5E7EB] rounded-lg p-3 bg-white space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {Object.entries(FORMATS).map(([id, f]) => (
          <button key={id} onClick={() => setRatio(id)}
            className={clsx(pastille, ratio === id
              ? 'bg-[#3434ef] text-white border-[#3434ef]'
              : 'border-[#E5E7EB] text-gray-600 hover:border-[#3434ef]')}>
            {id} <span className="opacity-60">{f.libelle}</span>
          </button>
        ))}
        <span className="w-px h-4 bg-[#E5E7EB] mx-1" />
        {(['bas', 'haut'] as const).map((p) => (
          <button key={p} onClick={() => setPosition(p)}
            className={clsx(pastille, position === p
              ? 'bg-[#3434ef] text-white border-[#3434ef]'
              : 'border-[#E5E7EB] text-gray-600 hover:border-[#3434ef]')}>
            texte en {p}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            Dispositifs{dispositifs.length ? ` · ${dispositifs.length}` : ''}
          </p>
          {dispositifs.length ? (
            <div className="flex flex-wrap gap-1.5">
              {dispositifs.map((d, i) => (
                <button key={i} onClick={() => setActifs((a) => ({ ...a, [i]: a[i] === false }))}
                  className={clsx(pastille, actifs[i] !== false
                    ? 'bg-[#0d0d12] text-white border-[#0d0d12]'
                    : 'border-[#E5E7EB] text-gray-400 line-through')}>
                  {NOMS[d.type] ?? d.type}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Ce brief ne porte aucun texte incrusté. Régénérez-le pour obtenir
              accroche, comparatif, puces et bouton.
            </p>
          )}

          <div>
            <label className="text-[10px] text-gray-400">Mots en couleur d’accent</label>
            <input value={accentChoisi} onChange={(e) => setAccentChoisi(e.target.value)}
              placeholder="détecté seul : les chiffres et les montants"
              className="w-full text-[11px] border border-[#E5E7EB] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#3434ef]" />
          </div>

          <p className="text-[10px] text-gray-400 leading-relaxed">
            Coupez un dispositif pour alléger, sans régénérer la photo.
            {!adn && ' Aucun ADN de marque : les couleurs restent celles du produit.'}
          </p>

          <button onClick={telecharger} disabled={!pret}
            className="btn-primary text-[11px] px-3 py-1.5 disabled:opacity-40">
            Télécharger le {ratio}
          </button>
        </div>

        <canvas ref={canvas} className="border border-[#E5E7EB] rounded-lg h-72 w-auto justify-self-center" />
      </div>
    </div>
  )
}
