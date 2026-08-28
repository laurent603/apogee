'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { METRICS, GROUPES, METRIC_BY_KEY } from '@/lib/scalr/metrics'
import {
  CHAMPS_FILTRE, CHAMP_PAR_CLE, GROUPES_CHAMPS, OPERATEURS,
  libelleCondition, valeursConnues, type Condition,
} from '@/lib/scalr/filtres'

/**
 * La barre d'outils du pilotage.
 *
 * Trois bandes, comme dans Scalr : le contexte — quand, quoi, sous quelle
 * attribution —, les filtres libres, puis les colonnes. L'ordre n'est pas
 * décoratif : on choisit d'abord la fenêtre, ensuite le périmètre, enfin ce
 * qu'on regarde dedans.
 *
 * Son état vaut pour tous les niveaux. Passer de Campagnes à Publicités ne
 * doit pas réinitialiser la période ni les filtres : c'est le même écran à un
 * autre grain, pas un autre écran.
 */

export type Reglages = {
  periode: string
  since: string
  until: string
  attribution: string
  campagne: string
  adset: string
  statut: string
  objectif: string
  format: string
  conditions: Condition[]
  /** Les colonnes des tableaux. */
  colonnes: string[]
  /** Les tuiles des cartes créa, tenues à part. */
  colonnesCrea: string[]
  dateLancement: boolean
  afficherStatut: boolean
  variations: boolean
  wrapNames: boolean
  /** Écarter les lignes qui n'ont pas dépensé sur la période. */
  diffuseesSeulement: boolean
}

/**
 * Une carte n'a pas l'appétit d'un tableau.
 *
 * Onze colonnes se lisent bien sur une ligne et noient une vignette. Les deux
 * listes sont donc distinctes — c'est ce que fait Scalr — et la barre modifie
 * celle du niveau affiché.
 */
export const COLONNES_CREA_DEFAUT = ['spend', 'resultValue', 'costPerResult', 'ctr']

export const cleColonnes = (niveau: string): 'colonnes' | 'colonnesCrea' =>
  niveau === 'crea' ? 'colonnesCrea' : 'colonnes'

export const REGLAGES_DEFAUT = (colonnes: string[]): Reglages => ({
  periode: '30d', since: '', until: '', attribution: 'default',
  campagne: 'all', adset: 'all', statut: 'all', objectif: 'all', format: 'all',
  conditions: [], colonnes, colonnesCrea: COLONNES_CREA_DEFAUT,
  dateLancement: false, afficherStatut: true, variations: true, wrapNames: false,
  diffuseesSeulement: true,
})

const PRESETS = [
  { id: 'today', label: 'Auj.' }, { id: 'yesterday', label: 'Hier' },
  { id: '7d', label: '7 J' }, { id: '30d', label: '30 J' },
  { id: '60d', label: '60 J' }, { id: '90d', label: '90 J' },
]

const ATTRIBUTIONS = [
  { id: 'default', label: 'Par défaut' },
  { id: '7d_click', label: '7 jours clic' },
  { id: '1d_click', label: '1 jour clic' },
  { id: '1d_view', label: '1 jour vue' },
]

const STATUTS = [
  { id: 'all', label: 'Tous' },
  { id: 'active', label: 'Actif' },
  { id: 'paused', label: 'En pause' },
]

/** Meta nomme ses objectifs en capitales : on les rend lisibles. */
const OBJECTIFS: Record<string, string> = {
  OUTCOME_LEADS: 'Prospects', OUTCOME_SALES: 'Ventes', OUTCOME_TRAFFIC: 'Trafic',
  OUTCOME_AWARENESS: 'Notoriété', OUTCOME_ENGAGEMENT: 'Interactions',
  OUTCOME_APP_PROMOTION: 'Application',
  LEAD_GENERATION: 'Prospects', CONVERSIONS: 'Conversions', LINK_CLICKS: 'Clics',
  BRAND_AWARENESS: 'Notoriété', REACH: 'Couverture', VIDEO_VIEWS: 'Vues vidéo',
  POST_ENGAGEMENT: 'Interactions', MESSAGES: 'Messages',
}
export const objectifLisible = (v: string) =>
  OBJECTIFS[v] || v.replace(/^OUTCOME_/, '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())

type Options = {
  campagnes: { id: string; nom: string }[]
  adsets: { id: string; nom: string; campagneId: string | null }[]
  objectifs: string[]
  formats: string[]
}

/** Un champ étiqueté, pour que la barre se lise sans deviner. */
function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] font-medium text-gray-400 leading-none">{label}</span>
      {children}
    </label>
  )
}

function Bascule({ label, actif, onClick }: { label: string; actif: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={clsx('flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap',
        actif ? 'border-[#3434ef] text-[#3434ef] bg-[#3434ef]/5' : 'border-[#E5E7EB] text-gray-500 hover:border-gray-300')}>
      <span className={clsx('w-6 h-3.5 rounded-full relative transition-colors flex-shrink-0',
        actif ? 'bg-[#3434ef]' : 'bg-gray-200')}>
        <span className={clsx('absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all',
          actif ? 'left-3' : 'left-0.5')} />
      </span>
      {label}
    </button>
  )
}

/** Ferme un panneau quand le clic part ailleurs. */
function useFermetureExterne(ouvert: boolean, fermer: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) fermer()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ouvert, fermer])
  return ref
}

export function BarreOutils({ r, set, niveau, options, lignes, comparaison }: {
  r: Reglages
  set: (patch: Partial<Reglages>) => void
  niveau: string
  options: Options | null
  lignes: Record<string, unknown>[]
  comparaison: { since: string; until: string } | null
}) {
  const [panneauFiltre, setPanneauFiltre] = useState(false)
  const [panneauMetrique, setPanneauMetrique] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [brouillon, setBrouillon] = useState<Condition>({ champ: 'name', op: 'contient', valeur: '' })
  const [depuis, setDepuis] = useState(r.since)
  const [jusqua, setJusqua] = useState(r.until)

  const refFiltre = useFermetureExterne(panneauFiltre, () => setPanneauFiltre(false))
  const refMetrique = useFermetureExterne(panneauMetrique, () => setPanneauMetrique(false))

  // Ce que la barre montre dépend du grain : filtrer des campagnes par
  // campagne n'a pas de sens, et une campagne n'a pas de format créa.
  // La matrice croise deux métriques de publicités : elle mérite les mêmes
  // filtres que le niveau Publicités.
  const surDesPubs = niveau === 'ad' || niveau === 'crea' || niveau === 'fatigue'
  const montre = {
    campagne: niveau !== 'campaign',
    adset: surDesPubs,
    format: surDesPubs,
  }

  // Les ad sets se restreignent à la campagne choisie : dérouler ceux de tout
  // le compte alors qu'une campagne est sélectionnée n'aide personne.
  const adsetsVisibles = useMemo(() => {
    const tous = options?.adsets || []
    return r.campagne === 'all' ? tous : tous.filter((a) => a.campagneId === r.campagne)
  }, [options, r.campagne])

  const champ = CHAMP_PAR_CLE.get(brouillon.champ)
  const ops = OPERATEURS[champ?.type || 'texte']
  const opCourant = ops.find((o) => o.cle === brouillon.op)
  const suggestions = useMemo(
    () => valeursConnues(lignes, brouillon.champ).slice(0, 60),
    [lignes, brouillon.champ])

  const metriquesVisibles = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return METRICS.filter((m) => !q || m.label.toLowerCase().includes(q))
  }, [recherche])

  // La bande des métriques agit sur la liste du niveau affiché : les colonnes
  // du tableau, ou les tuiles des cartes créa.
  const cle = cleColonnes(niveau)
  const colonnes = r[cle]
  const setColonnes = (v: string[]) => set({ [cle]: v } as Partial<Reglages>)
  const basculer = (k: string) =>
    setColonnes(colonnes.includes(k) ? colonnes.filter((x) => x !== k) : [...colonnes, k])

  function ajouterCondition() {
    if (!opCourant?.sansValeur && !brouillon.valeur.trim()) return
    set({ conditions: [...r.conditions, { ...brouillon, valeur: brouillon.valeur.trim() }] })
    setBrouillon({ ...brouillon, valeur: '' })
  }

  function changerChamp(cle: string) {
    // Les opérateurs dépendent du type : garder « contient » sur un nombre
    // laisserait une condition inapplicable.
    const t = CHAMP_PAR_CLE.get(cle)?.type || 'texte'
    setBrouillon({ champ: cle, op: OPERATEURS[t][0].cle, valeur: '' })
  }

  const selectClass = 'text-xs border border-[#E5E7EB] rounded-lg px-2 h-8 bg-white text-[#0d0d12] focus:outline-none focus:border-[#3434ef] min-w-[110px] max-w-[190px]'

  return (
    <div className="space-y-2">
      {/* ── Contexte ── */}
      <div className="card flex flex-wrap items-end gap-x-3 gap-y-2">
        <Champ label="Période">
          <div className="flex items-center gap-1 flex-wrap">
            <div className="flex gap-0.5 bg-[#f8f9fc] rounded-lg p-0.5 border border-[#E5E7EB]">
              {PRESETS.map((p) => (
                <button key={p.id} type="button"
                  onClick={() => { setDepuis(''); setJusqua(''); set({ periode: p.id, since: '', until: '' }) }}
                  className={clsx('px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap',
                    r.periode === p.id && !r.since
                      ? 'bg-white text-[#3434ef] shadow-sm border border-[#E5E7EB]'
                      : 'text-gray-500 hover:text-[#0d0d12]')}>
                  {p.label}
                </button>
              ))}
            </div>
            <input type="date" value={depuis} max={jusqua || undefined} onChange={(e) => setDepuis(e.target.value)}
              className="text-xs border border-[#E5E7EB] rounded-lg px-2 h-8 bg-white text-gray-600 focus:outline-none focus:border-[#3434ef]" />
            <span className="text-gray-300 text-xs">→</span>
            <input type="date" value={jusqua} min={depuis || undefined} onChange={(e) => setJusqua(e.target.value)}
              className="text-xs border border-[#E5E7EB] rounded-lg px-2 h-8 bg-white text-gray-600 focus:outline-none focus:border-[#3434ef]" />
            <button type="button" disabled={!depuis || !jusqua}
              onClick={() => set({ since: depuis, until: jusqua })}
              className="text-xs px-2.5 h-8 rounded-lg border border-[#E5E7EB] text-gray-600 hover:border-[#3434ef] hover:text-[#3434ef] disabled:opacity-40 disabled:hover:border-[#E5E7EB] disabled:hover:text-gray-600">
              OK
            </button>
          </div>
        </Champ>

        {comparaison && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-gray-400 leading-none">Comparaison</span>
            <span className="text-xs text-gray-500 h-8 flex items-center tabular-nums whitespace-nowrap">
              {comparaison.since} → {comparaison.until}
            </span>
          </div>
        )}

        {montre.campagne && (
          <Champ label="Campagne">
            <select value={r.campagne} className={selectClass}
              onChange={(e) => set({ campagne: e.target.value, adset: 'all' })}>
              <option value="all">Toutes</option>
              {(options?.campagnes || []).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </Champ>
        )}

        {montre.adset && (
          <Champ label="Ad set">
            <select value={r.adset} className={selectClass} onChange={(e) => set({ adset: e.target.value })}>
              <option value="all">Tous</option>
              {adsetsVisibles.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </Champ>
        )}

        <Champ label="Statut">
          <select value={r.statut} className={selectClass} onChange={(e) => set({ statut: e.target.value })}>
            {STATUTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Champ>

        <Champ label="Objectif">
          <select value={r.objectif} className={selectClass} onChange={(e) => set({ objectif: e.target.value })}>
            <option value="all">Tous</option>
            {(options?.objectifs || []).map((o) => <option key={o} value={o}>{objectifLisible(o)}</option>)}
          </select>
        </Champ>

        {montre.format && (
          <Champ label="Format créa">
            <select value={r.format} className={selectClass} onChange={(e) => set({ format: e.target.value })}>
              <option value="all">Tous</option>
              {(options?.formats || []).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Champ>
        )}

        <Champ label="Attribution">
          <select value={r.attribution} className={selectClass} onChange={(e) => set({ attribution: e.target.value })}>
            {ATTRIBUTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </Champ>

        <div className="flex flex-wrap gap-1.5 ml-auto">
          {/* Une campagne à zéro euro sur la période encombre autant qu'une
              créa à zéro euro : le filtre vaut à tous les niveaux. */}
          <Bascule label="Diffusées seulement" actif={r.diffuseesSeulement}
            onClick={() => set({ diffuseesSeulement: !r.diffuseesSeulement })} />
          <Bascule label="Date lancement" actif={r.dateLancement} onClick={() => set({ dateLancement: !r.dateLancement })} />
          <Bascule label="Statut" actif={r.afficherStatut} onClick={() => set({ afficherStatut: !r.afficherStatut })} />
          <Bascule label="Variation" actif={r.variations} onClick={() => set({ variations: !r.variations })} />
          <Bascule label="Noms sur 2 lignes" actif={r.wrapNames} onClick={() => set({ wrapNames: !r.wrapNames })} />
        </div>
      </div>

      {/* ── Filtres libres ── */}
      <div className="card flex flex-wrap items-center gap-2" ref={refFiltre}>
        <div className="relative">
          <button type="button" onClick={() => setPanneauFiltre((v) => !v)}
            className={clsx('text-xs px-2.5 py-1.5 rounded-lg border whitespace-nowrap transition-colors',
              panneauFiltre ? 'border-[#3434ef] text-[#3434ef]' : 'border-[#E5E7EB] text-gray-600 hover:border-gray-300')}>
            + Ajouter un filtre
          </button>

          {panneauFiltre && (
            <div className="absolute top-full left-0 mt-1 z-40 bg-white border border-[#E5E7EB] rounded-xl shadow-xl p-3 w-[min(560px,calc(100vw-3rem))]">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Quand</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <select value={brouillon.champ} onChange={(e) => changerChamp(e.target.value)}
                  className={clsx(selectClass, 'flex-1')}>
                  {GROUPES_CHAMPS.map((g) => (
                    <optgroup key={g} label={g}>
                      {CHAMPS_FILTRE.filter((c) => c.groupe === g).map((c) => (
                        <option key={c.cle} value={c.cle}>{c.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                <select value={brouillon.op} onChange={(e) => setBrouillon({ ...brouillon, op: e.target.value })}
                  className={clsx(selectClass, 'min-w-[120px]')}>
                  {ops.map((o) => <option key={o.cle} value={o.cle}>{o.label}</option>)}
                </select>

                {!opCourant?.sansValeur && (
                  <>
                    <input
                      list={suggestions.length ? 'valeurs-filtre' : undefined}
                      type={champ?.type === 'date' ? 'date' : champ?.type === 'nombre' ? 'number' : 'text'}
                      value={brouillon.valeur}
                      onChange={(e) => setBrouillon({ ...brouillon, valeur: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ajouterCondition() } }}
                      placeholder={champ?.type === 'nombre' ? '0' : 'Tape ou choisis une valeur'}
                      className="flex-1 min-w-[150px] text-xs border border-[#E5E7EB] rounded-lg px-2 h-8 bg-white text-[#0d0d12] focus:outline-none focus:border-[#3434ef]" />
                    <datalist id="valeurs-filtre">
                      {suggestions.map((v) => <option key={v} value={v} />)}
                    </datalist>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 mt-3">
                <button type="button" onClick={ajouterCondition}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-[#E5E7EB] text-gray-600 hover:border-gray-300">
                  + Ajouter une condition
                </button>
                <button type="button" onClick={() => { ajouterCondition(); setPanneauFiltre(false) }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[#3434ef] text-white hover:bg-[#2a2ac9] ml-auto">
                  Appliquer
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">Les conditions se cumulent : une ligne doit toutes les satisfaire.</p>
            </div>
          )}
        </div>

        {r.conditions.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-[#f8f9fc] border border-[#E5E7EB] text-[#0d0d12]">
            {libelleCondition(c)}
            <button type="button" aria-label="Retirer ce filtre"
              onClick={() => set({ conditions: r.conditions.filter((_, j) => j !== i) })}
              className="text-gray-400 hover:text-red-500 leading-none">×</button>
          </span>
        ))}

        {r.conditions.length > 1 && (
          <button type="button" onClick={() => set({ conditions: [] })}
            className="text-[11px] text-gray-400 hover:text-red-500 ml-1">Tout retirer</button>
        )}
      </div>

      {/* ── Colonnes ── */}
      <div className="card flex flex-wrap items-center gap-2" ref={refMetrique}>
        <span className="text-[10px] font-medium text-gray-400 mr-0.5">
          {niveau === 'crea' ? 'Indicateurs des cartes' : 'Colonnes'}
        </span>

        {colonnes.map((k) => {
          const m = METRIC_BY_KEY.get(k)
          if (!m) return null
          return (
            <span key={k} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-[#f8f9fc] border border-[#E5E7EB] text-[#0d0d12]">
              {m.label}
              <button type="button" aria-label={`Retirer ${m.label}`}
                onClick={() => basculer(k)}
                className="text-gray-400 hover:text-red-500 leading-none">×</button>
            </span>
          )
        })}

        <div className="relative">
          <button type="button" onClick={() => setPanneauMetrique((v) => !v)}
            className={clsx('text-xs px-2.5 py-1.5 rounded-lg border whitespace-nowrap transition-colors',
              panneauMetrique ? 'border-[#3434ef] text-[#3434ef]' : 'border-[#E5E7EB] text-gray-600 hover:border-gray-300')}>
            + Ajouter une métrique
          </button>

          {panneauMetrique && (
            <div className="absolute top-full left-0 mt-1 z-40 bg-white border border-[#E5E7EB] rounded-xl shadow-xl w-[min(320px,calc(100vw-3rem))]">
              <div className="p-2 border-b border-[#F3F4F6]">
                <input autoFocus value={recherche} onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Chercher une métrique…"
                  className="w-full text-xs border border-[#E5E7EB] rounded-lg px-2 h-8 focus:outline-none focus:border-[#3434ef]" />
              </div>
              <div className="max-h-[380px] overflow-y-auto p-2">
                {GROUPES.map((g) => {
                  const items = metriquesVisibles.filter((m) => m.group === g)
                  if (!items.length) return null
                  const actives = items.filter((m) => colonnes.includes(m.key)).length
                  return (
                    <div key={g} className="mb-3 last:mb-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{g}</p>
                        {actives > 0 && <span className="text-[10px] text-[#3434ef] font-semibold">{actives}</span>}
                      </div>
                      {items.map((m) => (
                        <label key={m.key} className="flex items-center gap-2 py-1 px-1 cursor-pointer hover:bg-[#f8f9fc] rounded">
                          <input type="checkbox" checked={colonnes.includes(m.key)}
                            onChange={() => basculer(m.key)}
                            className="w-3.5 h-3.5 rounded border-gray-300 accent-[#3434ef]" />
                          <span className="text-xs text-[#0d0d12]">{m.label}</span>
                        </label>
                      ))}
                    </div>
                  )
                })}
                {!metriquesVisibles.length && (
                  <p className="text-xs text-gray-400 text-center py-6">Aucune métrique ne correspond.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
