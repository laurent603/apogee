// Vérifie normaliserPub sur de vraies pubs de la Meta Ad Library.
// node scripts/veille-normaliser.check.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normaliserPub } from '../src/lib/veille/adLibrary.ts'

const { ads } = JSON.parse(readFileSync(new URL('./fixtures/adlibrary-exemples.json', import.meta.url)))
const [image, video, carrousel, dco] = ads.map(normaliserPub)

assert.equal(image.format, 'IMAGE')
assert.equal(image.medias.length, 1)
assert.match(image.medias[0].url, /868138088_/, 'image originale, pas la version réduite')
assert.deepEqual(image.plateformes, ['facebook', 'instagram', 'threads'])
assert.equal(image.debut.toISOString(), new Date(1793257200 * 1000).toISOString())

assert.equal(video.pageNom, 'legalstart.fr', 'l’annonceur, pas le créateur du contenu de marque')
assert.equal(video.pageId, '237855009707806')
assert.equal(video.medias[0].type, 'video')
assert.match(video.medias[0].url, /AQO8V1HD/, 'la HD avant la SD')
assert.ok(video.medias[0].apercu)
assert.match(normaliserPub(ads[1], { videoSd: true }).medias[0].url, /AQMfJQCER/, 'la SD pour un scan')
assert.equal(video.titre, null)

assert.equal(carrousel.medias.length, 2)
assert.equal(carrousel.texte.startsWith('Ne laissez plus'), true)

assert.equal(dco.texte.startsWith('PROPRIÉTAIRES'), true, 'les gabarits {{…}} sont remplacés par la 1re carte')
assert.equal(dco.titre, 'Vos aides pompe à chaleur')
assert.equal(dco.description, 'Vérifiez votre éligibilité en 3 clics')

// Le serveur télécharge ces liens : rien hors du CDN de Meta.
const piege = structuredClone(ads[0])
piege.snapshot.images[0].original_image_url = 'http://169.254.169.254/latest/meta-data'
piege.snapshot.images[0].resized_image_url = 'https://evil.example/fbcdn.net/x.jpg'
assert.equal(normaliserPub(piege).medias.length, 0)

assert.throws(() => normaliserPub({ ...ads[0], ad_archive_id: '../x' }), /ad_archive_id/)
assert.throws(() => normaliserPub(null), /ad_archive_id/)

console.log('normaliserPub : ok')

// Transparence UE (réponse AdLibraryV3AdDetailsQuery réelle)
const { normaliserTransparence, budgetEstime } = await import('../src/lib/veille/adLibrary.ts')
const detail = JSON.parse(readFileSync(new URL('./fixtures/adlibrary-detail.json', import.meta.url)))
const tr = normaliserTransparence(detail)
assert.equal(tr.reachUe, 7158470)
assert.equal(tr.repartition.length, 6)
assert.deepEqual(tr.repartition.find((l) => l.age === '25-34'), { pays: 'FR', age: '25-34', hommes: 565568, femmes: 537534, inconnu: 33089 })
assert.deepEqual(tr.ciblage, { ageMin: 25, ageMax: 65, sexe: 'Tous', lieux: ['France'] })
assert.equal(tr.payeur, 'Velux France SAS')
assert.equal(normaliserTransparence({ data: {} }), null)
assert.equal(normaliserTransparence(null), null)
// Les trois pubs Placier Energie relevées chez Créabase : 2,7 K, 1,0 K, 780 €.
assert.equal(Math.round(budgetEstime(296_000)), 2694)
assert.equal(Math.round(budgetEstime(110_000)), 1001)
assert.equal(Math.round(budgetEstime(86_000)), 783)
assert.equal(budgetEstime(null), null)
console.log('normaliserTransparence et budgetEstime : ok')
