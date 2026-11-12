// Parle à Apogee. Les scripts de contenu ne le font pas eux-mêmes : sur
// facebook.com, leurs requêtes partiraient avec l'origine de Facebook.

const PUBS_PAR_SCAN = 50
const ENVOIS_SIMULTANES = 4

async function config() {
  const { url, cle } = await chrome.storage.sync.get(['url', 'cle'])
  if (!url || !cle) throw new Error('renseignez l’URL d’Apogee et la clé dans les options de l’extension')
  return { url, cle }
}

async function envoyer(pub, scan, transparence, dossierId) {
  const { url, cle } = await config()
  const r = await fetch(`${url}/api/veille/capture`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-veille-cle': cle },
    body: JSON.stringify({ pub, scan, transparence, dossierId }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erreur || `Apogee a répondu ${r.status}`)
  return j
}

// Bouton « Sauvegarder dans Apogee » sur la Ad Library.
// Progression de la seconde passe, relayée à la page Espion qui a lancé le scan.
let progressionScan = null

chrome.runtime.onMessage.addListener((msg, _expediteur, repondre) => {
  if (msg?.type === 'progression') return void progressionScan?.(msg)
  if (msg?.type !== 'sauvegarder') return
  envoyer(msg.pub, false, msg.transparence).then(repondre, (e) => repondre({ erreur: e.message === 'Failed to fetch' ? 'Apogee injoignable' : e.message }))
  return true
})

function attendreChargement(ongletId) {
  return new Promise((resolve) => {
    const ecoute = (id, info) => {
      if (id === ongletId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(ecoute)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(ecoute)
  })
}

/**
 * Ouvre une page de la Ad Library, la fait défiler, lit la fiche des pubs
 * inconnues, puis referme. `discret` : dans une fenêtre en arrière-plan, pour
 * la vérification quotidienne ; sinon dans un onglet à côté d'Apogee.
 */
async function lireAdLibrary({ cible, max, connus = [], cibles, ongletApogee, discret, progression }) {
  progression({ etape: 'ouverture' })
  // Un onglet caché ne charge pas la suite des résultats : onglet actif, ou fenêtre à part.
  const fenetre = discret ? await chrome.windows.create({ url: cible, focused: false, width: 1280, height: 900 }) : null
  const onglet = fenetre ? fenetre.tabs[0] : await chrome.tabs.create({ url: cible, active: true, openerTabId: ongletApogee?.id })
  try {
    await attendreChargement(onglet.id)
    progression({ etape: 'lecture' })
    progressionScan = ({ etape, fait, total }) => progression({ etape, fait, total })
    return await chrome.tabs.sendMessage(onglet.id, { type: 'collecter', max, connus, cibles })
  } finally {
    progressionScan = null
    if (fenetre) chrome.windows.remove(fenetre.id).catch(() => {})
    else chrome.tabs.remove(onglet.id).catch(() => {})
    if (ongletApogee?.id) chrome.tabs.update(ongletApogee.id, { active: true }).catch(() => {})
  }
}

/** Envoie les pubs à Apogee, quatre à la fois. */
async function envoyerTout(pubs, details, progression) {
  const envoyees = []
  const erreurs = []
  let fait = 0
  progression({ etape: 'envoi', fait, total: pubs.length })
  const file = [...pubs]
  await Promise.all(
    Array.from({ length: ENVOIS_SIMULTANES }, async () => {
      while (file.length) {
        const pub = file.shift()
        try {
          const r = await envoyer(pub, true, details[String(pub.ad_archive_id)])
          envoyees.push({ id: r.id, adArchiveId: String(pub.ad_archive_id) })
        } catch (e) {
          erreurs.push(e.message)
        }
        progression({ etape: 'envoi', fait: ++fait, total: pubs.length })
      }
    }),
  )
  return { envoyees, erreurs }
}

/**
 * Espion : la recherche d'un nom ou un lien Ad Library collé (la page d'un
 * annonceur par exemple), jusqu'à 50 pubs, toutes envoyées à Apogee.
 */
async function scanner({ recherche, pays }, ongletApogee, progression) {
  await config()
  const lien = /^https:\/\/www\.facebook\.com\/ads\/library\//.test(recherche)
  const cible = lien
    ? recherche
    : `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${encodeURIComponent(pays || 'FR')}` +
      `&q=${encodeURIComponent(recherche)}&search_type=keyword_unordered&media_type=all`
  const { pubs, details } = await lireAdLibrary({ cible, max: PUBS_PAR_SCAN, ongletApogee, progression })
  if (!pubs?.length) throw new Error('la Ad Library n’a renvoyé aucune pub pour cette recherche')
  const { envoyees, erreurs } = await envoyerTout(pubs, details, progression)
  return { ids: envoyees.map((e) => e.id), erreurs: erreurs.length, premiereErreur: erreurs[0] ?? null }
}

/**
 * Veille : relit chaque marque suivie sur sa page annonceur, envoie ses
 * nouvelles pubs, puis dit à Apogee lesquelles sont encore là.
 */
const PUBS_PAR_MARQUE = 100

async function verifierVeille({ ongletApogee, discret, progression }) {
  const { url, cle } = await config()
  const r = await fetch(`${url}/api/veille/suivies`, { headers: { 'x-veille-cle': cle } })
  if (!r.ok) throw new Error(`Apogee a répondu ${r.status}`)
  const marques = await r.json()
  const bilan = []
  for (const [i, m] of marques.entries()) {
    const etape = (x) => progression({ ...x, marque: m.nom, rang: i + 1, marques: marques.length })
    try {
      const cible = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${m.pageId}&search_type=page&media_type=all`
      const { pubs, details, complet } = await lireAdLibrary({ cible, max: PUBS_PAR_MARQUE, connus: m.connus, ongletApogee, discret, progression: etape })
      const connus = new Set(m.connus)
      const { envoyees } = await envoyerTout(pubs.filter((p) => !connus.has(String(p.ad_archive_id))), details, etape)
      const v = await fetch(`${url}/api/veille/verification`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-veille-cle': cle },
        body: JSON.stringify({ pageId: m.pageId, vus: pubs.map((p) => String(p.ad_archive_id)), nouvelles: envoyees.map((e) => e.adArchiveId), complet }),
      }).then((x) => x.json())
      bilan.push({ marque: m.nom, nouvelles: v.nouvelles ?? 0, arretees: v.arretees ?? 0 })
    } catch (e) {
      bilan.push({ marque: m.nom, erreur: e.message })
    }
  }
  await chrome.storage.local.set({ derniereVeille: Date.now(), bilanVeille: bilan })
  return { bilan }
}

/**
 * Bibliothèque : importe des pubs par leur ID dans la Ad Library et les range
 * dans le dossier choisi. La page de l'ID montre les pubs de l'annonceur ; on
 * y garde seulement celle demandée.
 */
async function importer({ ids, dossierId }, ongletApogee, progression) {
  await config()
  const bilan = { importees: 0, introuvables: [], erreurs: [] }
  for (const [i, id] of ids.entries()) {
    progression({ etape: 'import', fait: i, total: ids.length })
    try {
      const { pubs, details } = await lireAdLibrary({
        cible: `https://www.facebook.com/ads/library/?id=${id}`, max: 200, cibles: [id], ongletApogee, progression: () => {},
      })
      if (!pubs.length) bilan.introuvables.push(id)
      else {
        await envoyer(pubs[0], false, details[id], dossierId)
        bilan.importees++
      }
    } catch (e) {
      bilan.erreurs.push(`${id} : ${e.message}`)
    }
  }
  return bilan
}

// Une fois par jour, tant que Chrome est ouvert.
const VEILLE_TOUS_LES = 24 * 60
chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('veille', { delayInMinutes: 2, periodInMinutes: VEILLE_TOUS_LES }))
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('veille', { delayInMinutes: 2, periodInMinutes: VEILLE_TOUS_LES }))
chrome.alarms.onAlarm.addListener(async (alarme) => {
  if (alarme.name !== 'veille') return
  const { derniereVeille } = await chrome.storage.local.get('derniereVeille')
  if (derniereVeille && Date.now() - derniereVeille < 20 * 3_600_000) return
  verifierVeille({ discret: true, progression: () => {} }).catch(() => {})
})

chrome.runtime.onConnect.addListener((port) => {
  if (!['scan', 'veille', 'importer'].includes(port.name)) return
  port.onMessage.addListener(async (demande) => {
    const signaler = (m) => { try { port.postMessage(m) } catch {} }
    const progression = (m) => signaler({ type: 'progression', ...m })
    try {
      const resultat = port.name === 'scan'
        ? await scanner(demande, port.sender?.tab, progression)
        : port.name === 'importer'
          ? await importer(demande, port.sender?.tab, progression)
          : await verifierVeille({ ongletApogee: port.sender?.tab, discret: false, progression })
      signaler({ type: 'fini', ...resultat })
    } catch (e) {
      signaler({ type: 'erreur', message: e.message })
    }
  })
})

chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === 'install') chrome.runtime.openOptionsPage()
})
