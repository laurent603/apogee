'use client'

import { useEffect, useState } from 'react'
import { CartePub, ChoixSauvegarde, joursDeDiffusion, type Dossier, type PubVeille } from '@/components/veille/CartePub'
import { FichePub, voisines } from '@/components/veille/FichePub'
import { ChoixSecteur, useSecteurClient } from '@/components/veille/SecteurClient'
import { MotsClesCollecte } from '@/components/veille/MotsClesCollecte'
import { FiltrePastille, type Plage } from '@/components/veille/FiltrePastille'

/**
 * Toutes les pubs concurrentes collectées : celles sauvegardées avec
 * l'extension, et demain celles que la veille ramène chaque nuit.
 */

const PAR_PAGE = 60

type Option = [valeur: string, libelle: string]

/** Les filtres à choix fixes ; `multiple` : plusieurs choix à la fois ; `plage` : minimum et maximum libres (« 7..30 »). */
const FILTRES: Record<string, { libelle: string; multiple?: boolean; plage?: Plage; options: Option[] }> = {
  format: { libelle: 'Type de média', multiple: true, options: [['IMAGE', 'Image'], ['VIDEO', 'Vidéo'], ['CAROUSEL', 'Carrousel'], ['DCO', 'Multi-version'], ['DPA', 'Catalogue'], ['AUTRE', 'Autre']] },
  statut: { libelle: 'Statut', options: [['active', 'Active'], ['inactive', 'Inactive']] },
  rang: { libelle: 'Rang', options: [['1', 'N°1 de sa marque'], ['3', 'Top 3 de sa marque'], ['10', 'Top 10 de sa marque']] },
  duree: { libelle: 'Jours de diffusion', plage: { unite: 'j' }, options: [['7..', '7 j et plus'], ['30..', '30 j et plus'], ['90..', '90 j et plus'], ['180..', '180 j et plus']] },
  lancement: { libelle: 'Date de lancement', plage: { unite: '', date: true }, options: [['7', '7 derniers jours'], ['30', '30 derniers jours'], ['90', '90 derniers jours'], ['180', '6 derniers mois'], ['365', '12 derniers mois']] },
  plateforme: { libelle: 'Plateformes', multiple: true, options: [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['messenger', 'Messenger'], ['audience_network', 'Audience Network'], ['threads', 'Threads']] },
  derniere: { libelle: 'Dernière diffusion', options: [['7', 'Arrêtée depuis moins de 7 j'], ['30', 'Arrêtée depuis moins de 30 j'], ['90', 'Arrêtée depuis moins de 90 j']] },
  longueur: { libelle: 'Longueur du texte', plage: { unite: 'car.' }, options: [['..124', 'Court (moins de 125)'], ['125..500', 'Moyen (125 à 500)'], ['501..', 'Long (plus de 500)']] },
  copies: { libelle: 'Copies de la créa', plage: { unite: 'copies' }, options: [['1..1', 'Unique'], ['2..', 'Réutilisée (2 et plus)'], ['5..', 'Déclinée (5 et plus)']] },
  age: { libelle: 'Âge ciblé', plage: { unite: 'ans' }, options: [['25..', '25 ans et plus'], ['30..', '30 ans et plus'], ['35..', '35 ans et plus'], ['45..', '45 ans et plus']] },
}
/** La barre de filtres, rangée par thème. */
const GROUPES: [titre: string, cles: string[]][] = [
  ['Annonceur', ['categorie', 'marque', 'page']],
  ['Diffusion', ['lancement', 'statut', 'duree', 'derniere', 'rang']],
  ['Ciblage', ['pays', 'age']],
  ['Créa', ['plateforme', 'format', 'copies', 'cta', 'longueur']],
]
const TRIS: Option[] = [
  ['', 'Plus récentes'], ['depenseJour', 'Plus forte dépense / jour'], ['couverture', 'Plus forte dépense totale (couverture)'],
  ['rang', 'Meilleur rang dans sa marque'], ['duree', 'Diffusées le plus longtemps'],
]

type Filtres = Record<string, string>
const AUCUN: Filtres = Object.fromEntries([...GROUPES.flatMap(([, cles]) => cles), 'tri'].map((c) => [c, '']))
type OptionsDonnees = { ctas: { valeur: string; n: number }[]; pages: { valeur: string; n: number }[]; pays: { valeur: string; n: number }[] }

/** L'onglet « Toutes les pubs » de la Bibliothèque : tout ce que les scans, la veille et la collecte ont ramené. */
export function ToutesLesPubs() {
  const [q, setQ] = useState('')
  const [recherche, setRecherche] = useState('')
  const [filtres, setFiltres] = useState<Filtres>(AUCUN)
  const [n, setN] = useState(PAR_PAGE)
  const [donnees, setDonnees] = useState<{
    pubs: PubVeille[]; total: number; marques: { id: string; nom: string; categorie: string | null }[]; categories: { libelle: string; n: number }[]
    options: OptionsDonnees
  } | null>(null)
  const [rafraichir, setRafraichir] = useState(0)
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [chargement, setChargement] = useState(true)
  const [ouverte, setOuverte] = useState<PubVeille | null>(null)
  const secteurClient = useSecteurClient()
  const { secteur } = secteurClient

  // Le client sélectionné ouvre la liste sur son secteur ; effacer la pastille Secteur montre le reste.
  useEffect(() => {
    if (secteur !== undefined) setFiltres((f) => ({ ...f, categorie: secteur ?? '' }))
  }, [secteur])

  // La recherche part 300 ms après la dernière frappe.
  useEffect(() => {
    const t = setTimeout(() => { setRecherche(q.trim()); setN(PAR_PAGE) }, 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    if (secteur === undefined) return
    const params = new URLSearchParams({ n: String(n), ...(recherche && { q: recherche }), ...(secteurClient.compte && { compte: secteurClient.compte }) })
    for (const [k, v] of Object.entries(filtres)) if (v) params.set(k, v)
    setChargement(true)
    // Une réponse arrivée après une requête plus récente est ignorée.
    let actuelle = true
    fetch(`/api/veille/pubs?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (actuelle) { setDonnees(d); setChargement(false) } })
      .catch(() => actuelle && setChargement(false))
    return () => { actuelle = false }
  }, [recherche, filtres, n, rafraichir, secteur])

  useEffect(() => {
    fetch('/api/veille/dossiers').then((r) => (r.ok ? r.json() : null)).then((d) => d && setDossiers(d.dossiers))
    // Les marques pas encore classées le sont à l'ouverture ; on recharge si c'est le cas.
    fetch('/api/veille/marques/categoriser', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.classees && setRafraichir((x) => x + 1))
  }, [])

  const [panneau, setPanneau] = useState(true)

  function filtrer(cle: string, valeur: string) {
    setFiltres((f) => ({ ...f, [cle]: valeur }))
    setN(PAR_PAGE)
  }

  const actifs = Object.values(filtres).some(Boolean) || !!recherche
  const nActifs = GROUPES.flatMap(([, cles]) => cles).filter((c) => filtres[c]).length
  const avecN = (l?: { valeur: string; n: number }[]) => (l ?? []).map((o) => ({ valeur: o.valeur, libelle: o.valeur, n: o.n }))
  const dynamiques: Record<string, { libelle: string; multiple?: boolean; options: { valeur: string; libelle: string; n?: number }[] }> = {
    categorie: { libelle: 'Secteur', options: (donnees?.categories ?? []).map((c) => ({ valeur: c.libelle, libelle: c.libelle, n: c.n })) },
    marque: {
      libelle: 'Marque',
      options: (donnees?.marques ?? []).filter((m) => !filtres.categorie || m.categorie === filtres.categorie).map((m) => ({ valeur: m.id, libelle: m.nom })),
    },
    page: { libelle: 'Landing pages', multiple: true, options: avecN(donnees?.options.pages) },
    pays: { libelle: 'Pays', multiple: true, options: avecN(donnees?.options.pays) },
    cta: { libelle: 'Bouton (CTA)', multiple: true, options: avecN(donnees?.options.ctas) },
  }
  const pastille = (cle: string) => {
    const def = dynamiques[cle] ?? { ...FILTRES[cle], options: FILTRES[cle].options.map(([valeur, libelle]) => ({ valeur, libelle })) }
    return <FiltrePastille key={cle} libelle={def.libelle} multiple={def.multiple} plage={FILTRES[cle]?.plage} options={def.options} valeur={filtres[cle] ?? ''} onChange={(v) => filtrer(cle, v)} />
  }
  const pubs = donnees?.pubs ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="page-subtitle">
          {donnees ? `${donnees.total} pub${donnees.total > 1 ? 's' : ''} concurrente${donnees.total > 1 ? 's' : ''}` : 'Les pubs concurrentes collectées'}
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un mot, une marque…"
          aria-label="Rechercher dans les pubs"
          className="input w-auto min-w-[260px]"
        />
      </div>

      <ChoixSecteur s={secteurClient} />

      <MotsClesCollecte />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPanneau(!panneau)} aria-expanded={panneau}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3 py-1 text-[13px] font-medium text-[#0d0d12] hover:border-gray-300">
            <svg className="h-3.5 w-3.5 opacity-60" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M3 4.75A.75.75 0 013.75 4h12.5a.75.75 0 01.53 1.28L12 10.06v4.19a.75.75 0 01-.33.62l-2.5 1.67A.75.75 0 018 15.92v-5.86L3.22 5.28A.75.75 0 013 4.75z" />
            </svg>
            Filtres
            {nActifs > 0 && <span className="rounded-full bg-[#3434ef] px-1.5 text-[11px] leading-4 text-white">{nActifs}</span>}
            <span className="font-normal text-gray-400">{panneau ? 'Masquer' : 'Afficher'}</span>
          </button>
          <label className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-white pl-3 text-[13px] text-gray-500">
            Tri :
            <select aria-label="Tri" value={filtres.tri} onChange={(e) => filtrer('tri', e.target.value)}
              className="select-chevron cursor-pointer appearance-none [field-sizing:content] rounded-full bg-transparent py-1 pl-0.5 pr-8 font-medium text-[#0d0d12] focus:outline-none">
              {TRIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {actifs && (
            <button type="button" onClick={() => { setFiltres(AUCUN); setQ('') }} className="text-xs text-[#3434ef] hover:underline">
              Effacer les filtres
            </button>
          )}
        </div>
        {panneau && (
          <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-xl border border-[#E5E7EB] bg-gray-50/70 px-4 py-3">
            {GROUPES.map(([titre, cles]) => (
              <div key={titre} role="group" aria-label={titre} className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs font-medium text-gray-500">{titre}</span>
                {cles.map(pastille)}
              </div>
            ))}
          </div>
        )}
      </div>

      {chargement && !donnees && <div className="card text-center py-20 text-gray-400 text-sm">Chargement…</div>}

      {donnees && pubs.length === 0 && (
        <div className="card text-center py-16">
          <p className="text-[#0d0d12] font-medium">{actifs ? 'Aucune pub pour ces filtres.' : 'Aucune pub collectée pour l’instant.'}</p>
          <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
            Les pubs arrivent ici quand on les sauvegarde depuis la Meta Ad Library avec l’extension Apogee Veille.
          </p>
        </div>
      )}

      {pubs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          {pubs.map((pub) => (
            <CartePub
              key={pub.id}
              pub={pub}
              actions={<ChoixSauvegarde pub={pub} dossiers={dossiers} />}
              ouvrir={() => setOuverte(pub)}
              retirer={() => setDonnees((d) => d && { ...d, pubs: d.pubs.filter((x) => x.id !== pub.id), total: d.total - 1 })}
            />
          ))}
        </div>
      )}

      {donnees && pubs.length < donnees.total && (
        <div className="text-center">
          <button type="button" onClick={() => setN(n + PAR_PAGE)} disabled={chargement} className="btn-secondary">
            {chargement ? 'Chargement…' : `Charger plus (${donnees.total - pubs.length} restantes)`}
          </button>
        </div>
      )}
      {ouverte && (
        <FichePub pub={ouverte} jours={joursDeDiffusion(ouverte)} actions={<ChoixSauvegarde pub={ouverte} dossiers={dossiers} />}
          fermer={() => setOuverte(null)} {...voisines(pubs, ouverte, setOuverte)} ouvrir={setOuverte}
          apresMasquage={() => setDonnees((d) => d && { ...d, pubs: d.pubs.filter((x) => x.id !== ouverte.id), total: d.total - 1 })} />
      )}
    </div>
  )
}
