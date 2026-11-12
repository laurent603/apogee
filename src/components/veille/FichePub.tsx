'use client'
import { useEffect, useState } from 'react'
import { budgetEstime, EUROS_POUR_MILLE_PERSONNES } from '@/lib/veille/adLibrary'
import type { PubVeille } from './CartePub'

/** 2 694 → « 2,7 K », 783 → « 780 » : deux chiffres significatifs, comme un ordre de grandeur. */
export function compact(v: number) {
  const arrondi = Number(v.toPrecision(2))
  // « 2,7 K », « 1,0 K », mais « 65 K » : une décimale seulement sous 10.
  const fr = (x: number) => x.toLocaleString('fr-FR', { minimumFractionDigits: x < 10 ? 1 : 0, maximumFractionDigits: 1 })
  if (arrondi >= 1_000_000) return `${fr(arrondi / 1_000_000)} M`
  if (arrondi >= 1_000) return `${fr(arrondi / 1_000)} K`
  return arrondi.toLocaleString('fr-FR')
}

const AGES = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'Unknown']
const pct = (n: number, total: number) => (total ? Math.round((100 * n) / total) : 0)

function Barre({ libelle, valeur, total }: { libelle: string; valeur: number; total: number }) {
  const p = pct(valeur, total)
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-gray-500 shrink-0">{libelle}</span>
      <span className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <span className="block h-full bg-[#3434ef]" style={{ width: `${p}%` }} />
      </span>
      <span className="w-10 text-right tabular-nums text-gray-600">{p} %</span>
    </div>
  )
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{titre}</h3>
      {children}
    </section>
  )
}

/** La fiche d'une pub : média, budget estimé, textes, diffusion, audience UE. */
export function FichePub({ pub, jours, actions, fermer }: {
  pub: PubVeille; jours: number | null; actions?: React.ReactNode; fermer: () => void
}) {
  const [index, setIndex] = useState(0)
  const media = pub.medias[index]
  const budget = budgetEstime(pub.reachUe)
  const t = pub.transparence

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && fermer()
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [fermer])

  const repartition = t?.repartition ?? []
  const totalRepartition = repartition.reduce((s, l) => s + l.hommes + l.femmes + l.inconnu, 0)
  const somme = (f: (l: (typeof repartition)[number]) => number) => repartition.reduce((s, l) => s + f(l), 0)
  const parAge = AGES.map((age) => ({ age, n: somme((l) => (l.age === age ? l.hommes + l.femmes + l.inconnu : 0)) })).filter((a) => a.n > 0)
  const parPays = [...new Set(repartition.map((l) => l.pays))]
    .map((pays) => ({ pays, n: somme((l) => (l.pays === pays ? l.hommes + l.femmes + l.inconnu : 0)) }))
    .sort((a, b) => b.n - a.n)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={fermer}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Pub de ${pub.marque.nom}`}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#E5E7EB]">
          <div className="min-w-0">
            <p className="font-semibold text-[#0d0d12] truncate">{pub.marque.nom}</p>
            {jours !== null && <p className="text-xs text-[#3434ef]">{jours} jours de diffusion</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className={pub.active ? 'badge-green' : 'badge-gray'}>{pub.active ? 'Active' : 'Inactive'}</span>
            <button type="button" onClick={fermer} aria-label="Fermer" className="text-gray-400 hover:text-[#0d0d12] text-xl leading-none px-1">×</button>
          </div>
        </header>

        <div className="overflow-y-auto px-4 py-4 space-y-4">
          <div className="relative bg-gray-100 rounded-lg overflow-hidden">
            {media?.type === 'video' ? (
              <video key={media.url} src={media.url} poster={media.apercu ?? undefined} controls playsInline className="w-full max-h-[420px] object-contain" />
            ) : media ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={media.url} alt="" className="w-full max-h-[420px] object-contain" />
            ) : (
              <div className="aspect-square flex items-center justify-center text-xs text-gray-400">Aucun média</div>
            )}
            {budget !== null && (
              <span className="badge-green absolute top-2 left-2" title="Estimation : couverture UE publiée par Meta × coût moyen pour 1 000 personnes touchées">
                ≈ {compact(budget)} €
              </span>
            )}
            {media && (
              <a href={media.url} target="_blank" rel="noreferrer" className="badge-gray absolute top-2 right-2 hover:underline">
                Ouvrir le média
              </a>
            )}
          </div>
          {pub.medias.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto">
              {pub.medias.map((m, i) => (
                <button key={i} type="button" onClick={() => setIndex(i)} aria-label={`Média ${i + 1}`}
                  className={`h-14 w-14 shrink-0 rounded-md overflow-hidden border-2 ${i === index ? 'border-[#3434ef]' : 'border-transparent'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.apercu ?? m.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {pub.titre && <Section titre="Titre"><p className="text-sm text-[#0d0d12]">{pub.titre}</p></Section>}
          {pub.texte && <Section titre="Texte principal"><p className="text-sm text-gray-700 whitespace-pre-line">{pub.texte}</p></Section>}
          {pub.description && <Section titre="Description"><p className="text-sm text-gray-700">{pub.description}</p></Section>}
          {(pub.cta || pub.lienUrl) && (
            <Section titre="Bouton">
              <p className="text-sm text-[#0d0d12]">
                {pub.cta}
                {pub.lienUrl && (
                  <> · <a href={pub.lienUrl} target="_blank" rel="noreferrer" className="text-[#3434ef] hover:underline break-all">{pub.lienUrl}</a></>
                )}
              </p>
            </Section>
          )}

          <Section titre="Diffusion">
            <p className="text-sm text-gray-700">
              {pub.plateformes.join(', ') || '—'}
              {pub.debut && <> · depuis le {new Date(pub.debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</>}
              {!pub.active && pub.fin && <> · arrêtée le {new Date(pub.fin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</>}
            </p>
          </Section>

          {pub.reachUe !== null && (
            <Section titre="Couverture dans l’UE">
              <p className="text-sm text-[#0d0d12]">
                <strong>{pub.reachUe.toLocaleString('fr-FR')}</strong> personnes touchées
                {budget !== null && <> · budget estimé <strong>≈ {compact(budget)} €</strong></>}
              </p>
              <p className="text-xs text-gray-400">
                Meta ne publie pas la dépense : estimation à {EUROS_POUR_MILLE_PERSONNES.toLocaleString('fr-FR')} € pour 1 000 personnes touchées.
                L’écart avec le budget réel peut être fort.
              </p>
            </Section>
          )}

          {totalRepartition > 0 && (
            <Section titre="Qui a été touché">
              <div className="space-y-1.5">
                <Barre libelle="Hommes" valeur={somme((l) => l.hommes)} total={totalRepartition} />
                <Barre libelle="Femmes" valeur={somme((l) => l.femmes)} total={totalRepartition} />
                <Barre libelle="Non déterminé" valeur={somme((l) => l.inconnu)} total={totalRepartition} />
              </div>
              <div className="space-y-1.5 pt-2">
                {parAge.map((a) => <Barre key={a.age} libelle={a.age === 'Unknown' ? 'Âge inconnu' : `${a.age} ans`} valeur={a.n} total={totalRepartition} />)}
              </div>
              {parPays.length > 1 && (
                <div className="space-y-1.5 pt-2">
                  {parPays.map((p) => <Barre key={p.pays} libelle={p.pays} valeur={p.n} total={totalRepartition} />)}
                </div>
              )}
            </Section>
          )}

          {t && (t.ciblage.ageMin !== null || t.ciblage.lieux.length > 0 || t.payeur) && (
            <Section titre="Ciblage et annonceur">
              <p className="text-sm text-gray-700">
                {t.ciblage.ageMin !== null && <>{t.ciblage.ageMin}–{t.ciblage.ageMax ?? '65+'} ans</>}
                {t.ciblage.sexe && <> · {t.ciblage.sexe}</>}
                {t.ciblage.lieux.length > 0 && <> · {t.ciblage.lieux.join(', ')}</>}
              </p>
              {t.payeur && (
                <p className="text-sm text-gray-700">
                  Payé par {t.payeur}{t.beneficiaire && t.beneficiaire !== t.payeur && <>, pour {t.beneficiaire}</>}
                </p>
              )}
            </Section>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[#E5E7EB]">
          <a href={`https://www.facebook.com/ads/library/?id=${pub.adArchiveId}`} target="_blank" rel="noreferrer" className="text-xs text-[#3434ef] hover:underline">
            Voir dans la Ad Library
          </a>
          <div className="w-56">{actions}</div>
        </footer>
      </div>
    </div>
  )
}
