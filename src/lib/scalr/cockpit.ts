import type { Decision } from './decision'

/**
 * Le score de santé du compte, et les signaux à traiter.
 *
 * Porté du cockpit de Scalr, avec trois écarts assumés.
 *
 * **Le score part de 100 et ne fait que descendre.** Scalr part de 76, ajoute
 * et retranche, puis borne le résultat entre 18 et 96. Un compte qu'on vient
 * d'ouvrir, dont on ne sait rien, affiche donc 76 — « globalement sain » —, et
 * un compte qui brûle son budget ne descend jamais sous 18. Ici, 100 est
 * l'absence de problème, et chaque pénalité se nomme.
 *
 * **Le score est `null` sans période de référence.** Une bonne moitié des
 * règles compare à la période précédente. Sans elle, un chiffre rassurant
 * sorti de nulle part vaut moins que pas de chiffre du tout.
 *
 * **Les seuils viennent du compte.** Scalr écrit `freq > 3` et
 * `dépense ≥ max(20, cpl)` en dur. Le CPL cible et le plafond sont saisis pour
 * chaque compte : les ignorer revient à juger un compte à 8 € de CPL cible
 * avec la règle d'un compte à 80 €.
 */

export type Totaux = {
  spend: number
  leads: number
  resultValue: number
  cpl: number | null
  costPerResult: number | null
  ctr: number | null
  linkCtr: number | null
  convRate: number | null
  cpm: number | null
  frequency: number | null
}

export type Objectifs = { targetCpl: number | null; maxCpl: number | null }

/** Une publicité, telle que le cockpit a besoin de la lire. */
export type Pub = {
  id: string
  name: string
  spend: number
  leads: number
  resultValue: number
  cpl: number | null
  costPerResult: number | null
  ctr: number | null
  frequency: number | null
  decision: Decision
}

export type Penalite = { libelle: string; points: number }

export type Sante = {
  score: number | null
  ton: string
  texte: string
  penalites: Penalite[]
}

const n = (v: number | null | undefined) => (Number.isFinite(v as number) ? (v as number) : 0)

/** Variation relative en %, `null` quand la référence manque. */
export function ecart(courant: number | null, precedent: number | null): number | null {
  const a = n(courant), b = n(precedent)
  if (!b) return null
  return ((a - b) / b) * 100
}

/**
 * Le score, avec le détail de ce qui le fait descendre.
 *
 * Exposer les pénalités plutôt que le seul nombre est le point du dispositif :
 * « 62 » ne dit pas quoi faire, « 62, dont −18 pour la part du budget qui part
 * sur des publicités sans lead » se traite.
 */
export function sante(t: Totaux, prec: Totaux | null, pubs: Pub[], objectifs: Objectifs): Sante {
  if (!prec || !prec.spend) {
    return {
      score: null,
      ton: 'Pas encore de référence',
      texte: "La période précédente est vide : les tendances — CPL, volume, clic — n'ont rien à quoi se comparer. Le score apparaîtra dès qu'une période complète précède celle-ci.",
      penalites: [],
    }
  }

  const p: Penalite[] = []
  const retire = (libelle: string, points: number) => {
    if (points > 0) p.push({ libelle, points: Math.round(points) })
  }

  // ── La fuite de budget : ce qui part sur des publicités sans lead ──
  // C'est la pénalité la plus lourde parce que c'est la seule qui se chiffre
  // directement en euros perdus.
  const gaspille = pubs.filter((x) => x.decision.kind === 'cut').reduce((s, x) => s + n(x.spend), 0)
  const partGaspillee = t.spend > 0 ? gaspille / t.spend : 0
  retire(`${Math.round(partGaspillee * 100)}% du budget sur des publicités à couper`, partGaspillee * 45)

  // ── Le CPL face à l'objectif du compte ──
  const cible = n(objectifs.targetCpl)
  const plafond = n(objectifs.maxCpl) || (cible ? cible * 2.5 : 0)
  const cpl = n(t.cpl)
  if (cible && cpl) {
    if (plafond && cpl > plafond) retire(`CPL ${cpl.toFixed(2)} € au-dessus du plafond ${plafond.toFixed(2)} €`, 22)
    else if (cpl > cible) retire(`CPL ${cpl.toFixed(2)} € au-dessus de la cible ${cible.toFixed(2)} €`, Math.min(18, ((cpl - cible) / cible) * 30))
  }

  // ── Les tendances ──
  const dCpl = ecart(t.cpl, prec.cpl)
  if (dCpl !== null && dCpl > 20) retire(`CPL en hausse de ${Math.round(dCpl)}%`, Math.min(14, dCpl / 3))

  const dLeads = ecart(t.leads || t.resultValue, prec.leads || prec.resultValue)
  if (dLeads !== null && dLeads < -15) retire(`Volume en baisse de ${Math.round(-dLeads)}%`, Math.min(12, -dLeads / 3))

  const dCtr = ecart(t.ctr, prec.ctr)
  if (dCtr !== null && dCtr < -15) retire(`CTR en baisse de ${Math.round(-dCtr)}%`, Math.min(10, -dCtr / 3))

  // ── La pression média ──
  const freq = n(t.frequency)
  if (freq > 3) retire(`Fréquence ${freq.toFixed(2)} : audience saturée`, 12)
  else if (freq > 2.5) retire(`Fréquence ${freq.toFixed(2)} : pression élevée`, 6)

  // ── La fatigue créative ──
  const fatiguees = pubs.filter((x) => x.decision.label === 'Fatigue').length
  if (fatiguees) retire(`${fatiguees} créa${fatiguees > 1 ? 's' : ''} en fatigue`, Math.min(10, fatiguees * 3))

  const total = p.reduce((s, x) => s + x.points, 0)
  const score = Math.max(0, Math.min(100, Math.round(100 - total)))

  const ton = score >= 80 ? 'Compte sain' : score >= 60 ? 'À surveiller' : 'Plan d’action requis'
  const texte = score >= 80
    ? 'Rien ne fuit. Le travail utile est de renforcer ce qui gagne et d’anticiper la fatigue créative avant qu’elle ne se voie.'
    : score >= 60
      ? 'Le compte tient, mais des signaux demandent une décision rapide pour éviter que le CPL ne dérive.'
      : 'Plusieurs signaux se cumulent. Traiter les coupes d’abord : c’est ce qui se chiffre en euros immédiatement.'

  return { score, ton, texte, penalites: p.sort((a, b) => b.points - a.points) }
}

/* ─── Signaux ───────────────────────────────────────────────────────────── */

export type Signal = {
  ton: 'bon' | 'attention' | 'mauvais' | 'info'
  tag: string
  titre: string
  texte: string
  kpis: [string, string][]
  /** Vers quelle pastille de Pilotage ce signal renvoie. */
  vers?: { niveau: string; pastille: string; libelle: string }
}

const eur = (v: number) => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const nb = (v: number) => Math.round(v).toLocaleString('fr-FR')

/** Un nom de créa entier déborde de la carte ; on garde le début, qui porte
 *  la convention de nommage. */
const court = (s: string, max = 42) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

/**
 * Les signaux, tirés des verdicts.
 *
 * Ils ne recalculent rien : `rowDecision` a déjà tranché, et refaire ici un
 * jugement parallèle — comme Scalr, qui définit ses « winners » par
 * `CPL < moyenne × 0,8` — laisserait le cockpit contredire le tableau.
 */
export function signaux(pubs: Pub[], t: Totaux, crm: {
  connecte: boolean; opportunites: number; attribuees: number; signees: number; ca: number
} | null): Signal[] {
  const s: Signal[] = []
  const parDepense = (a: Pub, b: Pub) => n(b.spend) - n(a.spend)
  const parCpl = (a: Pub, b: Pub) => (n(a.cpl) || 1e9) - (n(b.cpl) || 1e9)

  const aCouper = pubs.filter((x) => x.decision.kind === 'cut').sort(parDepense)
  const winners = pubs.filter((x) => x.decision.label === 'Winner').sort(parCpl)
  const enFatigue = pubs.filter((x) => x.decision.label === 'Fatigue').sort(parDepense)
  const aScaler = pubs.filter((x) => x.decision.label === 'Scaler').sort(parCpl)

  // L'argent qui part sans rien produire passe avant tout le reste.
  if (aCouper.length) {
    const perdu = aCouper.reduce((sum, x) => sum + n(x.spend), 0)
    s.push({
      ton: 'mauvais', tag: 'Budget',
      titre: `${aCouper.length} publicité${aCouper.length > 1 ? 's' : ''} à couper — ${eur(perdu)} engagés`,
      texte: `La plus coûteuse : ${court(aCouper[0].name)}. C'est la décision qui se chiffre le plus vite.`,
      kpis: [['Dépense', eur(perdu)], ['Part du budget', t.spend ? `${Math.round((perdu / t.spend) * 100)}%` : '—']],
      vers: { niveau: 'ad', pastille: 'cut', libelle: 'Voir à couper' },
    })
  }

  if (winners.length) {
    const w = winners[0]
    s.push({
      ton: 'bon', tag: 'Winner',
      titre: `${court(w.name)} est un winner confirmé`,
      texte: 'Volume atteint et CPL sous cible : décliner en variantes avant que la fatigue ne l’atteigne.',
      kpis: [['CPL', w.cpl ? eur(w.cpl) : '—'], ['Résultats', nb(n(w.resultValue) || n(w.leads))]],
      vers: { niveau: 'crea', pastille: 'scale', libelle: 'Voir les winners' },
    })
  }

  if (enFatigue.length) {
    const moyenne = (cle: 'ctr' | 'frequency') =>
      enFatigue.reduce((sum, x) => sum + n(x[cle]), 0) / enFatigue.length
    s.push({
      ton: 'attention', tag: 'Fatigue',
      titre: `${enFatigue.length} créa${enFatigue.length > 1 ? 's saturent' : ' sature'} son audience`,
      texte: 'Fréquence en hausse, clic en baisse. Injecter une variation avant de toucher au budget.',
      kpis: [['CTR moyen', `${moyenne('ctr').toFixed(2)}%`], ['Fréq. moyenne', moyenne('frequency').toFixed(2)]],
      vers: { niveau: 'crea', pastille: 'watch', libelle: 'Voir les créas fatiguées' },
    })
  }

  // Une créa qui performe sans budget est la seule opportunité gratuite du lot.
  const depenseMediane = pubs.length
    ? [...pubs.map((x) => n(x.spend))].sort((a, b) => a - b)[Math.floor(pubs.length / 2)]
    : 0
  const pepite = aScaler.find((x) => n(x.spend) < depenseMediane) || aScaler[0]
  if (pepite) {
    s.push({
      ton: 'info', tag: 'Opportunité',
      titre: `${court(pepite.name)} mérite plus de volume`,
      texte: 'CPL sous la moyenne avec peu de dépense : bon candidat à une hausse graduelle.',
      kpis: [['CPL', pepite.cpl ? eur(pepite.cpl) : '—'], ['Dépense', eur(n(pepite.spend))]],
      vers: { niveau: 'ad', pastille: 'scale', libelle: 'Voir à scaler' },
    })
  }

  if (crm?.connecte && crm.opportunites > 0) {
    const tauxSigne = crm.opportunites ? (crm.signees / crm.opportunites) * 100 : 0
    if (crm.signees > 0) {
      s.push({
        ton: 'bon', tag: 'Signés',
        titre: `${crm.signees} opportunité${crm.signees > 1 ? 's signées' : ' signée'} à rétro-analyser`,
        texte: 'Identifier les créas qui amènent du signé, pas seulement du lead — ce sont rarement les mêmes.',
        kpis: [['CA signé', eur(crm.ca)], ['ROAS CRM', t.spend ? `${(crm.ca / t.spend).toFixed(2)}×` : '—']],
      })
    } else {
      s.push({
        ton: 'attention', tag: 'CRM',
        titre: 'Des leads arrivent, aucun ne se signe',
        texte: 'Contrôler le délai de rappel, la promesse de la créa et la qualité du formulaire avant de monter le budget.',
        kpis: [['Opportunités', nb(crm.opportunites)], ['Taux signé', `${tauxSigne.toFixed(1)}%`]],
      })
    }
  }

  if (!s.length) {
    s.push({
      ton: 'info', tag: 'Suivi',
      titre: 'Aucun signal critique sur cette période',
      texte: 'Surveiller le CPL, la fréquence et le Link CTR avant toute hausse de budget.',
      kpis: [['CPL', t.cpl ? eur(t.cpl) : '—'], ['Fréquence', t.frequency ? t.frequency.toFixed(2) : '—']],
    })
  }

  return s.slice(0, 5)
}

/* ─── Saturation d'audience ─────────────────────────────────────────────── */

export type JourPortee = {
  date: string
  spend: number
  reach: number
  impressions: number
  cpm: number | null
}

export type Saturation = {
  /** Portée dédoublonnée de la période, telle que Meta la calcule. */
  personnesTouchees: number | null
  /** Somme des portées journalières : la même personne y compte une fois par
   *  jour où elle a été touchée. */
  expositionsCumulees: number
  fraiches: number
  partFraiche: number | null
  coutSaturation: number | null
  coutMilleFraiches: number | null
  composition: { date: string; fraiches: number; revues: number; partFraiche: number; cout: number | null }[]
}

/**
 * La pression exercée sur l'audience.
 *
 * Le proxy est celui de Scalr : sur une journée, la part d'expositions qui
 * touche quelqu'un pour la première fois vaut à peu près `1 / fréquence du
 * jour`. Ce n'est pas un décompte de personnes — Meta ne le donne pas — mais
 * une tendance, et c'est ce qu'on lit.
 *
 * **Une correction, sur un point où Scalr se contredit à l'écran.** Son bloc
 * annonce « personnes touchées » en additionnant les portées journalières :
 * quelqu'un vu dix jours de suite y compte dix fois. Sur trente jours le
 * chiffre vaut environ le double de la portée réelle, laquelle est affichée
 * quelques centimètres plus haut. Les deux sont ici distingués et nommés pour
 * ce qu'ils sont — la portée dédoublonnée d'un côté, le cumul des journées de
 * l'autre.
 */
export function saturation(jours: JourPortee[], porteeDedoublonnee: number | null): Saturation {
  const lignes = jours.map((j) => {
    const reach = n(j.reach)
    const impressions = n(j.impressions)
    const freq = reach > 0 ? Math.max(impressions / reach, 1) : 1
    const fraiches = reach > 0 ? reach / freq : 0
    return {
      date: j.date,
      fraiches,
      revues: Math.max(0, reach - fraiches),
      partFraiche: reach > 0 ? (fraiches / reach) * 100 : 0,
      // Ce que coûtent mille expositions, pondéré par le nombre de fois où la
      // même personne les reçoit.
      cout: j.cpm != null ? n(j.cpm) * freq : null,
      coutMille: fraiches > 0 ? (n(j.spend) / fraiches) * 1000 : null,
    }
  })

  const expositionsCumulees = lignes.reduce((s, x) => s + x.fraiches + x.revues, 0)
  const fraiches = lignes.reduce((s, x) => s + x.fraiches, 0)
  const moyenne = (cle: 'cout' | 'coutMille') => {
    const v = lignes.map((x) => x[cle]).filter((x): x is number => x != null && Number.isFinite(x))
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
  }

  return {
    personnesTouchees: porteeDedoublonnee,
    expositionsCumulees: Math.round(expositionsCumulees),
    fraiches: Math.round(fraiches),
    partFraiche: expositionsCumulees > 0 ? (fraiches / expositionsCumulees) * 100 : null,
    coutSaturation: moyenne('cout'),
    coutMilleFraiches: moyenne('coutMille'),
    composition: lignes.map(({ date, fraiches: f, revues, partFraiche, cout }) => ({
      date, fraiches: Math.round(f), revues: Math.round(revues),
      partFraiche: Math.round(partFraiche * 10) / 10, cout: cout != null ? Math.round(cout * 100) / 100 : null,
    })),
  }
}

/* ─── Verdicts de bloc ──────────────────────────────────────────────────── */

export type Verdict = { niveau: 'bon' | 'attention' | 'mauvais'; titre: string; texte: string; piste: string }

export function verdictSaturation(s: Saturation): Verdict {
  const part = s.partFraiche ?? 100
  const cout = s.coutSaturation ?? 0
  if (part < 35 || cout > 45) return {
    niveau: 'mauvais', titre: 'Saturation probable',
    texte: "La part d'expositions fraîches est faible ou le coût de saturation élevé : le compte recycle une audience déjà trop vue.",
    piste: 'Diversifier les angles, élargir le haut de tunnel, et vérifier que le budget ne monte pas plus vite que la portée.',
  }
  if (part < 50 || cout > 30) return {
    niveau: 'attention', titre: 'À surveiller',
    texte: "Les signaux ne sont pas critiques, mais le renouvellement d'audience mérite un suivi.",
    piste: 'Comparer les campagnes qui gardent une part fraîche élevée et répliquer leurs angles et placements.',
  }
  return {
    niveau: 'bon', titre: 'Audience encore saine',
    texte: "La part d'expositions fraîches reste correcte et le coût de saturation ne montre pas de pression forte.",
    piste: 'Continuer à alimenter le compte avec des angles distincts pour éviter que Meta recycle les mêmes profils.',
  }
}

export function verdictLeadgen(t: Totaux, dConvRate: number | null, dCpl: number | null): Verdict {
  if (dCpl !== null && dCpl > 20) return {
    niveau: 'mauvais', titre: 'CPL en dérive',
    texte: `Le coût par lead monte de ${Math.round(dCpl)}% : le volume se paie plus cher qu'avant.`,
    piste: 'Isoler les ad sets responsables avant de toucher aux budgets — une hausse générale masquerait le problème.',
  }
  if (dConvRate !== null && dConvRate > 10) return {
    niveau: 'bon', titre: 'Tendance positive',
    texte: 'Le taux de conversion progresse. Le compte peut absorber plus de budget si le CPL reste stable.',
    piste: 'Augmenter progressivement sur les campagnes qui tiennent le meilleur couple CPL et taux de signature.',
  }
  return {
    niveau: 'attention', titre: 'Leadgen stable',
    texte: 'Ni dérive ni progression nette. Le volume dépend surtout de ce qu’on injecte en créa.',
    piste: 'Chercher le gain côté taux de conversion avant le budget : c’est le levier le moins cher.',
  }
}

export function verdictMedia(dCpm: number | null, dLinkCtr: number | null): Verdict {
  if (dCpm !== null && dCpm > 20) return {
    niveau: 'mauvais', titre: 'Coûts média en hausse',
    texte: `Le CPM monte de ${Math.round(dCpm)}% : l'enchère se tend ou l'audience se resserre.`,
    piste: 'Vérifier le chevauchement des ad sets et élargir le ciblage avant d’accepter le surcoût.',
  }
  if (dLinkCtr !== null && dLinkCtr < -15) return {
    niveau: 'attention', titre: 'Clic en baisse',
    texte: `Le Link CTR recule de ${Math.round(-dLinkCtr)}% : l'accroche perd de sa force.`,
    piste: 'Rafraîchir les hooks avant que le CPM ne suive — Meta facture plus cher ce qui intéresse moins.',
  }
  return {
    niveau: 'bon', titre: 'Diffusion stable',
    texte: 'Les coûts média et l’engagement restent lisibles.',
    piste: 'Chercher les placements qui combinent bon Link CTR et coût par résultat acceptable.',
  }
}

export function verdictCreatif(hookRate: number | null, holdRate: number | null, dHook: number | null): Verdict {
  if (hookRate == null) return {
    niveau: 'attention', titre: 'Pas de signal vidéo',
    texte: 'Aucune vue vidéo sur la période : les indicateurs de rétention ne s’appliquent pas.',
    piste: 'Tester une vidéo courte pour obtenir un signal de hook, que le statique ne donne pas.',
  }
  if (hookRate < 15 || (holdRate ?? 0) < 10) return {
    niveau: 'attention', titre: 'Rétention à travailler',
    texte: 'Les premières secondes ne retiennent pas assez : le reste de la vidéo est peu vu.',
    piste: 'Retravailler les trois premières secondes — accroche visuelle, sous-titre, promesse — avant le montage.',
  }
  if (dHook !== null && dHook > 20) return {
    niveau: 'bon', titre: 'Créatif solide',
    texte: 'Hook et rétention sont bien orientés. Les meilleures variantes servent de base aux déclinaisons.',
    piste: 'Décliner le meilleur concept en statique, format court et version témoignage pour élargir la surface de test.',
  }
  return {
    niveau: 'bon', titre: 'Créatif solide',
    texte: 'Hook et rétention tiennent. Le concept fonctionne, il reste à l’exploiter.',
    piste: 'Décliner le meilleur concept plutôt que d’en chercher un nouveau : c’est le pari le plus sûr.',
  }
}
