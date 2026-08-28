'use client'
import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { markdownToHtml } from '@/lib/markdown'
import { ApercuMeta } from './ApercuMeta'
import { Camembert, BarresDoubles, AgeGenre, PAR_CLE, fmt, type Vent } from './graphes'

/**
 * Le détail d'une créa : pourquoi elle marche, ou pas.
 *
 * Le tableau dit qu'une créa performe ; ici on voit **d'où** vient la
 * performance. Un coût flatteur porté par un seul placement ou une seule
 * tranche d'âge ne se décline pas comme un coût réparti.
 *
 * Chaque bloc porte son propre sélecteur de métrique, et certains en portent
 * deux : la lecture qui décide n'est pas une métrique isolée mais un
 * croisement — dépense contre reach, CTR contre impressions.
 */

/* ─── Aperçu ────────────────────────────────────────────────────────────── */

/**
 * Les placements, avec une hauteur de repli.
 *
 * Meta déclare presque toujours les dimensions de son rendu, et c'est elles
 * qu'on utilise. Le repli couvre le cas où il ne les donne pas : sans hauteur,
 * le cadre s'effondre à zéro et la publicité disparaît sans un mot. Un fil
 * porte ses commentaires et son bouton, donc il est long ; une story tient
 * dans son écran.
 */
const FORMATS = [
  { id: 'MOBILE_FEED_STANDARD', label: 'Fil mobile', repli: 700 },
  { id: 'INSTAGRAM_STANDARD', label: 'Instagram', repli: 700 },
  { id: 'INSTAGRAM_STORY', label: 'Story IG', repli: 570 },
  { id: 'INSTAGRAM_REELS', label: 'Reels IG', repli: 570 },
  { id: 'FACEBOOK_STORY_MOBILE', label: 'Story FB', repli: 570 },
  { id: 'FACEBOOK_REELS_MOBILE', label: 'Reels FB', repli: 570 },
  { id: 'DESKTOP_FEED_STANDARD', label: 'Bureau', repli: 800 },
]

function Apercu({ adId }: { adId: string }) {
  const [format, setFormat] = useState(FORMATS[0].id)

  return (
    // La colonne est bornée par la modale et reste épinglée : la publicité
    // demeure sous les yeux pendant qu'on fait défiler les chiffres à côté,
    // et c'est cette hauteur connue qui permet d'y faire tenir l'aperçu.
    // Sur téléphone la publicité passe au-dessus des chiffres, sur une hauteur
    // bornée : en colonne elle occuperait tout l'écran avant le premier KPI.
    <div className="flex flex-col gap-2 h-[52vh] xl:h-[calc(85vh-7.5rem)] xl:sticky xl:top-0">
      <div className="flex flex-wrap gap-1 flex-shrink-0">
        {FORMATS.map((f) => (
          <button key={f.id} onClick={() => setFormat(f.id)}
            className={clsx('px-2 py-1 rounded-md text-[11px] font-medium border transition-all',
              format === f.id ? 'bg-[#3434ef] text-white border-[#3434ef]' : 'bg-white text-gray-600 border-[#E5E7EB] hover:border-gray-300')}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 rounded-xl border border-[#E5E7EB] overflow-hidden">
        <ApercuMeta adId={adId} format={format} mode="entier" interactif
          hauteurRepli={FORMATS.find((f) => f.id === format)?.repli || 700} />
      </div>
    </div>
  )
}

/** Une baisse de coût est une bonne nouvelle : le sens dépend de la métrique. */
function Var({ v, inverse }: { v: number | null | undefined; inverse?: boolean }) {
  if (v == null || !Number.isFinite(v)) return null
  const bon = inverse ? v < 0 : v > 0
  const neutre = Math.abs(v) < 1
  return (
    <span className={clsx('text-[10px] font-medium tabular-nums ml-1',
      neutre ? 'text-gray-400' : bon ? 'text-emerald-600' : 'text-red-500')}>
      {v > 0 ? '↑' : '↓'}{Math.abs(v).toFixed(0)}%
    </span>
  )
}

/* ─── Modale ────────────────────────────────────────────────────────────── */

type Detail = {
  ad: { id: string; name: string | null; status: string | null }
  periode: { since: string; until: string }
  global: Record<string, number | string | null> | null
  variations: Record<string, number | null>
  quotidien: Vent[]
  ventilations: { placement: Vent[]; age: Vent[]; ageGenre: Vent[]; genre: Vent[]; appareil: Vent[] }
}

export function DetailCrea({ adId, periode, attribution, decision, format, compte, onClose }: {
  adId: string; periode: string; attribution: string
  decision?: { kind: string; label: string; reason: string }
  format?: string | null
  /** Le compte publicitaire : l'analyse ne peut pas se faire sans lui, la
   *  route ayant besoin de l'identifiant Meta pour tirer ses chiffres. */
  compte?: { id: string; metaAccountId?: string | null } | null
  onClose: () => void
}) {
  const [d, setD] = useState<Detail | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [analyse, setAnalyse] = useState<string | null>(null)
  const [analyseEnCours, setAnalyseEnCours] = useState(false)
  const [passees, setPassees] = useState<{ id: string; title: string; createdAt: string }[]>([])

  useEffect(() => {
    let vivant = true
    fetch(`/api/scalr/ad-detail?adId=${adId}&periode=${periode}&attribution=${attribution}`)
      .then((r) => r.json())
      .then((j) => { if (!vivant) return; j.error ? setErreur(j.error) : setD(j) })
      .catch(() => { if (vivant) setErreur('Chargement impossible') })
    return () => { vivant = false }
  }, [adId, periode, attribution])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const g = d?.global
  const v = d?.variations || {}

  const kpis = useMemo(() => {
    if (!g) return []
    return ['cpl', 'leads', 'ctr', 'cpm', 'cpc', 'frequency', 'spend', 'impressions']
      .map((k) => PAR_CLE.get(k)!)
      .map((c) => ({ ...c, valeur: g[c.cle] as number | null, variation: v[c.cle] }))
  }, [g, v])

  /**
   * Les analyses déjà faites sur cette créa.
   *
   * C'est ce qui distingue l'archive du suivi : on rouvre une créa six
   * semaines plus tard et on voit ce qu'on en disait, avant d'en redemander
   * une lecture.
   */
  useEffect(() => {
    if (!compte?.id) return
    let vivant = true
    fetch(`/api/reports?dbAccountId=${compte.id}&adId=${adId}`)
      .then((r) => r.json())
      .then((d) => { if (vivant) setPassees(d?.reports || []) })
      .catch(() => {})
    return () => { vivant = false }
  }, [compte?.id, adId])

  async function analyser() {
    if (!compte) { setAnalyse('Aucun compte publicitaire sélectionné.'); return }
    setAnalyseEnCours(true)
    try {
      const r = await fetch('/api/ai/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // `accountId` est l'identifiant Meta, `dbAccountId` celui de la base :
          // la route lit les chiffres avec le premier et les réglages avec le
          // second. Sans eux elle répond « Missing parameters ».
          accountId: compte.metaAccountId || compte.id,
          dbAccountId: compte.id,
          // Rattache l'analyse à la créa : sans ça elle se perd dans une liste
          // de titres génériques, et on ne peut pas comparer deux passages.
          adId, adName: d?.ad.name ?? null,
          category: 'creativeStrategy', analysisType: 'creative_deep_dive',
          agentRole: 'creative_strategist', deep: true,
          customPrompt: `Analyse cette créa en particulier : « ${d?.ad.name} » (id ${adId}).\n\n`
            + `Chiffres de la période ${d?.periode.since} → ${d?.periode.until} :\n${JSON.stringify(g, null, 2)}\n\n`
            + `Répartition par placement :\n${JSON.stringify(d?.ventilations.placement?.slice(0, 8), null, 2)}\n\n`
            + `Répartition par âge :\n${JSON.stringify(d?.ventilations.age, null, 2)}\n\n`
            + `Dis en quoi cette créa fonctionne ou non, sur quel placement et quelle audience elle porte, `
            + `et comment la décliner. Appuie chaque affirmation sur un chiffre ci-dessus.`,
        }),
      })
      // Un échec arrive en JSON, pas en flux : le rendre tel quel afficherait
      // « {"error":"..."} » à l'écran.
      if (!r.ok) {
        const brut = await r.text()
        let motif = brut
        try { motif = (JSON.parse(brut) as { error?: string }).error || brut } catch {}
        setAnalyse(`L’analyse n’a pas pu aboutir : ${motif}`)
        return
      }
      const texte = await r.text()
      setAnalyse(texte || 'Aucune réponse.')
      // La nouvelle analyse rejoint l'historique : la liste doit le refléter
      // sans qu'on ait à rouvrir la fenêtre.
      if (compte?.id) {
        fetch(`/api/reports?dbAccountId=${compte.id}&adId=${adId}`)
          .then((x) => x.json()).then((d) => setPassees(d?.reports || [])).catch(() => {})
      }
    } catch {
      setAnalyse('L’analyse n’a pas pu aboutir.')
    } finally {
      setAnalyseEnCours(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white shadow-xl w-full h-full flex flex-col overflow-hidden lg:rounded-2xl lg:w-[80vw] lg:h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête : le verdict d'abord, les chiffres ensuite — ils le justifient */}
        <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-start justify-between gap-4 flex-shrink-0">
          <div className="min-w-0">
            {decision && (
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                  decision.kind === 'cut' ? 'bg-red-50 text-red-700 border-red-200'
                    : decision.kind === 'scale' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : decision.kind === 'iterate' ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-gray-50 text-gray-600 border-gray-200')}>
                  {decision.label}
                </span>
                <span className="text-[11px] text-gray-500">{decision.reason}</span>
              </div>
            )}
            <h2 className="text-base font-semibold text-[#0d0d12] leading-snug truncate">{d?.ad.name || 'Chargement…'}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {format || '—'} · {d?.ad.status === 'ACTIVE' ? 'active' : (d?.ad.status || '—').toLowerCase()}
              {d && <span className="font-mono"> · {d.periode.since} → {d.periode.until}</span>}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 text-lg flex-shrink-0">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {erreur && <div className="py-16 text-center text-sm text-gray-400">{erreur}</div>}

          {!erreur && (
            <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-5 items-start">
              <Apercu adId={adId} />

              <div className="space-y-4 min-w-0">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {kpis.map((k) => (
                    <div key={k.cle} className="border border-[#E5E7EB] rounded-xl px-3 py-2.5">
                      <p className="text-base font-bold text-[#0d0d12] tabular-nums leading-tight">
                        {fmt(k.valeur, k.unite)}
                        <Var v={k.variation} inverse={k.inverse} />
                      </p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{k.label}</p>
                    </div>
                  ))}
                  {!kpis.length && [...Array(8)].map((_, i) => (
                    <div key={i} className="border border-[#E5E7EB] rounded-xl h-16 animate-pulse bg-gray-50" />
                  ))}
                </div>

                {/* Vue globale */}
                {g && (
                  <div className="card p-0 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-[#E5E7EB]">
                      <p className="text-sm font-semibold text-[#0d0d12]">Vue globale</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] text-gray-400 uppercase tracking-wider bg-[#f8f9fc]">
                            <th className="px-4 py-2 text-left font-semibold">Élément</th>
                            {['spend', 'leads', 'cpl', 'convRate', 'reach', 'frequency'].map((k) => (
                              <th key={k} className="px-3 py-2 text-right font-semibold">{PAR_CLE.get(k)!.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t border-[#F3F4F6]">
                            <td className="px-4 py-2.5 font-medium text-[#0d0d12] truncate max-w-[280px]">{d?.ad.name}</td>
                            {['spend', 'leads', 'cpl', 'convRate', 'reach', 'frequency'].map((k) => (
                              <td key={k} className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                                {fmt(g[k] as number | null, PAR_CLE.get(k)!.unite)}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {d && (
                  <>
                    <Camembert titre="Répartition des métriques" dimensions={[
                      { cle: 'age', label: 'Âge', data: d.ventilations.age },
                      { cle: 'placement', label: 'Placement', data: d.ventilations.placement },
                      { cle: 'appareil', label: 'Appareil', data: d.ventilations.appareil },
                      { cle: 'genre', label: 'Genre', data: d.ventilations.genre },
                    ]} />

                    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
                      <BarresDoubles data={d.ventilations.placement} titre="Répartition par placement"
                        note="Là où le budget part, et ce qu'il touche réellement"
                        defaut1="spend" defaut2="reach" />
                      <AgeGenre data={d.ventilations.ageGenre} />
                    </div>

                    <BarresDoubles data={d.quotidien} titre="Évolution des métriques"
                      note="Deux échelles : barres à gauche, courbe à droite" defaut1="linkCtr" defaut2="ctr" courbe />
                  </>
                )}

                {/* Analyse Claude */}
                {d && (
                  <div className="card">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#0d0d12]">Analyser cette créa</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Claude lit les chiffres ci-dessus et dit sur quoi elle porte, et comment la décliner.
                          {passees.length > 0 && (
                            <> {passees.length} analyse{passees.length > 1 ? 's' : ''} déjà enregistrée{passees.length > 1 ? 's' : ''} pour cette créa —
                            {' '}<a href="/history" className="text-[#3434ef] hover:underline">
                              la plus récente du {new Date(passees[0].createdAt).toLocaleDateString('fr-FR')}
                            </a>.</>
                          )}
                        </p>
                      </div>
                      <button onClick={analyser} disabled={analyseEnCours} className="btn-primary text-sm disabled:opacity-40">
                        {analyseEnCours ? 'Analyse en cours…' : 'Analyser avec Claude →'}
                      </button>
                    </div>
                    {analyse && (
                      // L'analyse est du Markdown : brute, ses tableaux
                      // deviennent des barres verticales et ses titres des
                      // dièses. Le même rendu que l'historique et Autopilot.
                      <div className="chat-report mt-3 bg-[#f8f9fc] border border-[#E5E7EB] rounded-lg p-4 max-h-[460px] overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(analyse) }} />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
