// La veille et la collecte quotidiennes, lancées chaque matin par launchd (voir installer.sh).
//
// Le serveur ne peut pas lire la Ad Library (Facebook lui répond 403) : ce
// script ouvre le Google Chrome du Mac, invisible et sur un profil vierge,
// et y fait tourner le code de l'extension tel quel — seule l'API `chrome`
// est simulée. Pour chaque marque suivie : lecture de sa page annonceur,
// fiche détaillée des pubs inconnues, envoi à Apogee, puis vérification.
// Ensuite, la collecte : chaque mot-clé choisi dans Discovery est cherché
// dans la Ad Library, et ses pubs inconnues rejoignent Discovery.
//
//   node veille.mjs             passage réel
//   node veille.mjs --essai     lit tout, n'envoie rien
//   node veille.mjs --collecte  la collecte seule, sans la veille

import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const APOGEE = process.env.APOGEE_URL || 'https://launch.leadscore.fr'
const ESSAI = process.argv.includes('--essai')
const COLLECTE_SEULE = process.argv.includes('--collecte')
const PUBS_PAR_MARQUE = 100
const PUBS_PAR_MOT_CLE = 50
const log = (...a) => console.log(new Date().toLocaleString('fr-FR'), '·', ...a)

function lireCle() {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const ligne = env.split('\n').find((l) => l.startsWith('VEILLE_EXTENSION_KEY='))
  const cle = ligne?.slice('VEILLE_EXTENSION_KEY='.length).trim().replace(/^["']|["']$/g, '')
  if (!cle) throw new Error('VEILLE_EXTENSION_KEY absente de .env.local')
  return cle
}
const CLE = lireCle()

async function appel(chemin, init = {}) {
  const r = await fetch(APOGEE + chemin, { ...init, headers: { 'content-type': 'application/json', 'x-veille-cle': CLE } })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${j?.erreur ?? ''}`)
  return j
}

const fichier = (nom) => readFileSync(new URL(`../extension/${nom}`, import.meta.url), 'utf8')
// Le script de contenu attend l'API des extensions : on la simule, et on le
// démarre dès que le document existe (un script injecté peut arriver avant).
const SIMULATION = `window.__apogeeEcouteurs = [];
window.chrome = window.chrome || {};
window.chrome.runtime = {
  lastError: null,
  sendMessage: (m, cb) => { if (cb) setTimeout(() => cb({ erreur: 'hors extension' }), 0); return Promise.resolve() },
  onMessage: { addListener: (f) => window.__apogeeEcouteurs.push(f) },
};`
const CONTENU = `(() => {
  const demarrer = () => { ${fichier('contenu.js')} }
  if (document.documentElement) demarrer()
  else document.addEventListener('readystatechange', demarrer, { once: true })
})()`

async function lirePage(contexte, cible, connus, max = PUBS_PAR_MARQUE) {
  const page = await contexte.newPage()
  try {
    await page.goto(cible, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(3000)
    return await page.evaluate(
      ({ max, connus }) => new Promise((ok) => window.__apogeeEcouteurs[0]({ type: 'collecter', max, connus }, null, ok)),
      { max, connus },
    )
  } finally {
    await page.close()
  }
}

/** Les pubs inconnues des mots-clés de Discovery, envoyées comme un scan Espion. */
async function collecter(contexte) {
  const { motsCles, connus: dejaVues } = await appel('/api/veille/collecte')
  if (!motsCles.length) return log('collecte : aucun mot-clé')
  log(`collecte : ${motsCles.length} mot${motsCles.length > 1 ? 's' : ''}-clé${motsCles.length > 1 ? 's' : ''}`)
  const connus = new Set(dejaVues)
  for (const m of motsCles) {
    try {
      const cible = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${encodeURIComponent(m.pays)}` +
        // Phrase exacte : sans elle, « pompe à chaleur » ramène aussi des iPad.
        `&q=${encodeURIComponent(`"${m.motCle}"`)}&search_type=keyword_exact_phrase&media_type=all`
      const { pubs, details } = await lirePage(contexte, cible, [...connus], PUBS_PAR_MOT_CLE)
      const nouvelles = pubs.filter((p) => !connus.has(String(p.ad_archive_id)))
      let envoyees = 0
      if (!ESSAI) {
        for (const pub of nouvelles) {
          try {
            await appel('/api/veille/capture', { method: 'POST', body: JSON.stringify({ pub, scan: true, transparence: details[String(pub.ad_archive_id)] }) })
            envoyees++
          } catch (e) {
            log(`  capture refusée (${pub.ad_archive_id}) : ${e.message}`)
          }
        }
      }
      for (const p of pubs) connus.add(String(p.ad_archive_id))
      const bilan = `${pubs.length} lues, ${envoyees} nouvelle${envoyees > 1 ? 's' : ''}`
      log(`« ${m.motCle} » : ${bilan}${ESSAI ? ` (${nouvelles.length} inconnues, essai)` : ''}`)
      if (!ESSAI) await appel('/api/veille/collecte', { method: 'POST', body: JSON.stringify({ id: m.id, bilan }) })
    } catch (e) {
      log(`« ${m.motCle} » : échec — ${e.message}`)
    }
  }
}

async function main() {
  const navigateur = await chromium.launch({ channel: 'chrome', headless: true })
  const contexte = await navigateur.newContext({ locale: 'fr-FR', viewport: { width: 1280, height: 900 } })
  for (const script of [SIMULATION, fichier('interception.js'), CONTENU]) await contexte.addInitScript(script)

  try {
    if (!COLLECTE_SEULE) await verifier(contexte)
    await collecter(contexte)
  } finally {
    await navigateur.close()
  }
}

async function verifier(contexte) {
  const marques = await appel('/api/veille/suivies')
  if (!marques.length) return log('aucune marque suivie')
  log(`${marques.length} marque${marques.length > 1 ? 's' : ''} suivie${marques.length > 1 ? 's' : ''}${ESSAI ? ' — essai, rien n’est envoyé' : ''}`)
  for (const m of marques) {
    try {
      const cible = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${m.pageId}&search_type=page&media_type=all`
      const { pubs, details, complet } = await lirePage(contexte, cible, m.connus)
      const connus = new Set(m.connus)
      const nouvelles = pubs.filter((p) => !connus.has(String(p.ad_archive_id)))
      const lues = nouvelles.filter((p) => details[String(p.ad_archive_id)]).length
      log(`${m.nom} : ${pubs.length} pubs lues${complet ? ', liste complète' : ', liste partielle'} · ${nouvelles.length} nouvelle${nouvelles.length > 1 ? 's' : ''} (fiche lue pour ${lues})`)
      if (ESSAI) continue

      const envoyees = []
      for (const pub of nouvelles) {
        try {
          await appel('/api/veille/capture', { method: 'POST', body: JSON.stringify({ pub, scan: true, transparence: details[String(pub.ad_archive_id)] }) })
          envoyees.push(String(pub.ad_archive_id))
        } catch (e) {
          log(`  capture refusée (${pub.ad_archive_id}) : ${e.message}`)
        }
      }
      const v = await appel('/api/veille/verification', {
        method: 'POST',
        body: JSON.stringify({ pageId: m.pageId, vus: pubs.map((p) => String(p.ad_archive_id)), nouvelles: envoyees, complet }),
      })
      log(`  → ${v.nouvelles} nouvelle${v.nouvelles > 1 ? 's' : ''} enregistrée${v.nouvelles > 1 ? 's' : ''}, ${v.arretees} arrêtée${v.arretees > 1 ? 's' : ''}`)
    } catch (e) {
      log(`${m.nom} : échec — ${e.message}`)
    }
  }
}

main().catch((e) => {
  log('échec :', e.message)
  process.exitCode = 1
})
