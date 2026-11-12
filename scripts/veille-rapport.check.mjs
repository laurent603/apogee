// Vérifie les calculs du rapport Espion.
// node scripts/veille-rapport.check.mjs
import assert from 'node:assert/strict'
import { budgetMensuel, rapportMarque } from '../src/lib/veille/rapport.ts'

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
