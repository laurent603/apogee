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
import { CREATIVE_FIELDS, detectCreativeType, thumbnailUrl } from './creative'
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

type MetaPage = { data?: unknown[]; paging?: { next?: string }; error?: { message?: string; code?: number } }

/** Meta limite l'application, pas seulement le compte : passé un seuil, tous
 *  les appels échouent quelques minutes. Attendre puis réessayer coûte moins
 *  cher que de perdre un compte entier. */
function isRateLimited(msg: string, code?: number): boolean {
  const m = msg.toLowerCase()
  return code === 17 || code === 4 || code === 613
    || m.includes('request limit reached')
    || m.includes('too many calls')
    || m.includes('rate limit')
}

async function metaGet(url: string, attempt = 0): Promise<MetaPage> {
  const json = (await fetch(url).then((r) => r.json())) as MetaPage
  if (json.error && isRateLimited(json.error.message || '', json.error.code) && attempt < 4) {
    // Palier croissant : 30 s, 60 s, 120 s, 240 s.
    const wait = 30_000 * 2 ** attempt
    await new Promise((r) => setTimeout(r, wait))
    return metaGet(url, attempt + 1)
  }
  return json
}

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
const IDENTITY_FIELDS =
  'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,objective,date_start,date_stop'

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
      const json = await metaGet(url)
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

  // Les entités se déduisent des lignes déjà reçues : aucun appel de plus
  // pour les noms et l'objectif.
  const entities = await persistEntities(opts.adAccountId, opts.metaAccountId, opts.token, rows)

  return {
    account: opts.metaAccountId,
    from: iso(opts.since),
    to: iso(opts.until),
    rows: written,
    entities,
    durationMs: Date.now() - t0,
  }
}

type EntityDraft = {
  level: string; metaId: string; name: string
  objective: string | null; parentMetaId: string | null
}

/**
 * Noms, objectif et filiation — déduits des lignes d'insights elles-mêmes.
 *
 * Meta renvoie `ad_name`, `adset_name`, `campaign_name` et `objective` dans la
 * même réponse que les chiffres : les redemander séparément serait payer deux
 * fois. La première version parcourait les trois edges du compte entier —
 * 1 856 entités rapatriées pour 375 lignes de données — et la seconde tentait
 * un appel groupé par `ids`, paramètre que Meta a déprécié en v26.
 */
function draftEntitiesFromRows(rows: InsightRow[]): Map<string, EntityDraft> {
  const out = new Map<string, EntityDraft>()
  const put = (level: string, metaId: unknown, name: unknown, extra: Partial<EntityDraft> = {}) => {
    if (!metaId) return
    const id = String(metaId)
    out.set(`${level}:${id}`, {
      level, metaId: id, name: String(name || ''),
      objective: null, parentMetaId: null, ...extra,
    })
  }
  for (const r of rows) {
    put('campaign', r.campaign_id, r.campaign_name, { objective: r.objective ? String(r.objective) : null })
    put('adset', r.adset_id, r.adset_name, { parentMetaId: r.campaign_id ? String(r.campaign_id) : null })
    put('ad', r.ad_id, r.ad_name, { parentMetaId: r.adset_id ? String(r.adset_id) : null })
  }
  return out
}

/**
 * Complète les brouillons avec statut et budget, que les insights ne portent
 * pas. Le filtrage par identifiants sur l'edge remplace l'appel groupé `ids`.
 * Best-effort : un statut manquant n'invalide pas les chiffres.
 */
async function enrichStatuses(
  metaAccountId: string, token: string, drafts: Map<string, EntityDraft>,
): Promise<Map<string, Record<string, unknown>>> {
  const extra = new Map<string, Record<string, unknown>>()
  const edges: [string, string, string][] = [
    ['campaign', 'campaigns', 'id,status,effective_status,daily_budget,lifetime_budget,created_time'],
    ['adset', 'adsets', 'id,status,effective_status,daily_budget,lifetime_budget,created_time'],
    ['ad', 'ads', `id,name,status,effective_status,created_time,${CREATIVE_FIELDS}`],
  ]
  for (const [level, edge, fields] of edges) {
    const ids = [...drafts.values()].filter((d) => d.level === level).map((d) => d.metaId)
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50)
      const url = `${API}/${VERSION}/${metaAccountId}/${edge}?` + new URLSearchParams({
        fields,
        filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: batch }]),
        limit: '100',
        access_token: token,
      }).toString()
      const json = await metaGet(url)
      if (json.error) continue
      for (const it of (json.data || []) as Record<string, unknown>[]) {
        extra.set(`${level}:${String(it.id)}`, it)
      }
    }
  }
  return extra
}

async function persistEntities(
  adAccountId: string, metaAccountId: string, token: string, rows: InsightRow[],
): Promise<number> {
  const drafts = draftEntitiesFromRows(rows)
  if (!drafts.size) return 0
  const extra = await enrichStatuses(metaAccountId, token, drafts)

  const list = [...drafts.entries()]
  for (let i = 0; i < list.length; i += 200) {
    await prisma.$transaction(
      list.slice(i, i + 200).map(([key, d]) => {
        const x = extra.get(key) || {}
        const data = {
          adAccountId,
          level: d.level,
          metaId: d.metaId,
          name: d.name,
          objective: d.objective,
          parentMetaId: d.parentMetaId,
          status: x.status ? String(x.status) : null,
          effectiveStatus: x.effective_status ? String(x.effective_status) : null,
          dailyBudget: x.daily_budget ? num(x.daily_budget) / 100 : null,
          lifetimeBudget: x.lifetime_budget ? num(x.lifetime_budget) / 100 : null,
          createdTime: x.created_time ? new Date(String(x.created_time)) : null,
          // Publicités seulement : de quoi peupler la galerie de créas.
          thumbnailUrl: d.level === 'ad' ? thumbnailUrl(x.creative as never) : null,
          creativeType: d.level === 'ad' ? detectCreativeType(x.creative as never, d.name) : null,
          creativeId: d.level === 'ad' && x.creative ? String((x.creative as Record<string, unknown>).id ?? '') || null : null,
          syncedAt: new Date(),
        }
        return prisma.metaEntity.upsert({
          where: { level_metaId: { level: d.level, metaId: d.metaId } },
          create: data,
          update: data,
        })
      }),
    )
  }
  return drafts.size
}

/** Fenêtres de travail. La portée y est demandée à Meta plutôt que déduite,
 *  parce qu'aucune addition de journées ne donne des personnes uniques. */
export const FENETRES = [7, 14, 30, 90] as const

/**
 * Portée dédupliquée par période, pour les trois niveaux.
 *
 * Sans elle, la fréquence se calculerait sur une portée gonflée par le
 * recomptage des mêmes personnes d'un jour sur l'autre : sous-estimée, elle
 * empêcherait la règle de fatigue (seuil 2,6) de se déclencher un seul jour.
 */
export async function syncPeriodReach(opts: {
  adAccountId: string
  metaAccountId: string
  token: string
  /** Heures au-delà desquelles la portée est jugée périmée. */
  fraicheurH?: number
}): Promise<number> {
  // Douze appels Meta par compte : inutile de les refaire si la nuit les a
  // déjà rafraîchis. Sans ce garde-fou, une seconde passe du cron repayait
  // l'intégralité du coût pour rien.
  const seuil = new Date(Date.now() - (opts.fraicheurH ?? 20) * 3_600_000)
  const recent = await prisma.metaPeriodReach.findFirst({
    where: { adAccountId: opts.adAccountId, syncedAt: { gte: seuil } },
    select: { id: true },
  })
  if (recent) return 0

  const niveaux: [string, string][] = [['campaign', 'campaign'], ['adset', 'adset'], ['ad', 'ad']]
  let ecrits = 0

  for (const jours of FENETRES) {
    const until = daysAgo(0)
    const since = daysAgo(jours)
    for (const [level, metaLevel] of niveaux) {
      const url =
        `${API}/${VERSION}/${opts.metaAccountId}/insights?` +
        new URLSearchParams({
          level: metaLevel,
          fields: `${metaLevel}_id,reach,impressions`,
          time_range: JSON.stringify({ since: iso(since), until: iso(until) }),
          limit: '500',
          access_token: opts.token,
        }).toString()

      const json = await metaGet(url)
      if (json.error) continue

      const rows = (json.data || []) as Record<string, unknown>[]
      const mapped = rows
        .map((r) => ({
          adAccountId: opts.adAccountId,
          level,
          metaId: String(r[`${metaLevel}_id`] ?? ''),
          window: `${jours}d`,
          reach: Math.round(num(r.reach)),
          impressions: Math.round(num(r.impressions)),
          syncedAt: new Date(),
        }))
        .filter((r) => r.metaId)

      for (let i = 0; i < mapped.length; i += 200) {
        await prisma.$transaction(
          mapped.slice(i, i + 200).map((row) =>
            prisma.metaPeriodReach.upsert({
              where: { level_metaId_window: { level: row.level, metaId: row.metaId, window: row.window } },
              create: row,
              update: row,
            }),
          ),
        )
      }
      ecrits += mapped.length
    }
  }
  return ecrits
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

  // Best-effort : une portée manquante masque la fréquence, elle ne doit pas
  // faire échouer la synchronisation des chiffres eux-mêmes.
  await syncPeriodReach(opts).catch(() => 0)

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
