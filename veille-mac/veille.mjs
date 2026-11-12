// La veille quotidienne, lancée chaque matin par launchd (voir installer.sh).
//
// Le serveur ne peut pas lire la Ad Library (Facebook lui répond 403) : ce
// script ouvre le Google Chrome du Mac, invisible et sur un profil vierge,
// et y fait tourner le code de l'extension tel quel — seule l'API `chrome`
// est simulée. Pour chaque marque suivie : lecture de sa page annonceur,
// fiche détaillée des pubs inconnues, envoi à Apogee, puis vérification.
//
//   node veille.mjs          passage réel
//   node veille.mjs --essai  lit tout, n'envoie rien

import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const APOGEE = process.env.APOGEE_URL || 'https://launch.leadscore.fr'
const ESSAI = process.argv.includes('--essai')
const PUBS_PAR_MARQUE = 100
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

async function lirePage(contexte, cible, connus) {
  const page = await contexte.newPage()
  try {
    await page.goto(cible, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(3000)
    return await page.evaluate(
      ({ max, connus }) => new Promise((ok) => window.__apogeeEcouteurs[0]({ type: 'collecter', max, connus }, null, ok)),
      { max: PUBS_PAR_MARQUE, connus },
    )
  } finally {
    await page.close()
  }
}

async function main() {
  const marques = await appel('/api/veille/suivies')
  if (!marques.length) return log('aucune marque suivie')
  log(`${marques.length} marque${marques.length > 1 ? 's' : ''} suivie${marques.length > 1 ? 's' : ''}${ESSAI ? ' — essai, rien n’est envoyé' : ''}`)

  const navigateur = await chromium.launch({ channel: 'chrome', headless: true })
  const contexte = await navigateur.newContext({ locale: 'fr-FR', viewport: { width: 1280, height: 900 } })
  for (const script of [SIMULATION, fichier('interception.js'), CONTENU]) await contexte.addInitScript(script)

  try {
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
  } finally {
    await navigateur.close()
  }
}

main().catch((e) => {
  log('échec :', e.message)
  process.exitCode = 1
})
