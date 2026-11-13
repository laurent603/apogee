// Ajoute « Sauvegarder dans Apogee » sous chaque « ID dans la bibliothèque »
// et envoie la pub correspondante, reçue de interception.js.
const pubs = new Map()
const details = new Map()
let total = null
window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'apogee-veille') return
  if (e.data.detail) return void details.set(e.data.detail.id, e.data.detail.reponse)
  if (typeof e.data.total === 'number') return void (total = Math.max(total ?? 0, e.data.total))
  for (const p of e.data.pubs) pubs.set(String(p.ad_archive_id), p)
})

const ETIQUETTE = /(?:ID dans la bibliothèque|Library ID)\s*:\s*(\d+)/

function creerBouton(id) {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'apogee-veille'
  b.textContent = 'Sauvegarder dans Apogee'
  b.style.cssText =
    'display:block;margin:6px 0;padding:6px 10px;border:0;border-radius:6px;background:#111;color:#fff;font:600 12px system-ui;cursor:pointer'
  b.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const pub = pubs.get(id)
    if (!pub) {
      b.textContent = 'Données pas encore reçues, réessayez'
      return
    }
    b.disabled = true
    b.textContent = 'Sauvegarde…'
    chrome.runtime.sendMessage({ type: 'sauvegarder', pub, transparence: details.get(id) }, (r) => {
      b.disabled = false
      if (chrome.runtime.lastError || !r) b.textContent = 'Erreur : extension injoignable'
      else if (r.erreur) b.textContent = `Erreur : ${r.erreur}`
      else {
        b.textContent = r.deja ? 'Déjà dans Apogee' : 'Sauvegardée ✓'
        b.disabled = true
      }
    })
  })
  return b
}

function ajouterBoutons() {
  if (!document.body) return
  const marcheur = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const cibles = []
  while (marcheur.nextNode()) {
    const m = marcheur.currentNode.nodeValue.match(ETIQUETTE)
    if (m) cibles.push([marcheur.currentNode.parentElement, m[1]])
  }
  for (const [el, id] of cibles) {
    if (!el || el.nextElementSibling?.classList.contains('apogee-veille')) continue
    el.after(creerBouton(id))
  }
}

// Au plus un passage toutes les 400 ms, sans jamais être repoussé : un délai
// remis à zéro à chaque mutation peut ne jamais se déclencher.
let attente = null
const planifier = () => {
  attente ??= setTimeout(() => {
    attente = null
    ajouterBoutons()
  }, 400)
}
new MutationObserver(planifier).observe(document.documentElement, { childList: true, subtree: true })
window.addEventListener('load', planifier)

// Espion : fait défiler la recherche jusqu'à `max` pubs, ou jusqu'à ce que
// trois défilements de suite n'en apportent plus aucune. `nouvelles` (collecte
// du matin) : `max` pubs absentes de `connus`, pour descendre plus bas chaque jour.
chrome.runtime.onMessage.addListener((msg, _expediteur, repondre) => {
  if (msg?.type !== 'collecter') return
  ;(async () => {
    let avant = -1
    let immobile = 0
    // La Veille connaît déjà la plupart des pubs : elle ne lit que la fiche des nouvelles.
    const connus = new Set(msg.connus ?? [])
    const inconnues = () => [...pubs.values()].filter((p) => !connus.has(String(p.ad_archive_id)))
    // ponytail: plafond de 600 pubs parcourues, pour qu'une liste immense ne défile pas sans fin.
    const assez = () => (msg.nouvelles ? inconnues().length >= msg.max || pubs.size >= 600 : pubs.size >= msg.max)
    // Import : on s'arrête dès que les pubs demandées sont arrivées.
    const trouvees = () => msg.cibles?.length && msg.cibles.every((id) => pubs.has(id))
    while (!assez() && immobile < 3 && !trouvees()) {
      window.scrollTo(0, document.documentElement.scrollHeight)
      await new Promise((r) => setTimeout(r, 2000))
      immobile = pubs.size === avant ? immobile + 1 : 0
      avant = pubs.size
    }
    const retenues = msg.cibles ? msg.cibles.map((id) => pubs.get(id)).filter(Boolean)
      : msg.nouvelles ? inconnues().slice(0, msg.max)
      : [...pubs.values()].slice(0, msg.max)
    await lireDetails(msg.cibles ?? retenues.map((p) => String(p.ad_archive_id)).filter((id) => !connus.has(id)))
    repondre({ pubs: retenues, details: Object.fromEntries(details), complet: total !== null && pubs.size >= total })
  })()
  return true
})

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))

/** Le bouton « Voir les détails » de la carte qui porte cet ID, hors popup. */
function boutonDetails(id) {
  const marcheur = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (marcheur.nextNode()) {
    const m = marcheur.currentNode.nodeValue.match(ETIQUETTE)
    if (m?.[1] !== id || marcheur.currentNode.parentElement.closest('[role="dialog"]')) continue
    for (let el = marcheur.currentNode.parentElement; el && el !== document.body; el = el.parentElement) {
      const boutons = [...el.querySelectorAll('div[role="button"]')].filter((b) => /^Voir les détails/.test(b.textContent.trim()))
      if (boutons.length) return boutons.find((b) => !boutons.some((o) => o !== b && b.contains(o)))
    }
  }
  return null
}

function fermerPopup() {
  const b = [...document.querySelectorAll('[role="dialog"] div[role="button"], [role="dialog"] [aria-label="Fermer"], [role="dialog"] [aria-label="Close"]')]
    .find((x) => ['Fermer', 'Close'].includes(x.textContent.trim()) || ['Fermer', 'Close'].includes(x.getAttribute('aria-label')))
  if (b) b.click()
  else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
}

/**
 * Seconde passe : ouvre la fiche détaillée de chaque pub pour lire sa
 * couverture UE et son audience, puis la referme. Une fiche qui ne répond
 * pas en quatre secondes est laissée de côté.
 */
async function lireDetails(ids) {
  let fait = 0
  for (const id of ids) {
    chrome.runtime.sendMessage({ type: 'progression', etape: 'details', fait, total: ids.length }).catch(() => {})
    const bouton = !details.has(id) && boutonDetails(id)
    if (bouton) {
      bouton.click()
      for (let t = 0; t < 20 && !details.has(id); t++) await attendre(200)
      fermerPopup()
      await attendre(400)
    }
    fait++
  }
}
