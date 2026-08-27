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
  /** Kept apart from `lost`: an abandoned deal is often a duplicate or a
   *  disqualified contact, not a sale that was competed for and missed. */
  abandoned?: number
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
  [autre: string]: unknown
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
      opportunities: 0, won: 0, lost: 0, abandoned: 0, open: 0,
      wonValue: 0, pipelineValue: 0, valueFilled: 0,
    }
    s.opportunities++
    if (hasValue) { s.valueFilled++; s.pipelineValue += value }
    if (o.status === 'won') { s.won++; s.wonValue += value }
    else if (o.status === 'lost') s.lost++
    else if (o.status === 'abandoned') s.abandoned = (s.abandoned || 0) + 1
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
export function renderGhlForPrompt(
  json: string | null | undefined,
  summary: { totalOpps: number; attributed: number; wonCount: number; wonValue: number; valueFilled: number },
  /** Lifetime spend per ad — the only denominator that matches all-time deals. */
  lifetime?: Record<string, { adName: string; spend: number; leads: number }>,
): string | null {
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
      // Abandoned deals are excluded from the denominator: they are duplicates
      // and disqualified contacts, not sales that were competed for and missed
      const decided = s.won + s.lost
      const winRate = decided ? `${(s.won / decided * 100).toFixed(1)} %` : '—'
      const confidence = decided === 0 ? 'aucune affaire tranchée'
        : decided < 30 ? `⚠ ${decided} affaires tranchées — très incertain`
        : decided < 80 ? `${decided} affaires tranchées — indicatif`
        : `${decided} affaires tranchées — solide`
      const lt = lifetime?.[adId]
      const spendCol = lt ? `${Math.round(lt.spend)} €` : '—'
      const costPerSale = lt && s.won > 0 ? `${Math.round(lt.spend / s.won)} €` : '—'
      const ab = s.abandoned ?? 0
      return `| ${s.adName} | ${adId} | ${spendCol} | ${s.opportunities} | ${s.won} | ${s.lost} | ${ab} | ${s.open} | ${winRate} | ${Math.round(s.wonValue)} € | ${costPerSale} | ${confidence} |`
    })

  // Deliberately not "the account total looks healthy": a comfortable total
  // hides that each row may rest on a handful of closed deals
  const reliability = `${summary.wonCount} affaires gagnées sur l'ensemble du compte — mais ce total ne dit rien de la fiabilité d'une ligne prise isolément. La colonne « Fiabilité » qualifie chaque créa séparément.

Règle à respecter : un taux de gain calculé sur moins de 30 affaires closes ne permet pas de départager deux créas. Sur 7 gagnées et 43 perdues, le taux réel peut aller du simple au quadruple. Quand tu recommandes une créa sur son taux de gain, dis explicitement sur combien d'affaires closes il repose, et présente-la comme une piste à tester plutôt que comme la meilleure du compte.`

  const attributedWon = rows.reduce((n, [, s]) => n + s.won, 0)
  const orphanWon = summary.wonCount - attributedWon
  const completeness = summary.totalOpps
    ? `${summary.attributed}/${summary.totalOpps} opportunités rattachées à une publicité, ${summary.valueFilled}/${summary.totalOpps} avec un montant renseigné.

**${summary.wonCount} affaires gagnées au total sur le compte, dont ${attributedWon} rattachées à une publicité.**${orphanWon > 0 ? ` Les ${orphanWon} autres n'ont aucune attribution et n'apparaissent dans aucune ligne du tableau : la somme de la colonne « Gagnées » est donc inférieure au total du compte, ce n'est pas une incohérence. Mentionne-le si tu additionnes cette colonne.` : ''}`
    : ''

  return `## Pipeline commercial (GoHighLevel)

Ce que deviennent les prospects après Meta. Une créa peut produire beaucoup de prospects bon marché
et peu d'affaires : juge la valeur, pas seulement le coût par prospect.

${completeness}
${reliability}

| Créa | ID pub Meta | Dépense totale | Opportunités | Gagnées | Perdues | Abandonnées | Ouvertes | Taux de gain | CA signé | Coût/vente | Fiabilité |
|---|---|---|---|---|---|---|---|---|---|---|---|
${lines.join('\n')}

### Lecture des colonnes
Chaque ligne se décompose en **Gagnées + Perdues + Abandonnées + Ouvertes = Opportunités**.

- **Taux de gain** = Gagnées ÷ (Gagnées + Perdues). Les *abandonnées* en sont exclues — ce sont
  des doublons ou des contacts disqualifiés, pas des ventes disputées et manquées. Les *ouvertes*
  aussi : elles ne sont pas encore un échec.
- **Fiabilité** compte les affaires **tranchées** (gagnées + perdues), pas les ventes. Une créa à
  « 462 affaires tranchées » n'a pas fait 462 ventes : elle en a fait 19 sur 462 dossiers conclus.
  Ne présente jamais ce nombre comme un volume de ventes.

Une créa peut dominer en volume d'opportunités et rester médiocre en taux de gain — c'est ce
croisement qui décide où placer le budget, pas le coût par prospect seul. Rattache ces lignes aux
publicités Meta par l'ID. Une créa absente du tableau n'a produit aucune opportunité attribuée :
dis-le plutôt que de supposer qu'elle n'en a pas généré.

N'utilise pas le montant d'une opportunité ouverte comme un revenu : seules les affaires gagnées
comptent dans le CA.

### Coût/vente — le critère qui tranche
Quand cette colonne est renseignée, **c'est elle qui décide** d'un arbitrage budgétaire, pas le
taux de gain ni le coût par prospect. Fais-la figurer dans ton tableau et classe tes
recommandations dessus.

Le taux de gain mesure la qualité des prospects, jamais ce qu'ils coûtent à obtenir : une créa peut
transformer deux fois mieux et rester le pire investissement si ses prospects coûtent trois fois
plus cher. Ne recommande jamais de pousser une créa sur son seul taux de gain sans vérifier son
coût/vente, ni de réduire une créa dont le coût/vente est parmi les meilleurs.

Si les deux se contredisent, dis-le explicitement et tranche sur le coût/vente.

### Périodes — règle impérative
Ce tableau couvre **toute la vie de chaque publicité**. Les chiffres Meta présentés plus haut
(dépense, CPL, impressions) ne couvrent que la **période d'analyse**.

Ne divise jamais une dépense de la période d'analyse par un nombre d'affaires de ce tableau : le
résultat serait faux d'un ordre de grandeur. La colonne « Dépense totale » est la seule compatible
avec ces affaires, et « Coût/vente » en découle déjà. Si elle affiche « — », la dépense totale n'a
pas pu être récupérée : dis-le au lieu de reconstituer le ratio autrement.`
}

/* ─── Le tunnel, jour par jour ──────────────────────────────────────────── */

/**
 * Le parcours d'un prospect après le clic : lead, rendez-vous, devis, signature.
 *
 * Meta s'arrête au formulaire. La suite ne vit que dans le CRM, et GoHighLevel
 * ne l'expose pas comme un état : chaque étape est une **étiquette posée sur le
 * contact**, dont le libellé change d'un client à l'autre — « rdv booké » ici,
 * « RDV pris » ailleurs. Ce sont donc les étiquettes du compte qui décident, et
 * une étiquette non renseignée laisse son compteur à zéro plutôt que d'inventer
 * une correspondance.
 *
 * Le résultat est stocké par journée, pas en total. Le cockpit doit pouvoir
 * lire sept, trente ou quatre-vingt-dix jours et comparer à la période
 * précédente ; des compteurs figés ne vaudraient que pour la fenêtre de la
 * dernière synchronisation.
 */

export type TagsTunnel = {
  lead: string | null
  rdv: string | null
  devis: string | null
  signe: string | null
}

export type JourCrm = { date: string; leads: number; rdv: number; devis: number; signes: number; ca: number }

type Contact = { id?: string; dateAdded?: string; createdAt?: string; tags?: unknown }

/** Le jour d'une date ISO, ou `null` si elle est absente ou illisible. */
function jour(v: unknown): string | null {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** Comparaison indulgente : GHL rend les étiquettes telles qu'elles ont été
 *  saisies, à la casse et aux espaces près. */
const normalise = (s: unknown) => String(s ?? '').trim().toLowerCase()

function porte(contact: Contact, etiquette: string | null): boolean {
  if (!etiquette) return false
  const cible = normalise(etiquette)
  if (!cible) return false
  const tags = Array.isArray(contact.tags) ? contact.tags : []
  return tags.some((t) => normalise(t) === cible)
}

async function fetchContacts(token: string, locationId: string): Promise<Contact[]> {
  const tous: Contact[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await call(`/contacts/?locationId=${locationId}&limit=100&page=${page}`, token)
    const lot = (r.contacts || r.data || []) as Contact[]
    tous.push(...lot)
    if (lot.length < 100) break
  }
  return tous
}

/**
 * Le jour où une opportunité a été gagnée.
 *
 * GHL n'a pas de champ unique pour ça selon la façon dont le compte est
 * configuré : on prend le premier disponible, du plus précis au plus vague.
 * Sans aucun, la vente ne serait rattachée à aucune journée et disparaîtrait
 * du tunnel — la date de création sert alors de dernier recours.
 */
const CLES_SIGNATURE = ['wonDate', 'dateWon', 'closedAt', 'dateClosed', 'lastStatusChangeAt', 'updatedAt', 'dateAdded', 'createdAt']

function jourSignature(o: Record<string, unknown>): string | null {
  for (const cle of CLES_SIGNATURE) {
    const j = jour(o[cle])
    if (j) return j
  }
  return null
}

/** Agrège contacts et opportunités en une ligne par journée. */
export async function syncGhlTunnel(token: string, locationId: string, tags: TagsTunnel): Promise<JourCrm[]> {
  const [contacts, opps] = await Promise.all([
    fetchContacts(token, locationId),
    fetchOpportunities(token, locationId),
  ])

  const parJour = new Map<string, JourCrm>()
  const ligne = (d: string) => {
    const existante = parJour.get(d)
    if (existante) return existante
    const neuve: JourCrm = { date: d, leads: 0, rdv: 0, devis: 0, signes: 0, ca: 0 }
    parJour.set(d, neuve)
    return neuve
  }

  for (const c of contacts) {
    const d = jour(c.dateAdded) || jour(c.createdAt)
    if (!d) continue
    const l = ligne(d)
    if (porte(c, tags.lead)) l.leads++
    if (porte(c, tags.rdv)) l.rdv++
    if (porte(c, tags.devis)) l.devis++
    // La signature se compte sur l'opportunité gagnée, qui porte le montant.
    // L'étiquette ne sert que de repli quand aucune opportunité ne l'est.
  }

  let signeesParOpportunite = 0
  for (const o of opps as unknown as Record<string, unknown>[]) {
    if (String(o.status ?? '').toLowerCase() !== 'won') continue
    const d = jourSignature(o)
    if (!d) continue
    const l = ligne(d)
    l.signes++
    l.ca += Number(o.monetaryValue) || 0
    signeesParOpportunite++
  }

  // Repli : certains comptes ne passent pas par le pipeline et marquent la
  // signature au contact. Sans ce filet, le tunnel s'arrêterait au devis.
  if (!signeesParOpportunite && tags.signe) {
    for (const c of contacts) {
      const d = jour(c.dateAdded) || jour(c.createdAt)
      if (d && porte(c, tags.signe)) ligne(d).signes++
    }
  }

  return [...parJour.values()].sort((a, b) => a.date.localeCompare(b.date))
}
