/**
 * Les polices du Brand kit pour le rendu HTML des créas (next/og) : lues sur
 * Google Fonts en TTF, le seul format qu'il accepte avec OTF et WOFF. Une
 * police introuvable chez Google est remplacée par Inter, sans erreur.
 */

export type Police = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700 | 800; style: 'normal' }

const cache = new Map<string, Promise<ArrayBuffer | null>>()
const SECOURS = 'Inter'

function telecharger(famille: string, graisse: number) {
  const cle = `${famille}:${graisse}`
  if (!cache.has(cle)) {
    cache.set(cle, (async () => {
      // Sans navigateur annoncé, Google Fonts sert du TTF (un navigateur récent recevrait du WOFF2).
      const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(famille).replace(/%20/g, '+')}:wght@${graisse}`, { signal: AbortSignal.timeout(10_000) })
        .then((r) => (r.ok ? r.text() : ''))
        .catch(() => '')
      const url = css.match(/src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/)?.[1]
      if (!url) return null
      return fetch(url, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
    })())
  }
  return cache.get(cle)!
}

/** La famille telle que Google la nomme : « Montserrat, sans-serif » → « Montserrat ». */
export const famille = (nom: string | null | undefined) => (nom ?? '').split(',')[0].replace(/["']/g, '').trim()

async function charger(nom: string, graisses: Police['weight'][]): Promise<Police[]> {
  const chargees = await Promise.all(graisses.map(async (weight) => ({ weight, data: await telecharger(nom, weight) })))
  return chargees.filter((p): p is { weight: Police['weight']; data: ArrayBuffer } => !!p.data).map((p) => ({ name: nom, data: p.data, weight: p.weight, style: 'normal' as const }))
}

/** Titres en 700 et 800, textes en 400 et 600 ; chaque famille absente de Google passe à Inter. */
export async function polices(titre: string | null | undefined, texte: string | null | undefined) {
  const [t, x] = [famille(titre) || SECOURS, famille(texte) || famille(titre) || SECOURS]
  let titres = await charger(t, [700, 800])
  let textes = await charger(x, [400, 600])
  if (!titres.length) titres = await charger(SECOURS, [700, 800])
  if (!textes.length) textes = await charger(SECOURS, [400, 600])
  if (!titres.length || !textes.length) throw new Error('Polices introuvables : Google Fonts ne répond pas')
  return { fonts: [...titres, ...textes], titre: titres[0].name, texte: textes[0].name }
}
