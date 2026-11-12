// Tourne dans la page elle-même (world MAIN) : c'est le seul endroit où l'on
// voit les données que la bibliothèque reçoit — le JSON embarqué au premier
// affichage, puis les réponses /api/graphql/ à chaque défilement. Chaque pub
// trouvée est passée au script de contenu par postMessage.
(() => {
  const transmettre = (texte) => {
    if (typeof texte !== 'string' || !texte.includes('ad_archive_id')) return
    const pubs = []
    const parcourir = (o) => {
      if (!o || typeof o !== 'object') return
      if (Array.isArray(o)) return o.forEach(parcourir)
      if (o.ad_archive_id && o.snapshot) return void pubs.push(o)
      for (const k in o) parcourir(o[k])
    }
    for (const ligne of texte.replace(/^for \(;;\);/, '').split('\n')) {
      try { parcourir(JSON.parse(ligne)) } catch {}
    }
    if (pubs.length) window.postMessage({ source: 'apogee-veille', pubs }, location.origin)
  }

  // La fiche « Voir les détails » d'une pub (AdLibraryV3AdDetailsQuery) :
  // couverture UE, audience, payeur. La réponse ne dit pas de quelle pub il
  // s'agit ; la requête, si (variables.adArchiveID).
  const transmettreDetail = (corps, texte) => {
    if (typeof texte !== 'string' || !texte.includes('eu_transparency')) return
    try {
      const id = JSON.parse(new URLSearchParams(String(corps)).get('variables') || '{}').adArchiveID
      if (id) window.postMessage({ source: 'apogee-veille', detail: { id: String(id), reponse: JSON.parse(texte.replace(/^for \(;;\);/, '')) } }, location.origin)
    } catch {}
  }

  const ouvrir = XMLHttpRequest.prototype.open
  const envoyer = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (methode, url) {
    this.__apogeeUrl = String(url)
    return ouvrir.apply(this, arguments)
  }
  XMLHttpRequest.prototype.send = function (corps) {
    if (this.__apogeeUrl?.includes('/api/graphql')) {
      this.addEventListener('load', () => {
        if (this.responseType !== '' && this.responseType !== 'text') return
        transmettre(this.responseText)
        transmettreDetail(corps, this.responseText)
      })
    }
    return envoyer.apply(this, arguments)
  }

  const recuperer = window.fetch
  window.fetch = async function (entree) {
    const reponse = await recuperer.apply(this, arguments)
    if (String(entree?.url ?? entree).includes('/api/graphql')) reponse.clone().text().then(transmettre, () => {})
    return reponse
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('script[type="application/json"]').forEach((s) => transmettre(s.textContent))
  })
})()
