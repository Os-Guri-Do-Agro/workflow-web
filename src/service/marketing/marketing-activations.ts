import api from '../api'
import { mkt, uploadMarketingFile, type MarketingAsset } from './marketing-core'

/**
 * Cliente das Ativações (M3-B). Rotas em `/marketing/g/:groupId/activations`.
 * Valor em dinheiro vem `null` para quem não vê o financeiro.
 */

export type ActivationKind = 'FAIR' | 'TALK' | 'PARTNER_ACTION' | 'EVENT' | 'SAMPLING' | 'OTHER'
export type ActivationStatus = 'PLANNED' | 'CONFIRMED' | 'DONE' | 'CANCELED'

export interface ActivationBase {
  id: string
  companyId: string
  kind: ActivationKind
  title: string
  /** ISO */
  startAt: string
  endAt: string | null
  location: string | null
  partnerId: string | null
  status: ActivationStatus
  notes: string | null
  results: string | null
  createdById: string | null
  createdAt: string
  updatedAt: string
}

export interface ActivationListItem extends ActivationBase {
  partner: { id: string; name: string } | null
  checklist: { total: number; done: number }
  photoCount: number
  costCents: number | null
  paidCents: number | null
  plannedCents: number | null
}

export interface ActivationChecklistItem {
  id: string
  text: string
  position: number
  doneAt: string | null
  doneBy?: { id: string; name: string } | null
}

export interface ActivationExpense {
  id: string
  date: string
  description: string
  amountCents: number
  category: string
  status: 'PAID' | 'PLANNED'
  supplier: string | null
}

export interface ActivationQuoteSummary {
  id: string
  description: string
  status: 'RECEIVED' | 'CHOSEN' | 'DECLINED'
  supplierName: string | null
  amountCents: number | null
}

export interface ActivationDetail extends ActivationBase {
  createdBy: { id: string; name: string } | null
  partner: { id: string; name: string } | null
  checklist: ActivationChecklistItem[]
  photos: MarketingAsset[]
  /** null = sem acesso ao financeiro */
  expenses: ActivationExpense[] | null
  costCents: number | null
  paidCents: number | null
  plannedCents: number | null
  quotes: ActivationQuoteSummary[]
}

export interface ActivationCalendarRow {
  id: string
  companyId: string
  kind: ActivationKind
  title: string
  status: ActivationStatus
  startAt: string
  endAt: string | null
  location: string | null
}

export interface ActivationFilters {
  from?: string
  to?: string
  status?: ActivationStatus | ''
  kind?: ActivationKind | ''
  companyId?: string | null
  partnerId?: string | null
}

export interface ActivationInput {
  companyId?: string
  kind?: ActivationKind
  title?: string
  startAt?: string
  endAt?: string | null
  location?: string | null
  partnerId?: string | null
  status?: ActivationStatus
  notes?: string | null
  results?: string | null
}

function clean<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  ) as Partial<T>
}

export async function listActivations(groupId: string, filters: ActivationFilters = {}) {
  const { data } = await api.get<ActivationListItem[]>(mkt(groupId, '/activations'), {
    params: clean(filters),
  })
  return data
}

export type ActivationWhen = 'proximas' | 'passadas'

/** Uma página da lista (R1, D12): a aba, o cursor da próxima e a contagem das duas abas. */
export interface ActivationPage {
  items: ActivationListItem[]
  nextCursor: string | null
  counts: { upcoming: number; past: number }
}

export const ACTIVATION_PAGE_SIZE = 50

export async function listActivationsPage(
  groupId: string,
  filters: ActivationFilters,
  when: ActivationWhen,
  cursor?: string | null,
) {
  const { data } = await api.get<ActivationPage>(mkt(groupId, '/activations'), {
    params: clean({ ...filters, quando: when, cursor, limit: ACTIVATION_PAGE_SIZE }),
  })
  return data
}

export async function getActivation(groupId: string, id: string) {
  const { data } = await api.get<ActivationDetail>(mkt(groupId, `/activations/${encodeURIComponent(id)}`))
  return data
}

export async function listActivationCalendar(
  groupId: string,
  range: { from: string; to: string },
  companyId: string | null,
) {
  const { data } = await api.get<ActivationCalendarRow[]>(mkt(groupId, '/activations/calendar'), {
    params: clean({ ...range, companyId }),
  })
  return data
}

export async function createActivation(groupId: string, input: ActivationInput) {
  const { data } = await api.post<ActivationBase>(mkt(groupId, '/activations'), input)
  return data
}

export async function updateActivation(groupId: string, id: string, input: ActivationInput) {
  const { data } = await api.patch<ActivationBase>(mkt(groupId, `/activations/${encodeURIComponent(id)}`), input)
  return data
}

export async function deleteActivation(groupId: string, id: string) {
  await api.delete(mkt(groupId, `/activations/${encodeURIComponent(id)}`))
}

export async function addChecklistItem(groupId: string, id: string, text: string) {
  const { data } = await api.post<ActivationChecklistItem>(
    mkt(groupId, `/activations/${encodeURIComponent(id)}/checklist`),
    { text },
  )
  return data
}

export async function updateChecklistItem(
  groupId: string,
  id: string,
  itemId: string,
  patch: { text?: string; done?: boolean },
) {
  const { data } = await api.patch<ActivationChecklistItem>(
    mkt(groupId, `/activations/${encodeURIComponent(id)}/checklist/${encodeURIComponent(itemId)}`),
    patch,
  )
  return data
}

export async function deleteChecklistItem(groupId: string, id: string, itemId: string) {
  await api.delete(mkt(groupId, `/activations/${encodeURIComponent(id)}/checklist/${encodeURIComponent(itemId)}`))
}

export async function applyChecklistTemplate(groupId: string, id: string) {
  const { data } = await api.post<{ created: number; items: ActivationChecklistItem[] }>(
    mkt(groupId, `/activations/${encodeURIComponent(id)}/checklist/template`),
  )
  return data
}

/** Sobe uma foto ou vídeo: ticket, PUT direto no storage e confirmação. */
export function uploadActivationPhoto(
  groupId: string,
  id: string,
  file: File,
  onProgress?: (percent: number) => void,
) {
  return uploadMarketingFile(
    groupId,
    file,
    async (meta) => {
      const { data } = await api.post(mkt(groupId, `/activations/${encodeURIComponent(id)}/photos`), meta)
      return data
    },
    onProgress,
  )
}

export async function deleteActivationPhoto(groupId: string, id: string, assetId: string) {
  await api.delete(mkt(groupId, `/activations/${encodeURIComponent(id)}/photos/${encodeURIComponent(assetId)}`))
}
