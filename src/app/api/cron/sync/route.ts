import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncAccountRecent } from '@/lib/scalr/sync'
import { notifyIncident } from '@/lib/notify'

/**
 * Rafraîchissement nocturne de la base Meta.
 *
 * Le passage complet sur 90 jours demande près de huit minutes, bien au-delà
 * des 300 secondes d'une fonction Vercel. Plutôt que d'espérer que ça tienne,
 * le travail est **borné dans le temps et reprenable** : les comptes sont
 * traités du plus anciennement synchronisé au plus récent, et l'exécution
 * s'arrête proprement avant l'échéance. Le passage suivant reprend là où
 * celui-ci s'est arrêté, sans état à gérer — l'ordre de fraîcheur suffit.
 *
 * Ne rapatrie qu'une fenêtre récente : c'est un rafraîchissement, pas une
 * reprise d'historique. Les jours déjà en base ne bougent plus, sauf les tout
 * derniers que Meta réattribue encore.
 */

export const maxDuration = 300

/** Marge gardée pour écrire l'état et répondre avant la coupure. */
const BUDGET_MS = 240_000

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const days = Number(req.nextUrl.searchParams.get('days') || 7)
  const started = Date.now()

  // Le plus anciennement synchronisé d'abord. Un compte jamais synchronisé
  // (pas de ligne d'état) passe en tête.
  const comptes = await prisma.adAccount.findMany({
    select: {
      id: true, metaAccountId: true, name: true,
      user: { select: { accessToken: true } },
    },
  })
  const etats = await prisma.metaSyncState.findMany({
    select: { adAccountId: true, lastSyncedAt: true },
  })
  const fraicheur = new Map(etats.map((e) => [e.adAccountId, e.lastSyncedAt?.getTime() ?? 0]))
  comptes.sort((a, b) => (fraicheur.get(a.id) ?? 0) - (fraicheur.get(b.id) ?? 0))

  const results: { name: string; rows?: number; skipped?: string; error?: string }[] = []
  let traites = 0

  for (const c of comptes) {
    // On s'arrête net s'il ne reste pas de quoi traiter un compte lent.
    if (Date.now() - started > BUDGET_MS) break

    if (!c.user?.accessToken) {
      results.push({ name: c.name, skipped: 'aucun jeton' })
      continue
    }

    try {
      const r = await syncAccountRecent({
        adAccountId: c.id,
        metaAccountId: c.metaAccountId,
        token: c.user.accessToken,
        days,
      })
      results.push({ name: c.name, rows: r.rows })
      traites++
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0].slice(0, 200) : 'erreur inconnue'
      results.push({ name: c.name, error: msg })
      await prisma.metaSyncState
        .upsert({
          where: { adAccountId: c.id },
          create: { adAccountId: c.id, metaAccountId: c.metaAccountId, lastError: msg },
          update: { lastError: msg },
        })
        .catch(() => null)
    }
  }

  const echecs = results.filter((r) => r.error)
  const restants = comptes.length - results.length

  // Un compte qui échoue ponctuellement n'a pas à réveiller qui que ce soit —
  // la déduplication sur 24 h s'en charge. En revanche, une base qui ne se
  // rafraîchit plus rend tout le cockpit faux en silence.
  if (echecs.length > Math.max(3, comptes.length * 0.3)) {
    await notifyIncident({
      source: 'agent_cron',
      title: 'Synchronisation Meta majoritairement en échec',
      error: echecs.slice(0, 10).map((e) => `${e.name} : ${e.error}`).join('\n'),
      cause: `${echecs.length} comptes sur ${results.length} traités ont échoué. Les chiffres du cockpit ne se rafraîchissent plus et vieillissent silencieusement.`,
      email: true,
    })
  }

  return NextResponse.json({
    traites,
    echecs: echecs.length,
    restants,
    dureeMs: Date.now() - started,
    results,
  })
}
