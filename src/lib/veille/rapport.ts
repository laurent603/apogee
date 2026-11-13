/**
 * Le rapport Espion d'une marque, calculé à partir de ses pubs actives.
 * Aucun import (le coût pour mille arrive en paramètre) : vérifiable avec
 * `node scripts/veille-rapport.check.mjs`.
 */

export type PubRapport = {
  id: string
  format: string
  titre: string | null
  texte: string | null
  cta: string | null
  lienUrl: string | null
  plateformes: string[]
  debut: string | null
  reachUe: number | null
  transparence: { repartition: { pays: string; age: string; hommes: number; femmes: number; inconnu: number }[] } | null
  analyse: { angle: string; concept: string } | null
}

const JOUR = 86_400_000
type Compte = { libelle: string; n: number }

const compter = (valeurs: (string | null | undefined)[]): Compte[] => {
  const n = new Map<string, number>()
  for (const v of valeurs) if (v) n.set(v, (n.get(v) ?? 0) + 1)
  return [...n.entries()].map(([libelle, k]) => ({ libelle, n: k })).sort((a, b) => b.n - a.n)
}

export const ageEnJours = (p: PubRapport, maintenant: number) =>
  p.debut ? Math.max(0, (maintenant - Date.parse(p.debut)) / JOUR) : null

/**
 * Budget mensuel : la méthode de Créabase, relue dans leur code. Chaque pub
 * à couverture connue et âgée d'au moins 3 jours donne une dépense par jour
 * (couverture × coût pour mille ÷ âge). Classées par couverture, ces valeurs
 * dessinent une courbe qu'on prolonge jusqu'au nombre total de pubs actives ;
 * l'aire sous la courbe × 30 donne le mois. La fourchette s'élargit quand peu
 * de pubs ont une couverture connue.
 */
export function budgetMensuel(pubsParCouverture: PubRapport[], maintenant: number, eurosPourMille: number) {
  const points = pubsParCouverture
    .map((p, rang) => {
      const age = ageEnJours(p, maintenant)
      return p.reachUe && p.reachUe > 0 && age !== null && age >= 3
        ? { rang, valeur: (eurosPourMille * p.reachUe) / 1000 / age }
        : null
    })
    .filter((x): x is { rang: number; valeur: number } => x !== null)
  if (points.length < 3) return null

  const total = pubsParCouverture.length
  let aire = points[0].valeur * points[0].rang
  for (let i = 0; i < points.length - 1; i++) {
    aire += ((points[i].valeur + points[i + 1].valeur) / 2) * (points[i + 1].rang - points[i].rang)
  }
  const dernier = points[points.length - 1]
  aire += dernier.valeur * Math.max(1, total - dernier.rang)

  const mensuel = 30 * aire
  const marge = Math.min(0.55, Math.max(0.15, 0.15 + 0.4 * (1 - Math.sqrt(Math.min(1, points.length / Math.max(1, total))))))
  return { mensuel, bas: mensuel * (1 - marge), haut: mensuel * (1 + marge), echantillon: points.length, total }
}

/** Les pourcentages de réduction, remises en euros, codes et promotions. */
function offres(texte: string): string[] {
  const t = texte.toLowerCase()
  const trouvees = new Set<string>()
  for (const m of t.matchAll(/(?:-|jusqu['’]à\s*|économisez\s*(?:jusqu['’]à\s*)?)(\d{1,2})\s?%/g)) trouvees.add(`Réduction de ${m[1]} %`)
  for (const m of t.matchAll(/(\d[\d\s]{0,6})\s?€\s?(?:de\s)?(?:remise|réduction|offerts?|de prime)/g)) trouvees.add(`${m[1].replace(/\s/g, '')} € de remise`)
  if (/\bcode\s+(?:promo\s+)?[a-z0-9]{3,}/.test(t)) trouvees.add('Code promo')
  if (/\b(soldes|black friday|promo(?:tion)?s?)\b/.test(t)) trouvees.add('Promotion')
  if (/\b(livraison|installation|pose)\s+offerte\b/.test(t)) trouvees.add('Prestation offerte')
  return [...trouvees]
}

const GENERIQUES = new Set(['fr', 'en', 'products', 'product', 'produits', 'produit', 'collections', 'pages', 'page', 'shop', 'boutique', 'blog', 'p', 'c', 'lp', 'index.html', 'home', 'accueil'])

/** « Simulateur » pour placierenergie.fr/simulateur, « pro » pour pro.placierenergie.fr. */
function destination(url: string | null): { produit: string; domaine: string } | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname === 'fb.me' || u.hostname.endsWith('facebook.com')) return null
    const domaine = u.hostname.replace(/^www\./, '')
    const segment = u.pathname.split('/').filter(Boolean).find((s) => !GENERIQUES.has(s.toLowerCase()) && !/^\d+$/.test(s))
    const sous = domaine.split('.').length > 2 ? domaine.split('.')[0] : null
    const brut = segment ?? sous ?? domaine
    const propre = decodeURIComponent(brut).replace(/\.[a-z]{2,5}$/i, '').replace(/[-_]+/g, ' ')
    return { produit: propre.charAt(0).toUpperCase() + propre.slice(1), domaine }
  } catch {
    return null
  }
}

const AGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'Unknown']

// L'ordre et les noms de la Ad Library : « Facebook + Instagram + Messenger… ».
const PLATEFORMES = ['facebook', 'instagram', 'messenger', 'audience_network', 'threads', 'whatsapp']
const NOMS: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger', audience_network: 'Audience Network', threads: 'Threads', whatsapp: 'WhatsApp' }
const rangPlateforme = (p: string) => (PLATEFORMES.indexOf(p) + 1 || 99)
const combinaison = (plateformes: string[]) =>
  [...plateformes].sort((a, b) => rangPlateforme(a) - rangPlateforme(b)).map((p) => NOMS[p] ?? p).join(' + ') || null

export function rapportMarque(pubs: PubRapport[], eurosPourMille: number, maintenant = Date.now()) {
  const ages = pubs.map((p) => ageEnJours(p, maintenant)).filter((a): a is number => a !== null).sort((a, b) => a - b)
  const parCouverture = [...pubs].sort((a, b) => (b.reachUe ?? -1) - (a.reachUe ?? -1))
  const debuts = pubs.map((p) => p.debut).filter((d): d is string => !!d).sort()

  // Messages : même titre et même début de texte = même message décliné.
  const cle = (p: PubRapport) => `${p.titre ?? ''}|${(p.texte ?? '').slice(0, 120)}`.toLowerCase()
  const messages = new Map<string, PubRapport[]>()
  for (const p of pubs) if (p.titre || p.texte) messages.set(cle(p), [...(messages.get(cle(p)) ?? []), p])

  const repartition = pubs.flatMap((p) => p.transparence?.repartition ?? [])
  const somme = (f: (l: (typeof repartition)[number]) => number) => repartition.reduce((s, l) => s + f(l), 0)
  const touches = somme((l) => l.hommes + l.femmes + l.inconnu)
  const dest = pubs.map((p) => destination(p.lienUrl))

  return {
    total: pubs.length,
    periode: debuts.length ? { de: debuts[0], a: debuts[debuts.length - 1] } : null,
    depuisPlusDe30j: pubs.length ? ages.filter((a) => a > 30).length / pubs.length : 0,
    lanceesCes30j: ages.filter((a) => a <= 30).length,
    budget: budgetMensuel(parCouverture, maintenant, eurosPourMille),
    avecCouverture: pubs.filter((p) => p.reachUe !== null).length,

    plusDiffusees: parCouverture.filter((p) => p.reachUe).slice(0, 6),
    plusLongues: [...pubs].filter((p) => p.debut).sort((a, b) => Date.parse(a.debut!) - Date.parse(b.debut!)).slice(0, 6),

    parMois: compter(pubs.map((p) => p.debut?.slice(0, 7))).sort((a, b) => a.libelle.localeCompare(b.libelle)),
    anciennete: {
      tranches: [
        { libelle: 'Moins de 7 j', n: ages.filter((a) => a < 7).length },
        { libelle: '7 à 30 j', n: ages.filter((a) => a >= 7 && a <= 30).length },
        { libelle: '31 à 90 j', n: ages.filter((a) => a > 30 && a <= 90).length },
        { libelle: 'Plus de 90 j', n: ages.filter((a) => a > 90).length },
      ],
      mediane: ages.length ? Math.round(ages[Math.floor((ages.length - 1) / 2)]) : null,
    },
    formats: compter(pubs.map((p) => p.format)),
    boutons: compter(pubs.map((p) => p.cta)),
    plateformes: compter(pubs.map((p) => combinaison(p.plateformes))),

    offres: {
      part: pubs.length ? pubs.filter((p) => offres(`${p.titre ?? ''} ${p.texte ?? ''}`).length).length / pubs.length : 0,
      liste: compter(pubs.flatMap((p) => offres(`${p.titre ?? ''} ${p.texte ?? ''}`))),
    },
    messages: [...messages.values()].sort((a, b) => b.length - a.length).slice(0, 4).map((groupe) => ({ n: groupe.length, pub: groupe[0] })),
    produits: compter(dest.map((d) => d?.produit)),
    domaines: compter(dest.map((d) => d?.domaine)),

    audience: touches
      ? {
          sexe: [
            { libelle: 'Hommes', n: somme((l) => l.hommes) },
            { libelle: 'Femmes', n: somme((l) => l.femmes) },
            { libelle: 'Non déterminé', n: somme((l) => l.inconnu) },
          ],
          ages: AGES.map((age) => ({ libelle: age, n: somme((l) => (l.age === age ? l.hommes + l.femmes + l.inconnu : 0)) })).filter((a) => a.n > 0),
          pays: compter(repartition.map((l) => l.pays)).map((c) => ({
            libelle: c.libelle,
            n: somme((l) => (l.pays === c.libelle ? l.hommes + l.femmes + l.inconnu : 0)),
          })).sort((a, b) => b.n - a.n),
          total: touches,
        }
      : null,

    angles: compter(pubs.map((p) => p.analyse?.angle)),
    concepts: compter(pubs.map((p) => p.analyse?.concept)),
    decortiquees: pubs.filter((p) => p.analyse).length,
  }
}

export type Rapport = ReturnType<typeof rapportMarque>

// ─── Comparaison de marques ───────────────────────────────────────────────

export type LigneComparaison = {
  nom: string
  pubsActives: number
  budgetMensuel: number | null
  lancees30j: number
  installees: number // % des pubs actives diffusées depuis plus de 30 jours
  video: number // % de vidéos
  offre: number // % de pubs avec une offre
  feminin: number | null // % de femmes dans la couverture UE
  derniereVue: string | null
}

const pct = (x: number) => Math.round(100 * x)

/** Les chiffres d'une marque pour la comparaison, tirés de son rapport. */
export function ligneComparaison(nom: string, r: Rapport, derniereVue: string | null): LigneComparaison {
  const femmes = r.audience?.sexe.find((s) => s.libelle === 'Femmes')?.n
  return {
    nom,
    pubsActives: r.total,
    budgetMensuel: r.budget?.mensuel ?? null,
    lancees30j: r.lanceesCes30j,
    installees: pct(r.depuisPlusDe30j),
    video: r.total ? pct((r.formats.find((f) => f.libelle === 'VIDEO')?.n ?? 0) / r.total) : 0,
    offre: pct(r.offres.part),
    feminin: r.audience && femmes !== undefined ? pct(femmes / r.audience.total) : null,
    derniereVue,
  }
}

const euros = (v: number) => {
  const a = Number(v.toPrecision(2))
  return a >= 1000 ? `${(a / 1000).toLocaleString('fr-FR', { maximumFractionDigits: a < 10_000 ? 1 : 0 })} K €` : `${a.toLocaleString('fr-FR')} €`
}

/**
 * Les phrases qui résument la comparaison, sur les seuils de Créabase : on
 * ne signale un écart que s'il est net.
 */
export function constatsComparaison(lignes: LigneComparaison[]): string[] {
  const tri = (f: (l: LigneComparaison) => number | null) =>
    lignes.map((l) => ({ l, v: f(l) })).filter((x): x is { l: LigneComparaison; v: number } => typeof x.v === 'number').sort((a, b) => b.v - a.v)
  const phrases: string[] = []

  const parc = tri((l) => l.pubsActives)
  if (parc.length >= 2 && parc[0].v > 0) {
    const dernier = parc[parc.length - 1]
    const rapport = dernier.v > 0 ? parc[0].v / dernier.v : null
    phrases.push(rapport && rapport >= 1.5
      ? `${parc[0].l.nom} a le plus gros parc actif : ${parc[0].v} pubs, ${rapport >= 10 ? Math.round(rapport) : rapport.toFixed(1).replace('.', ',')} fois plus que ${dernier.l.nom}.`
      : `${parc[0].l.nom} a le plus gros parc actif (${parc[0].v} pubs), mais les volumes restent proches.`)
  }
  const budget = tri((l) => l.budgetMensuel)
  if (budget.length >= 2) phrases.push(`${budget[0].l.nom} investit le plus : environ ${euros(budget[0].v)} par mois, contre ${euros(budget[1].v)} pour ${budget[1].l.nom}.`)
  const tests = tri((l) => l.lancees30j)
  if (tests.length >= 2 && tests[0].v >= 3 && tests[0].v >= 1.5 * tests[1].v) {
    phrases.push(`${tests[0].l.nom} teste le plus : ${tests[0].v} créas lancées sur 30 jours, contre ${tests[1].v} pour ${tests[1].l.nom}.`)
  }
  const installees = tri((l) => l.installees)
  if (installees.length >= 2 && installees[0].v - installees[installees.length - 1].v >= 15) {
    const d = installees[installees.length - 1]
    phrases.push(`${installees[0].l.nom} laisse tourner ses pubs : ${installees[0].v} % ont plus de 30 jours, contre ${d.v} % chez ${d.l.nom}, qui renouvelle davantage.`)
  }
  const video = tri((l) => l.video)
  if (video.length >= 2 && video[0].v - video[video.length - 1].v >= 30) {
    const d = video[video.length - 1]
    phrases.push(`${video[0].l.nom} mise sur la vidéo (${video[0].v} % de ses pubs), ${d.l.nom} beaucoup moins (${d.v} %).`)
  }
  const offre = tri((l) => l.offre)
  if (offre.length >= 2 && offre[0].v >= 20 && offre[0].v - offre[offre.length - 1].v >= 20) {
    const d = offre[offre.length - 1]
    phrases.push(`${offre[0].l.nom} pousse des offres dans ${offre[0].v} % de ses pubs, contre ${d.v} % pour ${d.l.nom}.`)
  }
  return phrases
}

const jourIso = (n: number) => new Date(n * JOUR).toISOString().slice(0, 10)

/**
 * Courbes estimées sur `jours` jours, à partir des seules données en base :
 * chaque pub à couverture connue est supposée dépenser au même rythme de son
 * lancement à son arrêt (ou à aujourd'hui) ; « actives » compte les pubs
 * connues qui tournaient ce jour-là.
 */
export function courbesEstimees(
  pubs: { debut: string | null; fin?: string | null; active?: boolean; reachUe: number | null }[],
  eurosPourMille: number,
  maintenant = Date.now(),
  jours = 90,
) {
  const aujourdhui = Math.floor(maintenant / JOUR)
  const premier = aujourdhui - jours + 1
  const serie = Array.from({ length: jours }, (_, i) => ({ jour: jourIso(premier + i), depense: 0, actives: 0 }))
  for (const p of pubs) {
    if (!p.debut) continue
    const debut = Math.floor(Date.parse(p.debut) / JOUR)
    const fin = p.active === false && p.fin ? Math.floor(Date.parse(p.fin) / JOUR) : aujourdhui
    if (fin < debut) continue
    const parJour = p.reachUe ? (eurosPourMille * p.reachUe) / 1000 / (fin - debut + 1) : 0
    for (let j = Math.max(debut, premier); j <= Math.min(fin, aujourdhui); j++) {
      serie[j - premier].actives++
      serie[j - premier].depense += parJour
    }
  }
  return serie
}

/**
 * Courbes relevées : la couverture de chaque pub notée chaque matin. L'écart
 * entre deux relevés (réparti sur les jours qui les séparent) donne les
 * personnes touchées et la dépense de chaque jour ; « accélèrent » classe les
 * pubs par personnes touchées par jour sur leurs 7 derniers jours relevés.
 */
export function courbesRelevees(mesures: { pubId: string; jour: string; reachUe: number }[], eurosPourMille: number) {
  const parPub = new Map<string, { jour: number; reachUe: number }[]>()
  for (const m of mesures) {
    const l = parPub.get(m.pubId) ?? []
    l.push({ jour: Math.floor(Date.parse(m.jour) / JOUR), reachUe: m.reachUe })
    parPub.set(m.pubId, l)
  }
  const personnes = new Map<number, number>()
  const accelerent: { pubId: string; parJour: number }[] = []
  for (const [pubId, l] of parPub) {
    l.sort((a, b) => a.jour - b.jour)
    for (let i = 1; i < l.length; i++) {
      const ecart = l[i].jour - l[i - 1].jour
      const gain = Math.max(0, l[i].reachUe - l[i - 1].reachUe) / ecart
      for (let j = l[i - 1].jour + 1; j <= l[i].jour; j++) personnes.set(j, (personnes.get(j) ?? 0) + gain)
    }
    const dernier = l[l.length - 1]
    const depart = l.find((x) => x.jour >= dernier.jour - 7) ?? l[0]
    if (dernier.jour > depart.jour) accelerent.push({ pubId, parJour: Math.max(0, dernier.reachUe - depart.reachUe) / (dernier.jour - depart.jour) })
  }
  const jours = [...personnes.keys()].sort((a, b) => a - b)
  return {
    releves: new Set(mesures.map((m) => m.jour)).size,
    jours: jours.map((j) => ({ jour: jourIso(j), personnes: personnes.get(j)!, depense: (eurosPourMille * personnes.get(j)!) / 1000 })),
    accelerent: accelerent.filter((a) => a.parJour > 0).sort((a, b) => b.parJour - a.parJour).slice(0, 6),
  }
}
