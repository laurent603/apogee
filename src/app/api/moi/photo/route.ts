import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/** Photos choisies à la main, par id d'utilisateur ; les autres prennent leur photo Facebook. */
const PHOTOS: Record<string, string> = {
  cms8vijqq003us0ydsmqpsslx: '/avatars/laurent-segura.jpg',
}

/**
 * La photo de profil de l'utilisateur connecté.
 *
 * Le lien reçu à la connexion expire au bout de quelques jours : on en
 * redemande un frais à Meta et on y redirige. 404 si Meta ne répond pas,
 * la barre latérale affiche alors les initiales.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const perso = session?.user?.id ? PHOTOS[session.user.id] : undefined
  if (perso) return NextResponse.redirect(new URL(perso, req.url))
  if (!session?.accessToken) return new NextResponse(null, { status: 404 })
  const r = await fetch(`https://graph.facebook.com/v21.0/me/picture?type=normal&redirect=false&access_token=${encodeURIComponent(session.accessToken)}`)
  const d = await r.json().catch(() => null)
  const url: unknown = d?.data?.url
  if (!r.ok || typeof url !== 'string' || d.data.is_silhouette) return new NextResponse(null, { status: 404 })
  return NextResponse.redirect(url, { headers: { 'cache-control': 'private, max-age=3600' } })
}
