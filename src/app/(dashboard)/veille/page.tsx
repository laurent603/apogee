'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { CartePub, ChoixSauvegarde, type Dossier, type PubVeille } from '@/components/veille/CartePub'
import { ChoixSecteur, useSecteurClient, visiblePourClient } from '@/components/veille/SecteurClient'

/**
 * Veille : les marques suivies, relues chaque jour par l'extension tant que
 * Chrome est ouvert. On y voit ce qui a changé depuis le début du suivi : les
 * nouvelles pubs, celles qui s'installent, celles qui s'arrêtent.
 */

type Ligne = {
  id: string; nom: string; categorie: string | null; pageId: string; suivieDepuis: string | null; derniereVerif: string | null
  actives: number; nouvelles30: number; arretees30: number; survie: number | null
}
type PubFil = PubVeille & { premiereVue: string }
type Etat =
  | { etape: 'attente' }
  | { etape: 'en-cours'; texte: string }
  | { etape: 'fini'; bilan: { marque: string; nouvelles?: number; arretees?: number; erreur?: string }[] }
  | { etape: 'erreur'; message: string }

const ONGLETS = ['Nouvelles pubs', 'Qui s’installent', 'Arrêtées'] as const
const JOUR = 86_400_000
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—')
const ETAPES: Record<string, string> = {
  ouverture: 'ouverture de sa page', lecture: 'lecture de ses pubs', details: 'lecture des nouvelles fiches', envoi: 'enregistrement des nouveautés',
}

export default function VeillePage() {
  const [donnees, setDonnees] = useState<{ marques: Ligne[]; pubs: PubFil[]; installeeApres: number } | null>(null)
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [extension, setExtension] = useState<boolean | null>(null)
  const [etat, setEtat] = useState<Etat>({ etape: 'attente' })
  const [onglet, setOnglet] = useState<(typeof ONGLETS)[number]>(ONGLETS[0])
  const [marque, setMarque] = useState<string | null>(null)
  const secteurClient = useSecteurClient()
  const [voirTout, setVoirTout] = useState(false)
  const pourClient = (m: { id: string; categorie?: string | null }) => visiblePourClient(secteurClient, voirTout, m)

  const charger = useCallback(() => {
    fetch('/api/veille/fil').then((r) => (r.ok ? r.json() : null)).then(setDonnees)
  }, [])

  useEffect(() => {
    charger()
    fetch('/api/veille/dossiers').then((r) => (r.ok ? r.json() : null)).then((d) => d && setDossiers(d.dossiers))
    const ecoute = (e: MessageEvent) => {
      const m = e.data
      if (e.source !== window || m?.source !== 'apogee-extension') return
      if (m.type === 'presente') setExtension(true)
      else if (m.type === 'progression' && m.marque) {
        const avancement = m.total ? ` (${m.fait} / ${m.total})` : ''
        setEtat({ etape: 'en-cours', texte: `${m.marque} (${m.rang}/${m.marques}) : ${ETAPES[m.etape] ?? m.etape}${avancement}` })
      } else if (m.type === 'erreur') setEtat({ etape: 'erreur', message: m.message })
      else if (m.type === 'fini' && m.bilan) {
        setEtat({ etape: 'fini', bilan: m.bilan })
        charger()
      }
    }
    window.addEventListener('message', ecoute)
    window.postMessage({ source: 'apogee-page', type: 'ping' }, location.origin)
    const delai = setTimeout(() => setExtension((v) => v ?? false), 1500)
    return () => {
      window.removeEventListener('message', ecoute)
      clearTimeout(delai)
    }
  }, [charger])

  async function arreter(m: Ligne) {
    if (!confirm(`Arrêter la veille de ${m.nom} ? Elle ne sera plus vérifiée chaque jour ; ses pubs restent dans Discovery.`)) return
    const r = await fetch('/api/veille/suivi', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ marqueId: m.id }),
    })
    if (r.ok) charger()
  }

  function verifier() {
    setEtat({ etape: 'en-cours', texte: 'Ouverture de la Ad Library…' })
    window.postMessage({ source: 'apogee-page', type: 'veille' }, location.origin)
  }

  const maintenant = Date.now()
  const pubs = useMemo(() => {
    const toutes = (donnees?.pubs ?? []).filter((p) => (marque ? p.marque.id === marque : pourClient(p.marque)))
    if (onglet === 'Qui s’installent') {
      return toutes.filter((p) => p.active && maintenant - Date.parse(p.premiereVue) >= (donnees?.installeeApres ?? 7) * JOUR)
    }
    if (onglet === 'Arrêtées') return toutes.filter((p) => !p.active && p.fin)
    return toutes
  }, [donnees, marque, onglet, maintenant, voirTout, secteurClient.secteur, secteurClient.cachees])

  const enCours = etat.etape === 'en-cours'
  const lignes = (donnees?.marques ?? []).filter(pourClient)
  if (!donnees) return <div className="card text-center py-20 text-gray-400 text-sm">Chargement…</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Veille</h1>
          <p className="page-subtitle mt-0.5 max-w-2xl">
            Les marques suivies sont relues chaque jour par l’extension, tant que Chrome est ouvert : leurs nouvelles pubs,
            celles qui s’installent et celles qui s’arrêtent arrivent ici, avec un mail à chaque nouveauté.
          </p>
        </div>
        {donnees.marques.length > 0 && (
          <button type="button" onClick={verifier} disabled={!extension || enCours} className="btn-primary disabled:opacity-50">
            {enCours ? 'Vérification…' : 'Vérifier maintenant'}
          </button>
        )}
      </div>

      <ChoixSecteur s={secteurClient} voirTout={voirTout} setVoirTout={setVoirTout} />

      {extension === false && (
        <div className="card text-sm text-gray-600">
          L’extension Apogee Veille n’est pas détectée : sans elle, rien n’est vérifié. Installez-la ou rechargez-la (version 0.4.0),
          enregistrez de nouveau ses options, puis rechargez cette page.
        </div>
      )}
      {enCours && <div className="card text-sm text-gray-600" role="status">{etat.texte}</div>}
      {etat.etape === 'erreur' && <div className="card text-sm text-red-600" role="alert">La vérification a échoué : {etat.message}</div>}
      {etat.etape === 'fini' && (
        <div className="card text-sm text-gray-600 space-y-0.5">
          {etat.bilan.map((b) => (
            <p key={b.marque}>
              <strong className="text-[#0d0d12]">{b.marque}</strong> :{' '}
              {b.erreur ? <span className="text-red-600">{b.erreur}</span> : `${b.nouvelles} nouvelle${b.nouvelles! > 1 ? 's' : ''}, ${b.arretees} arrêtée${b.arretees! > 1 ? 's' : ''}`}
            </p>
          ))}
        </div>
      )}

      {donnees.marques.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-[#0d0d12] font-medium">Aucune marque suivie.</p>
          <p className="text-sm text-gray-400 mt-1">
            Ouvrez une marque dans <Link href="/espion" className="text-[#3434ef] hover:underline">Espion</Link> et cliquez sur
            « Activer la veille ».
          </p>
        </div>
      ) : (
        <>
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-[#E5E7EB]">
                  <th className="px-4 py-2.5 font-medium">Marque</th>
                  <th className="px-3 py-2.5 font-medium text-right">Pubs actives</th>
                  <th className="px-3 py-2.5 font-medium text-right">Nouvelles (30 j)</th>
                  <th className="px-3 py-2.5 font-medium text-right">Arrêtées (30 j)</th>
                  <th className="px-3 py-2.5 font-medium text-right" title="Part des nouveautés d’au moins une semaine qui tournent encore">Survie</th>
                  <th className="px-3 py-2.5 font-medium">Suivie depuis</th>
                  <th className="px-3 py-2.5 font-medium">Dernière vérification</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-400">Aucune marque suivie pour {secteurClient.client}.</td></tr>
                )}
                {lignes.map((m) => (
                  <tr key={m.id} className="border-b border-[#F3F4F6] last:border-0">
                    <td className="px-4 py-2.5 font-medium text-[#0d0d12]">{m.nom}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{m.actives}</td>
                    <td className="px-3 py-2.5 text-right">{m.nouvelles30 ? <span className="badge-blue">+{m.nouvelles30}</span> : <span className="text-gray-300">·</span>}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{m.arretees30 || <span className="text-gray-300">·</span>}</td>
                    <td className="px-3 py-2.5 text-right">
                      {m.survie === null ? <span className="text-gray-300">·</span> : (
                        <span className={m.survie >= 60 ? 'badge-green' : m.survie >= 30 ? 'badge-blue' : 'badge-red'}>{m.survie} %</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">{date(m.suivieDepuis)}</td>
                    <td className="px-3 py-2.5 text-gray-600">{m.derniereVerif ? date(m.derniereVerif) : 'pas encore'}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap space-x-3">
                      <Link href={`/espion?marque=${m.id}`} className="text-xs text-[#3434ef] hover:underline">Rapport</Link>
                      <button type="button" onClick={() => arreter(m)} className="text-xs text-gray-400 hover:text-red-600">Arrêter</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="flex gap-1 border-b border-[#E5E7EB]" aria-label="Fil de la veille">
              {ONGLETS.map((o) => (
                <button key={o} type="button" onClick={() => setOnglet(o)}
                  className={clsx('px-3 py-2 text-sm -mb-px border-b-2', onglet === o ? 'border-[#3434ef] text-[#3434ef] font-medium' : 'border-transparent text-gray-500 hover:text-[#0d0d12]')}>
                  {o}
                </button>
              ))}
            </nav>
            {lignes.length > 1 && (
              <select aria-label="Filtrer par marque" value={marque ?? ''} onChange={(e) => setMarque(e.target.value || null)} className="select select-chevron w-auto">
                <option value="">Toutes les marques</option>
                {lignes.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
            )}
          </div>

          {pubs.length === 0 ? (
            <div className="card text-center py-12 text-sm text-gray-400">
              {onglet === 'Nouvelles pubs'
                ? 'Aucune nouvelle pub depuis le début du suivi. Elles apparaîtront ici après les prochaines vérifications.'
                : onglet === 'Arrêtées'
                  ? 'Aucune nouveauté arrêtée pour l’instant.'
                  : `Aucune nouveauté ne tourne encore depuis plus de ${donnees.installeeApres} jours.`}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
              {pubs.map((p) => {
                const vie = Math.max(1, Math.round(((p.active || !p.fin ? maintenant : Date.parse(p.fin)) - Date.parse(p.premiereVue)) / JOUR))
                return (
                  <CartePub key={p.id} pub={p} retirer={() => setDonnees((d) => d && { ...d, pubs: d.pubs.filter((x) => x.id !== p.id) })} actions={
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">
                        Détectée le {date(p.premiereVue)} ·{' '}
                        {p.active ? <>suivie depuis {vie} j, <strong className="text-emerald-700">tourne toujours</strong></> : <>vue vivre {vie} j, <strong>arrêtée</strong></>}
                      </p>
                      <ChoixSauvegarde pub={p} dossiers={dossiers} />
                    </div>
                  } />
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
