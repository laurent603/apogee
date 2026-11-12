// Envoie la pub à Apogee. Le script de contenu ne le fait pas lui-même : sur
// facebook.com, ses requêtes partiraient avec l'origine de Facebook.
chrome.runtime.onMessage.addListener((msg, _expediteur, repondre) => {
  if (msg?.type !== 'sauvegarder') return
  ;(async () => {
    const { url, cle } = await chrome.storage.sync.get(['url', 'cle'])
    if (!url || !cle) return repondre({ erreur: 'renseignez l’URL d’Apogee et la clé dans les options' })
    try {
      const r = await fetch(`${url}/api/veille/capture`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-veille-cle': cle },
        body: JSON.stringify({ pub: msg.pub }),
      })
      const j = await r.json().catch(() => ({}))
      repondre(r.ok ? j : { erreur: j.erreur || `Apogee a répondu ${r.status}` })
    } catch {
      repondre({ erreur: 'Apogee injoignable' })
    }
  })()
  return true
})

chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === 'install') chrome.runtime.openOptionsPage()
})
