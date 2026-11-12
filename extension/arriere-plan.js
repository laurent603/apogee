// Parle à Apogee. Les scripts de contenu ne le font pas eux-mêmes : sur
// facebook.com, leurs requêtes partiraient avec l'origine de Facebook.

const PUBS_PAR_SCAN = 50
const ENVOIS_SIMULTANES = 4

async function config() {
  const { url, cle } = await chrome.storage.sync.get(['url', 'cle'])
  if (!url || !cle) throw new Error('renseignez l’URL d’Apogee et la clé dans les options de l’extension')
  return { url, cle }
}

async function envoyer(pub, scan) {
  const { url, cle } = await config()
  const r = await fetch(`${url}/api/veille/capture`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-veille-cle': cle },
    body: JSON.stringify({ pub, scan }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erreur || `Apogee a répondu ${r.status}`)
  return j
}

// Bouton « Sauvegarder dans Apogee » sur la Ad Library.
chrome.runtime.onMessage.addListener((msg, _expediteur, repondre) => {
  if (msg?.type !== 'sauvegarder') return
  envoyer(msg.pub, false).then(repondre, (e) => repondre({ erreur: e.message === 'Failed to fetch' ? 'Apogee injoignable' : e.message }))
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
 * Espion : ouvre la recherche dans la Ad Library, la fait défiler, envoie
 * chaque pub à Apogee, referme l'onglet. Un lien Ad Library collé (page d'un
 * annonceur par exemple) est ouvert tel quel.
 */
async function scanner({ recherche, pays }, ongletApogee, progression) {
  await config()
  const lien = /^https:\/\/www\.facebook\.com\/ads\/library\//.test(recherche)
  const cible = lien
    ? recherche
    : `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${encodeURIComponent(pays || 'FR')}` +
      `&q=${encodeURIComponent(recherche)}&search_type=keyword_unordered&media_type=all`

  progression({ etape: 'ouverture' })
  // Actif : un onglet en arrière-plan ne charge pas la suite des résultats.
  const onglet = await chrome.tabs.create({ url: cible, active: true, openerTabId: ongletApogee?.id })
  let pubs
  try {
    await attendreChargement(onglet.id)
    progression({ etape: 'lecture' })
    pubs = await chrome.tabs.sendMessage(onglet.id, { type: 'collecter', max: PUBS_PAR_SCAN })
  } finally {
    chrome.tabs.remove(onglet.id).catch(() => {})
    if (ongletApogee?.id) chrome.tabs.update(ongletApogee.id, { active: true }).catch(() => {})
  }
  if (!pubs?.length) throw new Error('la Ad Library n’a renvoyé aucune pub pour cette recherche')

  const ids = []
  const erreurs = []
  let fait = 0
  progression({ etape: 'envoi', fait, total: pubs.length })
  const file = [...pubs]
  await Promise.all(
    Array.from({ length: ENVOIS_SIMULTANES }, async () => {
      while (file.length) {
        const pub = file.shift()
        try {
          ids.push((await envoyer(pub, true)).id)
        } catch (e) {
          erreurs.push(e.message)
        }
        progression({ etape: 'envoi', fait: ++fait, total: pubs.length })
      }
    }),
  )
  return { ids, erreurs: erreurs.length, premiereErreur: erreurs[0] ?? null }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'scan') return
  port.onMessage.addListener(async (demande) => {
    const signaler = (m) => { try { port.postMessage(m) } catch {} }
    try {
      const resultat = await scanner(demande, port.sender?.tab, (m) => signaler({ type: 'progression', ...m }))
      signaler({ type: 'fini', ...resultat })
    } catch (e) {
      signaler({ type: 'erreur', message: e.message })
    }
  })
})

chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === 'install') chrome.runtime.openOptionsPage()
})
