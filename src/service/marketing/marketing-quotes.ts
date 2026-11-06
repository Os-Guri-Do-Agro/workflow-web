import api from '../api'
import { mkt, uploadMarketingFile, type MarketingAsset } from './marketing-core'

/**
 * Cliente dos Orçamentos (M3-B). Rotas em `/marketing/g/:groupId/quotes`.
 * `amountCents` e `files` só vêm para quem vê o financeiro.
 */

export type QuoteStatus = 'RECEIVED' | 'CHOSEN' | 'DECLINED'

export interface Quote {
  id: string
  companyId: string | null
  partnerId: string | null
  partner: { id: string; name: string } | null
  supplierName: string | null
  cardId: string | null
  card: { id: string; title: string } | null
  activationId: string | null
  activation: { id: string; title: string } | null
  description: string
  amountCents: number | null
  /** 'YYYY-MM-DD' */
  validUntil: string | null
  status: QuoteStatus
  notes: string | null
  createdById: string | null
  createdAt: string
  updatedAt: string
  files: MarketingAsset[]
}

export interface QuoteFilters {
  partnerId?: string | null
  cardId?: string | null
  activationId?: string | null
  status?: QuoteStatus | ''
}

export interface QuoteInput {
  description?: string
  amountCents?: number
  companyId?: string | null
  partnerId?: string | null
  supplierName?: string | null
  cardId?: string | null
  activationId?: string | null
  validUntil?: string | null
  notes?: string | null
}

export interface ChooseResult {
  quote: Quote
  declinedIds: string[]
  expenseId: string | null
}

export async function listQuotes(groupId: string, filters: QuoteFilters = {}) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => !!v))
  const { data } = await api.get<Quote[]>(mkt(groupId, '/quotes'), { params })
  return data
}

export async function createQuote(groupId: string, input: QuoteInput) {
  const { data } = await api.post<Quote>(mkt(groupId, '/quotes'), input)
  return data
}

export async function updateQuote(groupId: string, id: string, input: QuoteInput) {
  const { data } = await api.patch<Quote>(mkt(groupId, `/quotes/${encodeURIComponent(id)}`), input)
  return data
}

export async function deleteQuote(groupId: string, id: string) {
  await api.delete(mkt(groupId, `/quotes/${encodeURIComponent(id)}`))
}

export async function chooseQuote(
  groupId: string,
  id: string,
  createExpense?: { date: string; category: string },
) {
  const { data } = await api.post<ChooseResult>(
    mkt(groupId, `/quotes/${encodeURIComponent(id)}/choose`),
    createExpense ? { createExpense } : {},
  )
  return data
}

export function uploadQuoteFile(
  groupId: string,
  id: string,
  file: File,
  onProgress?: (percent: number) => void,
) {
  return uploadMarketingFile(
    groupId,
    file,
    async (meta) => {
      const { data } = await api.post(mkt(groupId, `/quotes/${encodeURIComponent(id)}/files`), meta)
      return data
    },
    onProgress,
  )
}

export async function deleteQuoteFile(groupId: string, id: string, assetId: string) {
  await api.delete(mkt(groupId, `/quotes/${encodeURIComponent(id)}/files/${encodeURIComponent(assetId)}`))
}
