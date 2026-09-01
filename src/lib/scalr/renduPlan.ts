import type { Dispositif, Marque } from './dispositifs'
import { ACCENT_AUTO, estChiffre } from './dispositifs'
import { modeAccent, type Plan, type Zone } from './plan'
import { FORMATS } from './rendu'

/**
 * Le rendu d'une créa depuis un plan de composition.
 *
 * Chaque bloc est dessiné **dans sa zone**, aux coordonnées que le plan
 * donne en pourcentages. La taille du texte n'est plus une constante : elle
 * est cherchée pour que le contenu remplisse sa zone sans la dépasser, ce qui
 * permet à la même créa de tenir en 1:1 comme en 9:16 sans réécrire le plan.
 *
 * Ce qui manque encore, et qui est annoncé plutôt que bâclé : le détourage
 * d'un sujet, qui demande de retirer un fond, et la flèche de liaison entre
 * deux zones. La photo détourée est donc posée en encart.
 */

type Ctx = CanvasRenderingContext2D

const px = (v: number, total: number) => (v / 100) * total

function lignes(ctx: Ctx, texte: string, largeur: number): string[] {
  const out: string[] = []
  for (const p of String(texte ?? '').split('\n')) {
    let courante = ''
    for (const mot of p.split(/\s+/).filter(Boolean)) {
      const essai = courante ? `${courante} ${mot}` : mot
      if (ctx.measureText(essai).width <= largeur) courante = essai
      else { if (courante) out.push(courante); courante = mot }
    }
    if (courante) out.push(courante)
  }
  return out.length ? out : ['']
}

const arrondi = (ctx: Ctx, x: number, y: number, l: number, h: number, r: number) => {
  const rr = Math.max(0, Math.min(r, l / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + l, y, x + l, y + h, rr)
  ctx.arcTo(x + l, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + l, y, rr)
  ctx.closePath()
}

/**
 * La plus grande taille de texte qui tienne dans la zone.
 *
 * Un plan décrit des proportions, pas des pixels : la même structure doit
 * tenir en 1080×1080 comme en 1080×1920. On cherche donc la taille plutôt que
 * de la fixer, et le poids du bloc donne le point de départ.
 */
function tailleQuiTient(ctx: Ctx, texte: string, police: string, gras: number,
  zl: number, zh: number, depart: number): { taille: number; ls: string[] } {
  let t = depart
  for (let i = 0; i < 24; i++) {
    ctx.font = `${gras} ${t}px ${police}`
    const ls = lignes(ctx, texte, zl)
    if (ls.length * t * 1.16 <= zh) return { taille: t, ls }
    t *= 0.92
  }
  ctx.font = `${gras} ${t}px ${police}`
  return { taille: t, ls: lignes(ctx, texte, zl) }
}

export type OptionsPlan = {
  ratio: string
  actifs: Record<number, boolean>
  accentChoisi?: string
}

export async function dessinerDepuisPlan(
  canvas: HTMLCanvasElement,
  photo: string,
  dispositifs: Dispositif[],
  marque: Marque,
  plan: Plan,
  o: OptionsPlan,
): Promise<boolean> {
  const f = FORMATS[o.ratio] ?? FORMATS['1:1']
  canvas.width = f.l
  canvas.height = f.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return false

  try { await (document as Document & { fonts?: FontFaceSet }).fonts?.ready } catch { /* ignoré */ }

  let img: HTMLImageElement | null = null
  try {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    await new Promise<void>((ok, ko) => {
      i.onload = () => ok(); i.onerror = () => ko(new Error('photo illisible')); i.src = photo
    })
    img = i
  } catch { img = null }

  const zones = new Map<string, Zone>((plan.grille ?? []).map((z) => [z.id, z]))
  const zonePhoto = plan.photo?.zone ? zones.get(plan.photo.zone) : undefined
  const traitement = plan.photo?.traitement ?? 'plein'
  const fondCouleur = /^#[0-9a-f]{6}$/i.test(plan.fond?.couleur ?? '')
    ? (plan.fond!.couleur as string) : marque.principale

  /* ── Le fond ── */
  if (plan.fond?.type === 'couleur' || traitement === 'absente' || !img) {
    ctx.fillStyle = fondCouleur
    ctx.fillRect(0, 0, f.l, f.h)
  } else {
    const e = Math.max(f.l / img.width, f.h / img.height)
    ctx.drawImage(img, (f.l - img.width * e) / 2, (f.h - img.height * e) / 2, img.width * e, img.height * e)
    // Le dégradé prend la couleur de la marque, pas un gris : c'est ce qui
    // fait qu'une créa appartient au compte plutôt qu'à l'outil.
    const g = ctx.createLinearGradient(0, 0, 0, f.h)
    const c = fondCouleur
    g.addColorStop(0, c + 'e6')
    g.addColorStop(0.45, c + '99')
    g.addColorStop(1, c + 'f2')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, f.l, f.h)
  }

  /* La photo posée dans sa zone, quand le plan le demande. */
  if (img && zonePhoto && (traitement === 'encart' || traitement === 'detouree')) {
    const zx = px(zonePhoto.x, f.l), zy = px(zonePhoto.y, f.h)
    const zl = px(zonePhoto.l, f.l), zh = px(zonePhoto.h, f.h)
    const e = Math.max(zl / img.width, zh / img.height)
    ctx.save()
    arrondi(ctx, zx, zy, zl, zh, Math.min(zl, zh) * 0.06)
    ctx.clip()
    ctx.drawImage(img, zx + (zl - img.width * e) / 2, zy + (zh - img.height * e) / 2,
      img.width * e, img.height * e)
    ctx.restore()
  }

  const mode = modeAccent(plan)
  const motsChoisis = new Set(
    (o.accentChoisi ?? '').split(/[,;]/).map((x) => x.trim().toLowerCase()).filter(Boolean),
  )

  /** Écrit une ligne en teintant selon le mode d'accent du plan. */
  const ecrireLigne = (l: string, x: number, y: number, indexLigne: number, align: string) => {
    const largeurLigne = ctx.measureText(l).width
    let cx = align === 'centre' ? x - largeurLigne / 2 : align === 'droite' ? x - largeurLigne : x
    if (mode === 'deuxieme_ligne' && !motsChoisis.size) {
      ctx.fillStyle = indexLigne === 1 ? marque.accent : '#ffffff'
      ctx.fillText(l, cx, y)
      return
    }
    for (const mot of l.split(' ')) {
      const nu = mot.toLowerCase().replace(/[.,;:!?»«"]/g, '')
      const teinte = motsChoisis.size
        ? [...motsChoisis].some((m) => nu === m || (m.length > 2 && nu.includes(m)))
        : mode === 'chiffres' && estChiffre(nu)
      ctx.fillStyle = teinte ? marque.accent : '#ffffff'
      ctx.fillText(mot, cx, y)
      cx += ctx.measureText(mot + ' ').width
    }
  }

  const parType = new Map<string, Dispositif[]>()
  dispositifs.forEach((d, i) => {
    if (o.actifs[i] === false) return
    const l = parType.get(d.type) ?? []
    l.push(d)
    parType.set(d.type, l)
  })
  const prendre = (type: string) => (parType.get(type) ?? []).shift() ?? null

  for (const bloc of plan.blocs ?? []) {
    const z = zones.get(bloc.zone)
    if (!z) continue
    const d = prendre(bloc.dispositif)
    if (!d) continue

    const zx = px(z.x, f.l), zy = px(z.y, f.h)
    const zl = px(z.l, f.l), zh = px(z.h, f.h)
    const ancre = bloc.align === 'centre' ? zx + zl / 2 : bloc.align === 'droite' ? zx + zl : zx
    ctx.textBaseline = 'top'

    if (d.type === 'accroche' || d.type === 'sous') {
      const gras = d.type === 'accroche' ? 800 : 700
      const { taille, ls } = tailleQuiTient(ctx, d.texte.toUpperCase(), marque.policeTitre, gras,
        zl, zh, d.type === 'accroche' ? f.l * 0.11 : f.l * 0.05)
      ctx.font = `${gras} ${taille}px ${marque.policeTitre}`
      let y = zy + (zh - ls.length * taille * 1.16) / 2
      ls.forEach((l, i) => { ecrireLigne(l, ancre, y, i, bloc.align ?? 'gauche'); y += taille * 1.16 })
    } else if (d.type === 'pastille') {
      const { taille, ls } = tailleQuiTient(ctx, d.texte, marque.policeTexte, 600, zl - zh * 0.9, zh, f.l * 0.03)
      ctx.font = `600 ${taille}px ${marque.policeTexte}`
      const lp = Math.min(zl, Math.max(...ls.map((l) => ctx.measureText(l).width)) + zh * 0.9)
      const x0 = bloc.align === 'centre' ? ancre - lp / 2 : bloc.align === 'droite' ? ancre - lp : ancre
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      arrondi(ctx, x0, zy, lp, zh, zh / 2)
      ctx.fill()
      ctx.fillStyle = marque.principale
      let y = zy + (zh - ls.length * taille * 1.2) / 2
      for (const l of ls) {
        const w = ctx.measureText(l).width
        ctx.fillText(l, x0 + (lp - w) / 2, y)
        y += taille * 1.2
      }
    } else if (d.type === 'bouton') {
      const { taille } = tailleQuiTient(ctx, d.texte, marque.policeTitre, 700, zl - zh, zh, f.l * 0.045)
      ctx.font = `700 ${taille}px ${marque.policeTitre}`
      const lb = Math.min(zl, ctx.measureText(d.texte).width + zh * 1.6)
      const x0 = bloc.align === 'centre' ? ancre - lb / 2 : bloc.align === 'droite' ? ancre - lb : ancre
      ctx.fillStyle = marque.boutonFond
      arrondi(ctx, x0, zy, lb, zh, marque.boutonPilule ? zh / 2 : zh * 0.22)
      ctx.fill()
      ctx.fillStyle = marque.boutonTexte
      ctx.fillText(d.texte, x0 + (lb - ctx.measureText(d.texte).width) / 2, zy + (zh - taille * 1.1) / 2)
    } else if (d.type === 'prix') {
      const { taille } = tailleQuiTient(ctx, d.montant, marque.policeTitre, 800, zl, zh * 0.78, f.l * 0.16)
      ctx.font = `800 ${taille}px ${marque.policeTitre}`
      ctx.fillStyle = marque.accent
      const w = ctx.measureText(d.montant).width
      const x0 = bloc.align === 'centre' ? ancre - w / 2 : ancre
      ctx.fillText(d.montant, x0, zy)
      if (d.mention) {
        const tm = taille * 0.24
        ctx.font = `600 ${tm}px ${marque.policeTexte}`
        ctx.fillStyle = 'rgba(255,255,255,0.88)'
        ctx.fillText(d.mention, x0, zy + taille * 1.06)
      }
    } else if (d.type === 'puces') {
      const n = d.items.length || 1
      const hl = zh / n
      const taille = Math.min(hl * 0.42, f.l * 0.034)
      ctx.font = `600 ${taille}px ${marque.policeTexte}`
      d.items.forEach((it, i) => {
        const y = zy + i * hl
        const r = taille * 0.5
        ctx.beginPath(); ctx.arc(zx + r, y + hl / 2, r, 0, Math.PI * 2)
        ctx.fillStyle = marque.accent; ctx.fill()
        ctx.fillStyle = marque.boutonTexte
        ctx.font = `800 ${r * 1.1}px ${marque.policeTexte}`
        ctx.fillText('✓', zx + r * 0.45, y + hl / 2 - r * 0.55)
        ctx.font = `600 ${taille}px ${marque.policeTexte}`
        ctx.fillStyle = '#ffffff'
        ctx.fillText(lignes(ctx, it, zl - r * 3)[0], zx + r * 3, y + hl / 2 - taille * 0.6)
      })
    } else if (d.type === 'comparatif') {
      ctx.fillStyle = '#ffffff'
      arrondi(ctx, zx, zy, zl, zh, Math.min(zl, zh) * 0.05)
      ctx.fill()
      const n = Math.max(1, d.lignes.length)
      const hl = (zh * 0.78) / n
      const t = Math.min(hl * 0.34, f.l * 0.024)
      const colD = zx + zl * 0.6
      ctx.font = `700 ${t}px ${marque.policeTitre}`
      ctx.fillStyle = '#74778a'
      ctx.fillText(d.gauche.toUpperCase(), zx + zl * 0.34, zy + zh * 0.06)
      ctx.fillStyle = marque.principale
      ctx.fillText(d.droite.toUpperCase(), colD, zy + zh * 0.06)
      d.lignes.forEach((l, i) => {
        const y = zy + zh * 0.2 + i * hl
        ctx.font = `600 ${t}px ${marque.policeTexte}`
        ctx.fillStyle = '#0d0d12'
        ctx.fillText(lignes(ctx, l.label, zl * 0.3)[0], zx + zl * 0.04, y)
        ctx.font = `500 ${t * 0.92}px ${marque.policeTexte}`
        ctx.fillStyle = '#9aa0ae'
        ctx.fillText('✕ ' + (l.g || '—'), zx + zl * 0.34, y)
        ctx.font = `700 ${t * 0.92}px ${marque.policeTexte}`
        ctx.fillStyle = marque.principale
        ctx.fillText('✓ ' + (l.d || '—'), colD, y)
      })
    } else if (d.type === 'mention') {
      const { taille, ls } = tailleQuiTient(ctx, d.texte, marque.policeTexte, 400, zl, zh, f.l * 0.026)
      ctx.font = `400 ${taille}px ${marque.policeTexte}`
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      let y = zy
      for (const l of ls) {
        const w = ctx.measureText(l).width
        ctx.fillText(l, bloc.align === 'centre' ? ancre - w / 2 : zx, y)
        y += taille * 1.3
      }
    }
  }

  return true
}
