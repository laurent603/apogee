'use client'
import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { EUROS_POUR_MILLE_PERSONNES, budgetEstime } from '@/lib/veille/adLibrary'
import { rapportMarque } from '@/lib/veille/rapport'
import { ChoixSauvegarde, joursDeDiffusion, type Dossier, type PubVeille } from './CartePub'
import { Barre, FichePub, compact } from './FichePub'

/**
 * Le rapport Espion d'une marque : ses pubs actives en chiffres, comme le
 * fait Créabase. Tout se calcule à partir des pubs en base ; la couverture et
 * l'audience n'existent que pour les pubs lues par la seconde passe (extension
 * 0.3.0 et suivantes).
 */

const ONGLETS = ['Vue d’ensemble', 'Stratégie créa', 'Offre & landing', 'Diffusion'] as const
const FORMATS: Record<string, string> = { IMAGE: 'Image', VIDEO: 'Vidéo', CAROUSEL: 'Carrousel', DCO: 'Dynamique' }
const pourcent = (x: number) => `${Math.round(100 * x)} %`
const mois = (aaaamm: string) => new Date(`${aaaamm}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

function Bloc({ titre, sousTitre, children, className }: { titre: string; sousTitre?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx('card space-y-3', className)}>
      <div>
        <h3 className="font-semibold text-[#0d0d12]">{titre}</h3>
        {sousTitre && <p className="text-xs text-gray-500 mt-0.5">{sousTitre}</p>}
      </div>
      {children}
    </section>
  )
}

function Indicateur({ libelle, valeur, note }: { libelle: string; valeur: string; note?: string }) {
  return (
    <div className="card">
      <p className="text-xs text-gray-500">{libelle}</p>
      <p className="text-2xl font-bold text-[#0d0d12] mt-1">{valeur}</p>
      {note && <p className="text-xs text-gray-400 mt-0.5">{note}</p>}
    </div>
  )
}

function Vide({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400">{children}</p>
}

/** Vignette d'une pub dans un classement ; un clic ouvre sa fiche. */
function Vignette({ pub, etiquette, ouvrir }: { pub: PubVeille; etiquette: string; ouvrir: () => void }) {
  const media = pub.medias[0]
  const budget = budgetEstime(pub.reachUe)
  const image = media?.type === 'video' ? media.apercu : media?.url
  return (
    <button type="button" onClick={ouvrir} className="text-left rounded-xl border border-[#E5E7EB] overflow-hidden hover:border-gray-300 bg-white">
      <div className="relative aspect-[4/5] bg-gray-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />}
        {budget !== null && <span className="badge-green absolute top-2 left-2">≈ {compact(budget)} €</span>}
        {media?.type === 'video' && <span className="badge-gray absolute top-2 right-2">Vidéo</span>}
      </div>
      <div className="p-2.5 space-y-0.5">
        <p className="text-xs font-medium text-[#3434ef]">{etiquette}</p>
        {pub.titre && <p className="text-sm font-semibold text-[#0d0d12] line-clamp-2">{pub.titre}</p>}
        {pub.texte && <p className="text-xs text-gray-500 line-clamp-2">{pub.texte}</p>}
      </div>
    </button>
  )
}

function Classement({ libelles, total }: { libelles: { libelle: string; n: number }[]; total: number }) {
  return (
    <div className="space-y-2">
      {libelles.map((l) => (
        <div key={l.libelle} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-[#0d0d12]">{l.libelle}</span>
            <span className="text-gray-500 tabular-nums">{pourcent(l.n / total)} · {l.n}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-[#3434ef]" style={{ width: `${(100 * l.n) / total}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function RapportMarque({ marque, dossiers }: { marque: { id: string; nom: string }; dossiers: Dossier[] }) {
  const [pubs, setPubs] = useState<PubVeille[] | null>(null)
  const [onglet, setOnglet] = useState<(typeof ONGLETS)[number]>(ONGLETS[0])
  const [ouverte, setOuverte] = useState<PubVeille | null>(null)

  useEffect(() => {
    setPubs(null)
    fetch(`/api/veille/pubs?marque=${marque.id}&statut=active&tri=couverture&n=600`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPubs(d?.pubs ?? []))
  }, [marque.id])

  const r = useMemo(() => (pubs ? rapportMarque(pubs, EUROS_POUR_MILLE_PERSONNES) : null), [pubs])
  if (!pubs || !r) return <div className="card text-center py-16 text-gray-400 text-sm">Calcul du rapport…</div>
  if (!r.total) return <div className="card text-center py-16 text-gray-400 text-sm">Aucune pub active connue pour {marque.nom}.</div>

  const parId = new Map(pubs.map((p) => [p.id, p]))
  const pub = (p: { id: string }) => parId.get(p.id)!
  const maxMois = Math.max(...r.parMois.map((m) => m.n))
  const sansCouverture = r.avecCouverture === 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-[#0d0d12]">{marque.nom}</h2>
          <p className="text-sm text-gray-500">
            {r.total} pub{r.total > 1 ? 's' : ''} active{r.total > 1 ? 's' : ''} analysée{r.total > 1 ? 's' : ''}
            {r.periode && <> · diffusion de {date(r.periode.de)} à {date(r.periode.a)}</>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Indicateur libelle="Créatives actives" valeur={String(r.total)} />
        <Indicateur libelle="Diffusées depuis plus de 30 j" valeur={pourcent(r.depuisPlusDe30j)} note="des créatives actives" />
        <Indicateur libelle="Rythme de lancement" valeur={String(r.lanceesCes30j)} note="lancées ces 30 jours" />
        <Indicateur
          libelle="Budget mensuel indicatif"
          valeur={r.budget ? `≈ ${compact(r.budget.mensuel)} €` : '—'}
          note={r.budget ? `entre ${compact(r.budget.bas)} et ${compact(r.budget.haut)} € · UE` : sansCouverture ? 'couverture inconnue : relancez un scan' : 'pas assez de pubs à couverture connue'}
        />
      </div>

      <section className="card space-y-3 bg-[#f0f0ff]">
        <h3 className="font-semibold text-[#0d0d12]">Ce qui marche chez {marque.nom}</h3>
        <div className="grid md:grid-cols-3 gap-3">
          {([['Concepts', 'Comment il présente', r.concepts], ['Angles', 'Ce qu’il met en avant', r.angles], ['Produits poussés', 'Où il renvoie le trafic', r.produits]] as const).map(([titre, sous, liste]) => (
            <div key={titre} className="bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-2">
              <div>
                <p className="text-sm font-semibold text-[#0d0d12]">{titre}</p>
                <p className="text-xs text-gray-400">{sous}</p>
              </div>
              {liste.length ? (
                <ol className="space-y-1">
                  {liste.slice(0, 4).map((l, i) => (
                    <li key={l.libelle} className="flex justify-between gap-2 text-sm">
                      <span className="text-[#0d0d12]">{i + 1}. {l.libelle}</span>
                      <span className="text-xs text-gray-400 whitespace-nowrap">{l.n} créa{l.n > 1 ? 's' : ''}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Vide>{titre === 'Produits poussés' ? 'Aucun lien de destination lisible.' : 'Décortiquez des pubs depuis leur fiche pour les voir ici.'}</Vide>
              )}
            </div>
          ))}
        </div>
      </section>

      <nav className="flex gap-1 border-b border-[#E5E7EB]" aria-label="Sections du rapport">
        {ONGLETS.map((o) => (
          <button key={o} type="button" onClick={() => setOnglet(o)}
            className={clsx('px-3 py-2 text-sm -mb-px border-b-2', onglet === o ? 'border-[#3434ef] text-[#3434ef] font-medium' : 'border-transparent text-gray-500 hover:text-[#0d0d12]')}>
            {o}
          </button>
        ))}
      </nav>

      {onglet === 'Vue d’ensemble' && (
        <div className="space-y-4">
          <Bloc titre="Pubs les plus diffusées" sousTitre="Classées par nombre de personnes touchées dans l’UE.">
            {r.plusDiffusees.length ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                {r.plusDiffusees.map((p, i) => (
                  <Vignette key={p.id} pub={pub(p)} etiquette={`N°${i + 1} · ${compact(p.reachUe!)} personnes`} ouvrir={() => setOuverte(pub(p))} />
                ))}
              </div>
            ) : (
              <Vide>Couverture inconnue pour ces pubs : relancez un scan Espion avec l’extension à jour.</Vide>
            )}
          </Bloc>
          <Bloc titre="Pubs qui tournent le plus longtemps" sousTitre="Une marque qui laisse tourner une créa des mois a rarement tort.">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              {r.plusLongues.map((p) => (
                <Vignette key={p.id} pub={pub(p)} etiquette={`${joursDeDiffusion(pub(p))} j de diffusion`} ouvrir={() => setOuverte(pub(p))} />
              ))}
            </div>
          </Bloc>
          <Bloc titre="Pubs actives par mois de lancement" sousTitre="Pubs encore en diffusion, selon leur mois de lancement.">
            <div className="flex items-end gap-2 h-44">
              {r.parMois.map((m) => (
                <div key={m.libelle} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                  <span className="text-xs text-gray-600 tabular-nums">{m.n}</span>
                  <div className="w-full rounded-t-md bg-[#3434ef]" style={{ height: `${Math.max(4, (100 * m.n) / maxMois)}%` }} />
                  <span className="text-xs text-gray-400 whitespace-nowrap">{mois(m.libelle)}</span>
                </div>
              ))}
            </div>
          </Bloc>
          <div className="grid lg:grid-cols-3 gap-4">
            <Bloc titre="Ancienneté des pubs actives">
              <Classement libelles={r.anciennete.tranches} total={r.total} />
              {r.anciennete.mediane !== null && <p className="text-xs text-gray-500">Âge médian : <strong>{r.anciennete.mediane} j</strong></p>}
            </Bloc>
            <Bloc titre="Répartition des formats">
              <Classement libelles={r.formats.map((f) => ({ ...f, libelle: FORMATS[f.libelle] ?? f.libelle }))} total={r.total} />
            </Bloc>
            <Bloc titre="Boutons d’action les plus utilisés">
              {r.boutons.length ? <Classement libelles={r.boutons.slice(0, 5)} total={r.total} /> : <Vide>Aucun bouton relevé.</Vide>}
            </Bloc>
          </div>
        </div>
      )}

      {onglet === 'Stratégie créa' && (
        <div className="space-y-4">
          <Bloc titre="Messages les plus utilisés" sousTitre="Un même titre et un même texte déclinés sur plusieurs créas.">
            <div className="grid md:grid-cols-2 gap-3">
              {r.messages.map((m, i) => {
                const p = pub(m.pub)
                const image = p.medias[0]?.type === 'video' ? p.medias[0].apercu : p.medias[0]?.url
                return (
                  <button key={p.id} type="button" onClick={() => setOuverte(p)} className="flex gap-3 text-left rounded-lg border border-[#E5E7EB] overflow-hidden hover:border-gray-300">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {image && <img src={image} alt="" loading="lazy" className="w-24 h-28 object-cover shrink-0" />}
                    <div className="py-2 pr-3 space-y-1 min-w-0">
                      <p className="text-xs"><span className="badge-blue">#{i + 1}</span> <span className="text-gray-500">{m.n} pub{m.n > 1 ? 's' : ''}</span></p>
                      {p.titre && <p className="text-sm font-semibold text-[#0d0d12] line-clamp-1">{p.titre}</p>}
                      {p.texte && <p className="text-xs text-gray-500 line-clamp-2">{p.texte}</p>}
                      {p.cta && <p className="text-xs text-[#3434ef]">{p.cta}</p>}
                    </div>
                  </button>
                )
              })}
            </div>
          </Bloc>
          <div className="grid md:grid-cols-2 gap-4">
            <Bloc titre="Angles" sousTitre={`D’après les ${r.decortiquees} pub${r.decortiquees > 1 ? 's' : ''} décortiquée${r.decortiquees > 1 ? 's' : ''}.`}>
              {r.angles.length ? <Classement libelles={r.angles} total={r.decortiquees} /> : <Vide>Décortiquez des pubs depuis leur fiche pour voir leurs angles.</Vide>}
            </Bloc>
            <Bloc titre="Concepts" sousTitre="La forme créative de chaque pub décortiquée.">
              {r.concepts.length ? <Classement libelles={r.concepts} total={r.decortiquees} /> : <Vide>Décortiquez des pubs depuis leur fiche pour voir leurs concepts.</Vide>}
            </Bloc>
          </div>
        </div>
      )}

      {onglet === 'Offre & landing' && (
        <div className="grid md:grid-cols-2 gap-4">
          <Bloc titre="Présence d’offres" sousTitre="Réductions, remises, codes promo, promotions.">
            <p className="text-3xl font-bold text-[#0d0d12]">{pourcent(r.offres.part)}</p>
            <p className="text-xs text-gray-500">des pubs contiennent une offre</p>
            {r.offres.liste.map((o) => (
              <div key={o.libelle} className="flex justify-between text-sm"><span>{o.libelle}</span><span className="text-gray-500">{o.n} créa{o.n > 1 ? 's' : ''}</span></div>
            ))}
          </Bloc>
          <Bloc titre="Destinations les plus utilisées">
            {r.produits.length ? <Classement libelles={r.produits} total={r.total} /> : <Vide>Aucun lien de destination lisible.</Vide>}
            {r.domaines.length > 0 && (
              <div className="pt-2 space-y-1">
                <p className="text-xs text-gray-400">Domaines de destination</p>
                {r.domaines.map((d) => (
                  <div key={d.libelle} className="flex justify-between text-sm"><span>{d.libelle}</span><span className="text-gray-500">{d.n} pub{d.n > 1 ? 's' : ''}</span></div>
                ))}
              </div>
            )}
          </Bloc>
        </div>
      )}

      {onglet === 'Diffusion' && (
        <div className="space-y-4">
          <Bloc titre="Profil d’audience touchée" sousTitre={r.audience ? `Sur ${compact(r.audience.total)} personnes touchées dans l’UE (transparence DSA).` : undefined}>
            {r.audience ? (
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-400 uppercase">Genre</p>
                  {r.audience.sexe.map((s) => <Barre key={s.libelle} libelle={s.libelle} valeur={s.n} total={r.audience!.total} />)}
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-400 uppercase">Tranches d’âge</p>
                  {r.audience.ages.map((a) => <Barre key={a.libelle} libelle={a.libelle === 'Unknown' ? 'Inconnu' : a.libelle} valeur={a.n} total={r.audience!.total} />)}
                </div>
              </div>
            ) : (
              <Vide>Audience inconnue pour ces pubs : relancez un scan Espion avec l’extension à jour.</Vide>
            )}
          </Bloc>
          <div className="grid md:grid-cols-2 gap-4">
            <Bloc titre="Pays les plus touchés">
              {r.audience ? r.audience.pays.map((p) => <Barre key={p.libelle} libelle={p.libelle} valeur={p.n} total={r.audience!.total} />) : <Vide>Inconnu.</Vide>}
            </Bloc>
            <Bloc titre="Plateformes de diffusion">
              <Classement libelles={r.plateformes.slice(0, 5)} total={r.total} />
            </Bloc>
          </div>
        </div>
      )}

      {ouverte && (
        <FichePub pub={ouverte} jours={joursDeDiffusion(ouverte)} actions={<ChoixSauvegarde pub={ouverte} dossiers={dossiers} />} fermer={() => setOuverte(null)} />
      )}
    </div>
  )
}
