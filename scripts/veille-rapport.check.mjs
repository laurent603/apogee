// Vérifie les calculs du rapport Espion.
// node scripts/veille-rapport.check.mjs
import assert from 'node:assert/strict'
import { budgetMensuel, courbesEstimees, courbesRelevees, rapportMarque } from '../src/lib/veille/rapport.ts'

const MAINTENANT = Date.parse('2026-11-12T12:00:00Z')
const jours = (n) => new Date(MAINTENANT - n * 86_400_000).toISOString()
const pub = (o) => ({ id: Math.random().toString(36), format: 'IMAGE', titre: null, texte: null, cta: null, lienUrl: null, plateformes: [], debut: null, reachUe: null, transparence: null, analyse: null, ...o })

// Budget : trois pubs identiques (10 000 personnes en 10 jours, soit 9,10 € par jour)
// sur cinq pubs actives → la courbe plate couvre les cinq rangs : 5 × 9,10 × 30.
const plates = [0, 1, 2].map(() => pub({ reachUe: 10_000, debut: jours(10) }))
const b = budgetMensuel([...plates, pub({}), pub({})], MAINTENANT, 9.1)
assert.ok(Math.abs(b.mensuel - 5 * 9.1 * 30) < 1e-6, `mensuel ${b.mensuel}`)
assert.equal(b.echantillon, 3)
assert.ok(b.bas < b.mensuel && b.haut > b.mensuel)
// Moins de trois pubs exploitables (ou trop récentes) : pas d'estimation.
assert.equal(budgetMensuel([pub({ reachUe: 1000, debut: jours(10) }), pub({ reachUe: 1000, debut: jours(1) })], MAINTENANT, 9.1), null)

const r = rapportMarque([
  pub({ format: 'VIDEO', cta: 'En savoir plus', debut: jours(100), reachUe: 296_000, lienUrl: 'https://www.placierenergie.fr/simulateur?utm=x', titre: 'Jusqu’à 40%', texte: 'Économisez jusqu’à 40% dès le 1er mois', plateformes: ['facebook', 'instagram'],
    transparence: { repartition: [{ pays: 'FR', age: '25-34', hommes: 60, femmes: 30, inconnu: 10 }] }, analyse: { angle: 'Économies chiffrées', concept: 'Listicle' } }),
  pub({ format: 'VIDEO', cta: 'En savoir plus', debut: jours(40), reachUe: 110_000, lienUrl: 'https://pro.placierenergie.fr/', titre: 'Jusqu’à 40%', texte: 'Économisez jusqu’à 40% dès le 1er mois', plateformes: ['instagram', 'facebook'] }),
  pub({ format: 'IMAGE', cta: 'Voir les détails', debut: jours(5), lienUrl: 'http://fb.me/', titre: 'Pour les pros', texte: 'Simulation gratuite', plateformes: ['facebook'] }),
], 9.1, MAINTENANT)

assert.equal(r.total, 3)
assert.equal(r.lanceesCes30j, 1)
assert.ok(Math.abs(r.depuisPlusDe30j - 2 / 3) < 1e-9)
assert.deepEqual(r.anciennete.tranches.map((t) => t.n), [1, 0, 1, 1])
assert.equal(r.anciennete.mediane, 40)
assert.deepEqual(r.formats, [{ libelle: 'VIDEO', n: 2 }, { libelle: 'IMAGE', n: 1 }])
assert.deepEqual(r.plateformes[0], { libelle: 'Facebook + Instagram', n: 2 }, 'les plateformes ne dépendent pas de leur ordre')
assert.deepEqual(r.produits, [{ libelle: 'Simulateur', n: 1 }, { libelle: 'Pro', n: 1 }], 'fb.me ne compte pas comme destination')
assert.deepEqual(r.domaines.map((d) => d.libelle), ['placierenergie.fr', 'pro.placierenergie.fr'])
assert.deepEqual(r.offres.liste, [{ libelle: 'Réduction de 40 %', n: 2 }])
assert.ok(Math.abs(r.offres.part - 2 / 3) < 1e-9, '« simulation gratuite » n’est pas une offre')
assert.equal(r.messages[0].n, 2, 'même titre + même texte = un message décliné deux fois')
assert.deepEqual(r.plusDiffusees.map((p) => p.reachUe), [296_000, 110_000])
assert.equal(r.plusLongues[0].debut, jours(100))
assert.deepEqual(r.audience.sexe.map((s) => s.n), [60, 30, 10])
assert.deepEqual(r.angles, [{ libelle: 'Économies chiffrées', n: 1 }])
assert.equal(r.budget, null, 'deux pubs à couverture connue ne suffisent pas')
console.log('rapportMarque : ok')

// Comparaison de marques
const { constatsComparaison } = await import('../src/lib/veille/rapport.ts')
const L = (o) => ({ nom: 'X', pubsActives: 0, budgetMensuel: null, lancees30j: 0, installees: 0, video: 0, offre: 0, feminin: null, derniereVue: null, ...o })
const constats = constatsComparaison([
  L({ nom: 'Placier', pubsActives: 24, budgetMensuel: 3400, lancees30j: 6, installees: 80, video: 70, offre: 30 }),
  L({ nom: 'Effy', pubsActives: 8, budgetMensuel: 9100, lancees30j: 2, installees: 40, video: 20, offre: 5 }),
])
assert.equal(constats[0], 'Placier a le plus gros parc actif : 24 pubs, 3,0 fois plus que Effy.')
assert.equal(constats[1], 'Effy investit le plus : environ 9,1 K € par mois, contre 3,4 K € pour Placier.')
assert.equal(constats[2], 'Placier teste le plus : 6 créas lancées sur 30 jours, contre 2 pour Effy.')
assert.ok(constats.some((c) => c.startsWith('Placier laisse tourner ses pubs : 80 %')))
assert.ok(constats.some((c) => c.startsWith('Placier mise sur la vidéo (70 %')))
assert.ok(constats.some((c) => c.startsWith('Placier pousse des offres dans 30 %')))
// Écarts faibles : pas de phrase inventée.
const proches = constatsComparaison([L({ nom: 'A', pubsActives: 10, installees: 50, video: 50 }), L({ nom: 'B', pubsActives: 9, installees: 45, video: 40 })])
assert.deepEqual(proches, ['A a le plus gros parc actif (10 pubs), mais les volumes restent proches.'])
console.log('constatsComparaison : ok')

// Courbes estimées : 10 000 personnes en 11 jours (lancée il y a 10 jours) → 91 € répartis sur ces 11 jours.
const ce = courbesEstimees([pub({ reachUe: 10_000, debut: jours(10) }), pub({ debut: jours(200) }), pub({ reachUe: 5000, debut: jours(20), active: false, fin: jours(15) })], 9.1, MAINTENANT)
assert.equal(ce.length, 90)
assert.ok(Math.abs(ce.reduce((s, j) => s + j.depense, 0) - (91 + 45.5)) < 1e-6, 'dépense totale')
assert.equal(ce[89].actives, 2) // la pub arrêtée ne compte plus aujourd'hui
assert.equal(ce[0].actives, 1) // seule la pub de 200 jours tournait il y a 89 jours
assert.equal(ce[89 - 15].actives, 2) // la pub de 200 jours et celle arrêtée ce jour-là

// Courbes relevées : +2 000 personnes en 2 jours (jours manquant comblé), puis +500.
const cr = courbesRelevees([
  { pubId: 'a', jour: '2026-11-10', reachUe: 1000 }, { pubId: 'a', jour: '2026-11-12', reachUe: 3000 }, { pubId: 'a', jour: '2026-11-13', reachUe: 3500 },
  { pubId: 'b', jour: '2026-11-12', reachUe: 800 }, { pubId: 'b', jour: '2026-11-13', reachUe: 800 },
], 9.1)
assert.equal(cr.releves, 3)
assert.deepEqual(cr.jours.map((j) => [j.jour, j.personnes]), [['2026-11-11', 1000], ['2026-11-12', 1000], ['2026-11-13', 500]])
assert.ok(Math.abs(cr.jours[2].depense - 4.55) < 1e-9)
assert.deepEqual(cr.accelerent.map((a) => a.pubId), ['a']) // b n'a rien gagné
console.log('courbes : ok')

