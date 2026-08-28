'use client'
import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'

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

export type Apercu = { src: string | null; largeur: number | null; hauteur: number | null; erreur?: string | null }

/**
 * Le cadre seul, sans récupération.
 *
 * La galerie tire ses aperçus par lots — un appel pour toute la page — et
 * n'a donc rien à charger ici. Le détail créa, lui, en veut un seul et change
 * de placement : `ApercuMeta` l'enveloppe pour ça.
 */
export function CadreApercu({ apercu, etat, interactif = false, mode = 'remplir', paresseux = false, hauteurRepli = 0 }: {
  apercu: Apercu | null
  etat: Etat
  interactif?: boolean
  mode?: 'remplir' | 'entier'
  /**
   * Hauteur à retenir quand Meta ne déclare pas la sienne.
   *
   * Sans elle, le cadre d'un aperçu entier retombe sur `h-full` dans un parent
   * de hauteur automatique — c'est-à-dire zéro, et la publicité disparaît
   * complètement.
   */
  hauteurRepli?: number
  /**
   * N'insère l'iframe qu'à l'approche de l'écran.
   *
   * Une iframe d'aperçu n'est pas une image : c'est un document Meta entier,
   * avec ses scripts, ses feuilles de style et la créa. En monter trente d'un
   * coup, c'est des dizaines de mégaoctets et des centaines de connexions
   * ouvertes ensemble — le mur rame quelle que soit la vitesse à laquelle on a
   * obtenu les URLs.
   */
  paresseux?: boolean
}) {
  const cadre = useRef<HTMLDivElement>(null)
  const [boite, setBoite] = useState({ l: 0, h: 0 })
  const [aPortee, setAPortee] = useState(!paresseux)

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
    if (!paresseux) { setAPortee(true); return }
    const el = cadre.current
    if (!el) return

    // Un observateur qui ne se déclenche pas laisserait la carte en
    // chargement pour toujours, sans erreur ni trace — c'est ce qui était
    // arrivé la première fois. Le minuteur garantit l'affichage même si le
    // signal ne vient jamais.
    const secours = setTimeout(() => setAPortee(true), 4000)
    const io = new IntersectionObserver((entrees) => {
      if (!entrees.some((e) => e.isIntersecting)) return
      setAPortee(true)
      clearTimeout(secours)
      io.disconnect()
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => { clearTimeout(secours); io.disconnect() }
  }, [paresseux])

  const largeur = apercu?.largeur || LARGEUR_DEFAUT
  const hauteur = apercu?.hauteur || hauteurRepli

  /**
   * Deux cadrages, deux contraintes.
   *
   * Une vignette remplit la largeur et se recadre par le bas, là où Meta
   * empile ses boutons : on veut voir la créa.
   *
   * Un aperçu entier doit tenir *dans* son cadre, donc se cale sur la
   * dimension la plus contraignante des deux. N'ajuster que la largeur suffit
   * pour une story, qui est courte, et fait déborder un fil, qui porte ses
   * commentaires et son bouton — c'est la modale qui se met alors à défiler,
   * et on ne voit plus la publicité d'un seul coup d'œil.
   */
  const echelle = mode === 'entier'
    ? (boite.l && boite.h && hauteur ? Math.min(boite.l / largeur, boite.h / hauteur) : 1)
    : (boite.l ? boite.l / largeur : 1)

  const hauteurIframe = mode === 'entier'
    ? (hauteur || boite.h)
    : (echelle ? boite.h / echelle : '100%')

  return (
    <div ref={cadre} className={clsx('w-full h-full overflow-hidden bg-[#f8f9fc]',
      mode === 'entier' && 'flex items-center justify-center')}>
      {apercu?.src && aPortee ? (
        <iframe src={apercu.src} title="Aperçu de la publicité"
          sandbox="allow-scripts allow-same-origin" loading="lazy"
          className={clsx('border-0 flex-shrink-0', !interactif && 'pointer-events-none')}
          style={{
            width: largeur,
            height: hauteurIframe,
            transform: `scale(${echelle})`,
            transformOrigin: mode === 'entier' ? 'center' : 'top left',
          }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-300">
          {etat === 'charge' ? (
            <svg className="w-6 h-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          ) : (
            // Le message de Meta plutôt qu'un « indisponible » muet : une
            // publicité n'est pas éligible à tous les placements, et savoir
            // lequel des deux vaut mieux que deviner.
            <span className="text-[11px] text-gray-400 px-3 text-center leading-snug">
              {apercu?.erreur || 'Aperçu indisponible pour ce placement'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Un aperçu qui va le chercher lui-même : un seul, dont le placement change.
 *
 * En mode entier, il mesure d'abord son cadre et **demande à Meta de composer
 * pour cette boîte**. C'est ce qui évite d'avoir à deviner la hauteur d'une
 * publicité : elle dépend du placement et de la publicité — longueur de
 * l'accroche, bouton, ligne de réactions —, et le contenu de l'iframe vient de
 * facebook.com, donc reste hors de portée de toute mesure.
 */
export function ApercuMeta({ adId, format = 'MOBILE_FEED_STANDARD', interactif = false, mode = 'remplir', hauteurRepli = 0 }: {
  adId: string
  format?: string
  interactif?: boolean
  mode?: 'remplir' | 'entier'
  hauteurRepli?: number
}) {
  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [etat, setEtat] = useState<Etat>('charge')
  const cadre = useRef<HTMLDivElement>(null)
  const [boite, setBoite] = useState({ l: 0, h: 0 })

  useEffect(() => {
    const el = cadre.current
    if (!el) return
    // Arrondi au pas de 20 px : sans lui, le moindre redimensionnement
    // relancerait un appel à Meta.
    const pas = (n: number) => Math.round(n / 20) * 20
    const mesurer = () => setBoite({ l: pas(el.clientWidth), h: pas(el.clientHeight) })
    mesurer()
    const ro = new ResizeObserver(mesurer)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /**
   * En dessous de cette largeur, on cesse de demander un rendu sur mesure.
   *
   * Meta ne rend rien d'exploitable pour une boîte trop étroite, et la
   * demande elle-même entretient une boucle : le cadre se mesure, l'iframe
   * arrive à une autre hauteur, le cadre se remesure, on redemande. Sur un
   * téléphone la boucle ne se stabilise pas — l'écran saute et l'aperçu reste
   * vide. On retombe alors sur la taille naturelle de Meta, mise à l'échelle.
   */
  const LARGEUR_SUR_MESURE = 360

  const surMesure = mode === 'entier' && boite.l >= LARGEUR_SUR_MESURE
  const pret = mode !== 'entier' || boite.l > 0

  useEffect(() => {
    if (!pret) return
    let vivant = true
    setApercu(null); setEtat('charge')

    const q = new URLSearchParams({ adId, format })
    if (surMesure) { q.set('width', String(boite.l)); q.set('height', String(boite.h)) }

    fetch(`/api/scalr/preview?${q}`)
      .then((r) => r.json())
      .then((d) => {
        if (!vivant) return
        if (!d.src) {
          setApercu({ src: null, largeur: null, hauteur: null, erreur: d.error })
          setEtat('absent')
          return
        }
        setApercu({ src: d.src, largeur: d.largeur, hauteur: d.hauteur })
        setEtat('pret')
      })
      .catch(() => { if (vivant) setEtat('absent') })
    return () => { vivant = false }
  }, [adId, format, surMesure, pret, boite.l, boite.h])

  return (
    <div ref={cadre} className="w-full h-full">
      <CadreApercu apercu={apercu} etat={etat} interactif={interactif}
        mode={mode} hauteurRepli={hauteurRepli} />
    </div>
  )
}
