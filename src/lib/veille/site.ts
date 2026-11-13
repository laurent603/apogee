import sharp from 'sharp'

/**
 * Lecture d'un site client pour le Brand kit : le HTML et le CSS sont lus
 * ici (Claude ne voit pas le CSS), et les logos et photos candidats sont
 * téléchargés et réduits pour lui être montrés. Aucun parseur : des
 * expressions suffisent pour relever couleurs, polices et images.
 */

const DELAI = 15_000
const AGENT = 'Mozilla/5.0 (compatible; ApogeeBrandKit/1.0)'
const PAGES_MAX = 3
const FEUILLES_MAX = 4
const LOGOS_MAX = 4
const PHOTOS_MAX = 10
const TEXTE_MAX = 6_000

export type ImageSite = { url: string; octets: Buffer; type: 'image/png' | 'image/jpeg' }
export type LectureSite = {
  url: string
  titre: string
  description: string
  texte: string
  couleurs: { hex: string; n: number }[]
  polices: string[]
  variables: string[]
  logos: ImageSite[]
  photos: ImageSite[]
}

const ouvrir = (url: string) =>
  fetch(url, { headers: { 'user-agent': AGENT }, redirect: 'follow', signal: AbortSignal.timeout(DELAI) }).then((r) => (r.ok ? r : null)).catch(() => null)

async function lireTexte(url: string) {
  const r = await ouvrir(url)
  return r ? { texte: await r.text().catch(() => ''), url: r.url } : null
}

async function lireOctets(url: string) {
  const r = await ouvrir(url)
  return r ? { octets: Buffer.from(await r.arrayBuffer()), url: r.url } : null
}

const absolue = (lien: string, base: string) => {
  try {
    const u = new URL(lien.replace(/&amp;/g, '&'), base)
    return /^https?:$/.test(u.protocol) ? u.href : null
  } catch {
    return null
  }
}

const attribut = (balise: string, nom: string) => balise.match(new RegExp(`${nom}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] ?? null

/** Le texte visible d'une page, sans scripts, styles ni balises. */
export function texteVisible(html: string) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#039;|&rsquo;/g, '’')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Couleurs (#hex et rgb()), polices et variables CSS de couleur, les plus fréquentes d'abord. */
export function relevesCss(css: string) {
  const n = new Map<string, number>()
  const ajouter = (hex: string) => n.set(hex, (n.get(hex) ?? 0) + 1)
  for (const [, h] of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const hex = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    ajouter(`#${hex.toLowerCase()}`)
  }
  for (const [, r, g, b] of css.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi)) {
    ajouter(`#${[r, g, b].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('')}`)
  }
  const polices = new Map<string, number>()
  for (const [, f] of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const premiere = f.split(',')[0].replace(/["']/g, '').replace(/!important/, '').trim()
    if (premiere && !/^(inherit|initial|var\()/i.test(premiere)) polices.set(premiere, (polices.get(premiere) ?? 0) + 1)
  }
  const variables = [...css.matchAll(/(--[\w-]*(?:color|colour|primary|secondary|accent|brand|main)[\w-]*)\s*:\s*([^;}{]+)/gi)].map(([, k, v]) => `${k}: ${v.trim()}`)
  return {
    couleurs: [...n.entries()].map(([hex, k]) => ({ hex, n: k })).sort((a, b) => b.n - a.n).slice(0, 24),
    polices: [...polices.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p).slice(0, 8),
    variables: [...new Set(variables)].slice(0, 20),
  }
}

/** Une image prête à montrer : SVG rendu en PNG, le reste réduit à 768 px. Null si trop petite ou illisible. */
async function preparer(url: string, logo: boolean): Promise<ImageSite | null> {
  const r = await lireOctets(url)
  if (!r || r.octets.length > 15 * 1024 * 1024) return null
  try {
    const image = sharp(r.octets, { density: 200 })
    const { width = 0, height = 0 } = await image.metadata()
    // Une photo de moins de 300 px est une vignette ou un picto, pas un visuel exploitable.
    if (!logo && Math.max(width, height) < 300) return null
    const sortie = logo
      ? await image.resize(768, 768, { fit: 'inside', withoutEnlargement: false }).png().toBuffer()
      : await image.resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
    return { url: r.url, octets: sortie, type: logo ? 'image/png' : 'image/jpeg' }
  } catch {
    return null
  }
}

export async function lireSite(adresse: string): Promise<LectureSite> {
  const depart = absolue(/^https?:\/\//i.test(adresse) ? adresse : `https://${adresse}`, 'https://x')
  if (!depart) throw new Error('Adresse du site invalide')
  const accueil = await lireTexte(depart)
  if (!accueil?.texte) throw new Error('Le site ne répond pas')
  const html = accueil.texte
  const base = accueil.url
  const hote = new URL(base).hostname

  // Pages internes qui parlent de l'offre ou de l'entreprise.
  const liens = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi)]
    .map(([, h]) => absolue(h, base))
    .filter((u): u is string => !!u && new URL(u).hostname === hote && u !== base)
  const internes = [...new Set(liens)]
    .filter((u) => /produit|offre|solution|service|prestation|qui-sommes|a-propos|about|realisation|entreprise|tarif/i.test(u))
    .slice(0, PAGES_MAX)
  const pages = (await Promise.all(internes.map(lireTexte))).filter((p): p is { texte: string; url: string } => !!p?.texte)
  const tous = [html, ...pages.map((p) => p.texte)]

  // CSS : styles en ligne et premières feuilles liées.
  const feuilles = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(([b]) => b)
    .filter((b) => /rel\s*=\s*["']?stylesheet/i.test(b))
    .map((b) => absolue(attribut(b, 'href') ?? '', base))
    .filter((u): u is string => !!u)
    .slice(0, FEUILLES_MAX)
  const css = [
    ...tous.flatMap((h) => [...h.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(([, c]) => c)),
    ...tous.flatMap((h) => [...h.matchAll(/style\s*=\s*["']([^"']+)["']/gi)].map(([, c]) => c)),
    ...(await Promise.all(feuilles.map(lireTexte))).map((r) => r?.texte ?? ''),
  ].join('\n')
  const releves = relevesCss(css)
  // Polices Google déclarées dans les liens (family=Montserrat:wght@400;700).
  const google = [...html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"']+)/gi)].flatMap(([, q]) =>
    [...q.replace(/&amp;/g, '&').matchAll(/family=([^&]+)/g)].flatMap(([, f]) =>
      decodeURIComponent(f).replace(/\+/g, ' ').split('|').map((x) => x.split(':')[0].trim()),
    ),
  )

  // Logos : images marquées « logo », icônes Apple, image de partage ; photos : les autres grandes images.
  const imgs = tous.flatMap((h, i) => [...h.matchAll(/<img\b[^>]*>/gi)].map(([b]) => ({ b, base: i ? pages[i - 1].url : base })))
  const candidatsLogo = [
    ...imgs.filter(({ b }) => /logo/i.test(b)).map(({ b, base: o }) => absolue(attribut(b, 'src') ?? attribut(b, 'data-src') ?? '', o)),
    ...[...html.matchAll(/<link\b[^>]*rel\s*=\s*["'][^"']*apple-touch-icon[^"']*["'][^>]*>/gi)].map(([b]) => absolue(attribut(b, 'href') ?? '', base)),
  ].filter((u): u is string => !!u)
  const og = absolue(attribut(html.match(/<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*>/i)?.[0] ?? '', 'content') ?? '', base)
  const candidatsPhotos = [
    ...(og ? [og] : []),
    ...imgs.filter(({ b }) => !/logo|icon|picto|avatar|flag|sprite/i.test(b)).map(({ b, base: o }) => absolue(attribut(b, 'src') ?? attribut(b, 'data-src') ?? '', o)),
  ].filter((u): u is string => !!u && !/\.svg(\?|$)/i.test(u))

  const [logos, photos] = await Promise.all([
    Promise.all([...new Set(candidatsLogo)].slice(0, LOGOS_MAX).map((u) => preparer(u, true))),
    Promise.all([...new Set(candidatsPhotos)].slice(0, PHOTOS_MAX * 2).map((u) => preparer(u, false))),
  ])

  return {
    url: base,
    titre: texteVisible(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''),
    description: attribut(html.match(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*>/i)?.[0] ?? '', 'content') ?? '',
    texte: [texteVisible(html), ...pages.map((p) => `--- ${p.url}\n${texteVisible(p.texte)}`)].join('\n\n').slice(0, TEXTE_MAX * (1 + pages.length)),
    couleurs: releves.couleurs,
    polices: [...new Set([...google, ...releves.polices])].slice(0, 8),
    variables: releves.variables,
    logos: logos.filter((x): x is ImageSite => !!x),
    photos: photos.filter((x): x is ImageSite => !!x).slice(0, PHOTOS_MAX),
  }
}
