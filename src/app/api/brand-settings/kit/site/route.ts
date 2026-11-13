import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { compteDe } from '@/lib/veille/compte'
import { deposer, urlPublique } from '@/lib/veille/stockage'
import { lireSite } from '@/lib/veille/site'
import { chartePourSite, ROLES_COULEUR } from '@/lib/veille/brandkit'

/**
 * « Remplir depuis le site » : POST lit le site du client et rend la charte
 * proposée par Claude, avec ses logos et photos déjà copiés dans le stockage ;
 * PUT enregistre ce que l'utilisateur a gardé.
 */

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const corps = await req.json().catch(() => null)
  const compte = await compteDe(corps?.dbAccountId)
  if (!compte) return NextResponse.json({ erreur: 'Compte introuvable' }, { status: 404 })
  const reglages = await prisma.brandSettings.findUnique({ where: { adAccountId: compte.id }, select: { websiteUrl: true } })
  const adresse = (typeof corps.url === 'string' && corps.url.trim()) || reglages?.websiteUrl
  if (!adresse) return NextResponse.json({ erreur: 'Indiquez l’adresse du site' }, { status: 400 })

  try {
    const site = await lireSite(adresse)
    const [proposition, logos, photos] = await Promise.all([
      chartePourSite(site),
      // Copiés tout de suite : l'enregistrement ne reprend que des chemins du stockage, jamais une adresse venue du navigateur.
      // ponytail: les candidats non retenus restent dans le stockage (quelques centaines de Ko par analyse) ; à purger si besoin.
      Promise.all(site.logos.map((l, i) => deposer(`marques/${compte.id}/site-${Date.now()}-logo-${i}`, l.type, l.octets))),
      Promise.all(site.photos.map((p, i) => deposer(`marques/${compte.id}/site-${Date.now()}-photo-${i}`, p.type, p.octets))),
    ])
    const enClair = (chemin: string) => ({ chemin, url: urlPublique(chemin) })
    return NextResponse.json({ site: site.url, proposition, logos: logos.map(enClair), photos: photos.map(enClair) })
  } catch (e) {
    return NextResponse.json({ erreur: (e as Error).message }, { status: 502 })
  }
}

type Choix = {
  identite?: { nom?: string; description?: string; proposition?: string }
  logo?: string
  logoClair?: string
  couleurs?: { hex: string; role: string }[]
  typos?: { typoTitre?: string; typoTexte?: string }
  ton?: { tonDeVoix?: string; motsAEmployer?: string[]; motsAEviter?: string[] }
  photos?: string[]
  produits?: { nom: string; description?: string; prix?: string; photo?: string | null }[]
}

const court = (v: unknown, max = 400) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export async function PUT(req: NextRequest) {
  const corps = await req.json().catch(() => null)
  const compte = await compteDe(corps?.dbAccountId)
  if (!compte) return NextResponse.json({ erreur: 'Compte introuvable' }, { status: 404 })
  const choix = (corps.choix ?? {}) as Choix
  // Seuls des fichiers copiés pour ce compte peuvent être repris.
  const sien = (c: unknown): c is string => typeof c === 'string' && c.startsWith(`marques/${compte.id}/`)

  const actuel = await prisma.brandSettings.findUnique({ where: { adAccountId: compte.id }, select: { photos: true } })
  const couleurs = (choix.couleurs ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex) && (ROLES_COULEUR as readonly string[]).includes(c.role)).slice(0, 6)
  const data = {
    ...(choix.identite && {
      ...(court(choix.identite.nom, 120) && { companyName: court(choix.identite.nom, 120) }),
      ...(court(choix.identite.description, 1000) && { productDescription: court(choix.identite.description, 1000) }),
      ...(court(choix.identite.proposition, 600) && { uniqueValueProp: court(choix.identite.proposition, 600) }),
    }),
    ...(sien(choix.logo) && { logoChemin: choix.logo }),
    ...(sien(choix.logoClair) && { logoClairChemin: choix.logoClair }),
    ...(couleurs.length && { couleurs: couleurs.map((c) => c.hex.toLowerCase()), couleursRoles: couleurs.map((c) => c.role) }),
    ...(choix.typos && { typoTitre: court(choix.typos.typoTitre), typoTexte: court(choix.typos.typoTexte) }),
    ...(choix.ton && {
      tonDeVoix: court(choix.ton.tonDeVoix),
      motsAEmployer: court((choix.ton.motsAEmployer ?? []).join(', ')),
      motsAEviter: court((choix.ton.motsAEviter ?? []).join(', ')),
    }),
    ...((choix.photos ?? []).some(sien) && { photos: [...(actuel?.photos ?? []), ...(choix.photos ?? []).filter(sien)].slice(0, 8) }),
  }
  await prisma.brandSettings.upsert({ where: { adAccountId: compte.id }, update: data, create: { adAccountId: compte.id, ...data } })
  const produits = (choix.produits ?? []).filter((p) => court(p.nom, 120)).slice(0, 12)
  if (produits.length) {
    await prisma.produitMarque.createMany({
      data: produits.map((p) => ({
        adAccountId: compte.id, nom: court(p.nom, 120)!, description: court(p.description, 1000), prix: court(p.prix, 60), photos: sien(p.photo) ? [p.photo] : [],
      })),
    })
  }
  return NextResponse.json({ ok: true })
}
