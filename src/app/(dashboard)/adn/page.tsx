'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { carteMarque, carteStyle, svgVersPng, type AdnMarque } from '@/lib/scalr/cartesMarque'

/**
 * L'ADN de marque, et les deux cartes qu'on montre au générateur.
 *
 * Un générateur d'images ne comprend pas « bleu foncé » ni « typographie
 * moderne ». Il comprend une image où la couleur est posée et la typographie
 * visible. Ces deux cartes sont jointes à chaque génération : c'est ce qui
 * sépare une créa générique d'une créa qui ressemble au compte.
 *
 * L'ADN reste un JSON éditable à la main. Corriger une couleur ou une règle ne
 * doit pas obliger à tout régénérer — et personne ne fait confiance à ce qu'il
 * ne peut pas relire.
 */
export default function AdnPage() {
  const { selectedAccount } = useStore()
  const compteId = selectedAccount?.id

  const [contenu, setContenu] = useState('')
  const [enregistre, setEnregistre] = useState('')
  const [chargement, setChargement] = useState(false)
  const [generation, setGeneration] = useState(false)
  const [message, setMessage] = useState('')
  const [cartes, setCartes] = useState<{ marque?: string; style?: string }>({})
  const [photo, setPhoto] = useState<string | null>(null)

  /**
   * Les créas de référence : le standard, montré plutôt que décrit.
   *
   * Les gagnantes du compte sont proposées d'abord — elles ont l'avantage
   * d'être jugées par les chiffres et non par l'œil.
   */
  type Ref = { id: string; image: string; source: string; adName?: string | null; cpl?: number | null; plan?: string | null }
  type Gagnante = { adId: string; nom: string; cpl: number | null; prospects: number; vignette: string | null; format: string | null }
  const [refs, setRefs] = useState<Ref[]>([])
  const [gagnantes, setGagnantes] = useState<Gagnante[]>([])
  const [refOccupe, setRefOccupe] = useState<string | null>(null)
  const [planOuvert, setPlanOuvert] = useState<string | null>(null)
  const [refErreur, setRefErreur] = useState<Record<string, string>>({})

  /** Le type d'une image, lu dans ses octets : une créa Meta est en JPEG. */
  const typeDeplus = (b64: string) =>
    b64.startsWith('/9j/') ? 'image/jpeg'
      : b64.startsWith('R0lGOD') ? 'image/gif'
        : b64.startsWith('UklGR') ? 'image/webp' : 'image/png'
  const [planTexte, setPlanTexte] = useState('')

  async function enregistrerPlan(id: string) {
    try { JSON.parse(planTexte) } catch { setMessage('JSON invalide — rien n’a été enregistré.'); return }
    const res = await fetch('/api/references', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, plan: planTexte }),
    })
    if (!res.ok) { setMessage('Enregistrement refusé.'); return }
    chargerRefs(); setMessage('Plan enregistré.')
  }

  const chargerRefs = useCallback(() => {
    if (!compteId) return
    fetch(`/api/references?dbAccountId=${compteId}`)
      .then((r) => r.json())
      .then((d) => { setRefs(d?.references || []); setGagnantes(d?.gagnantes || []) })
      .catch(() => { setRefs([]); setGagnantes([]) })
  }, [compteId])

  useEffect(() => { chargerRefs() }, [chargerRefs])

  async function ajouterRef(corps: Record<string, unknown>, cle: string) {
    if (!compteId) return
    setRefOccupe(cle); setMessage('')
    try {
      const res = await fetch('/api/references', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbAccountId: compteId, ...corps }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || d?.error) throw new Error(d?.error || `HTTP ${res.status}`)
      chargerRefs()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Ajout impossible.')
    } finally { setRefOccupe(null) }
  }

  async function deconstruire(id: string) {
    setRefOccupe(id); setMessage('')
    try {
      const res = await fetch('/api/references', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || d?.error) throw new Error(d?.error || `HTTP ${res.status}`)
      chargerRefs()
      setMessage('Plan de composition extrait.')
    } catch (e) {
      // L'erreur s'affiche sous la référence concernée : en haut de page, elle
      // passait inaperçue et le bouton semblait sans effet.
      setRefErreur((x) => ({ ...x, [id]: e instanceof Error ? e.message.slice(0, 160) : 'Échec' }))
    } finally { setRefOccupe(null) }
  }

  async function supprimerRef(id: string) {
    await fetch(`/api/references?id=${id}`, { method: 'DELETE' }).catch(() => null)
    chargerRefs()
  }

  async function fichierEnBase64(f: File) {
    return new Promise<string>((ok, ko) => {
      const fr = new FileReader()
      fr.onload = () => ok(String(fr.result).split(',')[1])
      fr.onerror = () => ko(new Error('lecture impossible'))
      fr.readAsDataURL(f)
    })
  }

  const charger = useCallback(() => {
    if (!compteId) return
    setChargement(true)
    fetch(`/api/brand-dna?dbAccountId=${compteId}`)
      .then((r) => r.json())
      .then((d) => {
        setContenu(d?.adn?.contenu ?? '')
        setEnregistre(d?.adn?.contenu ?? '')
        setCartes({ marque: d?.adn?.carteMarque ?? undefined, style: d?.adn?.carteStyle ?? undefined })
        setPhoto(d?.adn?.photoProduit ?? null)
      })
      .catch(() => setMessage('Chargement impossible.'))
      .finally(() => setChargement(false))
  }, [compteId])

  useEffect(() => { charger() }, [charger])

  const adn = useMemo<AdnMarque | null>(() => {
    if (!contenu.trim()) return null
    try { return JSON.parse(contenu) as AdnMarque } catch { return null }
  }, [contenu])

  const valide = contenu.trim() === '' || adn !== null
  const modifie = contenu !== enregistre

  async function generer() {
    if (!compteId) return
    setGeneration(true); setMessage('')
    try {
      const res = await fetch('/api/brand-dna', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbAccountId: compteId }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || d?.error) throw new Error(d?.error || `HTTP ${res.status}`)
      setContenu(d.adn.contenu); setEnregistre(d.adn.contenu)
      setCartes({})
      setMessage('ADN généré. Relisez-le, corrigez ce qui est faux, puis rendez les cartes.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Échec de la génération.')
    } finally { setGeneration(false) }
  }

  async function enregistrer() {
    if (!compteId || !valide) return
    const res = await fetch('/api/brand-dna', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbAccountId: compteId, contenu }),
    })
    const d = await res.json().catch(() => null)
    if (!res.ok || d?.error) { setMessage(d?.error || 'Enregistrement refusé.'); return }
    setEnregistre(contenu); setMessage('Enregistré.')
  }

  /** Les cartes se dessinent dans le navigateur, puis partent en base. */
  async function rendreCartes() {
    if (!compteId || !adn) return
    setMessage('')
    try {
      const [m, s] = await Promise.all([
        svgVersPng(carteMarque(adn)),
        svgVersPng(carteStyle(adn)),
      ])
      const res = await fetch('/api/brand-dna', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbAccountId: compteId, carteMarque: m, carteStyle: s }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setCartes({ marque: m, style: s })
      setMessage('Cartes rendues. Elles seront jointes à chaque génération d’image.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Rendu impossible.')
    }
  }

  async function chargerPhoto(f: File) {
    if (!compteId) return
    const b64 = await new Promise<string>((ok, ko) => {
      const fr = new FileReader()
      fr.onload = () => ok(String(fr.result).split(',')[1])
      fr.onerror = () => ko(new Error('lecture impossible'))
      fr.readAsDataURL(f)
    })
    await fetch('/api/brand-dna', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbAccountId: compteId, photoProduit: b64 }),
    })
    setPhoto(b64)
    setMessage('Photo produit enregistrée.')
  }

  if (!selectedAccount) {
    return <div className="card text-center py-16 text-gray-400 text-sm">Sélectionnez un compte publicitaire.</div>
  }

  return (
    <div className="space-y-4 max-w-[82rem] mx-auto">
      <div>
        <h1 className="page-title">ADN de marque</h1>
        <p className="page-subtitle mt-0.5">
          {selectedAccount.name} · ce qu’on montre au générateur d’images
        </p>
      </div>

      <div className="card bg-[#3434ef]/4 border border-[#3434ef]/15">
        <p className="text-sm text-[#0d0d12] leading-relaxed">
          Un générateur d’images ne comprend pas « bleu foncé ». Il comprend une image où la
          couleur est posée, la typographie visible et le bouton dessiné. Les deux cartes
          ci-dessous sont jointes à chaque génération — c’est ce qui sépare une créa générique
          d’une créa qui ressemble à ce compte.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={generer} disabled={generation || chargement}
          className="btn-primary text-sm px-4 py-2 disabled:opacity-40">
          {generation ? 'Génération…' : contenu ? 'Régénérer l’ADN' : 'Générer l’ADN'}
        </button>
        <button onClick={enregistrer} disabled={!modifie || !valide}
          className="text-sm px-4 py-2 rounded-lg border border-[#E5E7EB] text-gray-600 hover:border-[#3434ef] hover:text-[#3434ef] disabled:opacity-40">
          Enregistrer les corrections
        </button>
        <button onClick={rendreCartes} disabled={!adn}
          className="text-sm px-4 py-2 rounded-lg border border-[#E5E7EB] text-gray-600 hover:border-[#3434ef] hover:text-[#3434ef] disabled:opacity-40">
          Rendre les cartes
        </button>
        <label className="text-sm px-4 py-2 rounded-lg border border-[#E5E7EB] text-gray-600 hover:border-[#3434ef] hover:text-[#3434ef] cursor-pointer">
          {photo ? 'Remplacer la photo produit' : 'Ajouter une photo produit'}
          <input type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) chargerPhoto(f) }} />
        </label>
        {!valide && <span className="text-xs text-amber-600">JSON invalide — rien ne sera enregistré.</span>}
        {message && <span className="text-xs text-gray-500">{message}</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-0 overflow-hidden">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 pt-3">
            L’ADN — corrigez ce qui est faux
          </p>
          <textarea value={contenu} onChange={(e) => setContenu(e.target.value)}
            spellCheck={false}
            placeholder={chargement ? 'Chargement…' : 'Aucun ADN pour ce compte. Générez-le.'}
            className="w-full h-[640px] font-mono text-[11px] leading-relaxed p-4 border-0 focus:outline-none resize-none" />
        </div>

        <div className="space-y-4">
          {(['marque', 'style'] as const).map((k) => (
            <div key={k} className="card">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {k === 'marque' ? 'Carte de marque' : 'Carte de style'}
              </p>
              {cartes[k] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`data:image/png;base64,${cartes[k]}`} alt={`Carte ${k}`}
                  className="w-full border border-[#E5E7EB] rounded-lg" />
              ) : adn ? (
                <div className="border border-dashed border-[#E5E7EB] rounded-lg overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: k === 'marque' ? carteMarque(adn) : carteStyle(adn) }} />
              ) : (
                <p className="text-xs text-gray-400 py-8 text-center">Générez l’ADN pour voir la carte.</p>
              )}
            </div>
          ))}

          {photo && (
            <div className="card">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Photo produit</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/png;base64,${photo}`} alt="Photo produit"
                className="max-h-56 rounded-lg border border-[#E5E7EB]" />
            </div>
          )}
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Créas de référence {refs.length ? `· ${refs.length}` : ''}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed max-w-2xl">
              Le standard se montre, il ne se décrit pas. Déposez au moins trois créas que vous
              jugez bonnes — ou prenez les gagnantes du compte, jugées par les chiffres plutôt
              que par l’œil. Le plan de composition en est extrait, puis appliqué aux créas suivantes.
            </p>
          </div>
          <label className="text-sm px-4 py-2 rounded-lg border border-[#E5E7EB] text-gray-600 hover:border-[#3434ef] hover:text-[#3434ef] cursor-pointer flex-shrink-0">
            Ajouter une créa
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={async (e) => {
                for (const f of Array.from(e.target.files || [])) {
                  const b64 = await fichierEnBase64(f)
                  await ajouterRef({ image: b64 }, f.name)
                }
              }} />
          </label>
        </div>

        {refs.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {refs.map((r) => (
              <div key={r.id} className="border border-[#E5E7EB] rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:${typeDeplus(r.image)};base64,${r.image}`} alt={r.adName || 'référence'}
                  className="w-full aspect-square object-cover" />
                <div className="p-2 space-y-1.5">
                  <p className="text-[10px] text-gray-500 truncate">
                    {r.adName || 'Ajoutée à la main'}
                    {r.cpl != null && <span className="text-gray-400"> · CPL {r.cpl} €</span>}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => deconstruire(r.id)} disabled={refOccupe === r.id}
                      className={`text-[10px] px-2 py-1 rounded border ${r.plan
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-[#E5E7EB] text-gray-600 hover:border-[#3434ef]'} disabled:opacity-40`}>
                      {refOccupe === r.id ? 'Analyse…' : r.plan ? 'Plan extrait ✓' : 'Extraire le plan'}
                    </button>
                    <button onClick={() => supprimerRef(r.id)}
                      className="text-[10px] px-2 py-1 rounded border border-[#E5E7EB] text-gray-400 hover:text-red-600 hover:border-red-200">
                      Retirer
                    </button>
                  </div>
                  {refErreur[r.id] && (
                    <p className="text-[10px] text-amber-600 leading-snug">{refErreur[r.id]}</p>
                  )}
                  {r.plan && (
                    <button
                      onClick={() => {
                        const ouvre = planOuvert !== r.id
                        setPlanOuvert(ouvre ? r.id : null)
                        if (ouvre) setPlanTexte(JSON.stringify(JSON.parse(r.plan!), null, 2))
                      }}
                      className="text-[10px] text-[#3434ef] hover:underline truncate max-w-full text-left">
                      {(() => { try { const p = JSON.parse(r.plan!); return `${p.nom} · ${p.densite} · lire le plan` } catch { return 'lire le plan' } })()}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {planOuvert && (
          <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#f8f9fc] border-b border-[#E5E7EB]">
              <p className="text-[11px] font-semibold text-gray-500">
                Plan de composition — {refs.find((x) => x.id === planOuvert)?.adName || 'référence'}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => enregistrerPlan(planOuvert)}
                  className="text-[11px] px-2.5 py-1 rounded border border-[#E5E7EB] text-gray-600 hover:border-[#3434ef] hover:text-[#3434ef]">
                  Enregistrer
                </button>
                <button onClick={() => setPlanOuvert(null)}
                  className="text-[11px] text-gray-400 hover:text-gray-600">Fermer</button>
              </div>
            </div>
            <textarea value={planTexte} onChange={(e) => setPlanTexte(e.target.value)} spellCheck={false}
              className="w-full h-96 font-mono text-[11px] leading-relaxed p-3 border-0 focus:outline-none resize-none" />
          </div>
        )}

        {gagnantes.length > 0 && (
          <div className="pt-1">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Gagnantes du compte — 30 jours, meilleur CPL d’abord
            </p>
            <div className="flex flex-wrap gap-2">
              {gagnantes.map((g) => (
                <button key={g.adId}
                  onClick={() => ajouterRef({ adId: g.adId, adName: g.nom, cpl: g.cpl }, g.adId)}
                  disabled={refOccupe === g.adId}
                  className="flex items-center gap-2 border border-[#E5E7EB] rounded-lg pr-3 hover:border-[#3434ef] disabled:opacity-40 text-left">
                  {g.vignette
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={g.vignette} alt="" className="w-10 h-10 object-cover rounded-l-lg" />
                    : <span className="w-10 h-10 bg-[#f8f9fc] rounded-l-lg" />}
                  <span className="py-1.5">
                    <span className="block text-[11px] text-[#0d0d12] max-w-[190px] truncate">{g.nom}</span>
                    <span className="block text-[10px] text-gray-400">
                      CPL {g.cpl} € · {g.prospects} prospects{g.format ? ` · ${g.format}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              Une créa dynamique ou une vidéo n’expose pas d’image : l’ajout échouera et vous le dira.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
