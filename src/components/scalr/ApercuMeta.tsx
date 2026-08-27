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

export type Apercu = { src: string | null; largeur: number | null; hauteur: number | null }

/**
 * Le cadre seul, sans récupération.
 *
 * La galerie tire ses aperçus par lots — un appel pour toute la page — et
 * n'a donc rien à charger ici. Le détail créa, lui, en veut un seul et change
 * de placement : `ApercuMeta` l'enveloppe pour ça.
 */
export function CadreApercu({ apercu, etat, interactif = false, mode = 'remplir' }: {
  apercu: Apercu | null
  etat: Etat
  interactif?: boolean
  mode?: 'remplir' | 'entier'
}) {
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

  const largeur = apercu?.largeur || LARGEUR_DEFAUT
  const hauteur = apercu?.hauteur || 0

  // Remplir la largeur, sans plafond : une bande blanche à droite se voit
  // bien plus qu'un léger adoucissement du rendu.
  const echelle = boite.l ? boite.l / largeur : 1

  // En mode entier, c'est le cadre qui se règle sur la publicité : lui imposer
  // une hauteur arbitraire la couperait ou la laisserait flotter dans du vide.
  const hauteurCadre = mode === 'entier' && hauteur ? hauteur * echelle : undefined
  const hauteurIframe = mode === 'entier'
    ? (hauteur || boite.h)
    : (echelle ? boite.h / echelle : '100%')

  return (
    <div ref={cadre} className="w-full h-full overflow-hidden bg-[#f8f9fc]" style={{ height: hauteurCadre }}>
      {apercu?.src ? (
        <iframe src={apercu.src} title="Aperçu de la publicité"
          sandbox="allow-scripts allow-same-origin" loading="lazy"
          className={interactif ? 'border-0' : 'border-0 pointer-events-none'}
          style={{
            width: largeur,
            height: hauteurIframe,
            transform: `scale(${echelle})`,
            transformOrigin: 'top left',
          }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-300">
          {etat === 'charge' ? (
            <svg className="w-6 h-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          ) : (
            <span className="text-[10px] text-gray-400 px-2 text-center">Aperçu indisponible</span>
          )}
        </div>
      )}
    </div>
  )
}

/** Un aperçu qui va le chercher lui-même : un seul, dont le placement change. */
export function ApercuMeta({ adId, format = 'MOBILE_FEED_STANDARD', interactif = false, mode = 'remplir' }: {
  adId: string
  format?: string
  interactif?: boolean
  mode?: 'remplir' | 'entier'
}) {
  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [etat, setEtat] = useState<Etat>('charge')

  useEffect(() => {
    let vivant = true
    setApercu(null); setEtat('charge')
    fetch(`/api/scalr/preview?adId=${adId}&format=${format}`)
      .then((r) => r.json())
      .then((d) => {
        if (!vivant) return
        if (!d.src) { setEtat('absent'); return }
        setApercu({ src: d.src, largeur: d.largeur, hauteur: d.hauteur })
        setEtat('pret')
      })
      .catch(() => { if (vivant) setEtat('absent') })
    return () => { vivant = false }
  }, [adId, format])

  return <CadreApercu apercu={apercu} etat={etat} interactif={interactif} mode={mode} />
}
