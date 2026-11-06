import api from '../api'
import { mkt } from './marketing-core'

/**
 * Cliente das Campanhas da ala Marketing (spec
 * docs/specs/2026/q4/q4-2/ala-marketing/m2-rastreio-estrategia.md, "M2-B").
 * Rotas em `/marketing/g/:groupId/campaigns`.
 */

export type CampaignStatus = 'DRAFT' | 'AWAITING_APPROVAL' | 'APPROVED' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'CANCELED'

export interface CampaignResults {
  impressions?: number
  reach?: number
  clicks?: number
  leads?: number
  signups?: number
  sales?: number
  notes?: string
}

/** Pedido de resultados: `null` apaga o número, ausente mantém. */
export type CampaignResultsInput = { [K in keyof CampaignResults]?: CampaignResults[K] | null }

export interface MarketingCampaign {
  id: string
  companyId: string
  name: string
  objective: string | null
  status: CampaignStatus
  /** 'YYYY-MM-DD' */
  startDate: string | null
  endDate: string | null
  budgetCents: number | null
  dailyBudgetCents: number | null
  audience: string | null
  channels: string[]
  results: CampaignResults
  learnings: string | null
  approvedBy: { id: string; name: string } | null
  approvedAt: string | null
  createdBy: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

/** Item da lista: a campanha com os totais. Gasto vem `null` para quem não vê o financeiro. */
export interface CampaignListItem extends MarketingCampaign {
  cardsCount: number
  utmsCount: number
  spentPaidCents: number | null
  spentPlannedCents: number | null
  /** Soma dos cliques dos links curtos (UTMs) da campanha */
  clicks: number
  /** Soma das leituras dos QR Codes das UTMs */
  scans: number
}

export interface CampaignCardSummary {
  id: string
  title: string
  kind: string
  status: string
  networks: string[]
  publishAt: string | null
  dueAt: string | null
  assigneeId: string | null
  companyId: string
  assignee: { id: string; name: string } | null
}

export interface CampaignUtmSummary {
  id: string
  placement: string
  shortLink: {
    id: string
    code: string
    shortUrl: string
    targetUrl: string
    utmSource: string | null
    utmMedium: string | null
    utmCampaign: string | null
    utmContent: string | null
    utmTerm: string | null
    clickCount: number
    active: boolean
  } | null
  qr: { id: string; code: string; scanCount: number; active: boolean } | null
}

export interface CampaignExpense {
  id: string
  date: string
  description: string
  amountCents: number
  /** PLANNED | PAID */
  status: string
  category: string
  supplier: string | null
}

export type PaceState = 'none' | 'not_started' | 'on_track' | 'over' | 'under'

export interface CampaignPace {
  totalDays: number
  elapsedDays: number
  dailyCents: number | null
  expectedCents: number | null
  spentCents: number
  diffCents: number | null
  state: PaceState
}

export interface CampaignDetail extends CampaignListItem {
  cards: CampaignCardSummary[]
  utms: CampaignUtmSummary[]
  /** `null` = o papel não vê o financeiro */
  expenses: CampaignExpense[] | null
  pace: CampaignPace | null
}

export interface CampaignFilters {
  status?: CampaignStatus
  companyId?: string
  q?: string
}

export interface CampaignInput {
  companyId: string
  name: string
  objective?: string | null
  startDate?: string | null
  endDate?: string | null
  budgetCents?: number | null
  dailyBudgetCents?: number | null
  audience?: string | null
  channels?: string[]
}

export type CampaignPatch = Partial<Omit<CampaignInput, 'companyId'>> & { learnings?: string | null }

export interface CampaignCalendarRow {
  id: string
  companyId: string
  name: string
  status: CampaignStatus
  statusLabel: string
  startDate: string | null
  endDate: string | null
}

export interface LinkableCard {
  id: string
  title: string
  kind: string
  status: string
  campaignId: string | null
}

function clean<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Partial<T>
}

const base = (groupId: string, suffix = '') => mkt(groupId, `/campaigns${suffix}`)
const enc = encodeURIComponent

export async function listCampaigns(groupId: string, filters: CampaignFilters = {}) {
  const { data } = await api.get<CampaignListItem[]>(base(groupId), { params: clean(filters) })
  return data
}

export async function getCampaign(groupId: string, campaignId: string) {
  const { data } = await api.get<CampaignDetail>(base(groupId, `/${enc(campaignId)}`))
  return data
}

export async function createCampaign(groupId: string, input: CampaignInput) {
  const { data } = await api.post<MarketingCampaign>(base(groupId), input)
  return data
}

export async function updateCampaign(groupId: string, campaignId: string, input: CampaignPatch) {
  const { data } = await api.patch<MarketingCampaign>(base(groupId, `/${enc(campaignId)}`), input)
  return data
}

export async function updateCampaignResults(groupId: string, campaignId: string, input: CampaignResultsInput) {
  const { data } = await api.patch<MarketingCampaign>(base(groupId, `/${enc(campaignId)}/results`), input)
  return data
}

export async function changeCampaignStatus(groupId: string, campaignId: string, status: CampaignStatus) {
  const { data } = await api.post<MarketingCampaign>(base(groupId, `/${enc(campaignId)}/status`), { status })
  return data
}

export async function linkCampaignCard(groupId: string, campaignId: string, cardId: string) {
  await api.post(base(groupId, `/${enc(campaignId)}/cards`), { cardId })
}

export async function unlinkCampaignCard(groupId: string, campaignId: string, cardId: string) {
  await api.delete(base(groupId, `/${enc(campaignId)}/cards/${enc(cardId)}`))
}

export async function listLinkableCards(groupId: string, campaignId: string, q = '') {
  const { data } = await api.get<LinkableCard[]>(base(groupId, `/${enc(campaignId)}/linkable-cards`), {
    params: clean({ q }),
  })
  return data
}

export async function deleteCampaign(groupId: string, campaignId: string) {
  await api.delete(base(groupId, `/${enc(campaignId)}`))
}

export async function listCampaignCalendar(
  groupId: string,
  range: { from: string; to: string },
  companyId?: string | null,
) {
  const { data } = await api.get<CampaignCalendarRow[]>(base(groupId, '/calendar'), {
    params: clean({ from: range.from, to: range.to, companyId }),
  })
  return data
}
