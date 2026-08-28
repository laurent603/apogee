'use client'
import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { clsx } from 'clsx'
import { AreaChart, Area, Tooltip, Line, LineChart } from 'recharts'
import { TEINTES, Bulle, Cadre, AxesJour, eur as eurG } from '@/components/scalr/graphiques'
import type { Sante, Signal, Saturation, Verdict } from '@/lib/scalr/cockpit'
import { Bloc, MetriquesDetaillees, SaturationAudience, GraphiquesTendance, QualiteProspect, type Tunnel } from '@/components/scalr/BlocsDetail'

/**
 * Le cockpit du compte.
 *
 * Une seule page là où il y en avait deux : l'ancien Dashboard et l'ancien
 * Cockpit montraient les mêmes totaux, la même tendance journalière et la même
 * répartition — laquelle refaisait déjà le tableau de pilotage.
 *
 * Ce qui reste répond à une question que Pilotage ne pose pas : **est-ce que
 * ce compte va bien, et qu'est-ce que je traite en premier ?** Le détail par
 * campagne, par créa et par placement vit à côté, dans Pilotage, et n'est pas
 * dupliqué ici.
 *
 * Les verdicts sont ceux du tableau : « 3 publicités à couper » ouvre bien
 * trois lignes là-bas.
 */

const PERIODES = [
  { id: '7d', label: '7 J' }, { id: '14d', label: '14 J' },
  { id: '30d', label: '30 J' }, { id: '60d', label: '60 J' }, { id: '90d', label: '90 J' },
]

const eur = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? '—'
    : `${v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`
const nb = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString('fr-FR')
const pct = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(d)}%`

type Donnees = {
  periode: { since: string; until: string; jours: number }
  precedente: { since: string; until: string }
  fraicheur: string | null
  goals: { targetCpl: number | null; maxCpl: number | null }
  courant: Record<string, number | null>
  evolutions: Record<string, number | null>
  frequenceIndisponible: boolean
  sante: Sante
  signaux: Signal[]
  verdicts: Record<string, number>
  crm: {
    connecte: boolean; opportunites: number; attribuees: number; signees: number; ca: number
    tunnel: Tunnel; evolutions: Record<string, number | null>; aDesJours: boolean
  } | null
  serie: { date: string; spend: number; leads: number; cpl: number | null; ctr: number | null; reach: number; impressions: number; cpm: number | null }[]
  campagnes: { id: string; name: string; cpm: number | null; cpc: number | null; frequency: number | null }[]
  saturation: Saturation
  verdicts_blocs: { saturation: Verdict; leadgen: Verdict; media: Verdict; creatif: Verdict }
  detail: { leadgen: string[]; media: string[]; creatif: string[] }
  nbPubs: number
}

type Lancement = { id: string; campaignName: string; adsetCount: number; adCount: number; status: string; createdAt: string }

/** Une hausse n'est pas une bonne nouvelle en soi : `inverse` dit dans quel
 *  sens lire la métrique. */
function Evo({ v, inverse }: { v: number | null | undefined; inverse?: boolean }) {
  if (v == null || !Number.isFinite(v)) return <span className="text-[11px] text-gray-300">pas de référence</span>
  if (Math.abs(v) < 1) return <span className="text-[11px] text-gray-400">stable</span>
  const bon = inverse ? v < 0 : v > 0
  return (
    <span className={clsx('text-[11px] font-medium tabular-nums', bon ? 'text-emerald-600' : 'text-red-500')}>
      {v > 0 ? '▲' : '▼'}{Math.abs(v).toFixed(0)}%
    </span>
  )
}

function Tuile({ label, valeur, evo, inverse, sous }: {
  label: string; valeur: string; evo?: number | null; inverse?: boolean; sous?: string
}) {
  return (
    <div className="card">
      <p className="text-[11px] text-gray-400 font-medium">{label}</p>
      <p className="text-2xl font-bold text-[#0d0d12] tabular-nums leading-tight mt-0.5">{valeur}</p>
      <div className="mt-0.5">{sous ? <span className="text-[11px] text-gray-400">{sous}</span> : <Evo v={evo} inverse={inverse} />}</div>
    </div>
  )
}

function Ligne({ label, valeur, evo, inverse, sous }: {
  label: string; valeur: string; evo?: number | null; inverse?: boolean; sous?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <strong className="text-[#0d0d12] tabular-nums font-semibold">{valeur}</strong>
        {sous ? <span className="text-[11px] text-gray-400">{sous}</span> : <Evo v={evo} inverse={inverse} />}
      </span>
    </div>
  )
}

/** Un panneau : trois lignes et une jauge qui résume leur tension. */
function Panneau({ titre, badge, jauge, teinte, children }: {
  titre: string; badge: string; jauge: number; teinte: string; children: React.ReactNode
}) {
  return (
    <div className="card flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{titre}</p>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#f8f9fc] border border-[#E5E7EB] text-gray-600 whitespace-nowrap">
          {badge}
        </span>
      </div>
      <div className="space-y-1.5">{children}</div>
      <div className="h-1 bg-[#F3F4F6] rounded-full overflow-hidden mt-auto">
        <div className={clsx('h-full rounded-full transition-all', teinte)}
          style={{ width: `${Math.max(3, Math.min(100, jauge))}%` }} />
      </div>
    </div>
  )
}

const TON_SIGNAL: Record<Signal['ton'], { carte: string; tag: string }> = {
  bon: { carte: 'border-emerald-200 bg-emerald-50/40', tag: 'bg-emerald-100 text-emerald-700' },
  attention: { carte: 'border-amber-200 bg-amber-50/40', tag: 'bg-amber-100 text-amber-700' },
  mauvais: { carte: 'border-red-200 bg-red-50/40', tag: 'bg-red-100 text-red-700' },
  info: { carte: 'border-[#E5E7EB] bg-[#f8f9fc]', tag: 'bg-gray-100 text-gray-600' },
}

export default function CockpitPage() {
  const { selectedAccount } = useStore()
  const [periode, setPeriode] = useState('30d')
  const [d, setD] = useState<Donnees | null>(null)
  const [lancements, setLancements] = useState<Lancement[]>([])
  const [loading, setLoading] = useState(false)

  const charger = useCallback(() => {
    if (!selectedAccount) return
    setLoading(true)
    fetch(`/api/scalr/cockpit?dbAccountId=${selectedAccount.id}&periode=${periode}`)
      .then((r) => r.json())
      .then((x) => setD(x.error ? null : x))
      .catch(() => setD(null))
      .finally(() => setLoading(false))
  }, [selectedAccount, periode])

  useEffect(() => { charger() }, [charger])

  useEffect(() => {
    if (!selectedAccount) return
    const metaId = selectedAccount.metaAccountId || selectedAccount.id
    fetch(`/api/launch-history?metaAccountId=${metaId}`)
      .then((r) => r.json())
      .then((x) => setLancements(Array.isArray(x) ? x : x.launches || []))
      .catch(() => setLancements([]))
  }, [selectedAccount])

  const c = d?.courant
  const e = d?.evolutions
  const score = d?.sante.score ?? null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle mt-0.5">
            {selectedAccount?.name || 'Sélectionnez un compte'}
            {d && ` · ${d.periode.since} → ${d.periode.until}`}
            {d && <span className="text-gray-300"> · comparé au {d.precedente.since} → {d.precedente.until}</span>}
          </p>
        </div>
        <div className="flex gap-1 bg-[#f8f9fc] rounded-lg p-1 border border-[#E5E7EB]">
          {PERIODES.map((p) => (
            <button key={p.id} onClick={() => setPeriode(p.id)}
              className={clsx('px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                periode === p.id ? 'bg-white text-[#3434ef] shadow-sm border border-[#E5E7EB]' : 'text-gray-500 hover:text-[#0d0d12]')}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!selectedAccount && <div className="card text-center py-16 text-gray-400 text-sm">Sélectionnez un compte publicitaire.</div>}
      {selectedAccount && loading && <div className="card text-center py-16 text-gray-400 text-sm">Chargement…</div>}

      {selectedAccount && !loading && d && c && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
          <div className="space-y-4 min-w-0">

            {/* ── Santé ── */}
            <div className="card flex flex-wrap items-center gap-5">
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F3F4F6" strokeWidth="3" />
                  {score !== null && (
                    <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3" strokeLinecap="round"
                      stroke={score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'}
                      strokeDasharray={`${score} 100`} />
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-[#0d0d12] tabular-nums leading-none">
                    {score ?? '—'}
                  </span>
                  <span className="text-[10px] text-gray-400">/ 100</span>
                </div>
              </div>

              <div className="flex-1 min-w-[240px]">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Santé du compte</p>
                <p className="text-lg font-semibold text-[#0d0d12] leading-snug">{d.sante.ton}</p>
                <p className="text-xs text-gray-500 leading-relaxed mt-1">{d.sante.texte}</p>

                {/* Le détail plutôt que le seul nombre : « 62 » ne dit pas quoi
                    faire, « −18 pour le budget qui part sans lead » se traite. */}
                {d.sante.penalites.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {d.sante.penalites.map((x) => (
                      <span key={x.libelle}
                        className="text-[11px] px-2 py-1 rounded-lg bg-red-50 border border-red-100 text-red-700">
                        −{x.points} · {x.libelle}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Tuiles ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tuile label="Dépense" valeur={eur(c.spend)} evo={e?.spend} />
              <Tuile label="Résultats" valeur={nb(c.resultValue)} evo={e?.resultValue} />
              <Tuile label="Coût / résultat" valeur={eur(c.costPerResult)} evo={e?.costPerResult} inverse />
              {d.crm?.connecte
                ? <Tuile label="ROAS CRM"
                    valeur={c.spend && d.crm.ca ? `${(d.crm.ca / c.spend).toFixed(2)}×` : '—'}
                    sous={`${eur(d.crm.ca)} signés`} />
                : <Tuile label="CPM" valeur={eur(c.cpm)} evo={e?.cpm} inverse />}
            </div>

            {/* ── Panneaux ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Panneau titre="Efficacité leadgen"
                badge={c.convRate != null ? `${pct(c.convRate, 1)} CVR` : 'signal faible'}
                jauge={(c.convRate ?? 0) * 10} teinte="bg-[#3434ef]">
                <Ligne label="Taux de conversion" valeur={pct(c.convRate)} evo={e?.convRate} />
                <Ligne label="Link CTR" valeur={pct(c.linkCtr)} evo={e?.linkCtr} />
                <Ligne label="CPL" valeur={eur(c.cpl)} evo={e?.cpl} inverse />
              </Panneau>

              <Panneau titre="Pression média"
                badge={d.frequenceIndisponible ? 'fréquence en attente' : c.frequency ? `${c.frequency.toFixed(2)} fréq.` : '—'}
                jauge={(c.frequency ?? 1) * 22} teinte={(c.frequency ?? 0) > 2.5 ? 'bg-amber-500' : 'bg-[#3434ef]'}>
                <Ligne label="Fréquence"
                  valeur={d.frequenceIndisponible ? '—' : c.frequency?.toFixed(2) ?? '—'}
                  sous={d.frequenceIndisponible ? 'après la prochaine synchro' : undefined} />
                <Ligne label="CPM" valeur={eur(c.cpm)} evo={e?.cpm} inverse />
                <Ligne label="Publicités à couper" valeur={nb(d.verdicts.cut)}
                  sous={d.verdicts.cut ? 'budget sans retour' : 'aucune'} />
              </Panneau>

              <Panneau titre="Créatif" badge={`${d.verdicts.winner} winner${d.verdicts.winner > 1 ? 's' : ''}`}
                jauge={d.nbPubs ? (d.verdicts.winner / d.nbPubs) * 100 * 3 : 0} teinte="bg-emerald-500">
                <Ligne label="Winners confirmés" valeur={nb(d.verdicts.winner)} sous="à décliner" />
                <Ligne label="À confirmer" valeur={nb(d.verdicts.scaler)} sous="CPL bon, volume léger" />
                <Ligne label="Créas en fatigue" valeur={nb(d.verdicts.fatigue)}
                  sous={d.verdicts.fatigue ? 'à rafraîchir' : 'aucune'} />
                <Ligne label="CTR global" valeur={pct(c.ctr)} evo={e?.ctr} />
              </Panneau>

              <Panneau titre="Qualité prospect"
                badge={d.crm?.connecte ? 'CRM actif' : 'CRM non connecté'}
                jauge={d.crm?.connecte && d.crm.opportunites ? (d.crm.signees / d.crm.opportunites) * 100 * 2 : 0}
                teinte="bg-teal-500">
                <Ligne label="Opportunités" valeur={d.crm?.connecte ? nb(d.crm.opportunites) : '—'}
                  sous={d.crm?.connecte ? undefined : 'à connecter'} />
                <Ligne label="Attribuées à Meta" valeur={d.crm?.connecte ? nb(d.crm.attribuees) : '—'}
                  sous={d.crm?.connecte && d.crm.opportunites
                    ? `${Math.round((d.crm.attribuees / d.crm.opportunites) * 100)}% du total` : undefined} />
                <Ligne label="Signées" valeur={d.crm?.connecte ? nb(d.crm.signees) : '—'}
                  sous={d.crm?.connecte ? eur(d.crm.ca) : undefined} />
              </Panneau>
            </div>

            {/* ── Tendance ──
                Deux mesures d'échelles différentes, deux graphiques. Superposées
                sur deux axes verticaux, leur alignement était arbitraire et
                suggérait une corrélation absente des données. */}
            <div className="card">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 className="text-sm font-semibold text-[#0d0d12]">Tendance</h2>
                <span className="text-[11px] text-gray-400">{d.serie.length} jours</span>
              </div>
              {d.serie.length > 1 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Cadre titre="Dépense" note="par jour" children={
                    <AreaChart data={d.serie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <AxesJour unite=" €" />
                      <Tooltip content={({ active, payload, label }) => (
                        <Bulle actif={active} charge={payload as never} titre={String(label)} format={(v) => eurG(v)} />
                      )} />
                      <Area type="monotone" dataKey="spend" name="Dépense" stroke={TEINTES.primaire}
                        fill={TEINTES.primaire} fillOpacity={0.1} strokeWidth={2} activeDot={{ r: 4 }} />
                    </AreaChart>
                  } />
                  <Cadre titre="Coût par résultat" note="par jour" children={
                    <LineChart data={d.serie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <AxesJour unite=" €" />
                      <Tooltip content={({ active, payload, label }) => (
                        <Bulle actif={active} charge={payload as never} titre={String(label)} format={(v) => eurG(v)} />
                      )} />
                      <Line type="monotone" dataKey="cpl" name="Coût par résultat" stroke={TEINTES.secondaire}
                        strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
                    </LineChart>
                  } />
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-12">Pas assez de jours pour tracer une tendance.</p>
              )}
            </div>

            <Bloc titre="Métriques détaillées" sous="Qualité prospect, leadgen, média et créatif, avec leur évolution.">
              {d.crm?.connecte && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Qualité prospect</p>
                  <QualiteProspect t={d.crm.tunnel} evolutions={d.crm.evolutions} aDesJours={d.crm.aDesJours} />
                </div>
              )}
              <MetriquesDetaillees detail={d.detail} courant={d.courant} evolutions={d.evolutions}
                verdicts={d.verdicts_blocs} reachDedoublonne={d.saturation.personnesTouchees} />
            </Bloc>

            <Bloc titre="Saturation audience" sous="Portée utile, fréquence et coût de saturation.">
              <SaturationAudience s={d.saturation} verdict={d.verdicts_blocs.saturation} />
            </Bloc>

            <Bloc titre="Graphiques de tendance" sous="CPL, budget, leads, CTR, fréquence, CPM et CPC.">
              <GraphiquesTendance serie={d.serie} campagnes={d.campagnes} />
            </Bloc>
          </div>

          {/* ── Rail ── */}
          <aside className="space-y-3 xl:sticky xl:top-0">
            <div className="card">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Signaux à traiter</p>
              <p className="text-[11px] text-gray-400 mt-0.5 mb-3">Classés par ce qui coûte le plus vite</p>
              <div className="space-y-2.5">
                {d.signaux.map((s, i) => (
                  <div key={i} className={clsx('border rounded-xl p-3', TON_SIGNAL[s.ton].carte)}>
                    <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide', TON_SIGNAL[s.ton].tag)}>
                      {s.tag}
                    </span>
                    <p className="text-xs font-semibold text-[#0d0d12] leading-snug mt-1.5">{s.titre}</p>
                    <p className="text-[11px] text-gray-500 leading-snug mt-1">{s.texte}</p>
                    <div className="flex gap-4 mt-2">
                      {s.kpis.map(([l, v]) => (
                        <div key={l}>
                          <p className="text-xs font-bold text-[#0d0d12] tabular-nums">{v}</p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">{l}</p>
                        </div>
                      ))}
                    </div>
                    {s.vers && (
                      <a href={`/pilotage?niveau=${s.vers.niveau}&pastille=${s.vers.pastille}`}
                        className="inline-block mt-2.5 text-[11px] font-medium text-[#3434ef] hover:underline">
                        {s.vers.libelle} →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Diagnostic complet</p>
              <p className="text-[11px] text-gray-500 leading-snug mb-3">
                Une lecture stratégique de la période par l’agent, au-delà des seuls seuils.
              </p>
              <a href="/autopilot" className="btn-primary text-xs px-3 py-2 inline-block">Analyser avec l’agent →</a>
            </div>

            {/* Propre à Apogee : Scalr n'a pas d'outil de lancement. */}
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Derniers lancements</p>
                <a href="/history" className="text-[11px] text-[#3434ef] hover:underline">Tout voir</a>
              </div>
              {lancements.length ? (
                <div className="space-y-2">
                  {lancements.slice(0, 5).map((l) => (
                    <div key={l.id} className="flex items-center gap-2.5">
                      <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0',
                        l.status === 'success' ? 'bg-emerald-500' : 'bg-red-500')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#0d0d12] truncate">{l.campaignName}</p>
                        <p className="text-[10px] text-gray-400">{l.adsetCount} ad sets · {l.adCount} pubs</p>
                      </div>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">
                        {new Date(l.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-400">Aucun lancement pour l’instant.</p>
                  <a href="/upload" className="btn-primary text-xs px-3 py-1.5 inline-block mt-2">Lancer une campagne</a>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {d && (
        <p className="text-[11px] text-gray-400 px-1">
          {d.goals.targetCpl
            ? `Seuils du compte : CPL cible ${d.goals.targetCpl} €${d.goals.maxCpl ? `, plafond ${d.goals.maxCpl} €` : ''}.`
            : 'Aucun objectif renseigné — les verdicts se calent sur la médiane du compte. Renseignez le CPL cible dans Brand Settings pour un score plus juste.'}
          {d.fraicheur && ` · Données synchronisées le ${new Date(d.fraicheur).toLocaleString('fr-FR')}.`}
        </p>
      )}
    </div>
  )
}
