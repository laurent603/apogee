'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * L'aperçu officiel d'une publicité, mis à l'échelle de son cadre.
 *
 * C'est le seul moyen de voir une créa : `thumbnail_url` plafonne à 64×64, et
 * l'image de la publication n'existe pas pour des dark posts, non publiés sur
 * la Page.
 *
 * **Le rendu Meta ne se remet pas en page.** C'est un document de largeur
 * fixe : rétréci il est rogné, élargi il laisse une bande blanche. Il faut
 * donc le rendre à sa taille naturelle et le mettre à l'échelle — et
 * connaître cette taille, que Meta déclare sur son fragment, plutôt que la
 * supposer. Elle change avec le placement : un fil mobile et une story n'ont
 * pas la même forme.
 *
 * Meta rend un fragment `<iframe src="…">` : on n'en garde que l'URL, insérée
 * dans une iframe cadrée et cloisonnée. Injecter son HTML tel quel
 * exécuterait chez nous un document qu'on ne contrôle pas.
 */

/** Repli quand Meta ne déclare pas ses dimensions : la largeur d'un fil mobile. */
const LARGEUR_DEFAUT = 320

type Etat = 'charge' | 'absent' | 'pret'

export function ApercuMeta({ adId, format = 'MOBILE_FEED_STANDARD', delai = 0, interactif = false, mode = 'remplir' }: {
  adId: string
  format?: string
  /** Décale l'appel, pour ne pas en envoyer vingt d'un coup. */
  delai?: number
  /** Laisse le curseur atteindre le rendu — inutile sur une vignette. */
  interactif?: boolean
  /**
   * `remplir` occupe tout le cadre et recadre par le bas : c'est une vignette,
   * on veut voir la créa, pas les boutons sous elle.
   * `entier` montre la publicité complète, pour l'examiner.
   */
  mode?: 'remplir' | 'entier'
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [naturel, setNaturel] = useState({ l: LARGEUR_DEFAUT, h: 0 })
  const [etat, setEtat] = useState<Etat>('charge')
  const cadre = useRef<HTMLDivElement>(null)
  const [boite, setBoite] = useState({ l: 0, h: 0 })

  useEffect(() => {
    const el = cadre.current
    if (!el) return
    const mesurer = () => setBoite({ l: el.clientWidth, h: el.clientHeight })
    mesurer()
    const ro = new ResizeObserver(mesurer)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let vivant = true
    setSrc(null); setEtat('charge')
    const t = setTimeout(() => {
      fetch(`/api/scalr/preview?adId=${adId}&format=${format}`)
        .then((r) => r.json())
        .then((d) => {
          if (!vivant) return
          if (!d.src) { setEtat('absent'); return }
          setSrc(d.src)
          setNaturel({ l: d.largeur || LARGEUR_DEFAUT, h: d.hauteur || 0 })
          setEtat('pret')
        })
        .catch(() => { if (vivant) setEtat('absent') })
    }, delai)
    return () => { vivant = false; clearTimeout(t) }
  }, [adId, format, delai])

  // Remplir la largeur, sans plafond : une bande blanche à droite se voit
  // bien plus qu'un léger adoucissement du rendu.
  const echelle = boite.l ? boite.l / naturel.l : 1

  // En mode entier, c'est le cadre qui se règle sur la publicité : lui imposer
  // une hauteur arbitraire la couperait ou la laisserait flotter dans du vide.
  const hauteurCadre = mode === 'entier' && naturel.h ? naturel.h * echelle : undefined
  const hauteurIframe = mode === 'entier'
    ? (naturel.h || boite.h)
    : (echelle ? boite.h / echelle : '100%')

  return (
    <div ref={cadre} className="w-full h-full overflow-hidden bg-[#f8f9fc]" style={{ height: hauteurCadre }}>
      {src ? (
        <iframe src={src} title="Aperçu de la publicité"
          sandbox="allow-scripts allow-same-origin" loading="lazy"
          className={interactif ? 'border-0' : 'border-0 pointer-events-none'}
          style={{
            width: naturel.l,
            height: hauteurIframe,
            transform: `scale(${echelle})`,
            transformOrigin: 'top left',
          }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-300">
          {etat === 'absent' ? (
            <span className="text-[10px] text-gray-400 px-2 text-center">Aperçu indisponible</span>
          ) : (
            <svg className="w-6 h-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </div>
      )}
    </div>
  )
}
