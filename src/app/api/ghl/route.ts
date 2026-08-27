import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { checkGhlAccess, syncGhl, syncGhlTunnel } from '@/lib/ghl'

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
    const summary = await syncGhl(g.token, g.locationId)

    /**
     * Le tunnel par journée, à part.
     *
     * Il lit les contacts, une ressource que l'API GoHighLevel rend parfois en
     * 500 sans raison tenant au compte. Cette lecture est un ajout : la
     * remonter au même niveau que les opportunités ferait échouer une synchro
     * qui fonctionnait, et priverait l'écran de tout — attribution comprise —
     * pour une partie facultative. Elle échoue donc seule, et le dit.
     */
    let tunnel: { date: string }[] = []
    let erreurTunnel: string | null = null
    try {
      const jours = await syncGhlTunnel(g.token, g.locationId, {
        lead: g.tagLead, rdv: g.tagRdv, devis: g.tagDevis, signe: g.tagSigne,
      })
      tunnel = jours
      for (const j of jours) {
        const date = new Date(`${j.date}T00:00:00.000Z`)
        await prisma.ghlDaily.upsert({
          where: { adAccountId_date: { adAccountId: dbAccountId, date } },
          update: { leads: j.leads, rdv: j.rdv, devis: j.devis, signes: j.signes, ca: j.ca, syncedAt: new Date() },
          create: { adAccountId: dbAccountId, date, leads: j.leads, rdv: j.rdv, devis: j.devis, signes: j.signes, ca: j.ca },
        })
      }
    } catch (e) {
      erreurTunnel = e instanceof Error ? e.message : 'Erreur inconnue'
    }

    await prisma.ghlConnection.update({
      where: { adAccountId: dbAccountId },
      data: {
        adStats: JSON.stringify(summary.adStats),
        totalOpps: summary.totalOpps,
        attributed: summary.attributed,
        wonCount: summary.wonCount,
        wonValue: summary.wonValue,
        valueFilled: summary.valueFilled,
        syncedAt: new Date(),
        syncError: null,
      },
    })
    return NextResponse.json({
      ok: true, locationName, ...summary, adStats: undefined,
      adCount: Object.keys(summary.adStats).length,
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
