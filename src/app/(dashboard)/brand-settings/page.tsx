'use client'
import { useEffect, useState, useCallback } from 'react'
import { useStore } from '@/lib/store'
import toast from 'react-hot-toast'
import type { BrandSettings } from '@/types'

// ── Composants extraits EN DEHORS du composant parent ──
// (si définis à l'intérieur, React les recrée à chaque render → perte de focus)

interface FieldProps {
  label: string
  field: keyof BrandSettings
  type?: string
  placeholder?: string
  settings: BrandSettings
  onChange: (field: keyof BrandSettings, value: string | number | undefined) => void
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

const TABS = ['Votre Business', 'Votre Audience', 'Objectifs & KPIs', 'Votre Marché']

export default function BrandSettingsPage() {
  const { selectedAccount } = useStore()
  const [tab, setTab] = useState(0)
  const [settings, setSettings] = useState<BrandSettings>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!selectedAccount?.id) return
    const res = await fetch(`/api/brand-settings?dbAccountId=${selectedAccount.id}`)
    const data = await res.json()
    if (data.settings) setSettings(data.settings)
  }, [selectedAccount?.id])

  useEffect(() => { load() }, [load])

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
  const handleChange = useCallback((field: keyof BrandSettings, value: string | number | undefined) => {
    setSettings((prev) => ({ ...prev, [field]: value }))
  }, [])

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Brand Settings</h1>
          <p className="page-subtitle mt-0.5">
            Ces informations permettent à l&apos;IA de personnaliser chaque analyse pour votre client.
          </p>
        </div>
        <button onClick={save} disabled={saving || !selectedAccount} className="btn-primary">
          {saving ? 'Sauvegarde…' : '✓ Sauvegarder'}
        </button>
      </div>

      {!selectedAccount && (
        <div className="card text-center py-8 text-gray-400">Sélectionnez un compte publicitaire.</div>
      )}

      {selectedAccount && (
        <div className="card">
          {/* Tabs */}
          <div className="flex gap-1 mb-6 border-b border-[#E5E7EB] -mx-5 px-5">
            {TABS.map((t, i) => (
              <button
                key={t}
                onClick={() => setTab(i)}
                className={`pb-3 px-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
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
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-2 gap-4">
                <SelectField label="Stade de l'entreprise" field="companyStage" settings={settings} onChange={handleChange} options={[
                  { value: 'pre_launch', label: 'Pré-lancement' },
                  { value: 'early', label: 'Démarrage' },
                  { value: 'growth', label: 'Croissance' },
                  { value: 'scale', label: 'Scale' },
                  { value: 'mature', label: 'Mature' },
                ]} />
                <SelectField label="Taille catalogue" field="catalogSize" settings={settings} onChange={handleChange} options={[
                  { value: '1_product', label: '1 produit' },
                  { value: '2_5', label: '2-5' },
                  { value: '6_20', label: '6-20' },
                  { value: '21_100', label: '21-100' },
                  { value: '100_plus', label: '100+' },
                ]} />
              </div>
              <div className="border-t border-[#E5E7EB] pt-4">
                <p className="text-sm font-semibold text-[#0d0d12] mb-3">Économie du business</p>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Panier moyen (€)" field="averageOrderValue" type="number" placeholder="ex : 85" settings={settings} onChange={handleChange} />
                  <Field label="Marge brute (%)" field="productMarginPct" type="number" placeholder="ex : 40" settings={settings} onChange={handleChange} />
                  <Field label="Taux de réachat (%)" field="repeatPurchaseRatePct" type="number" placeholder="ex : 25" settings={settings} onChange={handleChange} />
                </div>
              </div>
            </div>
          )}

          {/* Tab 1 — Audience */}
          {tab === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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

          {/* Tab 2 — Goals */}
          {tab === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <SelectField label="Objectif principal" field="primaryObjective" settings={settings} onChange={handleChange} options={[
                  { value: 'sales', label: 'Ventes' },
                  { value: 'leads', label: 'Leads' },
                  { value: 'awareness', label: 'Notoriété' },
                  { value: 'traffic', label: 'Trafic' },
                  { value: 'app_installs', label: 'Installs app' },
                ]} />
                <Field label="KPI cible" field="primaryKpiTarget" placeholder="ex : CPA < 25€" settings={settings} onChange={handleChange} />
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
              <div className="border-t border-[#E5E7EB] pt-4">
                <p className="text-sm font-semibold text-[#0d0d12] mb-3">Budget & KPIs</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Budget mensuel (€)" field="monthlyAdBudget" type="number" placeholder="ex : 5000" settings={settings} onChange={handleChange} />
                  <Field label="CPA cible (€)" field="targetCpa" type="number" placeholder="ex : 25" settings={settings} onChange={handleChange} />
                  <Field label="CPA max (€)" field="maxCpa" type="number" placeholder="ex : 40" settings={settings} onChange={handleChange} />
                  <Field label="ROAS cible" field="targetRoas" type="number" placeholder="ex : 2.5" settings={settings} onChange={handleChange} />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <Field label="MER cible" field="targetMer" type="number" placeholder="ex : 3.0" settings={settings} onChange={handleChange} />
                  <Field label="Fourchette de prix" field="priceRange" placeholder="ex : 50-200€" settings={settings} onChange={handleChange} />
                </div>
              </div>
            </div>
          )}

          {/* Tab 3 — Market */}
          {tab === 3 && (
            <div className="space-y-4">
              <TextArea label="Concurrents" field="competitors" placeholder="ex : Concurrent A, Concurrent B" settings={settings} onChange={handleChange} />
              <TextArea label="Saisonnalité & périodes clés" field="seasonality" placeholder="ex : Black Friday, Noël, soldes de janvier/juillet" settings={settings} onChange={handleChange} />
              <Field label="Mois pics" field="peakMonths" placeholder="ex : 11,12 pour novembre-décembre" settings={settings} onChange={handleChange} />
              <div className="border-t border-[#E5E7EB] pt-4">
                <p className="text-sm font-semibold text-[#0d0d12] mb-3">Setup conversion</p>
                <div className="grid grid-cols-2 gap-4">
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
                    { value: 'hubspot', label: 'HubSpot' },
                    { value: 'salesforce', label: 'Salesforce' },
                    { value: 'pipedrive', label: 'Pipedrive' },
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
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
