import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { economie, verdictCpl } from '@/lib/scalr/economie'

/**
 * Le CPL que le compte peut se permettre, et celui qu'il paie.
 *
 * Servi à part du cockpit pour que l'écran de réglage puisse montrer le
 * résultat pendant qu'on saisit, sans tirer toute la page de pilotage.
 *
 * La fenêtre est longue — quatre-vingt-dix jours — parce qu'un taux de
 * signature mesuré sur sept jours ne mesure rien : les signatures arrivent
 * après les prospects, souvent des semaines après.
 */

export const maxDuration = 30

const JOURS = 90

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbAccountId = req.nextUrl.searchParams.get('dbAccountId')
  if (!dbAccountId) return NextResponse.json({ error: 'dbAccountId requis' }, { status: 400 })

  const until = new Date(); until.setUTCHours(0, 0, 0, 0)
  const since = new Date(until); since.setUTCDate(since.getUTCDate() - JOURS)

  const [reglages, crm, media] = await Promise.all([
    prisma.brandSettings.findUnique({
      where: { adAccountId: dbAccountId },
      select: {
        averageOrderValue: true, productMarginPct: true, partAcquisition: true,
        cplDerive: true, targetCpa: true,
      },
    }),
    prisma.ghlDaily.aggregate({
      where: { adAccountId: dbAccountId, date: { gte: since, lte: until } },
      _sum: { leads: true, signes: true, ca: true },
    }),
    prisma.metaDailyAd.aggregate({
      where: { adAccountId: dbAccountId, attribution: 'default', date: { gte: since, lte: until } },
      _sum: { spend: true, formLeads: true, pixelLeads: true, totalLeads: true },
    }),
  ])

  const leadsCrm = Number(crm._sum.leads ?? 0)
  const signes = Number(crm._sum.signes ?? 0)

  const eco = economie({
    valeurClient: reglages?.averageOrderValue ?? null,
    margePct: reglages?.productMarginPct ?? null,
    partAcquisitionPct: reglages?.partAcquisition ?? null,
    leads: leadsCrm,
    signes,
  })

  // Le CPL réel se mesure sur la même fenêtre que le taux, sans quoi on
  // comparerait deux périodes différentes.
  const depense = Number(media._sum.spend ?? 0)
  const leadsMeta = Number(media._sum.formLeads ?? 0) || Number(media._sum.pixelLeads ?? 0)
    || Number(media._sum.totalLeads ?? 0)
  const cplReel = leadsMeta > 0 ? Math.round((depense / leadsMeta) * 100) / 100 : null

  return NextResponse.json({
    periode: { since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10), jours: JOURS },
    ...eco,
    leadsCrm,
    signes,
    caSigne: Math.round(Number(crm._sum.ca ?? 0) * 100) / 100,
    cplReel,
    cplSaisi: reglages?.targetCpa ?? null,
    actif: Boolean(reglages?.cplDerive),
    verdict: verdictCpl(cplReel, eco.cplCible, eco.cplPointMort),
  })
}
