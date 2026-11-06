import axios from 'axios'
import api from '../api'
import { mkt, type MarketingAsset, type MarketingUploadTicket } from './marketing-core'

/**
 * Cliente do financeiro da ala Marketing (spec
 * docs/specs/2026/q4/q4-2/ala-marketing/m3-dinheiro-eventos.md, M3-A).
 * Dinheiro sempre em centavos inteiros; data 'YYYY-MM-DD', mês 'YYYY-MM'.
 */

export type ExpenseStatus = 'PAID' | 'PLANNED'

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  PAID: 'Pago',
  PLANNED: 'Previsto',
}

export interface MarketingExpense {
  id: string
  companyId: string
  date: string
  description: string
  amountCents: number
  category: string
  status: ExpenseStatus
  paymentMethod: string | null
  supplier: string | null
  partnerId: string | null
  partnerName: string | null
  campaignId: string | null
  campaignName: string | null
  activationId: string | null
  activationTitle: string | null
  cardId: string | null
  cardTitle: string | null
  recurringId: string | null
  invoiceNumber: string | null
  noInvoiceNeeded: boolean
  notes: string | null
  createdById: string | null
  createdBy: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
  invoices: MarketingAsset[]
  missingInvoice: boolean
  canDelete: boolean
}

export interface ExpenseTotals {
  paidCents: number
  plannedCents: number
  missingInvoiceCount: number
  count: number
}

export interface ExpenseList {
  month: string
  items: MarketingExpense[]
  totals: ExpenseTotals
}

export interface ExpenseFilter {
  month: string
  companyId?: string | null
  category?: string | null
  campaignId?: string | null
  activationId?: string | null
  status?: ExpenseStatus | null
  missingInvoice?: boolean
  q?: string | null
}

export interface ExpenseInput {
  companyId: string
  date: string
  description: string
  amountCents: number
  category: string
  status?: ExpenseStatus
  paymentMethod?: string | null
  supplier?: string | null
  partnerId?: string | null
  campaignId?: string | null
  activationId?: string | null
  cardId?: string | null
  invoiceNumber?: string | null
  noInvoiceNeeded?: boolean
  notes?: string | null
}

export interface SummaryLine {
  category: string
  budgetCents: number | null
  paidCents: number
  plannedCents: number
  spentCents: number
  diffCents: number | null
  over: boolean
  count: number
}

export interface RecurringPendingItem {
  ruleId: string
  companyId: string
  description: string
  category: string
  amountCents: number
  date: string
}

export interface FinanceSummary {
  month: string
  companyId: string | null
  categories: SummaryLine[]
  total: SummaryLine & { budgetSource: 'total' | 'categories' | 'mixed' | null }
  missingInvoiceCount: number
  invoiceCount: number
  recurringPending: { count: number; totalCents: number; items: RecurringPendingItem[] }
}

export interface YearCell {
  paidCents: number
  plannedCents: number
  budgetCents: number | null
}

export interface FinanceYear {
  year: number
  months: string[]
  rows: Array<{ category: string; months: YearCell[]; total: YearCell }>
  totals: YearCell[]
  total: YearCell
  companyId: string | null
}

export interface MarketingBudget {
  id: string
  companyId: string
  month: string
  /** '' = total do mês */
  category: string
  amountCents: number
  updatedAt: string
  updatedBy?: { id: string; name: string } | null
}

export type RecurringMonthState = 'OUT' | 'PENDING' | 'LAUNCHED'

export interface RecurringRule {
  id: string
  companyId: string
  description: string
  amountCents: number
  category: string
  supplier: string | null
  dayOfMonth: number
  startMonth: string
  endMonth: string | null
  active: boolean
  createdById: string | null
  monthDate: string
  monthState: RecurringMonthState
  launchedExpenseId: string | null
}

export interface RecurringInput {
  companyId: string
  description: string
  amountCents: number
  category: string
  supplier?: string | null
  dayOfMonth: number
  startMonth: string
  endMonth?: string | null
  active?: boolean
}

export interface FinanceOptions {
  categories: string[]
  statuses: Array<{ value: ExpenseStatus; label: string }>
  campaigns: Array<{ id: string; name: string; companyId: string; status: string }>
  activations: Array<{ id: string; title: string; companyId: string; startAt: string; status: string }>
  partners: Array<{ id: string; name: string; companyId: string | null; kind: string }>
  cards: Array<{ id: string; title: string; companyId: string; kind: string }>
}

const fin = (groupId: string, suffix = '') => mkt(groupId, `/finance${suffix}`)
const id = encodeURIComponent

function clean<T extends Record<string, unknown>>(params: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '' && v !== false) (out as Record<string, unknown>)[k] = v
  }
  return out
}

export async function listExpenses(groupId: string, filter: ExpenseFilter): Promise<ExpenseList> {
  const { missingInvoice, ...rest } = filter
  const { data } = await api.get<ExpenseList>(fin(groupId, '/expenses'), {
    params: clean({ ...rest, missingInvoice: missingInvoice ? '1' : null }),
  })
  return data
}

export async function createExpense(groupId: string, input: ExpenseInput): Promise<MarketingExpense> {
  const { data } = await api.post<MarketingExpense>(fin(groupId, '/expenses'), input)
  return data
}

export async function updateExpense(
  groupId: string,
  expenseId: string,
  patch: Partial<ExpenseInput>,
): Promise<MarketingExpense> {
  const { data } = await api.patch<MarketingExpense>(fin(groupId, `/expenses/${id(expenseId)}`), patch)
  return data
}

export async function deleteExpense(groupId: string, expenseId: string) {
  const { data } = await api.delete<{ ok: true; removedInvoices: number }>(fin(groupId, `/expenses/${id(expenseId)}`))
  return data
}

/** Ticket da nota fiscal (o `uploadMarketingFile` faz o PUT e o confirm). */
export function invoiceTicket(groupId: string, expenseId: string) {
  return async (meta: { name: string; mimeType: string; size: number; sha256?: string }) => {
    const { data } = await api.post<MarketingUploadTicket>(fin(groupId, `/expenses/${id(expenseId)}/invoices`), meta)
    return data
  }
}

export async function removeInvoice(groupId: string, expenseId: string, assetId: string) {
  await api.delete(fin(groupId, `/expenses/${id(expenseId)}/invoices/${id(assetId)}`))
}

export async function getFinanceSummary(groupId: string, month: string, companyId?: string | null) {
  const { data } = await api.get<FinanceSummary>(fin(groupId, '/summary'), { params: clean({ month, companyId }) })
  return data
}

export async function getFinanceYear(groupId: string, year: number, companyId?: string | null) {
  const { data } = await api.get<FinanceYear>(fin(groupId, '/year'), { params: clean({ year, companyId }) })
  return data
}

export async function listBudgets(groupId: string, year: number, companyId?: string | null) {
  const { data } = await api.get<MarketingBudget[]>(fin(groupId, '/budgets'), { params: clean({ year, companyId }) })
  return data
}

export async function upsertBudget(
  groupId: string,
  input: { companyId: string; month: string; category: string; amountCents: number },
) {
  const { data } = await api.put<MarketingBudget>(fin(groupId, '/budgets'), input)
  return data
}

export async function deleteBudget(groupId: string, budgetId: string) {
  await api.delete(fin(groupId, `/budgets/${id(budgetId)}`))
}

export async function listRecurring(groupId: string, month: string) {
  const { data } = await api.get<{ month: string; items: RecurringRule[] }>(fin(groupId, '/recurring'), {
    params: { month },
  })
  return data
}

export async function createRecurring(groupId: string, input: RecurringInput) {
  const { data } = await api.post<RecurringRule>(fin(groupId, '/recurring'), input)
  return data
}

export async function updateRecurring(groupId: string, ruleId: string, patch: Partial<RecurringInput>) {
  const { data } = await api.patch<RecurringRule>(fin(groupId, `/recurring/${id(ruleId)}`), patch)
  return data
}

export async function deleteRecurring(groupId: string, ruleId: string) {
  await api.delete(fin(groupId, `/recurring/${id(ruleId)}`))
}

export async function generateRecurring(groupId: string, month: string, companyId?: string | null) {
  const { data } = await api.post<{ month: string; created: number; skipped: number }>(
    fin(groupId, '/recurring/generate'),
    clean({ month, companyId }),
  )
  return data
}

export async function getFinanceOptions(groupId: string) {
  const { data } = await api.get<FinanceOptions>(fin(groupId, '/options'))
  return data
}

// ── Arquivos (Excel, PDF, zip) ──────────────────────────────────────────────

export type FinanceFileKind = 'xlsx-month' | 'xlsx-year' | 'pdf' | 'zip'

/** Nome do arquivo pelo Content-Disposition (o `filename*` UTF-8 vence). */
export function filenameFromDisposition(header: string | null | undefined, fallback: string): string {
  if (!header) return fallback
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
    } catch {
      /* cai no filename= */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)
  return plain?.[1]?.trim() || fallback
}

/** Erro de rota de arquivo vem como Blob: lê o JSON para mostrar a frase da API. */
export async function blobErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : fallback
  const data = error.response?.data
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: string | string[] }
      const msg = Array.isArray(parsed.message) ? parsed.message.join(', ') : parsed.message
      return msg || fallback
    } catch {
      return fallback
    }
  }
  const msg = (data as { message?: string | string[] } | undefined)?.message
  return (Array.isArray(msg) ? msg.join(', ') : msg) || fallback
}

/**
 * Baixa um arquivo do financeiro com o token (o axios do app) e salva com o
 * nome que a API mandou.
 */
export async function downloadFinanceFile(
  groupId: string,
  kind: FinanceFileKind,
  params: { month?: string; year?: number; companyId?: string | null },
): Promise<string> {
  const path =
    kind === 'pdf' ? '/export.pdf' : kind === 'zip' ? '/invoices.zip' : '/export.xlsx'
  const query =
    kind === 'xlsx-year'
      ? clean({ year: params.year, companyId: params.companyId })
      : clean({ month: params.month, companyId: params.companyId })
  const response = await api.get<Blob>(fin(groupId, path), { params: query, responseType: 'blob' })
  const fallback =
    kind === 'pdf' ? 'financeiro.pdf' : kind === 'zip' ? 'notas-fiscais.zip' : 'financeiro.xlsx'
  const name = filenameFromDisposition(response.headers['content-disposition'] as string | undefined, fallback)
  const url = URL.createObjectURL(response.data)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return name
}
