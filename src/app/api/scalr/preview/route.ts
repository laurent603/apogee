import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * Aperçu Meta d'une publicité, tel qu'il s'affiche vraiment.
 *
 * Le champ `thumbnail_url` d'un créatif plafonne à 64×64 — inexploitable dans
 * une galerie. Et `full_picture` de la publication n'existe pas : ce sont des
 * dark posts, non publiés sur la Page, qui n'exposent pas leur image même avec
 * un jeton de Page. Le rendu officiel est donc le seul moyen de voir la créa.
 *
 * Meta renvoie un fragment `<iframe src="…">` : on n'extrait que l'URL, qu'on
 * insère nous-mêmes dans une iframe cadrée et cloisonnée. Injecter le HTML de
 * Meta tel quel reviendrait à exécuter chez nous un document qu'on ne contrôle
 * pas.
 */

export const maxDuration = 30

// Non exporté : un fichier de route Next n'accepte que les handlers et
// quelques options réservées, tout autre export fait échouer la compilation.
const FORMATS = [
  'DESKTOP_FEED_STANDARD',
  'MOBILE_FEED_STANDARD',
  'FACEBOOK_STORY_MOBILE',
  'FACEBOOK_REELS_MOBILE',
  'INSTAGRAM_STANDARD',
  'INSTAGRAM_STORY',
  'INSTAGRAM_REELS',
] as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const token = (session as { accessToken?: string } | null)?.accessToken
  if (!session || !token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adId = req.nextUrl.searchParams.get('adId')
  const format = req.nextUrl.searchParams.get('format') || 'MOBILE_FEED_STANDARD'
  if (!adId) return NextResponse.json({ error: 'adId requis' }, { status: 400 })
  if (!FORMATS.includes(format as (typeof FORMATS)[number])) {
    return NextResponse.json({ error: 'Format non supporté' }, { status: 400 })
  }

  const version = process.env.META_API_VERSION || 'v21.0'
  const url =
    `https://graph.facebook.com/${version}/${adId}/previews?` +
    new URLSearchParams({ ad_format: format, access_token: token }).toString()

  try {
    const json = await fetch(url).then((r) => r.json())
    if (json.error) {
      return NextResponse.json({ error: json.error.message || 'erreur Meta', src: null }, { status: 200 })
    }
    const html: string = json.data?.[0]?.body || ''
    // On ne garde que la source : le reste du fragment n'est pas exécuté ici.
    const src = html.match(/src="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&') || null

    // Les dimensions naturelles du rendu, telles que Meta les déclare. Sans
    // elles il faudrait supposer une largeur, et toute erreur laisse une bande
    // blanche dans la vignette ou rogne la créa. Elles varient selon le
    // placement : un fil mobile et une story n'ont pas la même forme.
    const entier = (attr: string) => {
      const v = Number(html.match(new RegExp(`${attr}="(\\d+)"`))?.[1])
      return Number.isFinite(v) && v > 0 ? v : null
    }

    return NextResponse.json({
      src,
      format,
      largeur: entier('width'),
      hauteur: entier('height'),
      error: src ? null : 'Aucun aperçu disponible pour ce placement',
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'erreur inconnue', src: null },
      { status: 200 },
    )
  }
}
