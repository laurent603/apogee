// Vérifie la consigne de « Recréer pour ce client » : les images citées suivent l'ordre où elles sont jointes.
// node scripts/veille-recreer.check.mjs
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { consigne, consigneConcept, guidelines, versStory } from '../src/lib/veille/recreer.ts'

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

// Concept : pas de pub du concurrent jointe ; logo (image 1), logo pour fonds sombres (image 2), guidelines.
const g = { ...m, typoTitre: 'Montserrat', tonDeVoix: 'rassurant', motsAEviter: 'gratuit' }
const autre = consigneConcept(g, { logo: true, logoClair: true, photos: 1 }, { angle: 'Avant / après', detail: 'deux moitiés, avant et après', idee: 'Une toiture avant et après', textes: [{ role: 'accroche', texte: 'Y' }] })
assert.match(autre, /Angle : Avant \/ après \(deux moitiés/)
assert.match(autre, /accroche : « Y »/)
assert.match(autre, /Image 1 : le logo de MC Energy/)
assert.match(autre, /Image 2 : le même logo pour fonds sombres/)
assert.match(autre, /Image 3 : des photos réelles/)
assert.match(autre, /titres en Montserrat/)
assert.doesNotMatch(autre, /concurrent|au lieu de/)
assert.deepEqual(guidelines(g), ['Ton de voix : rassurant.', 'Mots à ne jamais écrire : gratuit.'])

// Produit, rôles de couleurs et créas modèles : numérotés après les photos.
const p = { ...g, couleursRoles: ['principale'], produit: { nom: 'Batterie X', description: null, prix: 'dès 30 €/mois' } }
const avecModeles = consigneConcept(p, { logo: true, logoClair: false, photos: 2, modeles: 2 }, { angle: 'Produit seul', idee: 'I', textes: [{ role: 'accroche', texte: 'Y' }] })
assert.match(avecModeles, /Images 2 à 3 : des photos réelles de MC Energy, dont Batterie X/)
assert.match(avecModeles, /Images 4 à 5 : des publicités de MC Energy qui marchent/)
assert.match(avecModeles, /#000f18 \(principale\)/)
assert.match(avecModeles, /prix affiché « dès 30 €\/mois », à écrire tel quel/)

console.log('veille-recreer : OK')
