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
}
