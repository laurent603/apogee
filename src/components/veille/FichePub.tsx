'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { budgetEstime, EUROS_POUR_MILLE_PERSONNES } from '@/lib/veille/adLibrary'
import type { PubVeille } from './CartePub'
import type { Decorticage } from '@/lib/veille/gemini'

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

export function Barre({ libelle, valeur, total }: { libelle: string; valeur: number; total: number }) {
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

export function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{titre}</h3>
      {children}
    </section>
  )
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Sous-titres .srt : chaque phrase dure jusqu'à la suivante, trois secondes au plus. */
function srt(segments: Decorticage['transcription']) {
  const t = (s: number) => {
    const ms = Math.round(s * 1000)
    const p = (n: number, l = 2) => String(n).padStart(l, '0')
    return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
  }
  return segments
    .map((g, i) => {
      const fin = Math.min(segments[i + 1]?.debut ?? g.debut + 3, g.debut + 3)
      return `${i + 1}\n${t(g.debut)} --> ${t(Math.max(fin, g.debut + 0.5))}\n${g.texte}\n`
    })
    .join('\n')
}

function telecharger(nom: string, contenu: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([contenu], { type: 'application/x-subrip;charset=utf-8' }))
  a.download = nom
  a.click()
  URL.revokeObjectURL(a.href)
}

/** « Décortiquer cette pub » : analyse Gemini du média, gardée sur la pub. */
function Decortiquer({ pub }: { pub: PubVeille }) {
  const [analyse, setAnalyse] = useState<Decorticage | null>(pub.analyse)
  const [chargement, setChargement] = useState(false)
  const [ouvert, setOuvert] = useState(true)
  const [filtre, setFiltre] = useState<'tout' | 'voix' | 'ecran'>('tout')

  async function lancer(refaire = false) {
    setChargement(true)
    const r = await fetch('/api/veille/decortiquer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pubId: pub.id, refaire }),
    })
    const j = await r.json().catch(() => ({}))
    setChargement(false)
    if (!r.ok) return void toast.error(j.erreur || 'Analyse impossible')
    setAnalyse(j)
    setOuvert(true)
  }

  if (!analyse) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-[#E5E7EB] bg-gray-50 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-[#0d0d12]">Décortiquer cette pub</p>
          <p className="text-xs text-gray-500">
            {chargement ? 'Analyse en cours… jusqu’à une minute pour une vidéo.' : 'Accroche, angle, concept, structure et transcription.'}
          </p>
        </div>
        <button type="button" onClick={() => lancer()} disabled={chargement} className="btn-primary disabled:opacity-50">
          {chargement ? 'Analyse…' : 'Lancer'}
        </button>
      </div>
    )
  }

  const segments = analyse.transcription.filter((g) => filtre === 'tout' || g.source === filtre)
  const voix = analyse.transcription.filter((g) => g.source === 'voix')
  const video = pub.medias.some((m) => m.type === 'video')

  return (
    <div className="rounded-xl border border-[#E5E7EB] px-5 py-5 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#0d0d12]">Pub décortiquée</p>
          <p className="text-xs text-gray-500">
            {video ? 'Vidéo' : 'Image'} · {analyse.transcription.length} élément{analyse.transcription.length > 1 ? 's' : ''} transcrit{analyse.transcription.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <button type="button" onClick={() => lancer(true)} disabled={chargement} className="text-gray-400 hover:text-[#0d0d12] disabled:opacity-50">
            {chargement ? 'Analyse…' : 'Refaire'}
          </button>
          <button type="button" onClick={() => setOuvert(!ouvert)} className="text-[#3434ef] hover:underline">{ouvert ? 'Masquer' : 'Afficher'}</button>
        </div>
      </div>

      {ouvert && (
        <>
          <Section titre="Accroche"><p className="text-sm text-[#0d0d12]">« {analyse.accroche} »</p></Section>
          <div className="grid grid-cols-2 gap-3">
            <Section titre="Angle"><p className="text-sm text-gray-700">{analyse.angle}</p></Section>
            <Section titre="Concept"><p className="text-sm text-gray-700">{analyse.concept}</p></Section>
          </div>
          <Section titre="Promesse"><p className="text-sm text-gray-700">{analyse.promesse}</p></Section>
          <Section titre="Appel à l’action"><p className="text-sm text-gray-700">{analyse.appelAction}</p></Section>
          {analyse.structure.length > 0 && (
            <Section titre="Structure">
              <ol className="space-y-1.5">
                {analyse.structure.map((e, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="h-5 w-5 shrink-0 rounded-full bg-[#f0f0ff] text-[#3434ef] text-xs font-semibold flex items-center justify-center">{i + 1}</span>
                    <span><span className="font-medium text-[#0d0d12]">{e.type}</span> <span className="text-gray-600">— {e.resume}</span></span>
                  </li>
                ))}
              </ol>
            </Section>
          )}
          {analyse.transcription.length > 0 && (
            <Section titre="Transcription">
              <div className="flex gap-1.5">
                {(['tout', 'voix', 'ecran'] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setFiltre(f)}
                    className={`px-2 py-0.5 rounded-full text-xs border ${filtre === f ? 'bg-[#3434ef] text-white border-[#3434ef]' : 'bg-white text-gray-600 border-[#E5E7EB]'}`}>
                    {f === 'tout' ? 'Tout' : f === 'voix' ? 'Voix off' : 'Écran'}
                  </button>
                ))}
              </div>
              <ul className="space-y-1">
                {segments.map((g, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="w-10 shrink-0 tabular-nums text-xs text-gray-400 pt-0.5">{mmss(g.debut)}</span>
                    <span className={g.source === 'ecran' ? 'font-medium uppercase text-xs tracking-wide text-gray-500 pt-0.5' : 'text-gray-700'}>{g.texte}</span>
                  </li>
                ))}
              </ul>
              {video && (
                <button type="button" onClick={() => telecharger(`transcription-${pub.adArchiveId}.srt`, srt(voix.length ? voix : analyse.transcription))}
                  className="text-xs text-[#3434ef] hover:underline">
                  Télécharger la transcription .srt
                </button>
              )}
            </Section>
          )}
        </>
      )}
    </div>
  )
}

/** Masque la pub partout, après confirmation. Vrai si c'est fait. */
export async function masquerPub(pub: PubVeille) {
  if (!confirm(`Masquer cette pub de ${pub.marque.nom} ? Elle disparaît de Discovery, Veille, Espion et de la Bibliothèque, et ne sera plus réimportée.`)) return false
  const r = await fetch('/api/veille/pubs', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: pub.id, masquee: true }),
  })
  if (!r.ok) {
    toast.error('Masquage impossible')
    return false
  }
  toast.success('Pub masquée')
  return true
}

/** La fiche d'une pub : média, budget estimé, textes, diffusion, audience UE. */
export function FichePub({ pub, jours, actions, fermer, lectureSeule, apresMasquage }: {
  pub: PubVeille; jours: number | null; actions?: React.ReactNode; fermer: () => void
  /** Page publique d'un dossier partagé : pas d'analyse à lancer. */
  lectureSeule?: boolean
  /** Retire la pub de la liste qui a ouvert la fiche ; sans lui, pas de bouton « Masquer ». */
  apresMasquage?: () => void
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
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl"
      >
        <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-[#E5E7EB]">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-[#0d0d12] truncate">{pub.marque.nom}</p>
            {jours !== null && <p className="text-sm text-[#3434ef] mt-0.5">{jours} jours de diffusion</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className={pub.active ? 'badge-green' : 'badge-gray'}>{pub.active ? 'Active' : 'Inactive'}</span>
            <button type="button" onClick={fermer} aria-label="Fermer" className="text-gray-400 hover:text-[#0d0d12] text-xl leading-none px-1">×</button>
          </div>
        </header>

        <div className="overflow-y-auto px-6 py-6 space-y-7">
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

          {!lectureSeule && <Decortiquer pub={pub} />}

          {pub.titre && <Section titre="Titre"><p className="text-sm text-[#0d0d12]">{pub.titre}</p></Section>}
          {pub.texte && <Section titre="Texte principal"><p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{pub.texte}</p></Section>}
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
              <div className="space-y-2">
                <Barre libelle="Hommes" valeur={somme((l) => l.hommes)} total={totalRepartition} />
                <Barre libelle="Femmes" valeur={somme((l) => l.femmes)} total={totalRepartition} />
                <Barre libelle="Non déterminé" valeur={somme((l) => l.inconnu)} total={totalRepartition} />
              </div>
              <div className="space-y-2 pt-3">
                {parAge.map((a) => <Barre key={a.age} libelle={a.age === 'Unknown' ? 'Âge inconnu' : `${a.age} ans`} valeur={a.n} total={totalRepartition} />)}
              </div>
              {parPays.length > 1 && (
                <div className="space-y-2 pt-3">
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

        <footer className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#E5E7EB]">
          <div className="flex items-center gap-4 text-sm">
            <a href={`https://www.facebook.com/ads/library/?id=${pub.adArchiveId}`} target="_blank" rel="noreferrer" className="text-[#3434ef] hover:underline">
              Voir dans la Ad Library
            </a>
            {apresMasquage && !lectureSeule && (
              <button type="button" onClick={async () => { if (await masquerPub(pub)) { fermer(); apresMasquage() } }} className="text-gray-400 hover:text-red-600">
                Masquer
              </button>
            )}
          </div>
          <div className="w-56">{actions}</div>
        </footer>
      </div>
    </div>
  )
}
