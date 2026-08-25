/**
 * GoHighLevel pipeline data, joined to Meta ads.
 *
 * Meta stops at the lead. GoHighLevel knows what became of it, and its
 * opportunities carry `utmAdId` — the Meta ad id — so a creative can be judged
 * on the value of what it brings in rather than only on lead cost. Verified on
 * a live account: 600/600 opportunities attributed.
 */

const BASE = 'https://services.leadconnectorhq.com'
const VERSION = '2021-07-28'
const MAX_PAGES = 20

export type AdStat = {
  adName: string
  opportunities: number
  won: number
  lost: number
  open: number
  wonValue: number
  pipelineValue: number
  valueFilled: number
}

export type GhlSummary = {
  adStats: Record<string, AdStat>
  totalOpps: number
  attributed: number
  wonCount: number
  wonValue: number
  valueFilled: number
}

type Attribution = {
  utmAdId?: string
  utmContent?: string
  utmCampaignId?: string
  isFirst?: boolean
  isLast?: boolean
}

type Opportunity = {
  status?: string
  monetaryValue?: number | string
  attributions?: Attribution[]
}

async function call(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Version: VERSION, Accept: 'application/json' },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`GoHighLevel ${res.status} — ${text.slice(0, 220)}`)
  return JSON.parse(text)
}

/** Confirms the token reaches the sub-account, and returns its name. */
export async function checkGhlAccess(token: string, locationId: string): Promise<string> {
  const loc = await call(`/locations/${locationId}`, token)
  return loc?.location?.name || loc?.name || locationId
}

async function fetchOpportunities(token: string, locationId: string): Promise<Opportunity[]> {
  const all: Opportunity[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await call(`/opportunities/search?location_id=${locationId}&limit=100&page=${page}`, token)
    const batch = (r.opportunities || []) as Opportunity[]
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all
}

/** Last touch decides which creative gets credit, first touch as a fallback. */
function creditedAd(o: Opportunity): Attribution | null {
  const list = o.attributions || []
  return list.find(a => a.isLast && a.utmAdId) || list.find(a => a.utmAdId) || null
}

export function aggregateByAd(opps: Opportunity[]): GhlSummary {
  const adStats: Record<string, AdStat> = {}
  let attributed = 0, wonCount = 0, wonValue = 0, valueFilled = 0

  for (const o of opps) {
    const value = Number(o.monetaryValue) || 0
    const hasValue = value > 0
    if (hasValue) valueFilled++
    if (o.status === 'won') { wonCount++; wonValue += value }

    const attr = creditedAd(o)
    if (!attr?.utmAdId) continue
    attributed++

    const s = adStats[attr.utmAdId] ??= {
      adName: attr.utmContent || attr.utmAdId,
      opportunities: 0, won: 0, lost: 0, open: 0,
      wonValue: 0, pipelineValue: 0, valueFilled: 0,
    }
    s.opportunities++
    if (hasValue) { s.valueFilled++; s.pipelineValue += value }
    if (o.status === 'won') { s.won++; s.wonValue += value }
    else if (o.status === 'lost' || o.status === 'abandoned') s.lost++
    else s.open++
  }

  return { adStats, totalOpps: opps.length, attributed, wonCount, wonValue, valueFilled }
}

export async function syncGhl(token: string, locationId: string): Promise<GhlSummary> {
  return aggregateByAd(await fetchOpportunities(token, locationId))
}

/**
 * Renders the pipeline picture for a prompt.
 *
 * Won-deal counts are small on most accounts, so the sample size travels with
 * the figure — a ranking built on two closed deals is not a verdict.
 */
export function renderGhlForPrompt(json: string | null | undefined, summary: {
  totalOpps: number; attributed: number; wonCount: number; wonValue: number; valueFilled: number
}): string | null {
  if (!json) return null
  let adStats: Record<string, AdStat>
  try { adStats = JSON.parse(json) } catch { return null }
  const rows = Object.entries(adStats)
  if (!rows.length) return null

  // Average value per opportunity is not shown: accounts set monetaryValue to a
  // standard estimate at creation, so it is near-identical across creatives and
  // reads as meaningful when it is not. Win rate is what actually discriminates.
  const lines = rows
    .sort((a, b) => b[1].wonValue - a[1].wonValue || b[1].opportunities - a[1].opportunities)
    .slice(0, 25)
    .map(([adId, s]) => {
      const closed = s.won + s.lost
      const winRate = closed ? `${(s.won / closed * 100).toFixed(1)} %` : '—'
      // A win rate over a handful of closed deals swings wildly; the account
      // total says nothing about the confidence of any single row
      const confidence = closed === 0 ? 'aucune affaire close'
        : closed < 30 ? `⚠ ${closed} closes — très incertain`
        : closed < 80 ? `${closed} closes — indicatif`
        : `${closed} closes — solide`
      return `| ${s.adName} | ${adId} | ${s.opportunities} | ${s.won} | ${s.lost} | ${winRate} | ${Math.round(s.wonValue)} € | ${confidence} |`
    })

  // Deliberately not "the account total looks healthy": a comfortable total
  // hides that each row may rest on a handful of closed deals
  const reliability = `${summary.wonCount} affaires gagnées sur l'ensemble du compte — mais ce total ne dit rien de la fiabilité d'une ligne prise isolément. La colonne « Fiabilité » qualifie chaque créa séparément.

Règle à respecter : un taux de gain calculé sur moins de 30 affaires closes ne permet pas de départager deux créas. Sur 7 gagnées et 43 perdues, le taux réel peut aller du simple au quadruple. Quand tu recommandes une créa sur son taux de gain, dis explicitement sur combien d'affaires closes il repose, et présente-la comme une piste à tester plutôt que comme la meilleure du compte.`

  const completeness = summary.totalOpps
    ? `${summary.attributed}/${summary.totalOpps} opportunités rattachées à une publicité, ${summary.valueFilled}/${summary.totalOpps} avec un montant renseigné.`
    : ''

  return `## Pipeline commercial (GoHighLevel)

Ce que deviennent les prospects après Meta. Une créa peut produire beaucoup de prospects bon marché
et peu d'affaires : juge la valeur, pas seulement le coût par prospect.

${completeness}
${reliability}

| Créa | ID pub Meta | Opportunités | Gagnées | Perdues | Taux de gain | CA signé | Fiabilité |
|---|---|---|---|---|---|---|---|
${lines.join('\n')}

Le taux de gain rapporte les affaires gagnées aux affaires closes (gagnées + perdues) : les
opportunités encore ouvertes en sont exclues, elles ne sont pas encore un échec.

Une créa peut dominer en volume d'opportunités et rester médiocre en taux de gain — c'est ce
croisement qui décide où placer le budget, pas le coût par prospect seul. Rattache ces lignes aux
publicités Meta par l'ID. Une créa absente du tableau n'a produit aucune opportunité attribuée :
dis-le plutôt que de supposer qu'elle n'en a pas généré.

N'utilise pas le montant d'une opportunité ouverte comme un revenu : seules les affaires gagnées
comptent dans le CA.`
}
