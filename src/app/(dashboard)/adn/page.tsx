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
    </div>
  )
}
