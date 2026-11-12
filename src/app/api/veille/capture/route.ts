import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/db'
import { normaliserPub, normaliserTransparence, type PubNormalisee } from '@/lib/veille/adLibrary'
import { copierMedia } from '@/lib/veille/stockage'

/**
 * Reçoit une pub sauvegardée depuis l'extension Chrome, sur la Meta Ad
 * Library : la range en base, recopie ses médias, l'ajoute à la bibliothèque.
 * Avec `scan: true` (Espion), la pub entre seulement dans la veille, sans
 * passer par la bibliothèque, et sa vidéo est prise en définition standard.
 *
 * L'extension n'a pas la session Apogee (elle tourne sur facebook.com) : elle
 * s'authentifie avec la clé partagée VEILLE_EXTENSION_KEY.
 */

// Une vidéo de 50 Mo se télécharge puis se renvoie au stockage.
export const maxDuration = 120

function cleValide(recue: string | null): boolean {
  const attendue = process.env.VEILLE_EXTENSION_KEY
  if (!attendue || !recue) return false
  const a = Buffer.from(recue)
  const b = Buffer.from(attendue)
  return a.length === b.length && timingSafeEqual(a, b)
}

type MediaStocke = { type: 'image' | 'video'; chemin: string; apercu?: string }

async function copierMedias(pub: PubNormalisee): Promise<MediaStocke[]> {
  return Promise.all(
    pub.medias.map(async (m, i) => {
      const base = `${pub.adArchiveId}/${i}`
      const chemin = await copierMedia(m.url, base)
      return m.apercu
        ? { type: m.type, chemin, apercu: await copierMedia(m.apercu, `${base}-apercu`) }
        : { type: m.type, chemin }
    }),
  )
}

export async function POST(req: NextRequest) {
  if (!cleValide(req.headers.get('x-veille-cle'))) {
    return NextResponse.json({ erreur: 'Clé de l’extension refusée' }, { status: 401 })
  }

  const corps = await req.json().catch(() => null)
  const scan = corps?.scan === true
  let pub: PubNormalisee
  try {
    pub = normaliserPub(corps?.pub, { videoSd: scan })
  } catch (e) {
    return NextResponse.json({ erreur: (e as Error).message }, { status: 400 })
  }
  const dossierId = typeof corps?.dossierId === 'string' ? corps.dossierId : null
  // La seconde passe d'Espion : la fiche détaillée de la pub, quand elle a été lue.
  const transparence = normaliserTransparence(corps?.transparence)

  const existante = await prisma.veillePub.findUnique({
    where: { adArchiveId: pub.adArchiveId },
    select: { medias: true },
  })
  const dejaCopies = Array.isArray(existante?.medias) && existante.medias.length > 0

  let medias: MediaStocke[] | undefined
  if (!dejaCopies) {
    if (pub.medias.length === 0) {
      return NextResponse.json({ erreur: 'Aucun média trouvé dans cette pub' }, { status: 422 })
    }
    try {
      medias = await copierMedias(pub)
    } catch (e) {
      // Rien n'est enregistré : tant que la page est ouverte, les liens Meta
      // restent valides et un nouveau clic peut réussir.
      console.error('[veille/capture]', pub.adArchiveId, (e as Error).message)
      return NextResponse.json({ erreur: (e as Error).message }, { status: 502 })
    }
  }

  const marque = await prisma.veilleMarque.upsert({
    where: { pageId: pub.pageId },
    create: { pageId: pub.pageId, nom: pub.pageNom },
    update: { nom: pub.pageNom },
  })

  const champs = {
    marqueId: marque.id,
    format: pub.format,
    texte: pub.texte,
    titre: pub.titre,
    description: pub.description,
    cta: pub.cta,
    lienUrl: pub.lienUrl,
    plateformes: pub.plateformes,
    debut: pub.debut,
    fin: pub.fin,
    active: pub.active,
    derniereVue: new Date(),
    ...(transparence && { reachUe: transparence.reachUe, transparence }),
  }
  const enregistree = await prisma.veillePub.upsert({
    where: { adArchiveId: pub.adArchiveId },
    create: { ...champs, adArchiveId: pub.adArchiveId, medias: medias ?? [], source: scan ? 'espion' : 'extension' },
    update: medias ? { ...champs, medias } : champs,
  })

  if (scan) return NextResponse.json({ ok: true, id: enregistree.id })

  const deja = await prisma.veilleSauvegarde.findFirst({ where: { pubId: enregistree.id, dossierId } })
  if (!deja) await prisma.veilleSauvegarde.create({ data: { pubId: enregistree.id, dossierId } })

  return NextResponse.json({ ok: true, id: enregistree.id, deja: !!deja })
}
