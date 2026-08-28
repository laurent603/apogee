'use client'
import { useState } from 'react'
import { clsx } from 'clsx'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Line, LineChart, Area, AreaChart, Legend, Cell,
} from 'recharts'
import type { Saturation, Verdict } from '@/lib/scalr/cockpit'
import { TEINTES, ETAT, AXE, court, eur, Bulle, Cadre, AxesJour } from './graphiques'

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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Empilement : la part fraîche se lit dans la hauteur bleue, sans
            qu'une seconde échelle vienne s'y superposer. */}
        <Cadre titre="Composition des expositions" note="par jour"
          children={
            <BarChart data={s.composition} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={TEINTES.grille} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(8, 10)} {...AXE} minTickGap={16} />
              <YAxis {...AXE} width={44} tickFormatter={court} />
              <Tooltip cursor={{ fill: 'rgba(52,52,239,.05)' }}
                content={({ active, payload, label }) => (
                  <Bulle actif={active} charge={payload as never} titre={String(label)} />
                )} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
              <Bar dataKey="fraiches" name="Personnes fraîches" stackId="a" fill={TEINTES.primaire} />
              <Bar dataKey="revues" name="Déjà exposées" stackId="a" fill={TEINTES.neutre} radius={[4, 4, 0, 0]} />
            </BarChart>
          } />

        <Cadre titre="Coût de saturation" note="CPM × fréquence"
          children={
            <LineChart data={s.composition} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <AxesJour unite=" €" />
              <Tooltip content={({ active, payload, label }) => (
                <Bulle actif={active} charge={payload as never} titre={String(label)}
                  format={(v) => eur(v)} />
              )} />
              <Line type="monotone" dataKey="cout" name="Coût de saturation"
                stroke={TEINTES.secondaire} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
            </LineChart>
          } />
      </div>

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
export function GraphiquesTendance({ serie, campagnes }: { serie: Jour[]; campagnes: Campagne[] }) {
  const parFrequence = [...campagnes]
    .filter((c) => c.frequency != null)
    .sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0))
    .slice(0, 8)

  // La fréquence est un état, pas une catégorie : sa couleur vient du registre
  // d'état, et un libellé la double pour ne jamais reposer sur la couleur seule.
  const teinteFreq = (f: number | null) =>
    f == null ? TEINTES.neutre : f > 3 ? ETAT.critique : f > 2.5 ? ETAT.attention : ETAT.bon

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Cadre titre="Coût par résultat" note="par jour"
          children={
            <LineChart data={serie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <AxesJour unite=" €" />
              <Tooltip content={({ active, payload, label }) => (
                <Bulle actif={active} charge={payload as never} titre={String(label)} format={(v) => eur(v)} />
              )} />
              {/* `connectNulls` : un jour sans résultat n'a pas de coût — le
                  tracer à zéro laisserait croire à une journée gratuite. */}
              <Line type="monotone" dataKey="cpl" name="Coût par résultat"
                stroke={TEINTES.secondaire} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
            </LineChart>
          } />

        <Cadre titre="CTR" note="par jour"
          children={
            <LineChart data={serie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <AxesJour unite="%" />
              <Tooltip content={({ active, payload, label }) => (
                <Bulle actif={active} charge={payload as never} titre={String(label)}
                  format={(v) => `${v.toFixed(2)}%`} />
              )} />
              <Line type="monotone" dataKey="ctr" name="CTR"
                stroke={TEINTES.primaire} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
            </LineChart>
          } />

        <Cadre titre="Dépense" note="par jour"
          children={
            <AreaChart data={serie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <AxesJour unite=" €" />
              <Tooltip content={({ active, payload, label }) => (
                <Bulle actif={active} charge={payload as never} titre={String(label)} format={(v) => eur(v)} />
              )} />
              <Area type="monotone" dataKey="spend" name="Dépense" stroke={TEINTES.primaire}
                fill={TEINTES.primaire} fillOpacity={0.1} strokeWidth={2} activeDot={{ r: 4 }} />
            </AreaChart>
          } />

        <Cadre titre="Prospects" note="par jour"
          children={
            <BarChart data={serie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={TEINTES.grille} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(8, 10)} {...AXE} minTickGap={16} />
              <YAxis {...AXE} width={44} tickFormatter={court} />
              <Tooltip cursor={{ fill: 'rgba(52,52,239,.05)' }}
                content={({ active, payload, label }) => (
                  <Bulle actif={active} charge={payload as never} titre={String(label)}
                    format={(v) => String(Math.round(v))} />
                )} />
              <Bar dataKey="leads" name="Prospects" fill={TEINTES.primaire} radius={[4, 4, 0, 0]} />
            </BarChart>
          } />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Barres horizontales : un nom de campagne se lit, là où un axe
            incliné le tronque. */}
        <Cadre titre="Fréquence par campagne" note="8 premières par dépense"
          hauteur={Math.max(160, parFrequence.length * 34 + 20)}
          children={
            <BarChart data={parFrequence} layout="vertical"
              margin={{ top: 0, right: 44, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={TEINTES.grille} horizontal={false} />
              <XAxis type="number" {...AXE} />
              <YAxis type="category" dataKey="name" width={150} {...AXE}
                tickFormatter={(v: string) => (v.length > 22 ? v.slice(0, 21) + '…' : v)} />
              <Tooltip cursor={{ fill: 'rgba(52,52,239,.05)' }}
                content={({ active, payload, label }) => (
                  <Bulle actif={active} charge={payload as never} titre={String(label)}
                    format={(v) => v.toFixed(2)} />
                )} />
              <Bar dataKey="frequency" name="Fréquence" radius={[0, 4, 4, 0]} barSize={16}
                label={{ position: 'right', fontSize: 10, fill: TEINTES.encre,
                  formatter: (v: number) => (v == null ? '' : v.toFixed(2)) }}>
                {parFrequence.map((c) => <Cell key={c.id} fill={teinteFreq(c.frequency)} />)}
              </Bar>
            </BarChart>
          } />

        {/* CPM et CPC partagent l'euro : une seule échelle suffit. */}
        <Cadre titre="CPM et CPC par campagne" note="même échelle, en euros"
          hauteur={Math.max(160, campagnes.slice(0, 8).length * 34 + 40)}
          children={
            <BarChart data={campagnes.slice(0, 8)} layout="vertical"
              margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={TEINTES.grille} horizontal={false} />
              <XAxis type="number" {...AXE} tickFormatter={(v: number) => `${court(v)} €`} />
              <YAxis type="category" dataKey="name" width={150} {...AXE}
                tickFormatter={(v: string) => (v.length > 22 ? v.slice(0, 21) + '…' : v)} />
              <Tooltip cursor={{ fill: 'rgba(52,52,239,.05)' }}
                content={({ active, payload, label }) => (
                  <Bulle actif={active} charge={payload as never} titre={String(label)} format={(v) => eur(v)} />
                )} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
              <Bar dataKey="cpm" name="CPM" fill={TEINTES.primaire} radius={[0, 4, 4, 0]} barSize={10} />
              <Bar dataKey="cpc" name="CPC" fill={TEINTES.secondaire} radius={[0, 4, 4, 0]} barSize={10} />
            </BarChart>
          } />
      </div>
    </div>
  )

}
