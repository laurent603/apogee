import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { compteDe } from '@/lib/veille/compte'
import { deposer, urlPublique } from '@/lib/veille/stockage'
import { ROLES_COULEUR } from '@/lib/veille/brandkit'

/**
 * Le Brand kit d'un client (logos, couleurs et leurs rôles, guidelines,
 * photos réelles, produits, créas modèles), repris par « Recréer pour ce
 * client ». Écrit ici seulement : la sauvegarde de Brand Settings ne le touche pas.
 */

const TYPES = ['image/png', 'image/jpeg', 'image/webp']
/** Les guidelines en texte libre, reprises par les nouveaux concepts. */
const GUIDELINES = ['typoTitre', 'typoTexte', 'tonDeVoix', 'motsAEmployer', 'motsAEviter'] as const
type Guidelines = Partial<Record<(typeof GUIDELINES)[number], string | null>>
const TAILLE_MAX = 8 * 1024 * 1024
const PHOTOS_MAX = 8
const COULEURS_MAX = 6
const MODELES_MAX = 6
const PHOTOS_PRODUIT_MAX = 4
const enClair = (chemin: string) => ({ chemin, url: urlPublique(chemin) })

async function kit(adAccountId: string) {
  const s = await prisma.brandSettings.findUnique({
    where: { adAccountId },
    select: { logoChemin: true, logoClairChemin: true, couleurs: true, couleursRoles: true, photos: true, websiteUrl: true, ...Object.fromEntries(GUIDELINES.map((g) => [g, true])) },
  })
  const [produits, modeles] = await Promise.all([
    prisma.produitMarque.findMany({ where: { adAccountId }, orderBy: { createdAt: 'asc' } }),
    prisma.creaModele.findMany({ where: { adAccountId }, orderBy: { createdAt: 'asc' } }),
  ])
  return {
    site: s?.websiteUrl ?? null,
    couleursRoles: s?.couleursRoles ?? [],
    produits: produits.map((p) => ({ id: p.id, nom: p.nom, description: p.description ?? '', prix: p.prix ?? '', photos: p.photos.map(enClair) })),
    modeles: modeles.map((m) => ({ id: m.id, note: m.note ?? '', ...enClair(m.chemin) })),
    logo: s?.logoChemin ? urlPublique(s.logoChemin) : null,
    logoClair: s?.logoClairChemin ? urlPublique(s.logoClairChemin) : null,
    guidelines: Object.fromEntries(GUIDELINES.map((g) => [g, (s as Record<string, unknown> | null)?.[g] ?? ''])) as Record<(typeof GUIDELINES)[number], string>,
    couleurs: s?.couleurs ?? [],
    photos: (s?.photos ?? []).map(enClair),
  }
}

const enregistrer = (adAccountId: string, data: Guidelines & { logoChemin?: string | null; logoClairChemin?: string | null; couleurs?: string[]; couleursRoles?: string[]; photos?: string[] }) =>
  prisma.brandSettings.upsert({ where: { adAccountId }, update: data, create: { adAccountId, ...data } })

export async function GET(req: NextRequest) {
  const compte = await compteDe(req.nextUrl.searchParams.get('dbAccountId'))
  if (!compte) return NextResponse.json({ erreur: 'Compte introuvable' }, { status: 404 })
  return NextResponse.json(await kit(compte.id))
}

/**
 * Dépose un logo (il remplace l'ancien : `logo`, ou `logoClair` pour fonds
 * sombres), une photo réelle, une créa modèle, ou une photo de produit (`produitId`).
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const compte = await compteDe(form?.get('dbAccountId'))
  if (!compte) return NextResponse.json({ erreur: 'Compte introuvable' }, { status: 404 })
  const quoi = form!.get('quoi')
  const fichier = form!.get('fichier')
  if (!['logo', 'logoClair', 'photo', 'modele', 'produitPhoto'].includes(String(quoi)) || !(fichier instanceof File)) return NextResponse.json({ erreur: 'Fichier manquant' }, { status: 400 })
  if (!TYPES.includes(fichier.type)) return NextResponse.json({ erreur: 'Image PNG, JPEG ou WebP seulement' }, { status: 400 })
  if (fichier.size > TAILLE_MAX) return NextResponse.json({ erreur: 'Image trop lourde (8 Mo au plus)' }, { status: 400 })

  const actuel = await kit(compte.id)
  const produit = quoi === 'produitPhoto' ? actuel.produits.find((p) => p.id === form!.get('produitId')) : null
  if (quoi === 'photo' && actuel.photos.length >= PHOTOS_MAX) return NextResponse.json({ erreur: `${PHOTOS_MAX} photos au plus` }, { status: 400 })
  if (quoi === 'modele' && actuel.modeles.length >= MODELES_MAX) return NextResponse.json({ erreur: `${MODELES_MAX} créas modèles au plus` }, { status: 400 })
  if (quoi === 'produitPhoto' && (!produit || produit.photos.length >= PHOTOS_PRODUIT_MAX)) return NextResponse.json({ erreur: `Produit introuvable ou déjà ${PHOTOS_PRODUIT_MAX} photos` }, { status: 400 })
  // Un nom neuf à chaque dépôt : l'ancien logo resterait sinon en cache chez le navigateur.
  const chemin = await deposer(`marques/${compte.id}/${quoi}-${Date.now()}`, fichier.type, Buffer.from(await fichier.arrayBuffer()))
  if (quoi === 'modele') await prisma.creaModele.create({ data: { adAccountId: compte.id, chemin } })
  else if (produit) await prisma.produitMarque.update({ where: { id: produit.id }, data: { photos: [...produit.photos.map((p) => p.chemin), chemin] } })
  else await enregistrer(compte.id, quoi === 'logo' ? { logoChemin: chemin } : quoi === 'logoClair' ? { logoClairChemin: chemin } : { photos: [...actuel.photos.map((p) => p.chemin), chemin] })
  return NextResponse.json(await kit(compte.id))
}

/**
 * Couleurs et leurs rôles, guidelines, produits (ajout, modification, retrait),
 * note d'une créa modèle, ou retrait d'un logo, d'une photo ou d'une créa modèle.
 */
export async function PATCH(req: NextRequest) {
  const corps = await req.json().catch(() => null)
  const compte = await compteDe(corps?.dbAccountId)
  if (!compte) return NextResponse.json({ erreur: 'Compte introuvable' }, { status: 404 })
  const sienne = { adAccountId: compte.id }
  const texte = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

  if (Array.isArray(corps.couleurs)) {
    // Couleur et rôle vont par paires : une couleur invalide part avec son rôle.
    const paires = corps.couleurs
      .map((c: unknown, i: number) => [c, Array.isArray(corps.couleursRoles) ? corps.couleursRoles[i] : null])
      .filter(([c]: [unknown]) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))
      .slice(0, COULEURS_MAX)
    await enregistrer(compte.id, {
      couleurs: paires.map(([c]: [string]) => c.toLowerCase()),
      couleursRoles: paires.map(([, r]: [string, unknown]) => ((ROLES_COULEUR as readonly unknown[]).includes(r) ? (r as string) : '')),
    })
  }
  if (corps.produit && typeof corps.produit === 'object') {
    const p = corps.produit
    const donnees = { nom: texte(p.nom, 120) ?? 'Produit', description: texte(p.description, 1000), prix: texte(p.prix, 60) }
    if (typeof p.id === 'string') await prisma.produitMarque.updateMany({ where: { id: p.id, ...sienne }, data: donnees })
    else await prisma.produitMarque.create({ data: { ...sienne, ...donnees } })
  }
  if (typeof corps.retirerProduit === 'string') await prisma.produitMarque.deleteMany({ where: { id: corps.retirerProduit, ...sienne } })
  if (typeof corps.retirerPhotoProduit === 'string' && typeof corps.produitId === 'string') {
    const p = await prisma.produitMarque.findFirst({ where: { id: corps.produitId, ...sienne } })
    if (p) await prisma.produitMarque.update({ where: { id: p.id }, data: { photos: p.photos.filter((c) => c !== corps.retirerPhotoProduit) } })
  }
  if (typeof corps.modeleId === 'string' && typeof corps.note === 'string') {
    await prisma.creaModele.updateMany({ where: { id: corps.modeleId, ...sienne }, data: { note: texte(corps.note, 400) } })
  }
  if (typeof corps.retirerModele === 'string') await prisma.creaModele.deleteMany({ where: { id: corps.retirerModele, ...sienne } })
  const guidelines = Object.fromEntries(
    GUIDELINES.filter((g) => typeof corps[g] === 'string').map((g) => [g, corps[g].trim().slice(0, 400) || null]),
  ) as Guidelines
  if (Object.keys(guidelines).length) await enregistrer(compte.id, guidelines)
  if (corps.retirerLogo === true) await enregistrer(compte.id, { logoChemin: null })
  if (corps.retirerLogoClair === true) await enregistrer(compte.id, { logoClairChemin: null })
  if (typeof corps.retirerPhoto === 'string') {
    const actuel = await kit(compte.id)
    await enregistrer(compte.id, { photos: actuel.photos.map((p) => p.chemin).filter((c) => c !== corps.retirerPhoto) })
  }
  return NextResponse.json(await kit(compte.id))
}
