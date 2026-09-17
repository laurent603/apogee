import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { economie, verdictSignature } from '@/lib/scalr/economie'

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

  /**
   * Le rythme de dépense se lit sur trente jours, pas sur quatre-vingt-dix.
   *
   * La fenêtre longue existe pour le taux de signature, qui met des semaines à
   * se former. Appliquée à la dépense, elle écrase la montée en puissance : un
   * compte passé de 2 880 € en juillet à 4 632 € aujourd'hui s'affichait à
   * 3 348 €, et semblait dépenser un tiers de moins que son budget alors qu'il
   * en était à 93 %.
   *
   * La borne est la veille : la journée en cours est partielle, la synchro ayant
   * lieu en cours de journée, et elle tirerait le rythme vers le bas.
   */
  const hier = new Date(until); hier.setUTCDate(hier.getUTCDate() - 1)
  const debut30 = new Date(hier); debut30.setUTCDate(debut30.getUTCDate() - 29)

  const [reglages, crm, media, media30] = await Promise.all([
    prisma.brandSettings.findUnique({
      where: { adAccountId: dbAccountId },
      select: {
        averageOrderValue: true, productMarginPct: true, partAcquisition: true,
        cplDerive: true, targetCpa: true,
      },
    }),
    prisma.ghlDaily.aggregate({
      where: { adAccountId: dbAccountId, date: { gte: since, lte: until } },
      _sum: { leads: true, signes: true, ca: true, signesMeta: true, caMeta: true },
    }),
    prisma.metaDailyAd.aggregate({
      where: { adAccountId: dbAccountId, attribution: 'default', date: { gte: since, lte: until } },
      _sum: { spend: true, formLeads: true, pixelLeads: true, totalLeads: true },
    }),
    prisma.metaDailyAd.aggregate({
      where: { adAccountId: dbAccountId, attribution: 'default', date: { gte: debut30, lte: hier } },
      _sum: { spend: true },
    }),
  ])

  const leadsCrm = Number(crm._sum.leads ?? 0)

  /**
   * Seules les affaires qui portent l'identifiant d'une publicité entrent dans
   * le calcul.
   *
   * Diviser la dépense Meta par toutes les signatures du CRM, y compris celles
   * venues d'ailleurs, sous-estime le coût d'acquisition — c'est le travers du
   * dénominateur décrit en tête de `economie.ts`, transposé aux signatures. Et
   * c'est ce chiffre-là qu'on présente au client : ce que le média a produit,
   * pas ce que l'entreprise a signé.
   *
   * Les totaux du CRM restent servis à côté, parce que l'écart avec eux se
   * remarque et demande une explication plutôt qu'un silence.
   */
  const signes = Number(crm._sum.signesMeta ?? 0)
  const signesCrm = Number(crm._sum.signes ?? 0)
  const caCrm = Math.round(Number(crm._sum.ca ?? 0) * 100) / 100

  const depense = Math.round(Number(media._sum.spend ?? 0) * 100) / 100
  const leadsMeta = Number(media._sum.formLeads ?? 0) || Number(media._sum.pixelLeads ?? 0)
    || Number(media._sum.totalLeads ?? 0)

  const eco = economie({
    valeurClient: reglages?.averageOrderValue ?? null,
    margePct: reglages?.productMarginPct ?? null,
    partAcquisitionPct: reglages?.partAcquisition ?? null,
    leads: leadsCrm,
    signes,
    leadsMeta,
    depense,
  })

  return NextResponse.json({
    periode: { since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10), jours: JOURS },
    ...eco,
    leadsCrm,
    leadsMeta,
    signes,
    depense,
    caSigne: Math.round(Number(crm._sum.caMeta ?? 0) * 100) / 100,
    signesCrm,
    caCrm,
    /** Dépense des trente derniers jours clos — le rythme, pas le cumul. */
    depense30: Math.round(Number(media30._sum.spend ?? 0) * 100) / 100,
    cplSaisi: reglages?.targetCpa ?? null,
    actif: Boolean(reglages?.cplDerive),
    verdict: verdictSignature(eco.coutParSignature, eco.margeParClient),
  })
}
