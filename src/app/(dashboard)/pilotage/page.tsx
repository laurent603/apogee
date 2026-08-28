'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { clsx } from 'clsx'
import {
  METRIC_BY_KEY, COLONNES_DEFAUT, formatMetric, senseVariation, type MetricDef,
} from '@/lib/scalr/metrics'
import { appliqueConditions } from '@/lib/scalr/filtres'
import { BarreOutils, REGLAGES_DEFAUT, objectifLisible, type Reglages } from '@/components/scalr/BarreOutils'
import { GalerieCreas } from '@/components/scalr/GalerieCreas'
import { DetailCrea } from '@/components/scalr/DetailCrea'
import { MatriceFatigue } from '@/components/scalr/MatriceFatigue'

/**
 * Le tableau de pilotage.
 *
 * Campagnes, ad sets et publicités ne sont pas trois écrans : c'est un écran
 * et un niveau de lecture. Même barre d'outils, même moteur, même verdict —
 * seul le regroupement change.
 *
 * La colonne Décision en est la colonne vertébrale, et les pastilles du haut
 * ne sont pas des étiquettes mais des filtres : on clique « À couper », on
 * obtient sa liste, on agit.
 *
 * Les filtres n'entrent jamais dans le calcul. Les repères — médianes de
 * dépense et de CPL — se calculent sur le compte entier, côté serveur : une
 * créa ne change pas de verdict parce qu'on a choisi de la regarder seule.
 */

type Decision = { kind: string; label: string; reason: string }
type Ligne = Record<string, unknown> & {
  id: string; name: string; status: string | null
  campaignId: string | null; adsetId: string | null
  objective: string | null; creativeType: string | null
  createdTime: string | null
  decision: Decision
  variations: Record<string, number | null>
}

const NIVEAUX = [
  { id: 'campaign', label: 'Campagnes' },
  { id: 'adset', label: 'Ad Sets' },
  { id: 'ad', label: 'Publicités' },
  { id: 'crea', label: 'Créas' },
  { id: 'fatigue', label: 'Matrice' },
] as const

/**
 * Une pastille par verdict.
 *
 * Winner et Scaler partagent le même `kind` mais appellent deux gestes
 * différents — décliner ou confirmer —, donc elles se filtrent sur le libellé.
 * Sans ça, « montre-moi mes winners » restait impossible.
 */
const PASTILLES: { id: string; label: string; kinds?: string[]; labels?: string[] }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'winner', label: 'Winner', labels: ['Winner'] },
  { id: 'scaler', label: 'Scaler', labels: ['Scaler'] },
  { id: 'iterate', label: 'Itérer', kinds: ['iterate'] },
  { id: 'cut', label: 'Couper', kinds: ['cut'] },
  { id: 'watch', label: 'Fatigue', kinds: ['watch'] },
  { id: 'objective', label: 'Dans la cible', kinds: ['objective'] },
  { id: 'test', label: 'Nouveau test', kinds: ['test'] },
  { id: 'paused', label: 'En pause', kinds: ['paused'] },
]

/** Une ligne appartient-elle à cette pastille ? */
const dansPastille = (d: Decision, p: (typeof PASTILLES)[number]) =>
  (p.kinds?.includes(d.kind) ?? false) || (p.labels?.includes(d.label) ?? false)

const COULEUR_DECISION: Record<string, string> = {
  cut: 'bg-red-50 text-red-700 border-red-200',
  scale: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  iterate: 'bg-blue-50 text-blue-700 border-blue-200',
  watch: 'bg-amber-50 text-amber-700 border-amber-200',
  objective: 'bg-teal-50 text-teal-700 border-teal-200',
  test: 'bg-gray-50 text-gray-600 border-gray-200',
  // Une ligne arrêtée n'est ni bonne ni mauvaise : elle est hors jeu.
  paused: 'bg-slate-100 text-slate-500 border-slate-200',
}

/** Une hausse n'est pas une bonne nouvelle en soi : le registre dit dans quel
 *  sens lire chaque métrique. */
function Variation({ value, def }: { value: number | null | undefined; def: MetricDef }) {
  const sens = senseVariation(value, def)
  if (sens === null) return null
  const v = value as number
  return (
    <span className={clsx('ml-1 text-[10px] font-medium tabular-nums whitespace-nowrap',
      sens === 'bon' ? 'text-emerald-600' : sens === 'mauvais' ? 'text-red-500' : 'text-gray-400')}>
      {v > 0 ? '▲' : '▼'}{Math.abs(v).toFixed(0)}%
    </span>
  )
}

const estActif = (s: string | null) => s === 'ACTIVE'

/**
 * Une ligne, en carte, pour les écrans étroits.
 *
 * Deux gestes distincts plutôt qu'un clic à double sens : **toucher la carte**
 * déplie ses métriques, **toucher le chevron** descend d'un niveau. Un tap
 * dont la signification dépend d'un état invisible finit toujours par
 * descendre quand on voulait lire.
 */
function CarteLigne({ row, cols, r, niveau, onDescendre }: {
  row: Ligne; cols: MetricDef[]; r: Reglages; niveau: string; onDescendre: () => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const descendable = niveau !== 'ad'

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-start gap-2 p-3">
        <button onClick={() => setOuvert((v) => !v)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0',
              estActif(row.status) ? 'bg-emerald-500' : 'bg-gray-300')} />
            <span className="font-medium text-[#0d0d12] text-sm leading-snug break-words">{row.name}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={clsx('inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border',
              COULEUR_DECISION[row.decision.kind] || COULEUR_DECISION.test)}>
              {row.decision.label}
            </span>
            {r.dateLancement && row.createdTime && (
              <span className="text-[10px] text-gray-400 tabular-nums">{String(row.createdTime).slice(0, 10)}</span>
            )}
            <span className="text-[10px] text-gray-400">{ouvert ? 'Masquer' : 'Voir les chiffres'}</span>
          </div>
        </button>

        {descendable && (
          <button onClick={onDescendre} aria-label="Descendre d’un niveau"
            className="flex-shrink-0 w-9 h-9 rounded-lg border border-[#E5E7EB] text-gray-400 hover:border-[#3434ef] hover:text-[#3434ef] flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {ouvert && (
        <div className="border-t border-[#F3F4F6] px-3 py-2.5">
          <p className="text-[11px] text-gray-500 leading-snug mb-2">{row.decision.reason}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {cols.map((c) => (
              <div key={c.key} className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-gray-400 truncate">{c.label}</span>
                <span className="text-xs font-semibold text-[#0d0d12] tabular-nums whitespace-nowrap">
                  {formatMetric(row[c.key] as number | null, c)}
                  {r.variations && <Variation value={row.variations?.[c.key]} def={c} />}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Le chemin parcouru en descendant, et le moyen de remonter.
 *
 * La descente ne fait que poser un niveau et un filtre — deux choses que la
 * barre d'outils sait déjà faire. Cliquer une campagne, c'est demander « les
 * ad sets, mais seulement les siens » ; le fil rend cet état lisible et
 * réversible, sans quoi on se retrouve deux niveaux plus bas sans savoir
 * pourquoi la liste est courte.
 */
function Fil({ campagne, adset, onRemonter }: {
  campagne: string | null
  adset: string | null
  onRemonter: (vers: 'campaign' | 'adset') => void
}) {
  if (!campagne) return null
  return (
    <nav className="flex items-center gap-1.5 text-sm flex-wrap" aria-label="Chemin">
      <button onClick={() => onRemonter('campaign')}
        className="text-[#3434ef] hover:underline font-medium">Campagnes</button>
      <span className="text-gray-300">›</span>
      {adset ? (
        <>
          <button onClick={() => onRemonter('adset')}
            className="text-[#3434ef] hover:underline font-medium max-w-[280px] truncate">{campagne}</button>
          <span className="text-gray-300">›</span>
          <span className="text-[#0d0d12] font-medium max-w-[280px] truncate">{adset}</span>
        </>
      ) : (
        <span className="text-[#0d0d12] font-medium max-w-[380px] truncate">{campagne}</span>
      )}
    </nav>
  )
}

export default function PilotagePage() {
  const { selectedAccount } = useStore()
  const [niveau, setNiveau] = useState<string>('campaign')
  const [pastille, setPastille] = useState('all')
  const [tri, setTri] = useState<{ cle: string; sens: 'asc' | 'desc' }>({ cle: 'spend', sens: 'desc' })
  const [recherche, setRecherche] = useState('')
  const [detailOuvert, setDetailOuvert] = useState<string | null>(null)
  const [r, setR] = useState<Reglages>(() => REGLAGES_DEFAUT(COLONNES_DEFAUT))

  const set = useCallback((patch: Partial<Reglages>) => setR((prev) => ({ ...prev, ...patch })), [])

  /**
   * Le cockpit renvoie ici avec un niveau et une pastille — « voir les
   * 3 publicités à couper » doit ouvrir ces trois lignes, pas le tableau
   * complet. Lu depuis l'URL au montage plutôt qu'avec `useSearchParams`, qui
   * imposerait une frontière Suspense pour rien.
   *
   * `pret` empêche la première requête de partir avant cette lecture. Sans
   * lui, la page chargeait les campagnes puis, l'URL lue, rechargeait les
   * publicités : deux appels, et un tableau qui se remplaçait sous les yeux
   * une seconde après s'être affiché.
   */
  const [pret, setPret] = useState(false)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const n = q.get('niveau')
    const p = q.get('pastille')
    if (n && NIVEAUX.some((x) => x.id === n)) setNiveau(n)
    if (p && PASTILLES.some((x) => x.id === p)) setPastille(p)
    setPret(true)
  }, [])

  const [data, setData] = useState<{
    lignes: Ligne[]
    periode: { since: string; until: string }
    precedente: { since: string; until: string }
    goals: { targetCpl: number | null; maxCpl: number | null }
    options: { campagnes: { id: string; nom: string }[]; adsets: { id: string; nom: string; campagneId: string | null }[]; objectifs: string[]; formats: string[] }
  } | null>(null)
  const [loading, setLoading] = useState(false)

  // Comme le dashboard : l'identifiant suffit, l'objet change de référence à
  // chaque rafraîchissement de la liste des comptes.
  const compteId = selectedAccount?.id

  const charger = useCallback(() => {
    if (!compteId) return
    setLoading(true)
    const q = new URLSearchParams({
      // La matrice croise deux métriques de publicités : elle lit le même
      // niveau, avec les mêmes filtres et la même période.
      dbAccountId: compteId, level: niveau === 'fatigue' ? 'ad' : niveau,
      periode: r.periode, attribution: r.attribution,
    })
    // Une plage libre l'emporte sur le raccourci : c'est le choix le plus
    // explicite des deux.
    if (r.since && r.until) { q.set('since', r.since); q.set('until', r.until) }
    fetch(`/api/scalr/table?${q}`)
      .then((res) => res.json())
      .then((d) => setData(d.error ? null : d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [compteId, niveau, r.periode, r.attribution, r.since, r.until])

  useEffect(() => { if (pret) charger() }, [charger, pret])

  /** Le périmètre, avant les pastilles : c'est sur lui que se comptent les
   *  verdicts affichés sur les pastilles. */
  const perimetre = useMemo(() => {
    let l = (data?.lignes || []) as Ligne[]
    if (r.campagne !== 'all') l = l.filter((x) => x.campaignId === r.campagne)
    if (r.adset !== 'all') l = l.filter((x) => x.adsetId === r.adset)
    if (r.statut !== 'all') l = l.filter((x) => (r.statut === 'active' ? estActif(x.status) : !estActif(x.status)))
    if (r.objectif !== 'all') l = l.filter((x) => x.objective === r.objectif)
    if (r.format !== 'all') l = l.filter((x) => x.creativeType === r.format)
    // Ce filtre vivait dans la galerie, qui écartait les créas sans dépense
    // après que les pastilles les avaient comptées : une pastille annonçait
    // « 12 » et le mur restait vide. Compteur et affichage partent désormais
    // de la même liste.
    if ((niveau === 'crea' || niveau === 'fatigue') && r.diffuseesSeulement) l = l.filter((x) => (x.spend as number) > 0)
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      l = l.filter((x) => x.name.toLowerCase().includes(q))
    }
    return appliqueConditions(l, r.conditions)
  }, [data, niveau, r.campagne, r.adset, r.statut, r.objectif, r.format,
      r.conditions, r.diffuseesSeulement, recherche])

  const lignes = useMemo(() => {
    let l = perimetre
    const p = PASTILLES.find((x) => x.id === pastille)
    if (p && p.id !== 'all') l = l.filter((x) => dansPastille(x.decision, p))
    return [...l].sort((a, b) => {
      const va = a[tri.cle] as number | null
      const vb = b[tri.cle] as number | null
      // Les valeurs absentes vont en fin de tri quel que soit le sens : une
      // métrique qui n'existe pas n'est ni la meilleure ni la pire.
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      return tri.sens === 'desc' ? vb - va : va - vb
    })
  }, [perimetre, pastille, tri])

  const compteurs = useMemo(() => {
    const c: Record<string, number> = {}
    for (const p of PASTILLES) {
      c[p.id] = p.id === 'all' ? perimetre.length : perimetre.filter((x) => dansPastille(x.decision, p)).length
    }
    return c
  }, [perimetre])

  const nomCampagne = r.campagne === 'all' ? null
    : data?.options.campagnes.find((c) => c.id === r.campagne)?.nom ?? 'Campagne'
  const nomAdset = r.adset === 'all' ? null
    : data?.options.adsets.find((a) => a.id === r.adset)?.nom ?? 'Ad set'

  /**
   * Descendre d'un cran : le niveau change, et le filtre se pose sur la ligne
   * cliquée. Une publicité n'a rien en dessous — elle ouvre son détail.
   */
  function descendre(row: Ligne) {
    if (niveau === 'campaign') { setNiveau('adset'); set({ campagne: row.id, adset: 'all' }) }
    else if (niveau === 'adset') { setNiveau('ad'); set({ campagne: row.campaignId ?? r.campagne, adset: row.id }) }
    else if (niveau === 'ad') setDetailOuvert(row.id)
  }

  function remonter(vers: 'campaign' | 'adset') {
    if (vers === 'campaign') { setNiveau('campaign'); set({ campagne: 'all', adset: 'all' }) }
    else { setNiveau('adset'); set({ adset: 'all' }) }
  }

  const cols = r.colonnes.map((k) => METRIC_BY_KEY.get(k)).filter(Boolean) as MetricDef[]
  const nbColonnes = cols.length + 2 + (r.dateLancement ? 1 : 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Media buying</h1>
          <p className="page-subtitle mt-0.5">
            {selectedAccount?.name || 'Sélectionnez un compte'}
            {data && ` · ${data.periode.since} → ${data.periode.until}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-[#f8f9fc] rounded-lg p-1 border border-[#E5E7EB]">
            {NIVEAUX.map((n) => (
              <button key={n.id} onClick={() => setNiveau(n.id)}
                className={clsx('px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap',
                  niveau === n.id ? 'bg-white text-[#3434ef] shadow-sm border border-[#E5E7EB]' : 'text-gray-500 hover:text-[#0d0d12]')}>
                {n.label}
              </button>
            ))}
          </div>
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher…" className="input w-auto text-sm py-1.5 min-w-[150px]" />
        </div>
      </div>

      <Fil campagne={nomCampagne} adset={nomAdset} onRemonter={remonter} />

      <BarreOutils r={r} set={set} niveau={niveau} options={data?.options || null}
        lignes={perimetre as unknown as Record<string, unknown>[]}
        comparaison={data?.precedente || null} />

      {/* Pastilles — des filtres sur le verdict, pas des étiquettes */}
      <div className="flex flex-wrap gap-2">
        {PASTILLES.map((p) => {
          const n = compteurs[p.id] || 0
          if (p.id !== 'all' && !n) return null
          return (
            <button key={p.id} onClick={() => setPastille(p.id)}
              className={clsx('px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                pastille === p.id
                  ? 'bg-[#3434ef] text-white border-[#3434ef]'
                  : 'bg-white text-gray-600 border-[#E5E7EB] hover:border-gray-300')}>
              {p.label} <span className={pastille === p.id ? 'text-white/70' : 'text-gray-400'}>{n}</span>
            </button>
          )
        })}
      </div>

      {!selectedAccount && <div className="card text-center py-16 text-gray-400 text-sm">Sélectionnez un compte publicitaire.</div>}
      {selectedAccount && loading && <div className="card text-center py-16 text-gray-400 text-sm">Chargement…</div>}

      {selectedAccount && !loading && data && niveau === 'fatigue' && (
        <MatriceFatigue lignes={lignes as unknown as Record<string, unknown>[]} />
      )}

      {selectedAccount && !loading && data && niveau === 'crea' && (
        <GalerieCreas lignes={lignes as never} periode={r.periode} attribution={r.attribution}
          colonnes={r.colonnesCrea} compte={selectedAccount}
          affichage={{ dateLancement: r.dateLancement, afficherStatut: r.afficherStatut,
                       variations: r.variations, wrapNames: r.wrapNames }} />
      )}

      {/* Sous 1024 px, une carte par ligne : un tableau à douze colonnes n'y
          tient pas, et le défilement horizontal met les chiffres hors d'atteinte. */}
      {selectedAccount && !loading && data && niveau !== 'crea' && niveau !== 'fatigue' && (
        <div className="lg:hidden space-y-2">
          {lignes.map((row) => (
            <CarteLigne key={row.id} row={row} cols={cols} r={r} niveau={niveau}
              onDescendre={() => descendre(row)} />
          ))}
          {!lignes.length && (
            <div className="card text-center py-12 text-gray-400 text-sm">Aucune ligne pour ce filtre.</div>
          )}
        </div>
      )}

      {selectedAccount && !loading && data && niveau !== 'crea' && niveau !== 'fatigue' && (
        <div className="card p-0 overflow-hidden hidden lg:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wider bg-[#f8f9fc]">
                  <th className="px-4 py-2.5 text-left font-semibold sticky left-0 bg-[#f8f9fc] min-w-[240px]">
                    {NIVEAUX.find((n) => n.id === niveau)?.label}
                  </th>
                  {r.dateLancement && <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Lancement</th>}
                  <th className="px-4 py-2.5 text-left font-semibold min-w-[280px]">Décision</th>
                  {cols.map((c) => (
                    <th key={c.key}
                      onClick={() => setTri((t) => ({ cle: c.key, sens: t.cle === c.key && t.sens === 'desc' ? 'asc' : 'desc' }))}
                      className="px-3 py-2.5 text-right font-semibold cursor-pointer hover:text-[#0d0d12] whitespace-nowrap">
                      {c.label}
                      {tri.cle === c.key && <span className="ml-1 text-[#3434ef]">{tri.sens === 'desc' ? '↓' : '↑'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((row) => (
                  <tr key={row.id} onClick={() => descendre(row)}
                    className="border-t border-[#F3F4F6] hover:bg-[#f8f9fc] group cursor-pointer">
                    <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-[#f8f9fc] min-w-[240px] max-w-[340px]">
                      <div className="flex items-start gap-2">
                        {r.afficherStatut && (
                          <span title={estActif(row.status) ? 'Actif' : 'En pause'}
                            className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5',
                              estActif(row.status) ? 'bg-emerald-500' : 'bg-gray-300')} />
                        )}
                        <div className="min-w-0">
                          <span className={clsx('font-medium text-[#0d0d12] leading-snug block',
                            r.wrapNames ? 'break-words' : 'truncate')}>
                            {row.name}
                            <span className="text-gray-300 ml-1 group-hover:text-[#3434ef]" aria-hidden>›</span>
                          </span>
                          {r.afficherStatut && (
                            <span className="text-[10px] text-gray-400">
                              {estActif(row.status) ? 'Actif' : 'En pause'}
                              {row.objective && ` · ${objectifLisible(row.objective)}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    {r.dateLancement && (
                      <td className="px-3 py-3 text-gray-500 text-xs tabular-nums whitespace-nowrap align-top">
                        {row.createdTime ? String(row.createdTime).slice(0, 10) : '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 align-top">
                      <span className={clsx('inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border mb-1',
                        COULEUR_DECISION[row.decision.kind] || COULEUR_DECISION.test)}>
                        {row.decision.label}
                      </span>
                      <p className="text-[11px] text-gray-500 leading-snug">{row.decision.reason}</p>
                    </td>
                    {cols.map((c) => (
                      <td key={c.key} className="px-3 py-3 text-right tabular-nums whitespace-nowrap align-top">
                        <span className="text-[#0d0d12]">{formatMetric(row[c.key] as number | null, c)}</span>
                        {r.variations && <Variation value={row.variations?.[c.key]} def={c} />}
                      </td>
                    ))}
                  </tr>
                ))}
                {!lignes.length && (
                  <tr><td colSpan={nbColonnes} className="px-4 py-12 text-center text-gray-400 text-sm">
                    Aucune ligne pour ce filtre.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detailOuvert && (
        <DetailCrea adId={detailOuvert} periode={r.periode} attribution={r.attribution} compte={selectedAccount}
          decision={(data?.lignes as Ligne[] | undefined)?.find((l) => l.id === detailOuvert)?.decision}
          format={(data?.lignes as (Ligne & { creativeType?: string })[] | undefined)?.find((l) => l.id === detailOuvert)?.creativeType ?? undefined}
          onClose={() => setDetailOuvert(null)} />
      )}

      {data && (
        <p className="text-[11px] text-gray-400 px-1">
          {data.goals.targetCpl
            ? `Verdicts calés sur les objectifs du compte : CPL cible ${data.goals.targetCpl} €${data.goals.maxCpl ? `, plafond ${data.goals.maxCpl} €` : ''}.`
            : 'Aucun objectif renseigné pour ce compte — les verdicts se calent sur la médiane du compte lui-même.'}
        </p>
      )}
    </div>
  )
}
