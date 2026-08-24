/**
 * Downloads ad thumbnails so the model can look at the creative instead of
 * reading its filename.
 *
 * Fetched server-side and inlined as base64 rather than passed as URLs: Meta's
 * CDN links are signed and expire, and a URL the API cannot fetch fails the
 * whole request. A download that fails here is simply skipped.
 */

export type AdImage = { adName: string; media_type: string; data: string }

const MAX_IMAGES = 8
const MAX_BYTES = 3_000_000
const TIMEOUT_MS = 8000

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

type Candidate = { name?: unknown; _thumbnail?: unknown; _computed?: Record<string, unknown> | null }

async function download(url: string): Promise<{ media_type: string; data: string } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!ALLOWED.has(type)) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BYTES || buf.byteLength === 0) return null
    return { media_type: type, data: Buffer.from(buf).toString('base64') }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Picks the highest-spending ads that have a thumbnail and fetches them.
 * Capped at eight — every image costs context, and the tail of a long list adds
 * little to a creative read.
 */
export async function fetchAdImages(ads: unknown[]): Promise<AdImage[]> {
  const candidates = (ads as Candidate[])
    .filter(a => typeof a?._thumbnail === 'string' && (a._thumbnail as string).startsWith('http'))
    .sort((a, b) => {
      const spend = (x: Candidate) => Number(x?._computed?.['Dépense'] ?? 0)
      return spend(b) - spend(a)
    })
    .slice(0, MAX_IMAGES)

  const results = await Promise.all(
    candidates.map(async (a) => {
      const img = await download(a._thumbnail as string)
      return img ? { adName: String(a.name ?? 'sans nom'), ...img } : null
    }),
  )
  return results.filter((r): r is AdImage => r !== null)
}

/** Content blocks for the Messages API: each image preceded by its ad name. */
export function toImageBlocks(images: AdImage[]) {
  return images.flatMap((img) => ([
    { type: 'text' as const, text: `Visuel de la publicité « ${img.adName} » :` },
    {
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: img.media_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: img.data },
    },
  ]))
}
