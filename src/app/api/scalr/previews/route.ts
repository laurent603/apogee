import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * Les aperçus de plusieurs publicités, en un aller-retour.
 *
 * La route unitaire ne tenait pas l'échelle : un mur de cent créas lançait
 * cent requêtes, donc cent fonctions serverless et cent appels à Meta, toutes
 * en quelques secondes. Le navigateur en sérialise une partie, Meta freine le
 * reste, et l'attente se compte en dizaines de secondes.
 *
 * L'API Graph sait grouper : un `batch` porte jusqu'à cinquante sous-requêtes
 * que Meta exécute de son côté. Trente aperçus deviennent un appel.
 *
 * Le repli compte autant que le groupement : si le lot échoue en bloc, on
 * repasse aux appels unitaires. Une panne du groupage doit ralentir le mur,
 * pas le vider.
 */

export const maxDuration = 60

const API = 'https://graph.facebook.com'
const VERSION = process.env.META_API_VERSION || 'v21.0'

/** Meta plafonne un lot à cinquante ; on garde une marge. */
const PAR_LOT = 40

const FORMATS = new Set([
  'DESKTOP_FEED_STANDARD', 'MOBILE_FEED_STANDARD', 'FACEBOOK_STORY_MOBILE',
  'FACEBOOK_REELS_MOBILE', 'INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'INSTAGRAM_REELS',
])

type Apercu = { src: string | null; largeur: number | null; hauteur: number | null }

/** On ne garde que l'URL du fragment : son HTML n'est jamais exécuté ici. */
function lireFragment(html: string): Apercu {
  const src = html.match(/src="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&') || null
  const entier = (attr: string) => {
    const v = Number(html.match(new RegExp(`${attr}="(\\d+)"`))?.[1])
    return Number.isFinite(v) && v > 0 ? v : null
  }
  return { src, largeur: entier('width'), hauteur: entier('height') }
}

const VIDE: Apercu = { src: null, largeur: null, hauteur: null }

async function lot(ids: string[], format: string, token: string): Promise<Record<string, Apercu>> {
  const batch = ids.map((id) => ({
    method: 'GET',
    relative_url: `${id}/previews?ad_format=${format}`,
  }))

  const res = await fetch(`${API}/${VERSION}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: token, batch: JSON.stringify(batch) }),
  })
  const json = await res.json()

  // Meta rend un tableau aligné sur les sous-requêtes. Autre chose — une
  // erreur globale, un jeton refusé — signifie que le lot n'a pas eu lieu.
  if (!Array.isArray(json)) throw new Error(json?.error?.message || 'lot refusé')

  const sortie: Record<string, Apercu> = {}
  json.forEach((rep, i) => {
    const id = ids[i]
    if (!rep || rep.code !== 200) { sortie[id] = VIDE; return }
    try {
      const corps = JSON.parse(rep.body)
      sortie[id] = lireFragment(corps?.data?.[0]?.body || '')
    } catch {
      sortie[id] = VIDE
    }
  })
  return sortie
}

/** Repli unitaire : plus lent, mais il rend quelque chose. */
async function unParUn(ids: string[], format: string, token: string): Promise<Record<string, Apercu>> {
  const paires = await Promise.all(ids.map(async (id) => {
    try {
      const url = `${API}/${VERSION}/${id}/previews?` +
        new URLSearchParams({ ad_format: format, access_token: token })
      const json = await fetch(url).then((r) => r.json())
      return [id, lireFragment(json?.data?.[0]?.body || '')] as const
    } catch {
      return [id, VIDE] as const
    }
  }))
  return Object.fromEntries(paires)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const token = (session as { accessToken?: string } | null)?.accessToken
  if (!session || !token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const corps = await req.json().catch(() => null)
  const ids: string[] = Array.isArray(corps?.adIds)
    ? corps.adIds.filter((x: unknown) => typeof x === 'string' && /^\d+$/.test(x)).slice(0, 120)
    : []
  const format = String(corps?.format || 'MOBILE_FEED_STANDARD')

  if (!ids.length) return NextResponse.json({ error: 'adIds requis' }, { status: 400 })
  if (!FORMATS.has(format)) return NextResponse.json({ error: 'Format non supporté' }, { status: 400 })

  const tranches: string[][] = []
  for (let i = 0; i < ids.length; i += PAR_LOT) tranches.push(ids.slice(i, i + PAR_LOT))

  const resultats = await Promise.all(tranches.map(async (tranche) => {
    try { return await lot(tranche, format, token) } catch { return unParUn(tranche, format, token) }
  }))

  return NextResponse.json({
    format,
    apercus: Object.assign({}, ...resultats) as Record<string, Apercu>,
  })
}
