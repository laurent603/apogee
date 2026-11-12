import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

/**
 * L'extension n'a pas la session Apogee (elle tourne sur facebook.com) : elle
 * s'authentifie avec la clé partagée VEILLE_EXTENSION_KEY.
 */
export function cleExtensionValide(req: NextRequest): boolean {
  const attendue = process.env.VEILLE_EXTENSION_KEY
  const recue = req.headers.get('x-veille-cle')
  if (!attendue || !recue) return false
  const a = Buffer.from(recue)
  const b = Buffer.from(attendue)
  return a.length === b.length && timingSafeEqual(a, b)
}
