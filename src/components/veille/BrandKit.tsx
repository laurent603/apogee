'use client'
import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

/**
 * L'onglet Brand kit de Brand Settings : tout ce que la génération de créas
 * reprend pour qu'une pub soit à la marque du client. Chaque changement
 * s'enregistre tout de suite, sans le bouton Sauvegarder de la page ; « Remplir
 * depuis le site » fait proposer la charte par Claude, à valider avant d'enregistrer.
 */

export type Guidelines = { typoTitre: string; typoTexte: string; tonDeVoix: string; motsAEmployer: string; motsAEviter: string }
type Fichier = { chemin: string; url: string }
export type Produit = { id: string; nom: string; description: string; prix: string; photos: Fichier[] }
export type Kit = {
  site: string | null
  logo: string | null
  logoClair: string | null
  couleurs: string[]
  couleursRoles: string[]
  photos: Fichier[]
  guidelines: Guidelines
  produits: Produit[]
  modeles: (Fichier & { id: string; note: string })[]
}

const ROLES = ['principale', 'secondaire', 'accent', 'fond', 'texte'] as const
const DAMIER_CLAIR = 'bg-[conic-gradient(#d1d5db_25%,#9ca3af_0_50%,#d1d5db_0_75%,#9ca3af_0)]'
const DAMIER_SOMBRE = 'bg-[conic-gradient(#1f2937_25%,#374151_0_50%,#1f2937_0_75%,#374151_0)]'

/** Le Brand kit d'un client : lu par l'onglet et par « Recréer pour ce client ». */
export function useKit(dbAccountId: string | undefined) {
  const [kit, setKit] = useState<Kit | null>(null)
  useEffect(() => {
    setKit(null)
    if (!dbAccountId) return
    fetch(`/api/brand-settings/kit?dbAccountId=${dbAccountId}`).then((r) => (r.ok ? r.json() : null)).then(setKit)
  }, [dbAccountId])
  return [kit, setKit] as const
}

/** Ce qui manque au kit pour que les créas soient vraiment à la marque. */
export function manques(kit: Kit) {
  const points: [boolean, string][] = [
    [!!kit.logo, 'logo'],
    [!!kit.logoClair, 'logo pour fonds sombres'],
    [kit.couleurs.length >= 2, 'deux couleurs'],
    [!!kit.guidelines.typoTitre, 'typographie des titres'],
    [!!kit.guidelines.tonDeVoix, 'ton de voix'],
    [!!(kit.guidelines.motsAEmployer || kit.guidelines.motsAEviter), 'vocabulaire'],
    [kit.photos.length >= 3, 'trois photos réelles'],
    [kit.produits.length > 0, 'un produit'],
    [kit.modeles.length > 0, 'une créa modèle'],
  ]
  return { score: Math.round((points.filter(([ok]) => ok).length / points.length) * 100), manque: points.filter(([ok]) => !ok).map(([, l]) => l) }
}

/** Charge la police depuis Google Fonts pour l'aperçu ; sans effet si ce n'est pas une police Google. */
function usePolice(nom: string) {
  useEffect(() => {
    const famille = nom.split(',')[0].trim()
    if (!famille) return
    const id = `police-${famille.replace(/\W+/g, '-')}`
    if (document.getElementById(id)) return
    const lien = Object.assign(document.createElement('link'), {
      id, rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(famille).replace(/%20/g, '+')}:wght@400;700&display=swap`,
    })
    document.head.appendChild(lien)
  }, [nom])
}

function Carte({ titre, aide, children, className }: { titre: string; aide?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-xl border border-[#E5E7EB] p-4 space-y-3', className)}>
      <div>
        <p className="text-sm font-semibold text-[#0d0d12]">{titre}</p>
        {aide && <p className="text-[11px] text-gray-400 mt-0.5">{aide}</p>}
      </div>
      {children}
    </section>
  )
}

function Deposer({ libelle, multiple, envoi, onFichiers }: { libelle: string; multiple?: boolean; envoi: boolean; onFichiers: (f: FileList | null) => void }) {
  return (
    <label className="inline-block text-xs text-[#3434ef] hover:underline cursor-pointer">
      {envoi ? 'Envoi…' : libelle}
      <input type="file" accept="image/png,image/jpeg,image/webp" multiple={multiple} className="sr-only" disabled={envoi}
        onChange={(e) => { onFichiers(e.target.files); e.target.value = '' }} />
    </label>
  )
}

function Vignette({ url, retirer, carre = true }: { url: string; retirer: () => void; carre?: boolean }) {
  return (
    <div className={clsx('relative rounded-md overflow-hidden bg-gray-50 group', carre && 'aspect-square')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-full w-full object-cover" />
      <button type="button" onClick={retirer} aria-label="Retirer"
        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-white/90 text-xs text-gray-600 hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100">×</button>
    </div>
  )
}

/** Un champ texte enregistré quand on le quitte, s'il a changé. */
function Champ({ libelle, valeur, exemple, long, enregistrer }: { libelle: string; valeur: string; exemple?: string; long?: boolean; enregistrer: (v: string) => void }) {
  const props = {
    defaultValue: valeur, placeholder: exemple, 'aria-label': libelle, maxLength: long ? 1000 : 400,
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (e.target.value.trim() !== valeur) enregistrer(e.target.value) },
    className: 'input text-sm',
  }
  return (
    <label className="block space-y-1">
      <span className="text-xs text-gray-500">{libelle}</span>
      {/* La clé suit la valeur : un kit rechargé (import du site) remplace ce qui était affiché. */}
      {long ? <textarea key={valeur} rows={2} {...props} /> : <input key={valeur} {...props} />}
    </label>
  )
}

function ApercuPolice({ nom, role }: { nom: string; role: string }) {
  usePolice(nom)
  return (
    <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
      <span className="text-3xl text-[#0d0d12]" style={{ fontFamily: nom ? `'${nom.split(',')[0].trim()}', sans-serif` : undefined }}>Aa</span>
      <span className="text-xs text-gray-500">{role}<br /><span className="text-[#0d0d12]">{nom || 'non définie'}</span></span>
    </div>
  )
}

export function BrandKit({ dbAccountId, apresIdentite }: { dbAccountId: string; apresIdentite?: () => void }) {
  const [kit, setKit] = useKit(dbAccountId)
  const [envoi, setEnvoi] = useState<string | null>(null)
  const [couleurs, setCouleurs] = useState<{ hex: string; role: string }[] | null>(null)
  const premier = useRef(true)

  useEffect(() => {
    if (kit && couleurs === null) setCouleurs(kit.couleurs.map((hex, i) => ({ hex, role: kit.couleursRoles[i] ?? '' })))
  }, [kit, couleurs])

  // Les couleurs partent 600 ms après le dernier changement : le sélecteur en émet un par mouvement.
  useEffect(() => {
    if (couleurs === null) return
    if (premier.current) return void (premier.current = false)
    const t = setTimeout(() => patcher({ couleurs: couleurs.map((c) => c.hex), couleursRoles: couleurs.map((c) => c.role) }), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couleurs])

  async function patcher(corps: object) {
    const r = await fetch('/api/brand-settings/kit', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dbAccountId, ...corps }) })
    if (!r.ok) return void toast.error('Brand kit non enregistré')
    setKit(await r.json())
  }

  async function deposer(quoi: string, fichiers: FileList | null, extra: Record<string, string> = {}) {
    if (!fichiers?.length) return
    setEnvoi(quoi + (extra.produitId ?? ''))
    for (const fichier of Array.from(fichiers)) {
      const form = new FormData()
      for (const [k, v] of Object.entries({ dbAccountId, quoi, ...extra })) form.set(k, v)
      form.set('fichier', fichier)
      const r = await fetch('/api/brand-settings/kit', { method: 'POST', body: form })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.erreur || `${fichier.name} non envoyé`); break }
      setKit(j)
    }
    setEnvoi(null)
  }

  async function recharger() {
    const r = await fetch(`/api/brand-settings/kit?dbAccountId=${dbAccountId}`)
    if (!r.ok) return
    const k: Kit = await r.json()
    setKit(k)
    setCouleurs(k.couleurs.map((hex, i) => ({ hex, role: k.couleursRoles[i] ?? '' })))
    premier.current = true
  }

  if (!kit || couleurs === null) return <p className="text-xs text-gray-400">Chargement du Brand kit…</p>
  const { score, manque } = manques(kit)
  const g = kit.guidelines

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2 min-w-[260px] flex-1">
          <p className="text-sm font-semibold text-[#0d0d12]">Brand kit · complet à {score} %</p>
          <div className="h-1.5 max-w-md rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-[#3434ef]" style={{ width: `${score}%` }} /></div>
          <p className="text-xs text-gray-500">
            {manque.length ? `Manque : ${manque.join(', ')}.` : 'Tout y est.'} Repris par « Recréer » (fiche d’une pub) : copie au plus près, ou nouveaux concepts à la marque.
          </p>
        </div>
        <ImportSite dbAccountId={dbAccountId} site={kit.site} apresEnregistrement={(identite) => { recharger(); if (identite) apresIdentite?.() }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Carte titre="Logos" aide="PNG à fond transparent de préférence.">
          <div className="grid grid-cols-2 gap-3">
            {([['logo', 'Principal', kit.logo, DAMIER_CLAIR, 'retirerLogo'], ['logoClair', 'Pour fonds sombres', kit.logoClair, DAMIER_SOMBRE, 'retirerLogoClair']] as const).map(([quoi, titre, url, damier, retirer]) => (
              <div key={quoi} className="space-y-2">
                <p className="text-xs text-gray-500">{titre}</p>
                <div className={clsx('h-20 rounded-lg flex items-center justify-center overflow-hidden bg-[length:16px_16px]', damier)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {url ? <img src={url} alt={titre} className="max-h-16 max-w-[80%] object-contain" /> : <span className="text-xs text-gray-400">Aucun</span>}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <Deposer libelle={url ? 'Remplacer' : 'Déposer'} envoi={envoi === quoi} onFichiers={(f) => deposer(quoi, f)} />
                  {url && <button type="button" onClick={() => patcher({ [retirer]: true })} className="text-gray-400 hover:text-red-600">Retirer</button>}
                </div>
              </div>
            ))}
          </div>
        </Carte>

        <Carte titre="Couleurs" aide="Chacune avec son rôle, la principale d’abord.">
          <div className="space-y-2">
            {couleurs.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="color" value={c.hex} aria-label={`Couleur ${i + 1}`} onChange={(e) => setCouleurs(couleurs.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))}
                  className="h-8 w-8 cursor-pointer rounded-md border border-[#E5E7EB] bg-transparent p-0" />
                <span className="w-16 text-xs font-mono text-gray-600">{c.hex}</span>
                <select value={c.role} aria-label={`Rôle de ${c.hex}`} onChange={(e) => setCouleurs(couleurs.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}
                  className="select select-chevron w-auto py-1 text-xs">
                  <option value="">Rôle…</option>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button type="button" onClick={() => setCouleurs(couleurs.filter((_, j) => j !== i))} aria-label={`Retirer ${c.hex}`} className="text-gray-400 hover:text-red-600">×</button>
              </div>
            ))}
          </div>
          {couleurs.length < 6 && (
            <button type="button" onClick={() => setCouleurs([...couleurs, { hex: '#0076ff', role: couleurs.length ? '' : 'principale' }])} className="text-xs text-[#3434ef] hover:underline">
              + Ajouter une couleur
            </button>
          )}
        </Carte>

        <Carte titre="Typographies" aide="Le modèle d’image imite le style de la police sans pouvoir la charger : vérifiez le rendu.">
          <div className="grid grid-cols-2 gap-2">
            <ApercuPolice nom={g.typoTitre} role="Titres" />
            <ApercuPolice nom={g.typoTexte} role="Textes" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Champ libelle="Police des titres" valeur={g.typoTitre} exemple="ex. Montserrat" enregistrer={(v) => patcher({ typoTitre: v })} />
            <Champ libelle="Police des textes" valeur={g.typoTexte} exemple="ex. Open Sans" enregistrer={(v) => patcher({ typoTexte: v })} />
          </div>
        </Carte>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Carte titre="Ton et vocabulaire" aide="Repris dans chaque texte écrit pour la marque.">
          <Champ libelle="Ton de voix" valeur={g.tonDeVoix} exemple="ex. professionnel, rassurant, proche" enregistrer={(v) => patcher({ tonDeVoix: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Champ libelle="Mots à employer" long valeur={g.motsAEmployer} exemple="ex. autoconsommation, étude gratuite" enregistrer={(v) => patcher({ motsAEmployer: v })} />
            <Champ libelle="Mots à éviter" long valeur={g.motsAEviter} exemple="ex. gratuit, pas cher, arnaque" enregistrer={(v) => patcher({ motsAEviter: v })} />
          </div>
        </Carte>

        <Carte titre="Photos réelles" aide="Chantiers, équipe, produit en situation : 8 au plus. Elles remplacent les visuels inventés.">
          <div className="grid grid-cols-4 gap-2">
            {kit.photos.map((p) => <Vignette key={p.chemin} url={p.url} retirer={() => patcher({ retirerPhoto: p.chemin })} />)}
          </div>
          {kit.photos.length < 8 && <Deposer libelle="+ Ajouter des photos" multiple envoi={envoi === 'photo'} onFichiers={(f) => deposer('photo', f)} />}
        </Carte>
      </div>

      <Carte titre="Produits et offres" aide="À choisir dans Recréer pour qu’un concept le mette en avant, avec sa photo et son prix tel qu’affiché.">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {kit.produits.map((p) => (
            <div key={p.id} className="rounded-lg border border-[#E5E7EB] p-3 space-y-2">
              <div className="grid grid-cols-4 gap-1.5">
                {p.photos.map((ph) => <Vignette key={ph.chemin} url={ph.url} retirer={() => patcher({ produitId: p.id, retirerPhotoProduit: ph.chemin })} />)}
              </div>
              {p.photos.length < 4 && <Deposer libelle="+ Photo" envoi={envoi === `produitPhoto${p.id}`} onFichiers={(f) => deposer('produitPhoto', f, { produitId: p.id })} />}
              <Champ libelle="Nom" valeur={p.nom} enregistrer={(v) => patcher({ produit: { ...p, nom: v } })} />
              <Champ libelle="Description" long valeur={p.description} enregistrer={(v) => patcher({ produit: { ...p, description: v } })} />
              <div className="flex items-end gap-2">
                <div className="flex-1"><Champ libelle="Prix affiché" valeur={p.prix} exemple="ex. dès 79 €/mois" enregistrer={(v) => patcher({ produit: { ...p, prix: v } })} /></div>
                <button type="button" onClick={() => patcher({ retirerProduit: p.id })} className="pb-2 text-xs text-gray-400 hover:text-red-600">Retirer</button>
              </div>
            </div>
          ))}
        </div>
        {kit.produits.length < 12 && (
          <button type="button" onClick={() => patcher({ produit: { nom: 'Nouveau produit' } })} className="text-xs text-[#3434ef] hover:underline">+ Ajouter un produit</button>
        )}
      </Carte>

      <Carte titre="Créas modèles" aide="Des pubs du client qui marchent : les nouveaux concepts reprennent leur style graphique, pas leurs textes. 6 au plus.">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {kit.modeles.map((m) => (
            <div key={m.id} className="space-y-1.5">
              <Vignette url={m.url} retirer={() => patcher({ retirerModele: m.id })} />
              <Champ libelle="Ce qui marche" valeur={m.note} exemple="ex. photo client, chiffre en gros" enregistrer={(v) => patcher({ modeleId: m.id, note: v })} />
            </div>
          ))}
        </div>
        {kit.modeles.length < 6 && <Deposer libelle="+ Ajouter des créas" multiple envoi={envoi === 'modele'} onFichiers={(f) => deposer('modele', f)} />}
      </Carte>
    </div>
  )
}

type Proposition = {
  proposition: {
    nom: string; slogan: string; description: string; proposition: string; logo: number; logoClair: number
    couleurs: { hex: string; role: string }[]; typoTitre: string; typoTexte: string; tonDeVoix: string
    motsAEmployer: string[]; motsAEviter: string[]; produits: { nom: string; description: string; prix: string; photo: number }[]
    photos: number[]; remarques: string
  }
  logos: Fichier[]
  photos: Fichier[]
}
const SECTIONS = [['identite', 'Identité'], ['logos', 'Logos'], ['couleurs', 'Couleurs'], ['typos', 'Typographies'], ['ton', 'Ton et vocabulaire'], ['photos', 'Photos'], ['produits', 'Produits']] as const

/** « Remplir depuis le site » : Claude propose, on coche ce qu'on garde, puis on enregistre. */
function ImportSite({ dbAccountId, site, apresEnregistrement }: { dbAccountId: string; site: string | null; apresEnregistrement: (identite: boolean) => void }) {
  const [url, setUrl] = useState(site ?? '')
  const [etat, setEtat] = useState<'repos' | 'analyse' | 'enregistrement'>('repos')
  const [res, setRes] = useState<Proposition | null>(null)
  const [gardees, setGardees] = useState<string[]>(SECTIONS.map(([k]) => k))
  const [photos, setPhotos] = useState<number[]>([])
  const [produits, setProduits] = useState<number[]>([])
  const [logo, setLogo] = useState(-1)
  const [logoClair, setLogoClair] = useState(-1)

  async function analyser() {
    setEtat('analyse')
    const r = await fetch('/api/brand-settings/kit/site', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dbAccountId, url }) })
    const j = await r.json().catch(() => ({}))
    setEtat('repos')
    if (!r.ok) return void toast.error(j.erreur || 'Analyse impossible', { duration: 8000 })
    setRes(j)
    setPhotos(j.proposition.photos)
    setProduits(j.proposition.produits.map((_: unknown, i: number) => i))
    setLogo(j.proposition.logo)
    setLogoClair(j.proposition.logoClair)
  }

  async function enregistrer() {
    if (!res) return
    const p = res.proposition
    const garde = (k: string) => gardees.includes(k)
    setEtat('enregistrement')
    const choix = {
      ...(garde('identite') && { identite: { nom: p.nom, description: p.description, proposition: p.proposition } }),
      ...(garde('logos') && { logo: res.logos[logo]?.chemin, logoClair: res.logos[logoClair]?.chemin }),
      ...(garde('couleurs') && { couleurs: p.couleurs }),
      ...(garde('typos') && { typos: { typoTitre: p.typoTitre, typoTexte: p.typoTexte } }),
      ...(garde('ton') && { ton: { tonDeVoix: p.tonDeVoix, motsAEmployer: p.motsAEmployer, motsAEviter: p.motsAEviter } }),
      ...(garde('photos') && { photos: photos.map((i) => res.photos[i]?.chemin).filter(Boolean) }),
      ...(garde('produits') && { produits: produits.map((i) => ({ ...p.produits[i], photo: res.photos[p.produits[i].photo]?.chemin ?? null })) }),
    }
    const r = await fetch('/api/brand-settings/kit/site', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dbAccountId, choix }) })
    setEtat('repos')
    if (!r.ok) return void toast.error('Enregistrement impossible')
    toast.success('Brand kit mis à jour depuis le site')
    setRes(null)
    apresEnregistrement(garde('identite'))
  }

  const bascule = <T,>(liste: T[], v: T) => (liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v])
  const p = res?.proposition

  return (
    <div className="w-full lg:w-auto space-y-3">
      <div className="flex items-center gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://site-du-client.fr" aria-label="Site du client" className="input w-64 text-sm" />
        <button type="button" onClick={analyser} disabled={etat !== 'repos' || !url.trim()} className="btn-primary shrink-0 disabled:opacity-50">
          {etat === 'analyse' ? 'Lecture du site…' : 'Remplir depuis le site'}
        </button>
      </div>
      {etat === 'analyse' && <p className="text-xs text-gray-400">Claude lit le site, son CSS et ses images : 30 secondes à une minute.</p>}

      {p && res && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRes(null)}>
          <div role="dialog" aria-modal="true" aria-label="Charte proposée" onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-2xl bg-white p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-[#0d0d12]">Charte proposée par Claude</p>
                <p className="text-xs text-gray-500">Décochez ce que vous ne voulez pas garder. Les logos et photos choisis s’ajoutent au kit ; les produits s’ajoutent à la liste.</p>
              </div>
              <button type="button" onClick={() => setRes(null)} aria-label="Fermer" className="text-2xl leading-none text-gray-400 hover:text-[#0d0d12]">×</button>
            </div>

            {SECTIONS.map(([k, titre]) => (
              <section key={k} className={clsx('rounded-xl border p-4 space-y-3', gardees.includes(k) ? 'border-[#3434ef]/40' : 'border-[#E5E7EB] opacity-50')}>
                <label className="flex items-center gap-2 text-sm font-semibold text-[#0d0d12]">
                  <input type="checkbox" checked={gardees.includes(k)} onChange={() => setGardees(bascule(gardees, k))} /> {titre}
                </label>
                {k === 'identite' && (
                  <div className="text-sm text-gray-700 space-y-1">
                    <p><strong>{p.nom}</strong>{p.slogan && <> · « {p.slogan} »</>}</p>
                    <p>{p.description}</p>
                    <p className="text-gray-500">{p.proposition}</p>
                    <p className="text-[11px] text-gray-400">Remplace le nom, la description et la proposition de valeur de l’onglet « Le client ».</p>
                  </div>
                )}
                {k === 'logos' && (
                  <div className="space-y-2">
                    {([['Principal', logo, setLogo, DAMIER_CLAIR], ['Pour fonds sombres', logoClair, setLogoClair, DAMIER_SOMBRE]] as const).map(([titreLogo, choisi, choisir, damier]) => (
                      <div key={titreLogo} className="flex flex-wrap items-center gap-2">
                        <span className="w-32 text-xs text-gray-500">{titreLogo}</span>
                        {res.logos.map((l, i) => (
                          <button key={l.chemin} type="button" onClick={() => choisir(choisi === i ? -1 : i)} aria-pressed={choisi === i}
                            className={clsx('h-14 w-24 rounded-md flex items-center justify-center bg-[length:12px_12px] border-2', damier, choisi === i ? 'border-[#3434ef]' : 'border-transparent')}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={l.url} alt="" className="max-h-12 max-w-[90%] object-contain" />
                          </button>
                        ))}
                        {!res.logos.length && <span className="text-xs text-gray-400">Aucun logo trouvé</span>}
                      </div>
                    ))}
                  </div>
                )}
                {k === 'couleurs' && (
                  <div className="flex flex-wrap gap-3">
                    {p.couleurs.map((c) => (
                      <div key={c.hex} className="flex items-center gap-2 text-xs">
                        <span className="h-8 w-8 rounded-md border border-[#E5E7EB]" style={{ background: c.hex }} />
                        <span><span className="font-mono">{c.hex}</span><br /><span className="text-gray-500">{c.role}</span></span>
                      </div>
                    ))}
                  </div>
                )}
                {k === 'typos' && (
                  <div className="grid grid-cols-2 gap-2 max-w-md">
                    <ApercuPolice nom={p.typoTitre} role="Titres" />
                    <ApercuPolice nom={p.typoTexte} role="Textes" />
                  </div>
                )}
                {k === 'ton' && (
                  <div className="text-sm text-gray-700 space-y-1">
                    <p>{p.tonDeVoix}</p>
                    {p.motsAEmployer.length > 0 && <p className="text-xs"><span className="text-gray-500">À employer :</span> {p.motsAEmployer.join(', ')}</p>}
                    {p.motsAEviter.length > 0 && <p className="text-xs"><span className="text-gray-500">À éviter :</span> {p.motsAEviter.join(', ')}</p>}
                  </div>
                )}
                {k === 'photos' && (
                  <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                    {res.photos.map((ph, i) => (
                      <button key={ph.chemin} type="button" onClick={() => setPhotos(bascule(photos, i))} aria-pressed={photos.includes(i)}
                        className={clsx('relative aspect-square rounded-md overflow-hidden border-2', photos.includes(i) ? 'border-[#3434ef]' : 'border-transparent opacity-50')}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ph.url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                {k === 'produits' && (
                  <div className="space-y-2">
                    {p.produits.map((pr, i) => (
                      <label key={i} className="flex items-start gap-3 text-sm">
                        <input type="checkbox" className="mt-1" checked={produits.includes(i)} onChange={() => setProduits(bascule(produits, i))} />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {res.photos[pr.photo] && <img src={res.photos[pr.photo].url} alt="" className="h-12 w-12 rounded object-cover" />}
                        <span><strong>{pr.nom}</strong>{pr.prix && <> · {pr.prix}</>}<br /><span className="text-xs text-gray-500">{pr.description}</span></span>
                      </label>
                    ))}
                    {!p.produits.length && <p className="text-xs text-gray-400">Aucun produit présenté sur le site.</p>}
                  </div>
                )}
              </section>
            ))}

            {p.remarques && <p className="text-xs text-gray-500">À savoir : {p.remarques}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRes(null)} className="btn-secondary">Annuler</button>
              <button type="button" onClick={enregistrer} disabled={etat !== 'repos' || !gardees.length} className="btn-primary disabled:opacity-50">
                {etat === 'enregistrement' ? 'Enregistrement…' : 'Enregistrer la sélection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
