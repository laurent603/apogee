import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & { id?: string }
    accessToken?: string
  }
}

export interface AdAccountMeta {
  id: string
  metaAccountId?: string
  name: string
  currency?: string
  timezone?: string
  brandSettings?: BrandSettings | null
}

export interface BrandSettings {
  id?: string
  adAccountId?: string
  businessModel?: string
  offerType?: string
  marketPositioning?: string
  companyName?: string
  websiteUrl?: string
  industry?: string
  uniqueValueProp?: string
  productDescription?: string
  companyStage?: string
  catalogSize?: string
  averageOrderValue?: number
  productMarginPct?: number
  repeatPurchaseRatePct?: number
  audienceType?: string
  targetAudience?: string
  ageRange?: string
  gender?: string
  targetPersona?: string
  buyerRole?: string
  awarenessLevel?: string
  audienceObjections?: string
  campaignRegions?: string
  primaryObjective?: string
  primaryKpiTarget?: string
  secondaryObjective?: string
  strategicGoal?: string
  shortTermGoal?: string
  monthlyAdBudget?: number
  monthlyConvTarget?: number
  budgetFlexibility?: string
  targetCpa?: number
  maxCpa?: number

  // Seuils du moteur de décision — vides, les défauts du moteur s'appliquent.
  cpaCibleRetargeting?: number
  toleranceWinner?: number
  facteurRegardable?: number
  facteurConfirme?: number
  volumeMinWinner?: number
  volumeMinEntite?: number
  hookMinWinner?: number
  freqFatigue?: number
  linkCtrFaible?: number
  ctrFaible?: number
  joursNouveauTest?: number

  // Économie du compte : la part de marge consacrée à l'acquisition, et le
  // choix de caler les verdicts sur le CPL qui en découle.
  partAcquisition?: number
  cplDerive?: boolean
  targetRoas?: number
  targetMer?: number
  priceRange?: string
  competitors?: string
  seasonality?: string
  peakMonths?: string
  conversionChannel?: string
  landingPageType?: string
  trackingSetup?: string
  crmIntegration?: string
  /** 'total' | 'meta' | 'website' — which lead figure this account trusts */
  leadSource?: string
  /** Account-wide report delivery address, so it is not retyped per agent */
  reportEmail?: string
  reportEmailEnabled?: boolean
  trackedEvents?: string
  trustpilotUrl?: string
}

export interface AutopilotAgent {
  id: string
  name: string
  description?: string
  role: string
  frequency: string
  runMode: string
  analysisPeriod: string
  instructions: string
  outputFormat?: string
  deliveryChannels: string
  isActive: boolean
  lastRunAt?: string
  nextRunAt?: string
}

export interface Report {
  id: string
  title: string
  type: string
  content: string
  isRead: boolean
  createdAt: string
}

export interface MetaInsight {
  spend?: string
  impressions?: string
  clicks?: string
  ctr?: string
  cpc?: string
  cpm?: string
  reach?: string
  frequency?: string
  actions?: { action_type: string; value: string }[]
  website_purchase_roas?: { action_type: string; value: string }[]
  cost_per_action_type?: { action_type: string; value: string }[]
  /** KPIs derived server-side; already honours the account's lead definition */
  _computed?: Record<string, string | number | null>
}
