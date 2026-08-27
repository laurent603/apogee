/**
 * Synchronisation Meta → Postgres.
 *
 * C'est la pièce qui règle la lenteur. Jusqu'ici, chaque changement de filtre
 * déclenchait un aller-retour vers Meta : l'écran allait à la vitesse de leur
 * API, soit plusieurs secondes par interaction. En rapatriant les chiffres au
 * grain le plus fin — une publicité, un jour — tout le reste s'obtient par
 * agrégation SQL, indexée et locale.
 *
 * Deux pièges que ce module traite explicitement :
 *
 * - **Les chiffres récents bougent.** Meta réattribue les conversions pendant
 *   plusieurs jours après coup. On réécrit donc systématiquement une fenêtre
 *   glissante récente au lieu d'ajouter à la suite, sinon les derniers jours
 *   restent figés sur leur première valeur, toujours sous-estimée.
 * - **La reprise d'historique se fait par tranches.** Demander deux ans d'un
 *   coup fait tomber la requête ou déclenche la limitation de débit.
 */

import { prisma } from '@/lib/db'
import {
  INSIGHT_FIELDS, fallbackFieldsFor, isRetryableInsightsError, withAttribution,
  extractActionValue, extractActionValueByKeyword,
  extractFormLeads, extractPixelLeads, extractTotalLeads, extractOutboundClicks,
  type InsightRow, type Attribution,
} from './insights'

const API = 'https://graph.facebook.com'
const VERSION = process.env.META_API_VERSION || 'v21.0'

/** Jours réécrits à chaque passage, pour absorber la réattribution Meta. */
const RESYNC_WINDOW_DAYS = 7
/** Taille d'une tranche de reprise d'historique. */
const BACKFILL_CHUNK_DAYS = 30

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const iso = (d: Date) => d.toISOString().slice(0, 10)

function daysAgo(n: number): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - n)
  return d
}

/* ─── Appel Meta, avec repli ────────────────────────────────────────────── */

type MetaPage = { data?: unknown[]; paging?: { next?: string }; error?: { message?: string } }

/**
 * Récupère toutes les pages d'un endpoint insights.
 *
 * Le repli sur une liste de champs réduite vient de Scalr : certains comptes
 * n'exposent pas tous les champs vidéo, et l'appel entier échouait alors pour
 * un seul champ manquant. Mieux vaut des métriques partielles qu'un écran vide.
 */
/** Identité de la ligne. Absents de `INSIGHT_FIELDS`, qui ne décrit que les
 *  métriques — sans eux chaque enregistrement arriverait sans identifiant ni
 *  date, et serait écarté à l'insertion. */
const IDENTITY_FIELDS = 'ad_id,ad_name,adset_id,campaign_id,date_start,date_stop'

async function fetchInsightsAll(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<InsightRow[]> {
  const run = async (metricFields: string): Promise<InsightRow[]> => {
    const fields = `${IDENTITY_FIELDS},${metricFields}`
    const rows: InsightRow[] = []
    let url: string | null =
      `${API}/${VERSION}/${path}?` +
      new URLSearchParams({ ...params, fields, access_token: token, limit: '500' }).toString()

    let guard = 0
    while (url && guard++ < 40) {
      const res = await fetch(url)
      const json = (await res.json()) as MetaPage
      if (json.error) throw new Error(json.error.message || 'erreur Meta')
      rows.push(...((json.data || []) as InsightRow[]))
      url = json.paging?.next || null
    }
    return rows
  }

  try {
    return await run(INSIGHT_FIELDS)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!isRetryableInsightsError(msg)) throw e
    return run(fallbackFieldsFor(INSIGHT_FIELDS))
  }
}

/* ─── Mise en base ──────────────────────────────────────────────────────── */

/** Extrait de la ligne Meta les seules valeurs brutes : aucun ratio, ils se
 *  recalculent à la lecture. */
function toDailyRow(r: InsightRow, ctx: { adAccountId: string; metaAccountId: string; attribution: string }) {
  const PURCHASE = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']
  return {
    adAccountId: ctx.adAccountId,
    metaAccountId: ctx.metaAccountId,
    attribution: ctx.attribution,
    date: new Date(String(r.date_start)),
    adId: String(r.ad_id || ''),
    adsetId: r.adset_id ? String(r.adset_id) : null,
    campaignId: r.campaign_id ? String(r.campaign_id) : null,

    spend: num(r.spend),
    impressions: num(r.impressions),
    reach: num(r.reach),
    clicks: num(r.clicks),
    linkClicks: num(r.inline_link_clicks) || extractActionValue(r, ['link_click']),
    outboundClicks: extractOutboundClicks(r),

    landingPageViews: extractActionValue(r, ['landing_page_view', 'omni_landing_page_view']),
    addToCart: extractActionValue(r, ['add_to_cart', 'omni_add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart']),
    initiateCheckout: extractActionValue(r, ['initiate_checkout', 'omni_initiated_checkout', 'offsite_conversion.fb_pixel_initiate_checkout']),
    purchases: extractActionValue(r, PURCHASE),
    revenue: extractActionValue(r, PURCHASE, 'action_values'),

    formLeads: extractFormLeads(r),
    pixelLeads: extractPixelLeads(r),
    totalLeads: extractTotalLeads(r),

    directions: extractActionValueByKeyword(r, ['direction', 'itineraire', 'itinéraire'], [], ['actions', 'conversions']),
    postEngagement: extractActionValue(r, ['post_engagement', 'page_engagement']),

    videoStarts: extractActionValue(r, ['video_play_actions'], 'video_play_actions'),
    video3s: extractActionValue(r, ['video_view']),
    video15s: extractActionValue(r, ['video_15_sec_watched_actions'], 'video_15_sec_watched_actions'),
    thruplays: extractActionValue(r, ['video_thruplay_watched_actions'], 'video_thruplay_watched_actions'),
    video25: extractActionValue(r, ['video_p25_watched_actions'], 'video_p25_watched_actions'),
    video50: extractActionValue(r, ['video_p50_watched_actions'], 'video_p50_watched_actions'),
    video75: extractActionValue(r, ['video_p75_watched_actions'], 'video_p75_watched_actions'),
    video95: extractActionValue(r, ['video_p95_watched_actions'], 'video_p95_watched_actions'),
    syncedAt: new Date(),
  }
}

export type SyncResult = {
  account: string
  from: string
  to: string
  rows: number
  entities: number
  durationMs: number
}

/**
 * Rapatrie une plage de jours pour un compte.
 *
 * `time_increment: 1` demande à Meta une ligne par jour plutôt qu'un total :
 * c'est ce qui rend n'importe quelle période reconstituable ensuite, y compris
 * celles qu'on n'avait pas prévues.
 */
export async function syncAccountRange(opts: {
  adAccountId: string
  metaAccountId: string
  token: string
  since: Date
  until: Date
  attribution?: Attribution
}): Promise<SyncResult> {
  const t0 = Date.now()
  const attribution = opts.attribution || 'default'

  const rows = await fetchInsightsAll(
    `${opts.metaAccountId}/insights`,
    withAttribution({
      level: 'ad',
      time_increment: '1',
      time_range: JSON.stringify({ since: iso(opts.since), until: iso(opts.until) }),
    }, attribution),
    opts.token,
  )

  const mapped = rows
    .map((r) => toDailyRow(r, { ...opts, attribution }))
    .filter((r) => r.adId)

  // Écriture par lots : un upsert par ligne saturerait le pooler.
  let written = 0
  for (let i = 0; i < mapped.length; i += 200) {
    const chunk = mapped.slice(i, i + 200)
    await prisma.$transaction(
      chunk.map((row) =>
        prisma.metaDailyAd.upsert({
          where: { adId_date_attribution: { adId: row.adId, date: row.date, attribution: row.attribution } },
          create: row,
          update: row,
        }),
      ),
    )
    written += chunk.length
  }

  const entities = await syncEntities(opts.adAccountId, opts.metaAccountId, opts.token)

  return {
    account: opts.metaAccountId,
    from: iso(opts.since),
    to: iso(opts.until),
    rows: written,
    entities,
    durationMs: Date.now() - t0,
  }
}

/** Noms, statuts et objectifs. L'objectif conditionne ce qui compte comme
 *  résultat, donc il ne peut pas manquer. */
async function syncEntities(adAccountId: string, metaAccountId: string, token: string): Promise<number> {
  const levels: { level: string; edge: string; fields: string }[] = [
    { level: 'campaign', edge: 'campaigns', fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time' },
    { level: 'adset', edge: 'adsets', fields: 'id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,created_time' },
    { level: 'ad', edge: 'ads', fields: 'id,name,status,effective_status,adset_id,created_time' },
  ]

  let count = 0
  for (const { level, edge, fields } of levels) {
    let url: string | null =
      `${API}/${VERSION}/${metaAccountId}/${edge}?` +
      new URLSearchParams({ fields, limit: '500', access_token: token }).toString()

    let guard = 0
    while (url && guard++ < 40) {
      const json = (await fetch(url).then((r) => r.json())) as MetaPage
      if (json.error) break
      const items = (json.data || []) as Record<string, unknown>[]

      for (let i = 0; i < items.length; i += 200) {
        const chunk = items.slice(i, i + 200)
        await prisma.$transaction(
          chunk.map((it) => {
            const data = {
              adAccountId,
              level,
              metaId: String(it.id),
              name: String(it.name || ''),
              status: it.status ? String(it.status) : null,
              effectiveStatus: it.effective_status ? String(it.effective_status) : null,
              objective: it.objective ? String(it.objective) : null,
              parentMetaId: it.campaign_id ? String(it.campaign_id) : it.adset_id ? String(it.adset_id) : null,
              dailyBudget: it.daily_budget ? num(it.daily_budget) / 100 : null,
              lifetimeBudget: it.lifetime_budget ? num(it.lifetime_budget) / 100 : null,
              createdTime: it.created_time ? new Date(String(it.created_time)) : null,
              syncedAt: new Date(),
            }
            return prisma.metaEntity.upsert({
              where: { level_metaId: { level, metaId: String(it.id) } },
              create: data,
              update: data,
            })
          }),
        )
        count += chunk.length
      }
      url = json.paging?.next || null
    }
  }
  return count
}

/**
 * Passage incrémental : réécrit la fenêtre récente d'un compte.
 * C'est ce que le cron appellera chaque nuit.
 */
export async function syncAccountRecent(opts: {
  adAccountId: string
  metaAccountId: string
  token: string
  days?: number
}): Promise<SyncResult> {
  const days = opts.days ?? RESYNC_WINDOW_DAYS
  const result = await syncAccountRange({
    ...opts,
    since: daysAgo(days),
    until: daysAgo(0),
  })

  await prisma.metaSyncState.upsert({
    where: { adAccountId: opts.adAccountId },
    create: {
      adAccountId: opts.adAccountId,
      metaAccountId: opts.metaAccountId,
      lastSyncedAt: new Date(),
      rowsTotal: result.rows,
    },
    update: {
      lastSyncedAt: new Date(),
      lastError: null,
      rowsTotal: { increment: result.rows },
    },
  })

  return result
}

/**
 * Reprise d'historique, une tranche par appel.
 *
 * Remonte le temps depuis le point déjà atteint. Rendre la main entre chaque
 * tranche évite à la fois le dépassement de durée d'une fonction serverless et
 * la limitation de débit côté Meta.
 */
export async function backfillAccountChunk(opts: {
  adAccountId: string
  metaAccountId: string
  token: string
  targetDays: number
}): Promise<SyncResult & { done: boolean }> {
  const state = await prisma.metaSyncState.findUnique({ where: { adAccountId: opts.adAccountId } })
  const oldest = state?.backfilledFrom ? new Date(state.backfilledFrom) : daysAgo(0)
  const target = daysAgo(opts.targetDays)

  if (oldest <= target) {
    return { account: opts.metaAccountId, from: iso(target), to: iso(oldest), rows: 0, entities: 0, durationMs: 0, done: true }
  }

  const until = new Date(oldest)
  until.setUTCDate(until.getUTCDate() - 1)
  const since = new Date(until)
  since.setUTCDate(since.getUTCDate() - BACKFILL_CHUNK_DAYS)
  if (since < target) since.setTime(target.getTime())

  const result = await syncAccountRange({ ...opts, since, until })

  await prisma.metaSyncState.upsert({
    where: { adAccountId: opts.adAccountId },
    create: {
      adAccountId: opts.adAccountId,
      metaAccountId: opts.metaAccountId,
      backfilledFrom: since,
      rowsTotal: result.rows,
    },
    update: { backfilledFrom: since, rowsTotal: { increment: result.rows }, lastError: null },
  })

  return { ...result, done: since <= target }
}
