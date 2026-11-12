// Ajoute « Sauvegarder dans Apogee » sous chaque « ID dans la bibliothèque »
// et envoie la pub correspondante, reçue de interception.js.
const pubs = new Map()
window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'apogee-veille') return
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
    chrome.runtime.sendMessage({ type: 'sauvegarder', pub }, (r) => {
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
