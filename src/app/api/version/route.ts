import { NextResponse } from 'next/server'

/**
 * Ce qui est réellement en ligne.
 *
 * « Rien n'est passé » peut vouloir dire trois choses : le code n'est pas
 * poussé, le déploiement a échoué, ou le navigateur sert une version en cache.
 * Aucune ne se distingue des autres depuis l'écran. Ce point de contrôle
 * tranche en une requête, sans authentification — sinon il faudrait être
 * connecté pour diagnostiquer une application qui ne se met pas à jour.
 *
 * Il ne rend qu'un identifiant de commit et un environnement : rien de secret.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split('\n')[0]?.slice(0, 120) ?? null,
    environnement: process.env.VERCEL_ENV ?? 'local',
    branche: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    servi: new Date().toISOString(),
  })
}
