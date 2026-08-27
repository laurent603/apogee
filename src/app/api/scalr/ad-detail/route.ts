import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { formatInsightRow, INSIGHT_FIELDS, withAttribution, type InsightRow, type Attribution } from '@/lib/scalr/insights'

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

/**
 * Regroupe une ventilation par libellé et somme les valeurs brutes.
 *
 * Le regroupement est indispensable : Meta rend « 25-34 · homme » et
 * « 25-34 · femme » sur deux lignes, et une ventilation par âge seul doit les
 * additionner plutôt que produire deux entrées du même nom.
 *
 * Les ratios se recalculent depuis les sommes, jamais en moyennant ceux des
 * lignes — un CTR de tranche n'est pas la moyenne des CTR de ses sous-lignes.
 */
function ventiler(
  rows: Record<string, unknown>[],
  libelle: (r: Record<string, unknown>) => string,
) {
  const acc = new Map<string, { spend: number; impressions: number; reach: number; clicks: number; leads: number; resultValue: number }>()

  for (const r of rows) {
    const m = formatInsightRow(r as InsightRow, {})
    const cle = libelle(r)
    const a = acc.get(cle) ?? { spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, resultValue: 0 }
    a.spend += m.spend
    a.impressions += m.impressions
    a.reach += Number(r.reach ?? 0)
    a.clicks += m.clicks
    a.leads += m.leads
    a.resultValue += m.resultValue
    acc.set(cle, a)
  }

  return [...acc.entries()]
    .map(([cle, a]) => ({
      cle,
      spend: Math.round(a.spend * 100) / 100,
      impressions: a.impressions,
      // Somme des portées d'un découpage : elle recompte les personnes vues
      // dans plusieurs segments, donc c'est une borne haute, pas une portée.
      reachSum: a.reach,
      clicks: a.clicks,
      leads: a.leads,
      resultValue: a.resultValue,
      costPerResult: a.resultValue > 0 ? Math.round((a.spend / a.resultValue) * 100) / 100 : null,
      ctr: a.impressions > 0 ? Math.round((a.clicks / a.impressions) * 10000) / 100 : null,
    }))
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

  const commun = withAttribution({ time_range }, attribution)

  const [meta, global, quotidien, placement, ageGenre, appareil] = await Promise.all([
    fetch(`${API}/${VERSION}/${adId}?` + new URLSearchParams({
      fields: 'id,name,status,effective_status,created_time,adset_id,campaign_id,creative{id,name}',
      access_token: token,
    }).toString()).then((r) => r.json()).catch(() => ({})),
    insights(adId, token, commun),
    insights(adId, token, { ...commun, time_increment: '1' }),
    insights(adId, token, { ...commun, breakdowns: 'publisher_platform,platform_position' }),
    insights(adId, token, { ...commun, breakdowns: 'age,gender' }),
    insights(adId, token, { ...commun, breakdowns: 'impression_device' }),
  ])

  const objectif = String((meta as Record<string, unknown>)?.objective || '')
  const g = global[0] ? formatInsightRow(global[0] as InsightRow, { objective: objectif }) : null

  return NextResponse.json({
    ad: {
      id: adId,
      name: (meta as Record<string, unknown>)?.name ?? null,
      status: (meta as Record<string, unknown>)?.effective_status ?? (meta as Record<string, unknown>)?.status ?? null,
      createdTime: (meta as Record<string, unknown>)?.created_time ?? null,
    },
    periode: { since: iso(since), until: iso(until), jours },
    attribution,
    global: g,
    quotidien: quotidien.map((r) => {
      const m = formatInsightRow(r as InsightRow, { objective: objectif })
      return {
        date: String(r.date_start ?? ''),
        spend: m.spend, impressions: m.impressions, clicks: m.clicks,
        resultValue: m.resultValue, costPerResult: m.costPerResult, ctr: m.ctr,
      }
    }).sort((a, b) => a.date.localeCompare(b.date)),
    ventilations: {
      // Meta rend la plateforme et la position séparément : recollées, elles
      // donnent le placement tel qu'un media buyer le nomme.
      placement: ventiler(placement, (r) =>
        [r.publisher_platform, r.platform_position].filter(Boolean).join(' · ') || 'inconnu'),
      ageGenre: ventiler(ageGenre, (r) =>
        [r.age, r.gender].filter(Boolean).join(' · ') || 'inconnu'),
      age: ventiler(ageGenre, (r) => String(r.age ?? 'inconnu')),
      appareil: ventiler(appareil, (r) => String(r.impression_device ?? 'inconnu')),
    },
  })
}
