// Vérifie la consigne de « Recréer pour ce client » : les images citées suivent l'ordre où elles sont jointes.
// node scripts/veille-recreer.check.mjs
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { consigne, consigneVariation, guidelines, versStory } from '../src/lib/veille/recreer.ts'

const m = { nom: 'MC Energy', site: null, secteur: 'Solaire', description: null, proposition: 'Sans apport', couleurs: ['#000f18'] }

const complet = consigne(m, { logo: true, logoClair: false, photos: 2 }, 'Offre de rentrée')
assert.match(complet, /Image 1 : une publicité d'un concurrent. Reproduis-la pour « MC Energy »/)
assert.match(complet, /aucune affirmation ni aucun avis du concurrent, aucun avis inventé/)
assert.match(complet, /photos réelles \(bâtiments.*\), par les photos de MC Energy jointes/)
assert.match(complet, /Image 2 : le logo de MC Energy/)
assert.match(complet, /Images 3 à 4 : des photos réelles/)
assert.match(complet, /Précision : Offre de rentrée/)
assert.match(complet, /#000f18/)

const nu = consigne({ ...m, couleurs: [] }, { logo: false, logoClair: false, photos: 1 })
assert.match(nu, /Pas de logo fourni : écris « MC Energy »/)
assert.match(nu, /Image 2 : des photos réelles/)
assert.match(consigne(m, { logo: false, logoClair: false, photos: 0 }), /par une scène nouvelle du même genre/)
assert.doesNotMatch(nu, /Couleurs de marque|Précision/)
assert.match(nu, /carré 1:1/)

// La Story : 1080 × 1920, le carré intact entre 420 et 1500 px (22 % à 78 %).
const carre = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#ff0000' } }).png().toBuffer()
const story = sharp(await versStory(carre, false))
const { width, height } = await story.metadata()
assert.equal(width, 1080)
assert.equal(height, 1920)
const { data } = await story.raw().toBuffer({ resolveWithObject: true })
const px = (x, y) => [...data.subarray((y * 1080 + x) * 3, (y * 1080 + x) * 3 + 3)]
assert.ok(px(540, 960)[0] > 240, 'centre rouge')
assert.ok(px(540, 425)[0] > 240, 'haut du carré à 420 px')
assert.ok(px(540, 200)[0] > 240 && px(540, 1800)[0] > 240, 'les bandes prolongent le bord du carré')

// Textes imposés : chacun mot pour mot, à la place de l'original.
const imposes = consigne(m, { logo: false, logoClair: false, photos: 0 }, '', [{ role: 'titre', original: 'Tout le monde parle de Placier', remplacement: 'Tout le monde parle de MC Energy' }])
assert.match(imposes, /mot pour mot/)
assert.match(imposes, /titre : « Tout le monde parle de MC Energy » \(au lieu de « Tout le monde parle de Placier »\)/)

// Variation : la pub (image 1) puis logo, logo clair, photos ; textes condensés et offre en bandeau.
const g = { ...m, typoTitre: 'Montserrat', tonDeVoix: 'rassurant', motsAEviter: 'gratuit', couleursRoles: ['principale'], produit: { nom: 'Batterie X', description: null, prix: 'dès 30 €/mois' } }
assert.deepEqual(guidelines(g), ['Ton de voix : rassurant.', 'Mots à ne jamais écrire : gratuit.'])
const variation = consigneVariation(g, { logo: true, logoClair: true, photos: 1 }, { titre: 'T', sousTitre: '', points: ['A', 'B'], offre: 'Étude offerte', bouton: '' }, { libelle: 'Polaroïd', consigne: 'une photo polaroïd' })
assert.match(variation, /Image 1 : une publicité d'un concurrent, qui marche. Crée une VARIATION/)
assert.match(variation, /en « Polaroïd » \(une photo polaroïd\)/)
assert.match(variation, /titre : « T »/)
assert.match(variation, /argument : « B »/)
assert.match(variation, /offre, bien visible en bandeau ou en macaron : « Étude offerte »/)
assert.doesNotMatch(variation, /sous-titre|bouton :/)
assert.match(variation, /Image 2 : le logo de MC Energy/)
assert.match(variation, /Image 3 : le même logo pour fonds sombres/)
assert.match(variation, /Image 4 : des photos réelles de MC Energy, dont Batterie X/)
assert.match(variation, /#000f18 \(principale\)/)
assert.match(variation, /titres en Montserrat/)

console.log('veille-recreer : OK')
