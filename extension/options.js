const url = document.getElementById('url')
const cle = document.getElementById('cle')
const etat = document.getElementById('etat')

chrome.storage.sync.get(['url', 'cle']).then((v) => {
  url.value = v.url || ''
  cle.value = v.cle || ''
})

document.getElementById('enregistrer').addEventListener('click', async () => {
  let origine
  try {
    origine = new URL(url.value).origin
  } catch {
    etat.textContent = 'Adresse invalide'
    return
  }
  // L'extension ne peut appeler Apogee qu'une fois son domaine autorisé.
  const ok = await chrome.permissions.request({ origins: [`${origine}/*`] })
  if (!ok) {
    etat.textContent = 'Autorisation refusée : l’extension ne pourra pas joindre Apogee'
    return
  }
  await chrome.storage.sync.set({ url: origine, cle: cle.value.trim() })
  // Le pont vers la page Espion n'est injecté que sur le domaine d'Apogee.
  await chrome.scripting.unregisterContentScripts({ ids: ['pont-apogee'] }).catch(() => {})
  await chrome.scripting.registerContentScripts([
    { id: 'pont-apogee', matches: [`${origine}/*`], js: ['pont.js'], runAt: 'document_start' },
  ])
  etat.textContent = 'Enregistré — rechargez la page Espion d’Apogee si elle est ouverte'
})
