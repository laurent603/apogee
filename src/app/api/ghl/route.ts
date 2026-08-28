import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { checkGhlAccess, syncGhlComplet } from '@/lib/ghl'

export const maxDuration = 120

/** Status only — the token never leaves the server. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbAccountId = req.nextUrl.searchParams.get('dbAccountId')
  if (!dbAccountId) return NextResponse.json({ error: 'dbAccountId requis' }, { status: 400 })

  const g = await prisma.ghlConnection.findUnique({ where: { adAccountId: dbAccountId } })
  return NextResponse.json({
    ghl: g ? {
      hasToken: Boolean(g.token),
      locationId: g.locationId,
      tagLead: g.tagLead, tagRdv: g.tagRdv, tagDevis: g.tagDevis, tagSigne: g.tagSigne,
      totalOpps: g.totalOpps,
      attributed: g.attributed,
      wonCount: g.wonCount,
      wonValue: g.wonValue,
      valueFilled: g.valueFilled,
      syncedAt: g.syncedAt,
      syncError: g.syncError,
      adStats: g.adStats ? JSON.parse(g.adStats) : null,
    } : null,
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { dbAccountId, token, locationId, tagLead, tagRdv, tagDevis, tagSigne } = await req.json()
  if (!dbAccountId) return NextResponse.json({ error: 'dbAccountId requis' }, { status: 400 })

  // Empty token means unchanged, so the stored secret survives a blank field
  const data: Record<string, string | null> = { locationId: locationId || null }
  if (token) data.token = token

  // Une étiquette vide est un choix — le compteur correspondant restera à
  // zéro — donc on l'enregistre telle quelle plutôt que de la sauter.
  const etiquette = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  data.tagLead = etiquette(tagLead)
  data.tagRdv = etiquette(tagRdv)
  data.tagDevis = etiquette(tagDevis)
  data.tagSigne = etiquette(tagSigne)

  await prisma.ghlConnection.upsert({
    where: { adAccountId: dbAccountId },
    update: data,
    create: { adAccountId: dbAccountId, locationId: locationId || null, token: token || null, ...data },
  })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { dbAccountId } = await req.json()
  if (!dbAccountId) return NextResponse.json({ error: 'dbAccountId requis' }, { status: 400 })

  const g = await prisma.ghlConnection.findUnique({ where: { adAccountId: dbAccountId } })
  if (!g?.token || !g?.locationId) {
    return NextResponse.json({ error: 'Renseignez le token et l\'ID du sous-compte avant de synchroniser.' }, { status: 400 })
  }

  try {
    // Fails early with a clear message when the token is scoped to another
    // sub-account, rather than returning an empty pipeline
    const locationName = await checkGhlAccess(g.token, g.locationId)

    // Une seule lecture des opportunités pour l'attribution et le tunnel.
    const { resume, tunnel, erreurContacts } = await syncGhlComplet(g.token, g.locationId, {
      lead: g.tagLead, rdv: g.tagRdv, devis: g.tagDevis, signe: g.tagSigne,
    })

    /**
     * Le tunnel s'écrit en un seul aller-retour.
     *
     * Deux cent seize `upsert` enchaînés sur une connexion mutualisée coûtaient
     * plus de temps que tous les appels à GoHighLevel réunis. Un remplacement
     * en bloc, dans une transaction, tient en une fraction du temps — et ne
     * peut pas laisser la table à moitié écrite.
     */
    let erreurTunnel: string | null = erreurContacts
    try {
      if (tunnel.length) {
        await prisma.$transaction([
          prisma.ghlDaily.deleteMany({ where: { adAccountId: dbAccountId } }),
          prisma.ghlDaily.createMany({
            data: tunnel.map((j) => ({
              adAccountId: dbAccountId,
              date: new Date(`${j.date}T00:00:00.000Z`),
              leads: j.leads, rdv: j.rdv, devis: j.devis, signes: j.signes, ca: j.ca,
            })),
          }),
        ])
      }
    } catch (e) {
      erreurTunnel = e instanceof Error ? e.message : 'Erreur inconnue'
    }

    await prisma.ghlConnection.update({
      where: { adAccountId: dbAccountId },
      data: {
        adStats: JSON.stringify(resume.adStats),
        totalOpps: resume.totalOpps,
        attributed: resume.attributed,
        wonCount: resume.wonCount,
        wonValue: resume.wonValue,
        valueFilled: resume.valueFilled,
        syncedAt: new Date(),
        syncError: null,
      },
    })
    return NextResponse.json({
      ok: true, locationName, ...resume, adStats: undefined,
      adCount: Object.keys(resume.adStats).length,
      joursTunnel: tunnel.length,
      erreurTunnel,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue'
    await prisma.ghlConnection.update({
      where: { adAccountId: dbAccountId },
      data: { syncError: message.slice(0, 400) },
    }).catch(() => {})
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
