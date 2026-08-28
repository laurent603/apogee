'use client'
import { useEffect, useState, useCallback } from 'react'
import { useStore } from '@/lib/store'
import toast from 'react-hot-toast'
import type { BrandSettings } from '@/types'
import { clsx } from 'clsx'

// ── Composants extraits EN DEHORS du composant parent ──
// (si définis à l'intérieur, React les recrée à chaque render → perte de focus)

interface FieldProps {
  label: string
  field: keyof BrandSettings
  type?: string
  placeholder?: string
  settings: BrandSettings
  onChange: (field: keyof BrandSettings, value: string | number | boolean | undefined) => void
}

type EcoApercu = {
  periode: { since: string; until: string; jours: number }
  margeParClient: number | null
  tauxSignature: number | null
  tauxSignatureMedia: number | null
  couverture: number | null
  cplPointMort: number | null
  cplCible: number | null
  coutParSignature: number | null
  margeRestante: number | null
  cplMeta: number | null
  cplCrm: number | null
  manquant: string[]
  leadsCrm: number
  leadsMeta: number
  signes: number
  depense: number
  caSigne: number
  cplSaisi: number | null
  actif: boolean
  verdict: { niveau: 'bon' | 'attention' | 'mauvais'; texte: string } | null
}

const euro = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—'
    : `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

/**
 * Un seuil du moteur de décision.
 *
 * L'espace réservé porte la valeur d'origine : laisser vide n'est pas une
 * omission mais un choix, celui de garder le défaut, et il faut pouvoir le
 * lire sans consulter le code.
 */
function Seuil({ label, aide, field, unite, defaut, settings, onChange }: {
  label: string; aide: string; field: keyof BrandSettings; unite: string; defaut: string
  settings: BrandSettings; onChange: FieldProps['onChange']
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-[#F3F4F6] last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#0d0d12]">{label}</p>
        <p className="text-[11px] text-gray-400 leading-snug">{aide}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <input type="number" step="any" placeholder={defaut}
          value={(settings[field] as number | undefined) ?? ''}
          onChange={(e) => onChange(field, e.target.value === '' ? undefined : Number(e.target.value))}
          className="input w-24 text-sm text-right py-1.5" />
        <span className="text-xs text-gray-400 w-4">{unite}</span>
      </div>
    </div>
  )
}

function Field({ label, field, type = 'text', placeholder, settings, onChange }: FieldProps) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type={type}
        value={(settings[field] as string) || ''}
        onChange={(e) =>
          onChange(field, type === 'number' ? parseFloat(e.target.value) || undefined : e.target.value)
        }
        placeholder={placeholder}
        className="input"
      />
    </div>
  )
}

interface TextAreaProps {
  label: string
  field: keyof BrandSettings
  rows?: number
  placeholder?: string
  settings: BrandSettings
  onChange: (field: keyof BrandSettings, value: string) => void
}

function TextArea({ label, field, rows = 2, placeholder, settings, onChange }: TextAreaProps) {
  return (
    <div>
      <label className="label">{label}</label>
      <textarea
        rows={rows}
        value={(settings[field] as string) || ''}
        onChange={(e) => onChange(field, e.target.value)}
        placeholder={placeholder}
        className="input resize-none"
      />
    </div>
  )
}

interface SelectProps {
  label: string
  field: keyof BrandSettings
  options: { value: string; label: string }[]
  settings: BrandSettings
  onChange: (field: keyof BrandSettings, value: string) => void
}

function SelectField({ label, field, options, settings, onChange }: SelectProps) {
  return (
    <div>
      <label className="label">{label}</label>
      <select
        value={(settings[field] as string) || ''}
        onChange={(e) => onChange(field, e.target.value)}
        className="select"
      >
        <option value="">Sélectionner…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

/**
 * Cinq onglets, un rôle chacun.
 *
 * Il y en avait sept, et trois répondaient à la même question — combien vaut
 * un client, combien on accepte de payer : le panier moyen vivait dans
 * « Business », le CPA cible dans « Objectifs », et les deux réapparaissaient
 * dans « Seuils ». « Votre Marché » abritait surtout du réglage technique,
 * sous un nom qui ne l'annonçait pas.
 *
 * Tout l'argent tient désormais dans un seul onglet, dans l'ordre de la
 * chaîne : ce qu'un client rapporte, ce qu'on accepte de payer, ce qui
 * déclenche les verdicts.
 */
const TABS = ['Le client', 'L’audience', 'Économie & seuils', 'Technique & CRM', 'Référentiel créatif']

type GhlState = {
  hasToken: boolean
  locationId: string | null
  tagLead?: string | null
  tagRdv?: string | null
  tagDevis?: string | null
  tagSigne?: string | null
  totalOpps: number
  attributed: number
  wonCount: number
  wonValue: number
  valueFilled: number
  syncedAt: string | null
  syncError: string | null
} | null

type KnowledgeState = {
  notionSourceId: string | null
  hasToken: boolean
  itemCount: number
  syncedAt: string | null
  syncError: string | null
} | null

export default function BrandSettingsPage() {
  const { selectedAccount } = useStore()
  const [tab, setTab] = useState(0)
  const [eco, setEco] = useState<EcoApercu | null>(null)
  const [settings, setSettings] = useState<BrandSettings>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!selectedAccount?.id) return
    const res = await fetch(`/api/brand-settings?dbAccountId=${selectedAccount.id}`)
    const data = await res.json()
    if (data.settings) setSettings(data.settings)
  }, [selectedAccount?.id])

  useEffect(() => { load() }, [load])

  // --- Référentiel créatif (Notion) ---
  const [knowledge, setKnowledge] = useState<KnowledgeState>(null)
  const [notionToken, setNotionToken] = useState('')
  const [notionSourceId, setNotionSourceId] = useState('')
  const [syncing, setSyncing] = useState(false)

  const loadKnowledge = useCallback(async () => {
    if (!selectedAccount?.id) return
    const res = await fetch(`/api/knowledge?dbAccountId=${selectedAccount.id}`)
    const data = await res.json()
    setKnowledge(data.knowledge)
    setNotionSourceId(data.knowledge?.notionSourceId || '')
    setNotionToken('')
  }, [selectedAccount?.id])

  useEffect(() => { loadKnowledge() }, [loadKnowledge])

  async function saveNotion() {
    if (!selectedAccount?.id) return
    const res = await fetch('/api/knowledge', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbAccountId: selectedAccount.id, notionToken, notionSourceId }),
    })
    if (res.ok) { toast.success('Connexion enregistrée'); await loadKnowledge() }
    else toast.error('Erreur d\'enregistrement')
  }

  async function syncNotion() {
    if (!selectedAccount?.id) return
    setSyncing(true)
    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbAccountId: selectedAccount.id }),
      })
      const data = await res.json()
      if (res.ok) toast.success(`${data.itemCount} textes importés`)
      else toast.error(data.error || 'Échec de la synchronisation')
    } catch {
      toast.error('Échec de la synchronisation')
    }
    await loadKnowledge()
    setSyncing(false)
  }

  // --- Pipeline CRM (GoHighLevel) ---
  const [ghl, setGhl] = useState<GhlState>(null)
  const [ghlToken, setGhlToken] = useState('')
  const [ghlLocation, setGhlLocation] = useState('')
  /** Les étiquettes qui marquent chaque étape du tunnel dans GoHighLevel. */
  const [ghlTags, setGhlTags] = useState({ tagLead: '', tagRdv: '', tagDevis: '', tagSigne: '' })
  const [ghlSyncing, setGhlSyncing] = useState(false)

  const loadGhl = useCallback(async () => {
    if (!selectedAccount?.id) return
    const res = await fetch(`/api/ghl?dbAccountId=${selectedAccount.id}`)
    const data = await res.json()
    setGhl(data.ghl)
    setGhlLocation(data.ghl?.locationId || '')
    setGhlTags({
      tagLead: data.ghl?.tagLead || '', tagRdv: data.ghl?.tagRdv || '',
      tagDevis: data.ghl?.tagDevis || '', tagSigne: data.ghl?.tagSigne || '',
    })
    setGhlToken('')
  }, [selectedAccount?.id])

  useEffect(() => { loadGhl() }, [loadGhl])

  // L'aperçu se recharge à l'ouverture de l'onglet et après enregistrement :
  // saisir une marge sans voir le CPL qui en découle n'apprend rien.
  const loadEco = useCallback(() => {
    if (!selectedAccount?.id) return
    fetch(`/api/scalr/economie?dbAccountId=${selectedAccount.id}`)
      .then((r) => r.json())
      .then((d) => setEco(d.error ? null : d))
      .catch(() => setEco(null))
  }, [selectedAccount?.id])

  useEffect(() => { if (tab === 2) loadEco() }, [tab, loadEco])

  /** Un compte de génération de prospects n'a ni ROAS, ni MER, ni catalogue :
   *  ces champs resteraient vides et encombreraient l'écran. */
  const leadGen = settings.businessModel === 'lead_gen'

  async function saveGhl() {
    if (!selectedAccount?.id) return
    const res = await fetch('/api/ghl', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbAccountId: selectedAccount.id, token: ghlToken, locationId: ghlLocation, ...ghlTags }),
    })
    if (res.ok) { toast.success('Connexion enregistrée'); await loadGhl() }
    else toast.error('Erreur d\'enregistrement')
  }

  async function syncGhlNow() {
    if (!selectedAccount?.id) return
    setGhlSyncing(true)
    try {
      const res = await fetch('/api/ghl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbAccountId: selectedAccount.id }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Échec de la synchronisation'); return }
      toast.success(`${data.attributed} opportunités rattachées sur ${data.totalOpps}`)
      // Le tunnel peut échouer seul : le taire laisserait croire que les
      // compteurs à zéro viennent des étiquettes.
      if (data.erreurTunnel) {
        toast.error(`Tunnel CRM non synchronisé — ${String(data.erreurTunnel).slice(0, 120)}`)
      } else if (data.joursTunnel === 0) {
        toast('Aucun contact étiqueté trouvé : vérifiez les libellés ci-dessus.')
      }
    } catch { toast.error('Échec de la synchronisation') }
    await loadGhl()
    setGhlSyncing(false)
  }

  async function save() {
    if (!selectedAccount?.id) return
    setSaving(true)
    const res = await fetch('/api/brand-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbAccountId: selectedAccount.id, ...settings }),
    })
    const data = await res.json()
    if (data.settings) { setSettings(data.settings); toast.success('Sauvegardé ✓') }
    else toast.error('Erreur de sauvegarde')
    setSaving(false)
  }

  // Callback stable pour mettre à jour un champ sans recréer le composant
  const handleChange = useCallback((field: keyof BrandSettings, value: string | number | boolean | undefined) => {
    setSettings((prev) => ({ ...prev, [field]: value }))
  }, [])

  return (
    <div className="max-w-[82rem] space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Brand Settings</h1>
          <p className="page-subtitle mt-0.5">
            Ces informations permettent à l&apos;IA de personnaliser chaque analyse pour votre client.
          </p>
        </div>
        <button onClick={save} disabled={saving || !selectedAccount} className="btn-primary flex-shrink-0">
          {saving ? 'Sauvegarde…' : '✓ Sauvegarder'}
        </button>
      </div>

      {!selectedAccount && (
        <div className="card text-center py-8 text-gray-400">Sélectionnez un compte publicitaire.</div>
      )}

      {selectedAccount && (
        <div className="card">
          {/* Tabs */}
          <div className="flex gap-1 mb-6 border-b border-[#E5E7EB] -mx-5 px-5 overflow-x-auto">
            {TABS.map((t, i) => (
              <button
                key={t}
                onClick={() => setTab(i)}
                className={`pb-3 px-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex-shrink-0 ${
                  tab === i
                    ? 'border-[#3434ef] text-[#3434ef]'
                    : 'border-transparent text-gray-500 hover:text-[#0d0d12]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Tab 0 — Business */}
          {tab === 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
              <div className="space-y-4">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectField label="Modèle business" field="businessModel" settings={settings} onChange={handleChange} options={[
                  { value: 'dtc_ecommerce', label: 'DTC E-commerce' },
                  { value: 'subscription', label: 'Abonnement' },
                  { value: 'marketplace', label: 'Marketplace' },
                  { value: 'saas', label: 'SaaS' },
                  { value: 'agency', label: 'Agence' },
                  { value: 'lead_gen', label: 'Lead Generation' },
                ]} />
                <SelectField label="Type d'offre" field="offerType" settings={settings} onChange={handleChange} options={[
                  { value: 'physical_product', label: 'Produit physique' },
                  { value: 'digital_product', label: 'Produit digital' },
                  { value: 'service', label: 'Service' },
                  { value: 'subscription', label: 'Abonnement' },
                  { value: 'free_trial', label: 'Essai gratuit' },
                ]} />
                <Field label="Nom de l'entreprise" field="companyName" placeholder="ex : Votre Marque" settings={settings} onChange={handleChange} />
                <Field label="Site web" field="websiteUrl" placeholder="https://..." settings={settings} onChange={handleChange} />
                <Field label="Secteur" field="industry" placeholder="ex : Mode e-commerce, SaaS B2B" settings={settings} onChange={handleChange} />
                <SelectField label="Positionnement marché" field="marketPositioning" settings={settings} onChange={handleChange} options={[
                  { value: 'budget', label: 'Budget' },
                  { value: 'mid_range', label: 'Milieu de gamme' },
                  { value: 'premium', label: 'Premium' },
                  { value: 'luxury', label: 'Luxe' },
                ]} />
              </div>
              <TextArea label="Proposition de valeur unique" field="uniqueValueProp" placeholder="Ce qui vous différencie en 1-2 phrases" settings={settings} onChange={handleChange} />
              <TextArea label="Description produit/service" field="productDescription" placeholder="ex : Nous vendons des soins bio pour peaux sensibles" settings={settings} onChange={handleChange} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectField label="Stade de l'entreprise" field="companyStage" settings={settings} onChange={handleChange} options={[
                  { value: 'pre_launch', label: 'Pré-lancement' },
                  { value: 'early', label: 'Démarrage' },
                  { value: 'growth', label: 'Croissance' },
                  { value: 'scale', label: 'Scale' },
                  { value: 'mature', label: 'Mature' },
                ]} />
                {!leadGen && <SelectField label="Taille catalogue" field="catalogSize" settings={settings} onChange={handleChange} options={[
                  { value: '1_product', label: '1 produit' },
                  { value: '2_5', label: '2-5' },
                  { value: '6_20', label: '6-20' },
                  { value: '21_100', label: '21-100' },
                  { value: '100_plus', label: '100+' },
                ]} />}
              </div>
              </div>

              <div className="space-y-5 xl:border-l xl:border-[#E5E7EB] xl:pl-5">
              <div className="space-y-4">
                <p className="text-sm font-semibold text-[#0d0d12]">Marché</p>
              <TextArea label="Concurrents" field="competitors" placeholder="ex : Concurrent A, Concurrent B" settings={settings} onChange={handleChange} />
              <TextArea label="Saisonnalité & périodes clés" field="seasonality" placeholder="ex : Black Friday, Noël, soldes de janvier/juillet" settings={settings} onChange={handleChange} />
              <Field label="Mois pics" field="peakMonths" placeholder="ex : 11,12 pour novembre-décembre" settings={settings} onChange={handleChange} />
              </div>

              <div className="space-y-4">
                <p className="text-sm font-semibold text-[#0d0d12]">Objectifs de la mission</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectField label="Objectif principal" field="primaryObjective" settings={settings} onChange={handleChange} options={[
                  { value: 'sales', label: 'Ventes' },
                  { value: 'leads', label: 'Leads' },
                  { value: 'awareness', label: 'Notoriété' },
                  { value: 'traffic', label: 'Trafic' },
                  { value: 'app_installs', label: 'Installs app' },
                ]} />
                <SelectField label="Objectif secondaire" field="secondaryObjective" settings={settings} onChange={handleChange} options={[
                  { value: 'none', label: 'Aucun' },
                  { value: 'brand_awareness', label: 'Notoriété marque' },
                  { value: 'retargeting', label: 'Retargeting' },
                  { value: 'email_capture', label: 'Capture email' },
                ]} />
                <SelectField label="Objectif stratégique" field="strategicGoal" settings={settings} onChange={handleChange} options={[
                  { value: 'maximize_growth', label: 'Maximiser la croissance' },
                  { value: 'maximize_profit', label: 'Maximiser le profit' },
                  { value: 'test_pmf', label: 'Tester le product-market fit' },
                  { value: 'scale_proven', label: 'Scaler une offre prouvée' },
                ]} />
              </div>
              <Field label="Objectif court terme" field="shortTermGoal" placeholder="ex : Réduire le CPA de 20% ce mois" settings={settings} onChange={handleChange} />
              </div>
              </div>
            </div>
          )}

          {tab === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                <SelectField label="Type d'audience" field="audienceType" settings={settings} onChange={handleChange} options={[
                  { value: 'b2c', label: 'B2C' },
                  { value: 'b2b', label: 'B2B' },
                  { value: 'b2b2c', label: 'B2B2C' },
                  { value: 'mixed', label: 'Mixte' },
                ]} />
                <Field label="Tranche d'âge" field="ageRange" placeholder="ex : 25-45" settings={settings} onChange={handleChange} />
              </div>
              <Field label="Audience cible" field="targetAudience" placeholder="ex : Femmes 25-45, urbaines, intéressées par le bien-être" settings={settings} onChange={handleChange} />
              <SelectField label="Genre" field="gender" settings={settings} onChange={handleChange} options={[
                { value: 'all', label: 'Tous' },
                { value: 'female', label: 'Femmes' },
                { value: 'male', label: 'Hommes' },
              ]} />
              <TextArea label="Persona cible" field="targetPersona" rows={3} placeholder="Décrivez votre client idéal en détail" settings={settings} onChange={handleChange} />
              <Field label="Rôle acheteur/décideur" field="buyerRole" placeholder="ex : Le parent décide, l'enfant utilise" settings={settings} onChange={handleChange} />
              <SelectField label="Niveau de conscience" field="awarenessLevel" settings={settings} onChange={handleChange} options={[
                { value: 'unaware', label: 'Unaware' },
                { value: 'problem_aware', label: 'Problem Aware' },
                { value: 'solution_aware', label: 'Solution Aware' },
                { value: 'product_aware', label: 'Product Aware' },
                { value: 'most_aware', label: 'Most Aware' },
              ]} />
              <TextArea label="Objections de l'audience" field="audienceObjections" placeholder="ex : Prix, manque de confiance, peur de l'engagement" settings={settings} onChange={handleChange} />
              <Field label="Régions de campagne" field="campaignRegions" placeholder="ex : France, Belgique, Suisse" settings={settings} onChange={handleChange} />
            </div>
          )}

          {tab === 2 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">

              <div className="border border-[#E5E7EB] rounded-2xl p-4">
                <p className="text-sm font-semibold text-[#0d0d12]">Seuils des verdicts</p>
                <p className="text-xs text-gray-400 mt-0.5 mb-3 leading-snug">
                  Ils décident de ce qui s’affiche Winner, Fatigue ou À couper dans Media buying.
                  Laissés vides, les valeurs entre parenthèses s’appliquent — un compte non réglé
                  se comporte comme avant.
                </p>

                <Seuil label="Tolérance Winner" unite="×" defaut="1"
                  aide="Une ligne passe si son coût reste sous cible × ce facteur."
                  field="toleranceWinner" settings={settings} onChange={handleChange} />
                <Seuil label="Seuil « regardable »" unite="×" defaut="2"
                  aide="Dépense minimale avant de juger, en multiples de la cible."
                  field="facteurRegardable" settings={settings} onChange={handleChange} />
                <Seuil label="Seuil « confirmé »" unite="×" defaut="5"
                  aide="Dépense qui suffit à valider un winner, sans atteindre le volume."
                  field="facteurConfirme" settings={settings} onChange={handleChange} />
                <Seuil label="Résultats min — publicité" unite="" defaut="3"
                  aide="Nombre de résultats pour conclure sur une créa."
                  field="volumeMinWinner" settings={settings} onChange={handleChange} />
                <Seuil label="Résultats min — campagne / ad set" unite="" defaut="10"
                  aide="Un niveau qui agrège plusieurs créas demande plus de volume."
                  field="volumeMinEntite" settings={settings} onChange={handleChange} />
                <Seuil label="Hook rate min — Winner" unite="%" defaut="0"
                  aide="Vidéos seulement. Zéro désactive : le hook n’entre pas dans le verdict."
                  field="hookMinWinner" settings={settings} onChange={handleChange} />
                <Seuil label="Fréquence de fatigue" unite="" defaut="2,6"
                  aide="Au-delà, l’audience est jugée sous pression."
                  field="freqFatigue" settings={settings} onChange={handleChange} />
                <Seuil label="Link CTR faible" unite="%" defaut="1"
                  aide="En dessous, le clic est considéré comme décroché."
                  field="linkCtrFaible" settings={settings} onChange={handleChange} />
                <Seuil label="CTR faible" unite="%" defaut="0,8"
                  aide="Même rôle, sur le CTR global."
                  field="ctrFaible" settings={settings} onChange={handleChange} />
                <Seuil label="Durée « nouveau test »" unite="j" defaut="14"
                  aide="Au-delà, une ligne active sans signal n’est plus un test."
                  field="joursNouveauTest" settings={settings} onChange={handleChange} />
                <Seuil label="CPA cible — retargeting" unite="€" defaut="—"
                  aide="Cible distincte sur audience chaude. Non appliquée tant que la détection froid/chaud n’existe pas."
                  field="cpaCibleRetargeting" settings={settings} onChange={handleChange} />
              </div>

              <div className="border border-[#E5E7EB] rounded-2xl p-4">
                <p className="text-sm font-semibold text-[#0d0d12]">Économie du compte</p>
                <p className="text-xs text-gray-400 mt-0.5 mb-3 leading-snug">
                  Ce qu’un prospect vaut réellement, déduit de la valeur d’un client, de la marge
                  et du <strong>taux de signature mesuré dans le CRM</strong> — pas d’une estimation.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                  <Field label="Valeur client (€)" field="averageOrderValue" type="number"
                    placeholder="ex : 8000" settings={settings} onChange={handleChange} />
                  <Field label="Marge brute (%)" field="productMarginPct" type="number"
                    placeholder="ex : 35" settings={settings} onChange={handleChange} />
                  <Field label="Part acquisition (%)" field="partAcquisition" type="number"
                    placeholder="50" settings={settings} onChange={handleChange} />
                  <Field label="Fourchette de prix" field="priceRange"
                    placeholder="ex : 5000-15000€" settings={settings} onChange={handleChange} />
                  {!leadGen && (
                    <Field label="Taux de réachat (%)" field="repeatPurchaseRatePct" type="number"
                      placeholder="ex : 25" settings={settings} onChange={handleChange} />
                  )}
                </div>

                {/* La saisie manuelle reste le repli quand la déduction ne tient pas. */}
                <div className="border-t border-[#E5E7EB] pt-3 mb-3">
                  <p className="text-xs font-semibold text-[#0d0d12] mb-2">Saisie manuelle et budget</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Field label="Budget mensuel (€)" field="monthlyAdBudget" type="number" placeholder="ex : 5000" settings={settings} onChange={handleChange} />
                    <Field label="CPA cible (€)" field="targetCpa" type="number" placeholder="ex : 25" settings={settings} onChange={handleChange} />
                    <Field label="CPA max (€)" field="maxCpa" type="number" placeholder="ex : 40" settings={settings} onChange={handleChange} />
                    {!leadGen && <Field label="ROAS cible" field="targetRoas" type="number" placeholder="ex : 2.5" settings={settings} onChange={handleChange} />}
                    {!leadGen && <Field label="MER cible" field="targetMer" type="number" placeholder="ex : 3.0" settings={settings} onChange={handleChange} />}
                  </div>
                </div>

                {eco && (
                  <div className="bg-[#f8f9fc] border border-[#E5E7EB] rounded-xl p-3 space-y-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      Sur {eco.periode.jours} jours · {euro(eco.depense)} dépensés
                    </p>

                    {/* Le rapport qui ne dépend d'aucun comptage de prospects. */}
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                        Coût d’acquisition d’un client
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          ['Coût / signature', euro(eco.coutParSignature)],
                          ['Marge par client', euro(eco.margeParClient)],
                          ['Reste par client', euro(eco.margeRestante)],
                        ].map(([l, v]) => (
                          <div key={l} className="bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-2">
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{l}</p>
                            <p className="text-base font-bold text-[#0d0d12] tabular-nums">{v}</p>
                          </div>
                        ))}
                      </div>
                      {eco.verdict && (
                        <p className={clsx('text-xs leading-snug mt-2 px-2.5 py-2 rounded-lg border',
                          eco.verdict.niveau === 'bon' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : eco.verdict.niveau === 'attention' ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : 'bg-red-50 border-red-200 text-red-800')}>
                          {eco.verdict.texte}
                        </p>
                      )}
                    </div>

                    {/* Le seuil par prospect, et le comptage sur lequel il repose. */}
                    <div className="border-t border-[#E5E7EB] pt-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                        Seuil par prospect
                      </p>
                      {eco.manquant.length ? (
                        <p className="text-xs text-gray-500 leading-snug">
                          Il manque {eco.manquant.join(', ')} pour déduire la cible.
                        </p>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                              ['CPL au point mort', euro(eco.cplPointMort)],
                              ['CPL cible déduit', euro(eco.cplCible)],
                              ['CPL réel', euro(eco.cplMeta)],
                              ['Taux de signature', eco.tauxSignatureMedia != null ? `${eco.tauxSignatureMedia.toFixed(2)}%` : '—'],
                            ].map(([l, v]) => (
                              <div key={l} className="bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-2">
                                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{l}</p>
                                <p className="text-sm font-bold text-[#0d0d12] tabular-nums">{v}</p>
                              </div>
                            ))}
                          </div>
                          <p className="text-[11px] text-gray-500 leading-snug mt-2">
                            Taux et coût sont rapportés aux <strong>{eco.leadsMeta.toLocaleString('fr-FR')} prospects
                            comptés par Meta</strong>, puisque c’est à ce coût-là que le seuil sera comparé.
                          </p>
                        </>
                      )}
                    </div>

                    {/* L'écart de comptage est une information, pas un détail. */}
                    {eco.couverture != null && eco.couverture < 90 && (
                      <div className="border-t border-[#E5E7EB] pt-3">
                        <p className="text-xs text-gray-600 leading-snug">
                          <strong className="text-[#0d0d12]">{eco.couverture.toFixed(0)}% des prospects Meta
                          arrivent au CRM</strong> — {eco.leadsCrm.toLocaleString('fr-FR')} sur {eco.leadsMeta.toLocaleString('fr-FR')}.
                          Doublons de la CAPI, formulaires abandonnés ou attribution perdue : tant que l’écart
                          est là, le taux mesuré côté CRM ({eco.tauxSignature?.toFixed(2)}%) flatte la réalité,
                          et c’est le taux sur base Meta qui sert de seuil.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
                  <input type="checkbox" checked={Boolean(settings.cplDerive)}
                    onChange={(e) => handleChange('cplDerive', e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-gray-300 accent-[#3434ef] flex-shrink-0" />
                  <span className="text-xs text-gray-600 leading-snug">
                    <strong className="text-[#0d0d12]">Caler les verdicts sur le CPL déduit</strong> plutôt que
                    sur le CPA cible saisi{eco?.cplSaisi ? ` (${euro(eco.cplSaisi)})` : ''}. Sans cette case,
                    le calcul reste indicatif et rien ne change dans Media buying.
                    {eco && eco.manquant.length > 0 && ' La saisie sert de repli tant que la déduction est incomplète.'}
                  </span>
                </label>
              </div>
            </div>
          )}

          {tab === 3 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
              <div className="space-y-4">

<div className="border-t border-[#E5E7EB] pt-4">
                <p className="text-sm font-semibold text-[#0d0d12] mb-3">Setup conversion</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <SelectField label="Canal de conversion" field="conversionChannel" settings={settings} onChange={handleChange} options={[
                    { value: 'website', label: 'Site web' },
                    { value: 'app', label: 'App' },
                    { value: 'phone', label: 'Téléphone' },
                    { value: 'in_store', label: 'En magasin' },
                    { value: 'mixed', label: 'Mixte' },
                  ]} />
                  <SelectField label="Type de landing page" field="landingPageType" settings={settings} onChange={handleChange} options={[
                    { value: 'product_page', label: 'Page produit' },
                    { value: 'collection', label: 'Collection' },
                    { value: 'advertorial', label: 'Advertorial' },
                    { value: 'lead_form', label: 'Formulaire lead' },
                    { value: 'quiz', label: 'Quiz / Funnel' },
                  ]} />
                  <SelectField label="Setup tracking" field="trackingSetup" settings={settings} onChange={handleChange} options={[
                    { value: 'pixel_only', label: 'Pixel uniquement' },
                    { value: 'pixel_capi', label: 'Pixel + CAPI' },
                    { value: 'capi_only', label: 'CAPI uniquement' },
                    { value: 'gtm', label: 'GTM' },
                    { value: 'none', label: 'Aucun' },
                  ]} />
                  <SelectField label="CRM" field="crmIntegration" settings={settings} onChange={handleChange} options={[
                    { value: 'none', label: 'Aucun' },
                    { value: 'gohighlevel', label: 'GoHighLevel' },
                    { value: 'hubspot', label: 'HubSpot' },
                    { value: 'salesforce', label: 'Salesforce' },
                    { value: 'pipedrive', label: 'Pipedrive' },
                    { value: 'brevo', label: 'Brevo' },
                    { value: 'other', label: 'Autre' },
                  ]} />
                </div>
                <div>
                  <SelectField label="Prospects à comptabiliser" field="leadSource" settings={settings} onChange={handleChange} options={[
                    { value: 'total', label: 'Total Meta (site web + formulaires)' },
                    { value: 'meta', label: 'Formulaires instantanés Meta uniquement' },
                    { value: 'website', label: 'Site web uniquement (pixel / CAPI)' },
                  ]} />
                  <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                    Si votre CRM renvoie un événement <code className="bg-gray-100 px-1 rounded">Lead</code> via la CAPI pour chaque prospect
                    venu d&apos;un formulaire Meta, le total compte deux fois la même personne. Choisissez alors
                    « Formulaires instantanés Meta uniquement » : le dashboard et les analyses IA utiliseront ce chiffre.
                  </p>
                </div>
                <Field label="Événements trackés" field="trackedEvents" placeholder="ex : Purchase, Lead, ViewContent, AddToCart" settings={settings} onChange={handleChange} />
                <Field label="URL Trustpilot" field="trustpilotUrl" placeholder="https://trustpilot.com/review/votresite.com" settings={settings} onChange={handleChange} />

                <div className="pt-4 border-t border-[#E5E7EB]">
                  <p className="text-sm font-semibold text-[#0d0d12] mb-1">Livraison des rapports</p>
                  <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                    Adresse commune à tous les agents de ce compte. Sans elle, seuls les agents créés
                    via le formulaire personnalisé peuvent envoyer un email — ceux issus d&apos;un
                    template n&apos;ont aucune adresse.
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={Boolean(settings.reportEmailEnabled)}
                      onChange={(e) => handleChange('reportEmailEnabled', e.target.checked as unknown as string)}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">Envoyer tous les rapports de ce compte par email</span>
                  </label>
                  {Boolean(settings.reportEmailEnabled) && (
                    <Field label="Adresse de réception" field="reportEmail" type="email" placeholder="vous@exemple.fr" settings={settings} onChange={handleChange} />
                  )}
                </div>
              </div>
              </div>

              <div className="space-y-5 xl:border-l xl:border-[#E5E7EB] xl:pl-5">
              <div className="space-y-5">
              <div>
                <p className="text-sm font-semibold text-[#0d0d12] mb-1">Pipeline commercial GoHighLevel</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Meta s&apos;arrête au prospect. GoHighLevel sait ce qu&apos;il devient. Les opportunités portent
                  l&apos;identifiant Meta de la publicité, ce qui permet de juger une créa sur la <strong>valeur</strong>
                  {' '}qu&apos;elle rapporte et non sur son seul coût par prospect.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Token d&apos;intégration privée</label>
                  <input type="password" className="input font-mono text-xs"
                    placeholder={ghl?.hasToken ? '•••••••• (enregistré)' : 'pit-…'}
                    value={ghlToken} onChange={(e) => setGhlToken(e.target.value)} />
                  <p className="text-[11px] text-gray-400 mt-1">Laissez vide pour conserver le token enregistré.</p>
                </div>
                <div>
                  <label className="label">ID du sous-compte</label>
                  <input type="text" className="input font-mono text-xs"
                    placeholder="visible dans l'URL du sous-compte"
                    value={ghlLocation} onChange={(e) => setGhlLocation(e.target.value)} />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Le token est lié à un sous-compte : celui d&apos;un autre client ne fonctionnera pas ici.
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-[#0d0d12]">Étiquettes du tunnel</p>
                <p className="text-[11px] text-gray-400 mt-0.5 mb-2">
                  GoHighLevel ne connaît pas d&apos;étape « rendez-vous » ou « devis » : ce sont des
                  étiquettes posées sur le contact, dont le libellé vous appartient. Copiez-collez-les
                  depuis GoHighLevel. Les emoji sont acceptés, ainsi que la casse, les accents et les
                  espaces en trop — seule l&apos;orthographe compte. Une étiquette laissée vide garde son
                  compteur à zéro.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  {([
                    ['tagLead', 'Lead', 'lead fb'],
                    ['tagRdv', 'Rendez-vous pris', 'rdv booké'],
                    ['tagDevis', 'Devis envoyé', 'devis envoyé'],
                    ['tagSigne', 'Signé', 'prospects signés'],
                  ] as const).map(([cle, label, exemple]) => (
                    <div key={cle}>
                      <label className="label">{label}</label>
                      <input type="text" className="input text-xs" placeholder={exemple}
                        value={ghlTags[cle]}
                        onChange={(e) => setGhlTags((t) => ({ ...t, [cle]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={saveGhl} className="btn-secondary">Enregistrer la connexion</button>
                <button onClick={syncGhlNow} disabled={ghlSyncing || !ghl?.hasToken || !ghl?.locationId}
                  className="btn-primary flex items-center gap-2">
                  {ghlSyncing && (
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  )}
                  {ghlSyncing ? 'Synchronisation…' : 'Synchroniser'}
                </button>
              </div>

              {!ghlSyncing && (!ghl?.hasToken || !ghl?.locationId) && (
                <p className="text-xs text-amber-700">
                  Renseignez le token et l&apos;ID du sous-compte, puis enregistrez la connexion pour activer la synchronisation.
                </p>
              )}

              {ghl?.syncError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm font-semibold text-red-900">Échec de la dernière synchronisation</p>
                  <p className="text-xs text-red-800 mt-1 font-mono break-all">{ghl.syncError}</p>
                </div>
              )}

              {ghl?.syncedAt && !ghl.syncError && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {([
                      ['Opportunités', ghl.totalOpps.toLocaleString('fr-FR'), false],
                      ['Rattachées à une pub', `${ghl.attributed}/${ghl.totalOpps}`, ghl.attributed / Math.max(ghl.totalOpps, 1) < 0.5],
                      ['Affaires gagnées', String(ghl.wonCount), ghl.wonCount < 10],
                      ['CA signé', `${Math.round(ghl.wonValue).toLocaleString('fr-FR')} €`, false],
                    ] as [string, string, boolean][]).map(([label, value, warn]) => (
                      <div key={label} className={`rounded-xl border px-3 py-2.5 ${warn ? 'border-amber-200 bg-amber-50' : 'border-[#E5E7EB] bg-[#f8f9fc]'}`}>
                        <p className="text-lg font-bold text-[#0d0d12]">{value}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* The sample size travels with the figure: a ranking built on a
                      handful of closed deals is not a verdict */}
                  {ghl.wonCount < 10 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-xs text-amber-900 leading-relaxed">
                        <strong>{ghl.wonCount} affaire{ghl.wonCount > 1 ? 's' : ''} gagnée{ghl.wonCount > 1 ? 's' : ''} seulement.</strong>{' '}
                        Le CA par créa reste indicatif : une signature de plus peut inverser le classement.
                        Passez vos affaires signées en <em>gagné</em> dans GoHighLevel et renseignez leur montant —
                        le chiffre deviendra fiable sans développement supplémentaire.
                      </p>
                    </div>
                  )}

                  {ghl.valueFilled < ghl.totalOpps && (
                    <p className="text-xs text-gray-500">
                      Montant renseigné sur {ghl.valueFilled} opportunités sur {ghl.totalOpps} — les autres comptent
                      dans le volume, pas dans la valeur.
                    </p>
                  )}

                  <p className="text-xs text-gray-400">
                    Synchronisé le {new Date(ghl.syncedAt).toLocaleString('fr-FR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
                    {' · '}utilisé par toutes les analyses IA de ce compte
                  </p>
                </div>
              )}

              <div className="rounded-xl bg-[#f8f9fc] border border-[#E5E7EB] px-4 py-3">
                <p className="text-xs font-semibold text-[#0d0d12] mb-1.5">Créer le token dans GoHighLevel</p>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal pl-4 leading-relaxed">
                  <li>Placez-vous dans le <strong>sous-compte du client</strong>, pas dans l&apos;agence</li>
                  <li><strong>Paramètres</strong> → <strong>Intégrations privées</strong> → créer une intégration</li>
                  <li>Cochez <span className="font-mono">contacts.readonly</span>, <span className="font-mono">opportunities.readonly</span>, <span className="font-mono">locations.readonly</span></li>
                  <li>Copiez le token, et relevez l&apos;ID du sous-compte dans l&apos;URL</li>
                </ol>
              </div>
              </div>
              </div>
            </div>
          )}

          {tab === 4 && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-semibold text-[#0d0d12] mb-1">Référentiel créatif Notion</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Vos textes publicitaires déjà écrits, classés par étape de tunnel et niveau de conscience.
                  Une fois importés, les analyses créatives reprennent <strong>votre</strong> grille et votre style
                  au lieu d&apos;en inventer une à chaque fois. Le contenu est copié dans l&apos;application :
                  Notion n&apos;est interrogé qu&apos;à la synchronisation, jamais pendant une analyse.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                <div>
                  <label className="label">Token d&apos;intégration Notion</label>
                  <input
                    type="password"
                    className="input font-mono text-xs"
                    placeholder={knowledge?.hasToken ? '•••••••• (enregistré)' : 'ntn_… ou secret_…'}
                    value={notionToken}
                    onChange={(e) => setNotionToken(e.target.value)}
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Laissez vide pour conserver le token déjà enregistré.
                  </p>
                </div>
                <div>
                  <label className="label">Base ou page source</label>
                  <input
                    type="text"
                    className="input font-mono text-xs"
                    placeholder="Collez l'URL ou l'ID Notion"
                    value={notionSourceId}
                    onChange={(e) => setNotionSourceId(e.target.value)}
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Base de données ou page contenant des sous-pages — les deux fonctionnent.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={saveNotion} className="btn-secondary">Enregistrer la connexion</button>
                <button
                  onClick={syncNotion}
                  disabled={syncing || !knowledge?.notionSourceId || !knowledge?.hasToken}
                  className="btn-primary flex items-center gap-2"
                >
                  {syncing && (
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  )}
                  {syncing ? 'Import en cours…' : 'Synchroniser'}
                </button>
              </div>

              {syncing && (
                <p className="text-xs text-gray-400">
                  Notion limite le rythme des requêtes : comptez une à deux minutes pour une centaine de textes.
                </p>
              )}

              {/* A greyed-out button with no explanation is why a token was saved
                  without a source and the sync was never run */}
              {!syncing && (!knowledge?.hasToken || !knowledge?.notionSourceId) && (
                <p className="text-xs text-amber-700">
                  {!knowledge?.hasToken && !knowledge?.notionSourceId
                    ? 'Renseignez le token et la source, puis enregistrez la connexion pour activer la synchronisation.'
                    : !knowledge?.hasToken
                      ? 'Token manquant — renseignez-le puis enregistrez la connexion.'
                      : 'Source manquante — collez l\'URL de votre base ou page Notion, puis enregistrez la connexion.'}
                </p>
              )}

              {knowledge && !knowledge.syncedAt && knowledge.hasToken && knowledge.notionSourceId && !knowledge.syncError && (
                <p className="text-xs text-amber-700">
                  Connexion enregistrée, mais aucun import n&apos;a encore été lancé — cliquez sur <strong>Synchroniser</strong>.
                </p>
              )}

              <p className="text-[11px] text-gray-400">
                Ce référentiel ne vaut que pour <strong>{selectedAccount?.name}</strong>. Chaque compte publicitaire a le sien.
              </p>

              {knowledge?.syncError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm font-semibold text-red-900">Échec de la dernière synchronisation</p>
                  <p className="text-xs text-red-800 mt-1 font-mono break-all">{knowledge.syncError}</p>
                  <p className="text-xs text-red-800 mt-2">
                    Cause la plus fréquente : la page n&apos;est pas partagée avec l&apos;intégration.
                    Dans Notion, ouvrez la source → menu <strong>•••</strong> → <strong>Connexions</strong> → ajoutez votre intégration.
                  </p>
                </div>
              )}

              {knowledge?.syncedAt && !knowledge.syncError && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <div>
                    <p className="text-sm font-semibold text-green-900">
                      {knowledge.itemCount} texte{knowledge.itemCount > 1 ? 's' : ''} importé{knowledge.itemCount > 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-green-800 mt-0.5">
                      Dernière synchronisation le {new Date(knowledge.syncedAt).toLocaleString('fr-FR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
                      {' · '}utilisé par les agents Creative Strategist et Copywriter
                    </p>
                  </div>
                </div>
              )}

              <div className="rounded-xl bg-[#f8f9fc] border border-[#E5E7EB] px-4 py-3">
                <p className="text-xs font-semibold text-[#0d0d12] mb-1.5">Créer le token dans Notion</p>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal pl-4 leading-relaxed">
                  <li>Ouvrez <span className="font-mono">notion.so/my-integrations</span> → <strong>New integration</strong></li>
                  <li>Donnez-lui un nom, sélectionnez votre espace de travail, validez</li>
                  <li>Copiez le <strong>Internal Integration Secret</strong> dans le champ ci-dessus</li>
                  <li>Ouvrez la base ou la page à importer → <strong>•••</strong> → <strong>Connexions</strong> → ajoutez l&apos;intégration</li>
                </ol>
                <p className="text-[11px] text-gray-400 mt-2">
                  Sans la quatrième étape, Notion renvoie une erreur d&apos;accès même avec un token valide.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
