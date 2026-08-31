'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'

/**
 * L'incrustation du texte, faite ici plutôt que par le générateur d'images.
 *
 * Un générateur **dessine** le texte, il ne le compose pas : les lettres se
 * déforment, les polices changent d'un bloc à l'autre, et le bandeau tombe
 * sur le bras du sujet. Sur une créa dont toute la promesse tient dans une
 * accroche, c'est rédhibitoire — et aucun réglage de prompt n'y remédie de
 * façon fiable.
 *
 * Ici le texte reste du texte. Il est net, il est à la bonne place, et il se
 * modifie sans régénérer la photo : trois accroches se testent sur le même
 * visuel pour le prix d'une image. Les deux ratios sortent de la même photo,
 * recadrée — plutôt que de deux générations montrant deux personnes
 * différentes.
 */

export type TextesCrea = { accroche?: string; sous_accroche?: string; mention?: string }

/** Les formats servis, en pixels réels de livraison. */
const FORMATS: Record<string, { l: number; h: number; libelle: string }> = {
  '1:1': { l: 1080, h: 1080, libelle: 'Fil' },
  '4:5': { l: 1080, h: 1350, libelle: 'Fil vertical' },
  '9:16': { l: 1080, h: 1920, libelle: 'Story / Reels' },
}

/**
 * Les couleurs du produit ne sont qu'un repli.
 *
 * L'incrustation posait systématiquement le bleu d'Apogee sur des créas de
 * clients qui ont leur propre accent — un filet bleu sur une marque jaune,
 * c'est la signature de l'outil au milieu de la publicité du client.
 */
const BLEU_DEFAUT = '#3434ef'

/** Extrait une famille utilisable d'une description libre de l'ADN. */
function familles(description: string | undefined, repli: string): string {
  const connues = ['Poppins', 'Montserrat', 'Inter', 'Roboto', 'Lato', 'Open Sans',
    'Source Sans', 'Helvetica', 'Arial', 'DM Sans', 'Work Sans', 'Nunito']
  const trouvee = connues.find((f) => new RegExp(f, 'i').test(description || ''))
  // La famille nommée passe en tête : si le navigateur ne l'a pas, la pile de
  // secours prend le relais sans que le rendu casse.
  return [trouvee, repli, 'system-ui', '-apple-system', 'sans-serif']
    .filter(Boolean).map((f) => `"${f}"`).join(', ')
}

/** Découpe un texte en lignes qui tiennent dans la largeur donnée. */
function lignes(ctx: CanvasRenderingContext2D, texte: string, largeur: number): string[] {
  const out: string[] = []
  for (const paragraphe of texte.split('\n')) {
    let courante = ''
    for (const mot of paragraphe.split(/\s+/).filter(Boolean)) {
      const essai = courante ? `${courante} ${mot}` : mot
      if (ctx.measureText(essai).width <= largeur) courante = essai
      else { if (courante) out.push(courante); courante = mot }
    }
    if (courante) out.push(courante)
  }
  return out
}

export function ComposeurImage({ src, textes, ratioInitial = '9:16', nom, marque }: {
  src: string
  textes: TextesCrea
  ratioInitial?: string
  nom: string
  /** L'ADN du compte : ses couleurs et ses polices, pas celles du produit. */
  marque?: { accent?: string; policeTitre?: string; policeTexte?: string }
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ratio, setRatio] = useState(FORMATS[ratioInitial] ? ratioInitial : '9:16')
  const [position, setPosition] = useState<'bas' | 'haut'>('bas')
  const [accroche, setAccroche] = useState(textes.accroche || '')
  const [sous, setSous] = useState(textes.sous_accroche || '')
  const [mention, setMention] = useState(textes.mention || '')
  const [pret, setPret] = useState(false)

  const accent = /^#[0-9a-f]{6}$/i.test(marque?.accent || '') ? (marque!.accent as string) : BLEU_DEFAUT
  const policeTitre = familles(marque?.policeTitre, 'DM Sans')
  const policeTexte = familles(marque?.policeTexte, 'DM Sans')

  const dessiner = useCallback(async () => {
    const c = canvas.current
    if (!c) return
    const f = FORMATS[ratio]
    c.width = f.l
    c.height = f.h
    const ctx = c.getContext('2d')
    if (!ctx) return

    // Attendre la police : sans ça, le premier rendu tombe sur la police de
    // secours et le texte change d'allure une fraction de seconde plus tard.
    try { await (document as Document & { fonts?: FontFaceSet }).fonts?.ready } catch { /* ignoré */ }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((ok, ko) => {
      img.onload = () => ok()
      img.onerror = () => ko(new Error('image illisible'))
      img.src = src
    })

    /* La photo remplit le cadre, recadrée au centre — jamais déformée. */
    const echelle = Math.max(f.l / img.width, f.h / img.height)
    const li = img.width * echelle
    const hi = img.height * echelle
    ctx.drawImage(img, (f.l - li) / 2, (f.h - hi) / 2, li, hi)

    /**
     * Les zones que l'interface d'Instagram recouvre.
     *
     * 15 % en haut, 20 % en bas sur une story : y placer du texte revient à
     * ne pas l'afficher. Le bloc s'installe donc à l'intérieur de ce qui
     * reste, quel que soit le ratio.
     */
    const story = ratio === '9:16'
    const hautSur = story ? f.h * 0.15 : f.h * 0.06
    const basSur = story ? f.h * 0.2 : f.h * 0.08
    const marge = f.l * 0.07
    const largeurTexte = f.l - marge * 2

    /* Mesurer avant de peindre : le voile doit couvrir le texte, pas l'inverse. */
    const tAccroche = Math.round(f.l * (story ? 0.082 : 0.075))
    const tSous = Math.round(tAccroche * 0.46)
    const tMention = Math.round(tAccroche * 0.33)
    const interA = tAccroche * 1.12
    const interS = tSous * 1.25

    ctx.font = `700 ${tAccroche}px ${policeTitre}`
    const lA = accroche.trim() ? lignes(ctx, accroche.toUpperCase(), largeurTexte) : []
    ctx.font = `600 ${tSous}px ${policeTitre}`
    const lS = sous.trim() ? lignes(ctx, sous.toUpperCase(), largeurTexte) : []
    ctx.font = `400 ${tMention}px ${policeTexte}`
    const lM = mention.trim() ? lignes(ctx, mention, largeurTexte) : []

    const hBloc =
      lA.length * interA +
      (lS.length ? tAccroche * 0.42 + lS.length * interS : 0) +
      (lM.length ? tAccroche * 0.3 + lM.length * tMention * 1.3 : 0)

    const yBloc = position === 'bas'
      ? f.h - basSur - hBloc - f.h * 0.02
      : hautSur + f.h * 0.03

    /**
     * Le voile court jusqu'au bord de l'image.
     *
     * Limité à la hauteur du texte, il laissait une ligne horizontale nette là
     * où il s'arrêtait — la photo reprenait sa luminosité d'un coup. Un
     * dégradé qui va jusqu'au bord n'a qu'une extrémité visible, et elle est
     * transparente.
     */
    const fondu = f.h * 0.22
    const g = position === 'bas'
      ? ctx.createLinearGradient(0, yBloc - fondu, 0, f.h)
      : ctx.createLinearGradient(0, 0, 0, yBloc + hBloc + fondu)
    const stops: [number, string][] = position === 'bas'
      ? [[0, 'rgba(8,8,14,0)'], [0.42, 'rgba(8,8,14,0.66)'], [1, 'rgba(8,8,14,0.9)']]
      : [[0, 'rgba(8,8,14,0.9)'], [0.58, 'rgba(8,8,14,0.66)'], [1, 'rgba(8,8,14,0)']]
    for (const [p, col] of stops) g.addColorStop(p, col)
    ctx.fillStyle = g
    ctx.fillRect(0, position === 'bas' ? Math.max(0, yBloc - fondu) : 0,
      f.l, position === 'bas' ? f.h - Math.max(0, yBloc - fondu) : yBloc + hBloc + fondu)

    let y = yBloc
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 ${tAccroche}px ${policeTitre}`
    for (const l of lA) { ctx.fillText(l, marge, y); y += interA }

    if (lS.length) {
      y += tAccroche * 0.42
      // Un filet aux couleurs de la marque sépare l'accroche de la bascule :
      // l'œil s'arrête, puis repart. Deux blocs collés se lisent comme un seul.
      ctx.fillStyle = accent
      ctx.fillRect(marge, y - tAccroche * 0.22, f.l * 0.09, Math.max(3, f.l * 0.005))
      ctx.fillStyle = '#ffffff'
      ctx.font = `600 ${tSous}px ${policeTitre}`
      for (const l of lS) { ctx.fillText(l, marge, y); y += interS }
    }

    if (lM.length) {
      y += tAccroche * 0.3
      ctx.fillStyle = 'rgba(255,255,255,0.82)'
      ctx.font = `400 ${tMention}px ${policeTexte}`
      for (const l of lM) { ctx.fillText(l, marge, y); y += tMention * 1.3 }
    }

    setPret(true)
  }, [src, ratio, position, accroche, sous, mention, accent, policeTitre, policeTexte])

  useEffect(() => { dessiner().catch(() => setPret(false)) }, [dessiner])

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

  const champ = 'w-full text-[11px] border border-[#E5E7EB] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#3434ef]'

  return (
    <div className="mt-2 border border-[#E5E7EB] rounded-lg p-3 bg-white space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {Object.entries(FORMATS).map(([id, f]) => (
          <button key={id} onClick={() => setRatio(id)}
            className={clsx('text-[11px] px-2.5 py-1 rounded-lg border transition-colors',
              ratio === id ? 'bg-[#3434ef] text-white border-[#3434ef]'
                : 'border-[#E5E7EB] text-gray-600 hover:border-[#3434ef]')}>
            {id} <span className="opacity-60">{f.libelle}</span>
          </button>
        ))}
        <span className="w-px h-4 bg-[#E5E7EB] mx-1" />
        {(['bas', 'haut'] as const).map((p) => (
          <button key={p} onClick={() => setPosition(p)}
            className={clsx('text-[11px] px-2.5 py-1 rounded-lg border transition-colors',
              position === p ? 'bg-[#3434ef] text-white border-[#3434ef]'
                : 'border-[#E5E7EB] text-gray-600 hover:border-[#3434ef]')}>
            texte en {p}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
        <div className="space-y-1.5">
          <input value={accroche} onChange={(e) => setAccroche(e.target.value)}
            placeholder="Accroche" className={champ} />
          <input value={sous} onChange={(e) => setSous(e.target.value)}
            placeholder="Sous-accroche" className={champ} />
          <input value={mention} onChange={(e) => setMention(e.target.value)}
            placeholder="Mention" className={champ} />
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Le texte se modifie sans régénérer la photo — trois accroches se testent
            sur le même visuel.
          </p>
          <button onClick={telecharger} disabled={!pret}
            className="btn-primary text-[11px] px-3 py-1.5 disabled:opacity-40">
            Télécharger le {ratio}
          </button>
        </div>
        <canvas ref={canvas} className="border border-[#E5E7EB] rounded-lg h-64 w-auto justify-self-center" />
      </div>
    </div>
  )
}
