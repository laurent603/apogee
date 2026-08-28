'use client'
import { useState } from 'react'
import { clsx } from 'clsx'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Line, Area, AreaChart, ComposedChart, Legend, Cell,
} from 'recharts'
import type { Saturation, Verdict } from '@/lib/scalr/cockpit'
import {
  TEINTES, ETAT, AXE, court, eur, jourCourt, Bulle, Panneau, SurfaceSat,
  GrilleGraphiques, LegendeScalr, GRILLE, AXE_JOURS, axeValeurs,
} from './graphiques'

/**
 * Les blocs dépliables du cockpit : le détail, la saturation, les tendances.
 *
 * Repliés par défaut. Le cockpit répond d'abord à « est-ce que ça va, et que
 * fais-je en premier ? » ; ces trois blocs répondent à « pourquoi », et cette
 * question ne se pose qu'ensuite.
 */

type Unite = 'eur' | 'nb' | 'pct' | 'ratio'
type Def = { label: string; unite: Unite; inverse?: boolean }

/** Le nom, l'unité et le sens de lecture de chaque métrique détaillée. */
const DEFS: Record<string, Def> = {
  spend: { label: 'Dépense', unite: 'eur' },
  leads: { label: 'Leads', unite: 'nb' },
  cpl: { label: 'CPL', unite: 'eur', inverse: true },
  convRate: { label: 'Taux conv. lead', unite: 'pct' },
  reachSum: { label: 'Reach', unite: 'nb' },
  frequency: { label: 'Fréquence', unite: 'ratio', inverse: true },

  impressions: { label: 'Impressions', unite: 'nb' },
  clicks: { label: 'Clics', unite: 'nb' },
  ctr: { label: 'CTR', unite: 'pct' },
  linkClicks: { label: 'Clics lien', unite: 'nb' },
  linkCtr: { label: 'Link CTR', unite: 'pct' },
  cpc: { label: 'CPC', unite: 'eur', inverse: true },
  cpm: { label: 'CPM', unite: 'eur', inverse: true },
  cpcLink: { label: 'Coût / clic lien', unite: 'eur', inverse: true },
  outboundClicks: { label: 'Clics sortants', unite: 'nb' },
  cpcOutbound: { label: 'Coût / clic sortant', unite: 'eur', inverse: true },
  postEngagement: { label: 'Engagement publication', unite: 'nb' },
  landingPageViews: { label: 'Vues page de destination', unite: 'nb' },

  hookRate: { label: 'Hook rate', unite: 'pct' },
  holdRate: { label: 'Hold rate', unite: 'pct' },
  video3s: { label: 'Vues vidéo 3 s', unite: 'nb' },
  videoStarts: { label: 'Lectures démarrées', unite: 'nb' },
  video25: { label: 'Vues 25 %', unite: 'nb' },
  video50: { label: 'Vues 50 %', unite: 'nb' },
  video75: { label: 'Vues 75 %', unite: 'nb' },
  video95: { label: 'Vues 95 %', unite: 'nb' },
  thruplays: { label: 'Thruplays', unite: 'nb' },
  costPerThruplay: { label: 'Coût / thruplay', unite: 'eur', inverse: true },
}

const fmt = (v: number | null | undefined, u: Unite) => {
  if (v == null || !Number.isFinite(v)) return '—'
  if (u === 'eur') return `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
  if (u === 'pct') return `${v.toFixed(2)}%`
  if (u === 'ratio') return v.toFixed(2)
  return Math.round(v).toLocaleString('fr-FR')
}


const TEINTE_VERDICT: Record<Verdict['niveau'], string> = {
  bon: 'border-emerald-200 bg-emerald-50/50',
  attention: 'border-amber-200 bg-amber-50/50',
  mauvais: 'border-red-200 bg-red-50/50',
}
const TITRE_VERDICT: Record<Verdict['niveau'], string> = {
  bon: 'text-emerald-700', attention: 'text-amber-700', mauvais: 'text-red-700',
}

function BoiteVerdict({ v }: { v: Verdict }) {
  return (
    <div className={clsx('border rounded-xl p-3 mt-auto', TEINTE_VERDICT[v.niveau])}>
      <p className={clsx('text-[10px] font-bold uppercase tracking-widest', TITRE_VERDICT[v.niveau])}>{v.titre}</p>
      <p className="text-xs text-gray-600 leading-snug mt-1">{v.texte}</p>
      <p className="text-xs text-gray-600 leading-snug mt-1.5">
        <span className="font-semibold text-[#3434ef]">Piste : </span>{v.piste}
      </p>
    </div>
  )
}

function Case({ cle, valeur, evo }: { cle: string; valeur: number | null | undefined; evo: number | null | undefined }) {
  const def = DEFS[cle]
  if (!def) return null
  const lisible = evo != null && Number.isFinite(evo) && Math.abs(evo) >= 1
  const bon = def.inverse ? (evo ?? 0) < 0 : (evo ?? 0) > 0
  return (
    <div className="border border-[#E5E7EB] rounded-xl px-3 py-2.5 min-w-0">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide truncate" title={def.label}>
        {def.label}
      </p>
      <p className="text-lg font-bold text-[#0d0d12] tabular-nums leading-tight mt-0.5">
        {fmt(valeur, def.unite)}
      </p>
      <p className={clsx('text-[10px] font-medium tabular-nums mt-0.5',
        !lisible ? 'text-gray-300' : bon ? 'text-emerald-600' : 'text-red-500')}>
        {lisible ? `${evo! > 0 ? '+' : ''}${evo!.toFixed(0)}% vs période préc.` : 'pas de référence'}
      </p>
    </div>
  )
}

/** Un bloc qu'on replie : le cockpit doit tenir sur un écran par défaut. */
export function Bloc({ titre, sous, ouvertParDefaut = false, children }: {
  titre: string; sous: string; ouvertParDefaut?: boolean; children: React.ReactNode
}) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut)
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#0d0d12]">{titre}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{sous}</p>
        </div>
        <button onClick={() => setOuvert((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-lg border border-[#E5E7EB] text-gray-600 hover:border-gray-300 whitespace-nowrap flex-shrink-0">
          {ouvert ? 'Masquer' : 'Afficher'}
        </button>
      </div>
      {ouvert && <div className="mt-4">{children}</div>}
    </div>
  )
}

type Chiffres = Record<string, number | null>

export type Tunnel = {
  leads: number; rdv: number; devis: number; signes: number; ca: number
  tauxRdv: number | null; tauxDevis: number | null; tauxSigne: number | null
  coutRdv: number | null; coutSigne: number | null; roas: number | null
}

/**
 * Le tunnel CRM : ce que le clic est devenu.
 *
 * Meta s'arrête au formulaire. Les coûts affichés ici rapportent la dépense
 * média à ce que le CRM a réellement produit — un coût par rendez-vous ou par
 * signature décide d'un budget bien mieux qu'un coût par lead.
 */
export function QualiteProspect({ t, evolutions, aDesJours }: {
  t: Tunnel; evolutions: Chiffres; aDesJours: boolean
}) {
  const cases: { label: string; valeur: string; cle?: string; inverse?: boolean }[] = [
    { label: 'Leads CRM', valeur: fmt(t.leads, 'nb'), cle: 'leads' },
    { label: 'Rendez-vous', valeur: fmt(t.rdv, 'nb'), cle: 'rdv' },
    { label: 'Taux de prise RDV', valeur: fmt(t.tauxRdv, 'pct'), cle: 'tauxRdv' },
    { label: 'Coût / rendez-vous', valeur: fmt(t.coutRdv, 'eur'), inverse: true },
    { label: 'Devis envoyés', valeur: fmt(t.devis, 'nb'), cle: 'devis' },
    { label: 'Taux de devis', valeur: fmt(t.tauxDevis, 'pct'), cle: 'tauxDevis' },
    { label: 'Signés', valeur: fmt(t.signes, 'nb'), cle: 'signes' },
    { label: 'Coût / signature', valeur: fmt(t.coutSigne, 'eur'), inverse: true },
    { label: 'CA signé', valeur: fmt(t.ca, 'eur'), cle: 'ca' },
    { label: 'ROAS CRM', valeur: t.roas != null ? `${t.roas.toFixed(2)}×` : '—' },
    { label: 'Taux lead → signé', valeur: fmt(t.tauxSigne, 'pct'), cle: 'tauxSigne' },
  ]

  return (
    <div className="space-y-3">
      {!aDesJours && (
        <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Étiquettes à renseigner</p>
          <p className="text-xs text-gray-600 leading-snug mt-1">
            Le tunnel est vide parce que les étiquettes GoHighLevel ne sont pas encore associées.
            Elles se saisissent dans Brand Settings — leur libellé exact varie d’un compte à l’autre.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
        {cases.map((c) => {
          const evo = c.cle ? evolutions[c.cle] : null
          const lisible = evo != null && Number.isFinite(evo) && Math.abs(evo) >= 1
          const bon = c.inverse ? (evo ?? 0) < 0 : (evo ?? 0) > 0
          return (
            <div key={c.label} className="border border-[#E5E7EB] rounded-xl px-3 py-2.5 min-w-0">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide truncate" title={c.label}>
                {c.label}
              </p>
              <p className="text-lg font-bold text-[#0d0d12] tabular-nums leading-tight mt-0.5">{c.valeur}</p>
              <p className={clsx('text-[10px] font-medium tabular-nums mt-0.5',
                !lisible ? 'text-gray-300' : bon ? 'text-emerald-600' : 'text-red-500')}>
                {lisible ? `${evo! > 0 ? '+' : ''}${evo!.toFixed(0)}% vs période préc.` : 'pas de référence'}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function MetriquesDetaillees({ detail, courant, evolutions, verdicts, reachDedoublonne }: {
  detail: { leadgen: string[]; media: string[]; creatif: string[] }
  courant: Chiffres
  evolutions: Chiffres
  verdicts: { leadgen: Verdict; media: Verdict; creatif: Verdict }
  reachDedoublonne: number | null
}) {
  /** La portée dédoublonnée l'emporte sur la somme des journées, qui recompte
   *  la même personne à chaque jour où elle a été touchée. */
  const valeur = (cle: string) =>
    cle === 'reachSum' && reachDedoublonne != null ? reachDedoublonne : courant[cle]

  const colonnes = [
    { titre: 'Essentiel leadgen', cles: detail.leadgen, verdict: verdicts.leadgen, large: false },
    { titre: 'Diagnostic média', cles: detail.media, verdict: verdicts.media, large: true },
    { titre: 'Créatif et vidéo', cles: detail.creatif, verdict: verdicts.creatif, large: true },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {colonnes.map((c) => (
        <div key={c.titre} className="border border-[#E5E7EB] rounded-2xl p-3 flex flex-col gap-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{c.titre}</p>
          <div className="grid grid-cols-2 gap-2">
            {c.cles.map((cle) => (
              <Case key={cle} cle={cle} valeur={valeur(cle)} evo={evolutions[cle]} />
            ))}
          </div>
          <BoiteVerdict v={c.verdict} />
        </div>
      ))}
    </div>
  )
}

function SatKpi({ label, valeur, sous, teinte }: { label: string; valeur: string; sous: string; teinte?: string }) {
  return (
    <div className="border border-[#E5E7EB] rounded-xl px-3 py-2.5">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={clsx('text-xl font-bold tabular-nums leading-tight mt-0.5', teinte || 'text-[#0d0d12]')}>{valeur}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{sous}</p>
    </div>
  )
}

export function SaturationAudience({ s, verdict }: { s: Saturation; verdict: Verdict }) {
  const part = s.partFraiche
  const teintePart = part == null ? undefined
    : part < 35 ? 'text-red-600' : part < 50 ? 'text-amber-600' : 'text-emerald-600'
  const cout = s.coutSaturation
  const teinteCout = cout == null ? undefined
    : cout > 45 ? 'text-red-600' : cout > 30 ? 'text-amber-600' : 'text-emerald-600'

  const jour = (d: string) => d.slice(5)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <SatKpi label="Personnes touchées"
          valeur={s.personnesTouchees != null ? court(s.personnesTouchees) : '—'}
          sous={s.personnesTouchees != null ? 'portée dédoublonnée' : 'après la prochaine synchro'} />
        <SatKpi label="Expositions cumulées" valeur={court(s.expositionsCumulees)}
          sous="somme des journées" />
        <SatKpi label="Part d’expositions fraîches"
          valeur={part != null ? `${part.toFixed(1)}%` : '—'}
          sous={part == null ? '—' : part < 35 ? 'saturation probable' : part < 50 ? 'à surveiller' : 'sain'}
          teinte={teintePart} />
        <SatKpi label="Coût de saturation" valeur={cout != null ? `${cout.toFixed(2)} €` : '—'}
          sous="CPM × fréquence" teinte={teinteCout} />
        <SatKpi label="Coût / 1 000 fraîches"
          valeur={s.coutMilleFraiches != null ? `${s.coutMilleFraiches.toFixed(2)} €` : '—'}
          sous="estimé" />
      </div>

      <GrilleGraphiques>
        <SurfaceSat titre="Composition des personnes touchées"
          children={
            <ComposedChart data={s.composition} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={TEINTES.grille} />
              <XAxis dataKey="date" tickFormatter={jourCourt} {...AXE} minTickGap={4} interval="preserveStartEnd" />
              {/* Assez large pour que le titre d'axe tienne à côté des
                  graduations : sous 70 px il se superpose ou disparaît. */}
              <YAxis yAxisId="g" {...axeValeurs({ compact: true, titre: 'Personnes touchées', largeur: 56 })} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} width={78} {...AXE}
                tickFormatter={(v: number) => `${v}%`}
                label={{ value: '% nouvelles personnes', angle: 90, position: 'insideRight',
                  fontSize: 11, fill: TEINTES.axe, style: { textAnchor: 'middle' } }} />
              <Tooltip cursor={{ fill: 'rgba(52,52,239,.05)' }}
                content={({ active, payload, label }) => (
                  <Bulle actif={active} charge={payload as never} titre={jourCourt(String(label))}
                    format={(v, cle) => (cle === 'partFraiche' ? `${v.toFixed(1)}%` : court(v))} />
                )} />
              <Legend verticalAlign="top" align="center" content={<LegendeScalr />} />
              <Bar isAnimationActive={false} yAxisId="g" dataKey="revues" name="Personnes déjà exposées" stackId="reach"
                fill={TEINTES.secondaire} fillOpacity={0.75} radius={[4, 4, 0, 0]} />
              <Bar isAnimationActive={false} yAxisId="g" dataKey="fraiches" name="Nouvelles personnes estimées" stackId="reach"
                fill={TEINTES.vert} fillOpacity={0.72} radius={[4, 4, 0, 0]} />
              <Line isAnimationActive={false} yAxisId="pct" type="monotone" dataKey="partFraiche" name="% nouvelles personnes touchées"
                stroke={TEINTES.jaune} strokeWidth={2} legendType="line"
                dot={{ r: 3, fill: TEINTES.jaune, strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </ComposedChart>
          } />

        <SurfaceSat titre="Évolution du coût de saturation"
          children={
            <AreaChart data={s.composition} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRILLE} />
              <XAxis {...AXE_JOURS} />
              <YAxis {...axeValeurs({ unite: ' €', titre: 'Coût de saturation (€)', largeur: 52 })} />
              <Tooltip content={({ active, payload, label }) => (
                <Bulle actif={active} charge={payload as never} titre={jourCourt(String(label))} format={(v) => eur(v)} />
              )} />
              <Area isAnimationActive={false} type="monotone" dataKey="cout" name="Coût de saturation (€)"
                stroke={TEINTES.accent} strokeWidth={2} fill={TEINTES.accent} fillOpacity={0.1}
                dot={{ r: 3, fill: TEINTES.accent, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
            </AreaChart>
          } />
      </GrilleGraphiques>

      <BoiteVerdict v={verdict} />
    </div>
  )
}

type Jour = { date: string; spend: number; leads: number; cpl: number | null; ctr: number | null }
type Campagne = { id: string; name: string; cpm: number | null; cpc: number | null; frequency: number | null }

/** Un nom de campagne entier écrase l'axe ; le début porte la convention. */
const nomCourt = (s: string) => (s.length > 22 ? `${s.slice(0, 21)}…` : s)

/**
 * Les tendances.
 *
 * Chaque graphique porte **une échelle**. La dépense et les prospects étaient
 * superposés sur deux axes verticaux : leur alignement était arbitraire et
 * suggérait une corrélation que les données ne portent pas. Ils sont
 * maintenant côte à côte, chacun lisible pour ce qu'il est.
 */
/**
 * Les graphiques de tendance, repris de Scalr.
 *
 * Cinq graphiques, dans son ordre et avec ses partis pris : courbes remplies
 * pour le coût et le clic, barres groupées pour budget et prospects, barres
 * colorées par seuil pour la fréquence, et — le détail qui compte — **le CPC
 * multiplié par dix** pour tenir sur la même échelle que le CPM. C'est ainsi
 * que Scalr évite un second axe, et c'est plus honnête que de superposer deux
 * échelles muettes : le facteur est écrit dans la légende.
 */
/**
 * Les graphiques de tendance, dans la disposition de Scalr.
 *
 * Deux panneaux sur la première rangée, trois sur la seconde — sa
 * `dashboard-chart-grid` puis sa variante `compact`. Chaque graphique tient
 * dans un panneau blanc à en-tête souligné, et sa surface de tracé fait 185 px.
 */
export function GraphiquesTendance({ serie, campagnes }: { serie: Jour[]; campagnes: Campagne[] }) {
  // Scalr tronque les noms de campagne à vingt caractères, sans les incliner.
  const parCampagne = campagnes.slice(0, 10).map((c) => ({
    ...c,
    court: c.name.length > 20 ? c.name.slice(0, 20) : c.name,
    cpcX10: c.cpc != null ? Math.round(c.cpc * 10 * 100) / 100 : null,
  }))

  const teinteFreq = (f: number | null) =>
    f == null ? TEINTES.grille : f > 3 ? ETAT.critique : f > 2.5 ? ETAT.attention : ETAT.bon

  const axeCampagne = { dataKey: 'court', ...AXE, tick: { fontSize: 8, fill: TEINTES.axe }, interval: 0 }

  return (
    <div className="space-y-[14px]">
      <GrilleGraphiques>
        <Panneau titre="Évolution CPL"
          children={
            <AreaChart data={serie} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRILLE} />
              <XAxis {...AXE_JOURS} />
              <YAxis {...axeValeurs({ unite: ' €', titre: 'CPL (€)', largeur: 40 })} />
              <Tooltip content={({ active, payload, label }) => (
                <Bulle actif={active} charge={payload as never} titre={jourCourt(String(label))} format={(v) => eur(v)} />
              )} />
              <Legend verticalAlign="top" align="center" content={<LegendeScalr />} />
              <Area isAnimationActive={false} type="monotone" dataKey="cpl" name="CPL (€)" stroke={TEINTES.accent} legendType="line"
                strokeWidth={2} fill={TEINTES.accent} fillOpacity={0.08}
                dot={{ r: 3, fill: TEINTES.accent, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
            </AreaChart>
          } />

        <Panneau titre="Budget dépensé vs Leads"
          children={
            <BarChart data={serie} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={TEINTES.grille} />
              <XAxis dataKey="date" tickFormatter={jourCourt} {...AXE} minTickGap={4} interval="preserveStartEnd" />
              <YAxis {...axeValeurs({ titre: 'Euros et leads', largeur: 40 })} />
              <Tooltip cursor={{ fill: 'rgba(52,52,239,.05)' }}
                content={({ active, payload, label }) => (
                  <Bulle actif={active} charge={payload as never} titre={jourCourt(String(label))}
                    format={(v, cle) => (cle === 'spend' ? eur(v) : String(Math.round(v)))} />
                )} />
              <Legend verticalAlign="top" align="center" content={<LegendeScalr />} />
              <Bar isAnimationActive={false} dataKey="spend" name="Dépensé (€)" fill={TEINTES.accent} fillOpacity={0.7} radius={[4, 4, 0, 0]} />
              <Bar isAnimationActive={false} dataKey="leads" name="Leads" fill={TEINTES.secondaire} fillOpacity={0.7} radius={[4, 4, 0, 0]} />
            </BarChart>
          } />
      </GrilleGraphiques>

      <GrilleGraphiques compact>
        <Panneau titre="CTR"
          children={
            <AreaChart data={serie} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRILLE} />
              <XAxis {...AXE_JOURS} />
              <YAxis {...axeValeurs({ unite: '%', titre: 'CTR (%)', largeur: 40 })} />
              <Tooltip content={({ active, payload, label }) => (
                <Bulle actif={active} charge={payload as never} titre={jourCourt(String(label))}
                  format={(v) => `${v.toFixed(2)}%`} />
              )} />
              <Legend verticalAlign="top" align="center" content={<LegendeScalr />} />
              <Area isAnimationActive={false} type="monotone" dataKey="ctr" name="CTR %" stroke={TEINTES.vert} legendType="line"
                strokeWidth={2} fill={TEINTES.vert} fillOpacity={0.1}
                dot={{ r: 2, fill: TEINTES.vert, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
            </AreaChart>
          } />

        <Panneau titre="Fréquence"
          children={
            <BarChart data={parCampagne} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={TEINTES.grille} />
              <XAxis {...axeCampagne} />
              <YAxis {...axeValeurs({ titre: 'Fréquence', largeur: 30 })}
                label={{ value: 'Fréquence', angle: -90, position: 'insideLeft',
                  fontSize: 11, fill: TEINTES.axe, style: { textAnchor: 'middle' } }} />
              <Tooltip cursor={{ fill: 'rgba(52,52,239,.05)' }}
                content={({ active, payload, label }) => (
                  <Bulle actif={active} charge={payload as never} titre={String(label)} format={(v) => v.toFixed(2)} />
                )} />
              <Bar isAnimationActive={false} dataKey="frequency" name="Fréquence" radius={[4, 4, 0, 0]}>
                {parCampagne.map((c) => <Cell key={c.id} fill={teinteFreq(c.frequency)} fillOpacity={0.7} />)}
              </Bar>
            </BarChart>
          } />

        <Panneau titre="CPM & CPC"
          children={
            <BarChart data={parCampagne} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={TEINTES.grille} />
              <XAxis {...axeCampagne} />
              <YAxis {...axeValeurs({ unite: ' €', titre: 'Euros', largeur: 36 })} />
              <Tooltip cursor={{ fill: 'rgba(52,52,239,.05)' }}
                content={({ active, payload, label }) => (
                  <Bulle actif={active} charge={payload as never} titre={String(label)} format={(v) => eur(v)} />
                )} />
              <Legend verticalAlign="top" align="center" content={<LegendeScalr />} />
              <Bar isAnimationActive={false} dataKey="cpm" name="CPM (€)" fill={TEINTES.violet} fillOpacity={0.7} radius={[4, 4, 0, 0]} />
              <Bar isAnimationActive={false} dataKey="cpcX10" name="CPC ×10 (€)" fill={TEINTES.rose} fillOpacity={0.7} radius={[4, 4, 0, 0]} />
            </BarChart>
          } />
      </GrilleGraphiques>
    </div>
  )

}
