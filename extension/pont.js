// Injecté dans les pages d'Apogee (voir options.js) : relie la page Espion à
// l'extension. La page ne peut pas parler à l'extension directement.
const signaler = (m) => window.postMessage({ source: 'apogee-extension', ...m }, location.origin)

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'apogee-page') return
  if (e.data.type === 'ping') return signaler({ type: 'presente' })
  const PORTS = { scanner: 'scan', veille: 'veille', importer: 'importer' }
  if (!PORTS[e.data.type]) return
  const port = chrome.runtime.connect({ name: PORTS[e.data.type] })
  port.onMessage.addListener(signaler)
  const { source, type, ...demande } = e.data
  port.postMessage(demande)
})

signaler({ type: 'presente' })
