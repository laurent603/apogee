import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type Anthropic from '@anthropic-ai/sdk'
import { anthropic, MODEL_REPORT, REPORT_REASONING } from '@/lib/anthropic'
import { BRAND_DNA, ANGLES_MARKETING, SOUS_FORMATS } from '@/lib/prompts'

/**
 * L'ADN de marque d'un compte.
 *
 * Route isolée, table dédiée : la fonctionnalité se retire sans toucher au
 * reste. Le contenu est un JSON éditable — l'utilisateur doit pouvoir
 * corriger une couleur ou une règle sans repasser par une génération.
 */

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbAccountId = req.nextUrl.searchParams.get('dbAccountId')
  if (!dbAccountId) return NextResponse.json({ error: 'dbAccountId requis' }, { status: 400 })

  const adn = await prisma.brandDna.findUnique({ where: { adAccountId: dbAccountId } })
  return NextResponse.json({ adn, angles: ANGLES_MARKETING, sousFormats: SOUS_FORMATS })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Clé Anthropic absente' }, { status: 500 })
  }

  const { dbAccountId } = await req.json().catch(() => ({})) as { dbAccountId?: string }
  if (!dbAccountId) return NextResponse.json({ error: 'dbAccountId requis' }, { status: 400 })

  const [compte, reglages, entites] = await Promise.all([
    prisma.adAccount.findUnique({ where: { id: dbAccountId }, select: { name: true } }),
    prisma.brandSettings.findUnique({ where: { adAccountId: dbAccountId } }),
    // Les noms des publicités disent l'angle sans qu'on ait à le demander :
    // « avis-client-2 », « statique_made-in-fr », « Vidéo 4 - qualité française ».
    prisma.metaEntity.findMany({
      where: { adAccountId: dbAccountId, level: 'ad' },
      select: { name: true, creativeType: true },
      take: 60,
    }),
  ])

  const contexte = `# Le compte
${compte?.name ?? dbAccountId}

# Ses réglages de marque
${reglages ? JSON.stringify({
    entreprise: reglages.companyName, secteur: reglages.industry,
    proposition: reglages.uniqueValueProp, produit: reglages.productDescription,
    audience: reglages.targetAudience, persona: reglages.targetPersona,
    objections: reglages.audienceObjections, positionnement: reglages.marketPositioning,
    cplCible: reglages.targetCpa, cplMax: reglages.maxCpa,
  }, null, 2) : 'Non renseignés — déduis ce que tu peux du secteur et des noms de publicités, et dis-le dans « incertitudes ».'}

# Les publicités qui tournent
Leur nom porte souvent l'angle et le format.
${entites.map((e) => `- ${e.name}${e.creativeType ? ` (${e.creativeType})` : ''}`).join('\n') || 'Aucune.'}

# Les angles marketing disponibles
Choisis exclusivement dans cette liste, elle sert de classement dans un suivi
créatif existant :
${ANGLES_MARKETING.join(' · ')}

# Les sous-formats disponibles
${SOUS_FORMATS.join(' · ')}`

  try {
    const reponse = await anthropic.messages.stream({
      model: MODEL_REPORT,
      max_tokens: 16000,
      system: BRAND_DNA,
      messages: [{ role: 'user', content: contexte }],
      ...REPORT_REASONING,
    }).finalMessage()

    if (reponse.stop_reason === 'max_tokens') {
      return NextResponse.json({ error: 'Génération interrompue — relancez.' }, { status: 502 })
    }

    const brut = reponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text).join('\n').trim()

    // Le modèle encadre parfois son JSON malgré la consigne : on le déballe
    // plutôt que d'échouer sur trois backticks.
    const json = brut.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    try { JSON.parse(json) } catch {
      return NextResponse.json({ error: 'Réponse non exploitable (JSON invalide)' }, { status: 502 })
    }

    const adn = await prisma.brandDna.upsert({
      where: { adAccountId: dbAccountId },
      create: { adAccountId: dbAccountId, contenu: json },
      // Les cartes déjà rendues ne valent plus rien : elles décrivent
      // l'ancien ADN.
      update: { contenu: json, carteMarque: null, carteStyle: null },
    })
    return NextResponse.json({ adn })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message.slice(0, 300) : 'Erreur inconnue' },
      { status: 502 },
    )
  }
}

/** Enregistre l'ADN corrigé à la main, ou les cartes rendues par le navigateur. */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { dbAccountId, contenu, carteMarque, carteStyle, photoProduit } =
    await req.json().catch(() => ({})) as {
      dbAccountId?: string; contenu?: string
      carteMarque?: string; carteStyle?: string; photoProduit?: string | null
    }
  if (!dbAccountId) return NextResponse.json({ error: 'dbAccountId requis' }, { status: 400 })

  if (contenu !== undefined) {
    try { JSON.parse(contenu) } catch {
      return NextResponse.json({ error: 'JSON invalide — rien n’a été enregistré.' }, { status: 400 })
    }
  }

  const adn = await prisma.brandDna.upsert({
    where: { adAccountId: dbAccountId },
    create: { adAccountId: dbAccountId, contenu: contenu ?? '{}', carteMarque, carteStyle, photoProduit },
    update: {
      ...(contenu !== undefined ? { contenu } : {}),
      ...(carteMarque !== undefined ? { carteMarque } : {}),
      ...(carteStyle !== undefined ? { carteStyle } : {}),
      ...(photoProduit !== undefined ? { photoProduit } : {}),
    },
  })
  return NextResponse.json({ adn: { ...adn, carteMarque: undefined, carteStyle: undefined, photoProduit: undefined } })
}
