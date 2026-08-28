import type { NextRequest } from 'next/server'

/**
 * Le secret partagé des tâches planifiées.
 *
 * Vercel envoie `Authorization: Bearer <CRON_SECRET>` — c'est la seule forme
 * qu'il connaisse. Les routes ne lisaient que `x-cron-secret` et `?secret=`,
 * deux formes qu'aucun planificateur n'émet : chaque passage nocturne était
 * donc refusé en 401, sans bruit, et la base ne se rafraîchissait plus que
 * lors des lancements manuels.
 *
 * Les deux autres formes restent acceptées : elles servent à déclencher un
 * passage à la main, depuis un terminal ou un navigateur.
 */
export function cronAutorise(req: NextRequest): boolean {
  const attendu = process.env.CRON_SECRET
  // Sans secret configuré, la route reste fermée : l'ouvrir à tout le monde
  // parce qu'une variable manque serait le pire des deux mondes.
  if (!attendu) return false

  const entete = req.headers.get('authorization') || ''
  const porteur = entete.toLowerCase().startsWith('bearer ') ? entete.slice(7).trim() : null

  return (
    porteur === attendu ||
    req.headers.get('x-cron-secret') === attendu ||
    req.nextUrl.searchParams.get('secret') === attendu
  )
}
