// Injecté dans les pages d'Apogee (voir options.js) : relie la page Espion à
// l'extension. La page ne peut pas parler à l'extension directement.
const signaler = (m) => window.postMessage({ source: 'apogee-extension', ...m }, location.origin)

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'apogee-page') return
  if (e.data.type === 'ping') return signaler({ type: 'presente' })
  if (e.data.type !== 'scanner' && e.data.type !== 'veille') return
  const port = chrome.runtime.connect({ name: e.data.type === 'scanner' ? 'scan' : 'veille' })
  port.onMessage.addListener(signaler)
  port.postMessage({ recherche: e.data.recherche, pays: e.data.pays })
})

signaler({ type: 'presente' })
