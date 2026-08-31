import { ACCENT_AUTO, estChiffre, type Dispositif, type Marque } from './dispositifs'

/**
 * Le rendu d'une créa statique sur un canevas.
 *
 * Deux passes, et c'est ce qui permet la densité : chaque dispositif se
 * **mesure** d'abord, on additionne, puis on réduit l'échelle jusqu'à ce que
 * l'ensemble tienne dans la zone utile. Sans cette mesure préalable, une créa
 * à six dispositifs déborde ou oblige à en sacrifier un au hasard — alors que
 * la densité est un choix de l'angle, pas un accident.
 */

export const FORMATS: Record<string, { l: number; h: number; libelle: string }> = {
  '1:1': { l: 1080, h: 1080, libelle: 'Fil' },
  '4:5': { l: 1080, h: 1350, libelle: 'Fil vertical' },
  '9:16': { l: 1080, h: 1920, libelle: 'Story / Reels' },
}

type Ctx = CanvasRenderingContext2D

/** Découpe un texte en lignes qui tiennent dans la largeur donnée. */
function lignes(ctx: Ctx, texte: string, largeur: number): string[] {
  const out: string[] = []
  for (const paragraphe of String(texte ?? '').split('\n')) {
    let courante = ''
    for (const mot of paragraphe.split(/\s+/).filter(Boolean)) {
      const essai = courante ? `${courante} ${mot}` : mot
      if (ctx.measureText(essai).width <= largeur) courante = essai
      else { if (courante) out.push(courante); courante = mot }
    }
    if (courante) out.push(courante)
  }
  return out.length ? out : ['']
}

/**
 * Écrit une ligne en colorant certains mots.
 *
 * La règle d'accent des comptes porte sur des mots, pas sur des phrases : il
 * faut donc écrire mot à mot pour ne teinter que ceux qui portent la
 * promesse. Un `fillText` unique ne le permet pas.
 */
function ligneAccentuee(ctx: Ctx, ligne: string, x: number, y: number, normal: string, accent: string, mots: Set<string>) {
  let cx = x
  const auto = mots.has(ACCENT_AUTO)
  for (const mot of ligne.split(' ')) {
    const nu = mot.toLowerCase().replace(/[.,;:!?»«"]/g, '')
    let teinte = auto && estChiffre(nu)
    if (!auto) {
      for (const m of mots) {
        if (!m) continue
        if (nu === m || (m.length > 2 && nu.includes(m)) || (nu.length > 2 && m.includes(nu))) { teinte = true; break }
      }
    }
    ctx.fillStyle = teinte ? accent : normal
    ctx.fillText(mot, cx, y)
    cx += ctx.measureText(mot + ' ').width
  }
}

const arrondi = (ctx: Ctx, x: number, y: number, l: number, h: number, r: number) => {
  ctx.beginPath()
  // `roundRect` n'existe pas partout ; le tracé manuel évite un rendu absent
  // là où on ne peut pas le vérifier.
  const rr = Math.min(r, l / 2, h / 2)
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + l, y, x + l, y + h, rr)
  ctx.arcTo(x + l, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + l, y, rr)
  ctx.closePath()
}

export type Reglages = {
  ratio: string
  position: 'bas' | 'haut'
  actifs: Record<number, boolean>
  accentChoisi?: string
}

/**
 * Dessine la créa. Rend `false` si la photo est illisible.
 *
 * L'échelle est cherchée par essais successifs : on part de 1 et on resserre
 * tant que l'empilement dépasse la zone utile. Huit essais suffisent à passer
 * de six dispositifs serrés à une créa qui respire.
 */
export async function dessinerCrea(
  canvas: HTMLCanvasElement,
  photo: string,
  dispositifs: Dispositif[],
  marque: Marque,
  r: Reglages,
  motsAccent: Set<string>,
): Promise<boolean> {
  const f = FORMATS[r.ratio] ?? FORMATS['9:16']
  canvas.width = f.l
  canvas.height = f.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return false

  try { await (document as Document & { fonts?: FontFaceSet }).fonts?.ready } catch { /* ignoré */ }

  const img = new Image()
  img.crossOrigin = 'anonymous'
  try {
    await new Promise<void>((ok, ko) => {
      img.onload = () => ok()
      img.onerror = () => ko(new Error('photo illisible'))
      img.src = photo
    })
  } catch { return false }

  const ech = Math.max(f.l / img.width, f.h / img.height)
  ctx.drawImage(img, (f.l - img.width * ech) / 2, (f.h - img.height * ech) / 2, img.width * ech, img.height * ech)

  const story = r.ratio === '9:16'
  const hautSur = story ? f.h * 0.15 : f.h * 0.06
  const basSur = story ? f.h * 0.2 : f.h * 0.08
  const marge = f.l * 0.07
  const largeur = f.l - marge * 2
  const zone = f.h - hautSur - basSur - f.h * 0.04

  const visibles = dispositifs.filter((_, i) => r.actifs[i] !== false)

  /** Mesure l'empilement à une échelle donnée, sans rien peindre. */
  const mesurer = (k: number) => {
    const T = {
      accroche: f.l * 0.082 * k, sous: f.l * 0.038 * k, mention: f.l * 0.027 * k,
      pastille: f.l * 0.026 * k, puce: f.l * 0.031 * k, comparatif: f.l * 0.026 * k,
      prix: f.l * 0.13 * k, bouton: f.l * 0.036 * k,
    }
    let h = 0
    const plan: { d: Dispositif; h: number; T: typeof T }[] = []
    for (const d of visibles) {
      let hd = 0
      if (d.type === 'accroche') {
        ctx.font = `700 ${T.accroche}px ${marque.policeTitre}`
        hd = lignes(ctx, d.texte.toUpperCase(), largeur).length * T.accroche * 1.12
      } else if (d.type === 'sous') {
        ctx.font = `600 ${T.sous}px ${marque.policeTitre}`
        hd = lignes(ctx, d.texte.toUpperCase(), largeur).length * T.sous * 1.28 + T.accroche * 0.4
      } else if (d.type === 'mention') {
        ctx.font = `400 ${T.mention}px ${marque.policeTexte}`
        hd = lignes(ctx, d.texte, largeur).length * T.mention * 1.35 + T.mention * 0.6
      } else if (d.type === 'pastille') {
        ctx.font = `600 ${T.pastille}px ${marque.policeTexte}`
        hd = lignes(ctx, d.texte, largeur - T.pastille * 2).length * T.pastille * 1.3 + T.pastille * 1.6
      } else if (d.type === 'puces') {
        ctx.font = `600 ${T.puce}px ${marque.policeTexte}`
        hd = d.items.reduce((s, it) => s + lignes(ctx, it, largeur - T.puce * 2.4).length * T.puce * 1.3, 0)
          + d.items.length * T.puce * 0.7 + T.puce * 0.4
      } else if (d.type === 'comparatif') {
        hd = T.comparatif * 2.6 + d.lignes.length * T.comparatif * 2.5 + T.comparatif * 1.2
      } else if (d.type === 'prix') {
        hd = T.prix * 1.1 + (d.mention ? T.mention * 1.6 : 0)
      } else if (d.type === 'bouton') {
        hd = T.bouton * 2.7 + T.bouton * 0.6
      }
      plan.push({ d, h: hd, T })
      h += hd + f.h * 0.016
    }
    return { total: h, plan, T }
  }

  let k = 1
  let m = mesurer(k)
  for (let i = 0; i < 10 && m.total > zone; i++) { k *= 0.9; m = mesurer(k) }

  const debut = r.position === 'bas' ? f.h - basSur - m.total - f.h * 0.02 : hautSur + f.h * 0.03

  /* Le voile va jusqu'au bord : borné au texte, il laisse une ligne nette. */
  const fondu = f.h * 0.18
  const g = r.position === 'bas'
    ? ctx.createLinearGradient(0, debut - fondu, 0, f.h)
    : ctx.createLinearGradient(0, 0, 0, debut + m.total + fondu)
  const arrets: [number, string][] = r.position === 'bas'
    ? [[0, 'rgba(8,8,14,0)'], [0.4, 'rgba(8,8,14,0.7)'], [1, 'rgba(8,8,14,0.92)']]
    : [[0, 'rgba(8,8,14,0.92)'], [0.6, 'rgba(8,8,14,0.7)'], [1, 'rgba(8,8,14,0)']]
  for (const [p, c] of arrets) g.addColorStop(p, c)
  ctx.fillStyle = g
  ctx.fillRect(0, r.position === 'bas' ? Math.max(0, debut - fondu) : 0,
    f.l, r.position === 'bas' ? f.h - Math.max(0, debut - fondu) : debut + m.total + fondu)

  ctx.textBaseline = 'top'
  let y = debut
  const T = m.T

  for (const { d, h } of m.plan) {
    if (d.type === 'accroche') {
      ctx.font = `700 ${T.accroche}px ${marque.policeTitre}`
      for (const l of lignes(ctx, d.texte.toUpperCase(), largeur)) {
        ligneAccentuee(ctx, l, marge, y, '#ffffff', marque.accent, motsAccent)
        y += T.accroche * 1.12
      }
    } else if (d.type === 'sous') {
      y += T.accroche * 0.4
      ctx.fillStyle = marque.accent
      ctx.fillRect(marge, y - T.accroche * 0.2, f.l * 0.09, Math.max(3, f.l * 0.005))
      ctx.font = `600 ${T.sous}px ${marque.policeTitre}`
      for (const l of lignes(ctx, d.texte.toUpperCase(), largeur)) {
        ligneAccentuee(ctx, l, marge, y, '#ffffff', marque.accent, motsAccent)
        y += T.sous * 1.28
      }
    } else if (d.type === 'pastille') {
      ctx.font = `600 ${T.pastille}px ${marque.policeTexte}`
      const ls = lignes(ctx, d.texte, largeur - T.pastille * 2)
      const hp = ls.length * T.pastille * 1.3 + T.pastille * 1.2
      const lp = Math.min(largeur, Math.max(...ls.map((l) => ctx.measureText(l).width)) + T.pastille * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
      arrondi(ctx, marge, y, lp, hp, hp / 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      let yp = y + T.pastille * 0.6
      for (const l of ls) { ctx.fillText(l, marge + T.pastille, yp); yp += T.pastille * 1.3 }
    } else if (d.type === 'prix') {
      ctx.font = `700 ${T.prix}px ${marque.policeTitre}`
      ctx.fillStyle = marque.accent
      ctx.fillText(d.montant, marge, y)
      if (d.mention) {
        ctx.font = `500 ${T.mention}px ${marque.policeTexte}`
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillText(d.mention, marge + ctx.measureText(d.montant).width * 0 + 0, y + T.prix * 1.05)
      }
    } else if (d.type === 'puces') {
      ctx.font = `600 ${T.puce}px ${marque.policeTexte}`
      let yp = y + T.puce * 0.4
      for (const it of d.items) {
        const rayon = T.puce * 0.42
        ctx.beginPath()
        ctx.arc(marge + rayon, yp + rayon * 1.05, rayon, 0, Math.PI * 2)
        ctx.fillStyle = marque.accent
        ctx.fill()
        ctx.fillStyle = '#0d0d12'
        ctx.font = `700 ${rayon * 1.2}px ${marque.policeTexte}`
        ctx.fillText('✓', marge + rayon * 0.5, yp + rayon * 0.45)
        ctx.font = `600 ${T.puce}px ${marque.policeTexte}`
        ctx.fillStyle = '#ffffff'
        for (const l of lignes(ctx, it, largeur - T.puce * 2.4)) {
          ctx.fillText(l, marge + T.puce * 1.6, yp)
          yp += T.puce * 1.3
        }
        yp += T.puce * 0.7
      }
    } else if (d.type === 'comparatif') {
      /* Un tableau se lit : fond blanc opaque, jamais translucide. */
      const hc = h - T.comparatif * 1.2
      ctx.fillStyle = '#ffffff'
      arrondi(ctx, marge, y, largeur, hc, T.comparatif)
      ctx.fill()
      const colL = marge + largeur * 0.44
      const lg = largeur * 0.28
      ctx.font = `700 ${T.comparatif * 0.92}px ${marque.policeTitre}`
      ctx.fillStyle = '#74778a'
      ctx.fillText(d.gauche.toUpperCase(), colL, y + T.comparatif * 0.9)
      ctx.fillStyle = marque.principale
      ctx.fillText(d.droite.toUpperCase(), colL + lg, y + T.comparatif * 0.9)
      let yl = y + T.comparatif * 2.6
      for (const l of d.lignes) {
        ctx.font = `600 ${T.comparatif}px ${marque.policeTexte}`
        ctx.fillStyle = '#0d0d12'
        for (const t of lignes(ctx, l.label, largeur * 0.4).slice(0, 2)) {
          ctx.fillText(t, marge + T.comparatif, yl)
        }
        ctx.font = `500 ${T.comparatif * 0.86}px ${marque.policeTexte}`
        ctx.fillStyle = '#9aa0ae'
        ctx.fillText('✕ ' + (l.g || '—').slice(0, 22), colL, yl)
        ctx.fillStyle = marque.principale
        ctx.font = `700 ${T.comparatif * 0.86}px ${marque.policeTexte}`
        ctx.fillText('✓ ' + (l.d || '—').slice(0, 22), colL + lg, yl)
        yl += T.comparatif * 2.5
        ctx.fillStyle = '#eef0f5'
        ctx.fillRect(marge + T.comparatif, yl - T.comparatif * 1.1, largeur - T.comparatif * 2, 1)
      }
    } else if (d.type === 'bouton') {
      ctx.font = `700 ${T.bouton}px ${marque.policeTitre}`
      const lb = Math.min(largeur, ctx.measureText(d.texte).width + T.bouton * 2.4)
      const hb = T.bouton * 2.4
      ctx.fillStyle = marque.boutonFond
      arrondi(ctx, marge, y, lb, hb, marque.boutonPilule ? hb / 2 : T.bouton * 0.5)
      ctx.fill()
      ctx.fillStyle = marque.boutonTexte
      ctx.fillText(d.texte, marge + T.bouton * 1.2, y + hb / 2 - T.bouton * 0.58)
    } else if (d.type === 'mention') {
      y += T.mention * 0.6
      ctx.font = `400 ${T.mention}px ${marque.policeTexte}`
      ctx.fillStyle = 'rgba(255,255,255,0.82)'
      for (const l of lignes(ctx, d.texte, largeur)) { ctx.fillText(l, marge, y); y += T.mention * 1.35 }
    }

    if (!['accroche', 'sous', 'mention'].includes(d.type)) y += h
    y += f.h * 0.016
  }

  return true
}
