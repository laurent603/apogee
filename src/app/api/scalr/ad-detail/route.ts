import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { formatInsightRow, INSIGHT_FIELDS, withAttribution, extractActionValue, extractFormLeads, extractPixelLeads, extractTotalLeads, extractOutboundClicks, extractActionValueByKeyword, type InsightRow, type Attribution } from '@/lib/scalr/insights'
import { computeMetrics, emptyTotals, type Totals } from '@/lib/scalr/aggregate'

/**
 * Le détail d'une publicité : d'où viennent ses résultats.
 *
 * Interrogé en direct plutôt que stocké, à la différence des tableaux. Un
 * détail s'ouvre sur un clic délibéré, pas à chaque changement de filtre :
 * une seconde d'attente y est acceptable, et stocker quatre ventilations pour
 * chaque publicité de chaque compte coûterait bien plus que ça ne rapporte.
 *
 * Les cinq appels partent ensemble — enchaînés, ils cumuleraient leurs
 * latences.
 */

export const maxDuration = 60

const API = 'https://graph.facebook.com'
const VERSION = process.env.META_API_VERSION || 'v21.0'

const PERIODES: Record<string, number> = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 }

const iso = (d: Date) => d.toISOString().slice(0, 10)

type Reponse = { data?: Record<string, unknown>[]; error?: { message?: string } }

async function insights(
  adId: string, token: string, params: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const url = `${API}/${VERSION}/${adId}/insights?` +
    new URLSearchParams({ fields: INSIGHT_FIELDS, limit: '200', access_token: token, ...params }).toString()
  const json = (await fetch(url).then((r) => r.json())) as Reponse
  if (json.error) return []
  return json.data || []
}

/** Convertit une ligne Meta brute en totaux cumulables. Les ratios ne sont
 *  jamais additionnés : ils se recalculent depuis les sommes. */
function versTotaux(r: Record<string, unknown>, acc: Totals): Totals {
  const ins = r as InsightRow
  const PURCHASE = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']
  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
  acc.spend += n(ins.spend)
  acc.impressions += n(ins.impressions)
  acc.reachSum += n(ins.reach)
  acc.clicks += n(ins.clicks)
  acc.linkClicks += n(ins.inline_link_clicks) || extractActionValue(ins, ['link_click'])
  acc.outboundClicks += extractOutboundClicks(ins)
  acc.landingPageViews += extractActionValue(ins, ['landing_page_view', 'omni_landing_page_view'])
  acc.purchases += extractActionValue(ins, PURCHASE)
  acc.revenue += extractActionValue(ins, PURCHASE, 'action_values')
  acc.formLeads += extractFormLeads(ins)
  acc.pixelLeads += extractPixelLeads(ins)
  acc.totalLeads += extractTotalLeads(ins)
  acc.directions += extractActionValueByKeyword(ins, ['direction', 'itineraire', 'itinéraire'], [], ['actions', 'conversions'])
  acc.postEngagement += extractActionValue(ins, ['post_engagement', 'page_engagement'])
  acc.videoStarts += extractActionValue(ins, ['video_play_actions'], 'video_play_actions')
  acc.video3s += extractActionValue(ins, ['video_view'])
  acc.video15s += extractActionValue(ins, ['video_15_sec_watched_actions'], 'video_15_sec_watched_actions')
  acc.thruplays += extractActionValue(ins, ['video_thruplay_watched_actions'], 'video_thruplay_watched_actions')
  acc.video25 += extractActionValue(ins, ['video_p25_watched_actions'], 'video_p25_watched_actions')
  acc.video95 += extractActionValue(ins, ['video_p95_watched_actions'], 'video_p95_watched_actions')
  acc.days += 1
  return acc
}

/**
 * Regroupe une ventilation par libellé et en tire le jeu complet de métriques.
 *
 * Le regroupement est indispensable : Meta rend « 25-34 · homme » et
 * « 25-34 · femme » sur deux lignes, et une ventilation par âge doit les
 * additionner plutôt que produire deux entrées du même nom.
 *
 * `computeMetrics` est réutilisé tel quel : le CPL d'un placement doit se
 * calculer exactement comme celui d'une campagne, sinon deux écrans de la même
 * application finissent par se contredire.
 *
 * `fusionne` signale que plusieurs lignes ont été additionnées — la portée
 * devient alors une borne haute, les mêmes personnes apparaissant dans
 * plusieurs sous-segments, et la fréquence qui en découle est tue.
 */
function ventiler(
  rows: Record<string, unknown>[],
  libelle: (r: Record<string, unknown>) => string,
  objectif = '',
) {
  const acc = new Map<string, { t: Totals; n: number }>()
  for (const r of rows) {
    const cle = libelle(r)
    const e = acc.get(cle) ?? { t: emptyTotals(), n: 0 }
    versTotaux(r, e.t)
    e.n += 1
    acc.set(cle, e)
  }

  return [...acc.entries()]
    .map(([cle, { t, n }]) => {
      const m = computeMetrics(t, objectif)
      const fusionne = n > 1
      return {
        cle,
        ...m,
        fusionne,
        // Une portée recomposée par addition n'est plus une portée.
        frequency: fusionne ? null : (t.reachSum > 0 ? Math.round((t.impressions / t.reachSum) * 100) / 100 : null),
        reach: t.reachSum,
      }
    })
    .filter((x) => x.spend > 0 || x.impressions > 0)
    .sort((a, b) => b.spend - a.spend)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const token = (session as { accessToken?: string } | null)?.accessToken
  if (!session || !token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const adId = p.get('adId')
  if (!adId) return NextResponse.json({ error: 'adId requis' }, { status: 400 })

  const jours = PERIODES[p.get('periode') || '30d'] ?? 30
  const attribution = (p.get('attribution') || 'default') as Attribution
  const until = new Date(); until.setUTCHours(0, 0, 0, 0)
  const since = new Date(until); since.setUTCDate(since.getUTCDate() - jours)
  const time_range = JSON.stringify({ since: iso(since), until: iso(until) })

  // Fenêtre précédente de même longueur, collée à celle demandée : sans elle
  // les indicateurs d'en-tête n'auraient rien à quoi se comparer.
  const precUntil = new Date(since.getTime() - 86_400_000)
  const precSince = new Date(precUntil.getTime() - (until.getTime() - since.getTime()))
  const commun = withAttribution({ time_range }, attribution)
  const communPrec = withAttribution(
    { time_range: JSON.stringify({ since: iso(precSince), until: iso(precUntil) }) }, attribution)

  const [meta, global, globalPrec, quotidien, placement, ageGenre, appareil] = await Promise.all([
    fetch(`${API}/${VERSION}/${adId}?` + new URLSearchParams({
      fields: 'id,name,status,effective_status,created_time,adset_id,campaign_id,creative{id,name}',
      access_token: token,
    }).toString()).then((r) => r.json()).catch(() => ({})),
    insights(adId, token, commun),
    insights(adId, token, communPrec),
    insights(adId, token, { ...commun, time_increment: '1' }),
    insights(adId, token, { ...commun, breakdowns: 'publisher_platform,platform_position' }),
    insights(adId, token, { ...commun, breakdowns: 'age,gender' }),
    insights(adId, token, { ...commun, breakdowns: 'impression_device' }),
  ])

  const objectif = String((meta as Record<string, unknown>)?.objective || '')
  const g = global[0] ? formatInsightRow(global[0] as InsightRow, { objective: objectif }) : null
  const gPrec = globalPrec[0] ? formatInsightRow(globalPrec[0] as InsightRow, { objective: objectif }) : null
  const reachGlobal = Number(global[0]?.reach ?? 0)
  const reachPrec = Number(globalPrec[0]?.reach ?? 0)

  /** `null` quand la référence est nulle : partir de 0 n'est pas une hausse
   *  infinie, c'est un démarrage. */
  const varie = (a: unknown, b: unknown): number | null => {
    const x = Number(a), y = Number(b)
    if (!Number.isFinite(x) || !Number.isFinite(y) || y === 0) return null
    return Math.round(((x - y) / y) * 1000) / 10
  }

  return NextResponse.json({
    ad: {
      id: adId,
      name: (meta as Record<string, unknown>)?.name ?? null,
      status: (meta as Record<string, unknown>)?.effective_status ?? (meta as Record<string, unknown>)?.status ?? null,
      createdTime: (meta as Record<string, unknown>)?.created_time ?? null,
    },
    periode: { since: iso(since), until: iso(until), jours },
    attribution,
    global: g && {
      ...g,
      reach: reachGlobal,
      frequency: reachGlobal > 0 ? Math.round((g.impressions / reachGlobal) * 100) / 100 : null,
    },
    variations: g && gPrec ? Object.fromEntries(
      (['spend', 'impressions', 'clicks', 'linkClicks', 'leads', 'resultValue', 'costPerResult',
        'cpl', 'cpm', 'cpc', 'ctr', 'linkCtr', 'convRate', 'hookRate', 'holdRate', 'video3s']
      ).map((k) => [k, varie((g as Record<string, unknown>)[k], (gPrec as Record<string, unknown>)[k])])
        .concat([['reach', varie(reachGlobal, reachPrec)],
                 ['frequency', varie(reachGlobal ? g.impressions / reachGlobal : 0, reachPrec ? gPrec.impressions / reachPrec : 0)]]),
    ) : {},
    quotidien: quotidien.map((r) => {
      const t = versTotaux(r, emptyTotals())
      const m = computeMetrics(t, objectif)
      return {
        date: String(r.date_start ?? ''),
        ...m,
        // Une seule journée : la portée du jour est exacte.
        frequency: t.reachSum > 0 ? Math.round((t.impressions / t.reachSum) * 100) / 100 : null,
        reach: t.reachSum,
      }
    }).sort((a, b) => a.date.localeCompare(b.date)),
    ventilations: {
      // Meta rend la plateforme et la position séparément : recollées, elles
      // donnent le placement tel qu'un media buyer le nomme.
      placement: ventiler(placement, (r) =>
        [r.publisher_platform, r.platform_position].filter(Boolean).join(' · ') || 'inconnu', objectif),
      ageGenre: ventiler(ageGenre, (r) =>
        [r.age, r.gender].filter(Boolean).join(' · ') || 'inconnu', objectif),
      age: ventiler(ageGenre, (r) => String(r.age ?? 'inconnu'), objectif),
      genre: ventiler(ageGenre, (r) => String(r.gender ?? 'inconnu'), objectif),
      appareil: ventiler(appareil, (r) => String(r.impression_device ?? 'inconnu'), objectif),
    },
  })
}
