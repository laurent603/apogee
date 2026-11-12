/**
 * Les copies des médias de la veille, dans le stockage Supabase du projet.
 *
 * Les liens fbcdn de la bibliothèque expirent en quelques jours : une pub
 * n'est gardée que si ses médias ont été recopiés ici.
 */

const BUCKET = 'veille'

function config() {
  // Saisie à la main dans Vercel : guillemets et « https:// » oubliés y
  // passent sans erreur, et cassaient chaque envoi (« unknown scheme »).
  const brute = process.env.SUPABASE_URL?.trim().replace(/^["']|["']$/g, '').replace(/\/$/, '')
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim().replace(/^["']|["']$/g, '')
  if (!brute || !cle) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant')
  return { url: /^https?:\/\//.test(brute) ? brute : `https://${brute}`, cle }
}

const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

async function creerBucket(url: string, cle: string) {
  const r = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cle}`, 'content-type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  })
  // 409 : créé entre-temps par une autre requête.
  if (!r.ok && r.status !== 409) throw new Error(`Création du bucket refusée (${r.status}) : ${await r.text()}`)
}

/**
 * Une erreur réseau de fetch ne dit que « fetch failed » : la vraie cause
 * (ECONNRESET, ENOTFOUND, délai…) est dans `cause`. On nomme l'étape avec.
 */
async function appel(etape: string, ...args: Parameters<typeof fetch>) {
  try {
    return await fetch(...args)
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string; hostname?: string } }).cause
    const detail = [cause?.code || cause?.message || (e as Error).message, cause?.hostname].filter(Boolean).join(' ')
    throw new Error(`${etape} impossible (${detail})`)
  }
}

/** Télécharge `source` et le range sous `prefixe.<ext>`. Renvoie le chemin. */
export async function copierMedia(source: string, prefixe: string): Promise<string> {
  const { url, cle } = config()
  const r = await appel('Téléchargement du média chez Meta', source)
  if (!r.ok) throw new Error(`Téléchargement du média refusé par Meta (${r.status})`)
  const type = (r.headers.get('content-type') || '').split(';')[0].trim()
  const chemin = `${prefixe}.${EXTENSIONS[type] ?? 'bin'}`
  const corps = await r.arrayBuffer()

  const envoyer = () =>
    appel('Envoi du média au stockage', `${url}/storage/v1/object/${BUCKET}/${chemin}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cle}`, 'content-type': type || 'application/octet-stream', 'x-upsert': 'true' },
      body: corps,
    })

  let up = await envoyer()
  if (!up.ok && (await up.clone().text()).includes('Bucket not found')) {
    await creerBucket(url, cle)
    up = await envoyer()
  }
  if (!up.ok) throw new Error(`Stockage du média refusé (${up.status}) : ${await up.text()}`)
  return chemin
}

export function urlPublique(chemin: string): string {
  return `${config().url}/storage/v1/object/public/${BUCKET}/${chemin}`
}
