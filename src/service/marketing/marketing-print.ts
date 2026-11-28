import api from '../api'
import { mkt } from './marketing-core'
import type { CardStatus } from '@/features/marketing/marketing-labels'

/**
 * Cliente da M2-A: Gráfica (peça impressa depois da aprovação). Baixar o
 * original usa `getAssetDownload` da fundação (devolve URL assinada e sha256).
 */

export interface PrintSpecs {
  format?: string
  paper?: string
  finish?: string
  quantity?: number
  bleedMm?: number
  colors?: string
  printer?: string
  notes?: string
}

export type PrintSpecsPatch = { [K in keyof PrintSpecs]?: PrintSpecs[K] | null }

export interface PrepressItem {
  id: string
  text: string
  done: boolean
  doneAt: string | null
}

export interface PrepressState {
  total: number
  done: number
  items: PrepressItem[]
}

export interface PrintFile {
  id: string
  name: string
  size: number
  mimeType: string
  colorSpace: string | null
  hasPreview: boolean
  sha256: string | null
  width: number | null
  height: number | null
  url: string | null
  previewUrl: string | null
}

export interface PrintCard {
  id: string
  companyId: string
  kind: 'PRINT'
  title: string
  status: CardStatus
  dueAt: string | null
  publishAt: string | null
  printSpecs: PrintSpecs | null
  assignee: { id: string; name: string } | null
  currentVersionId: string | null
  versionNumber: number | null
  approvedVersionId: string | null
  approvedAt: string | null
  /** A aprovação vale para a versão atual */
  approvalValid: boolean
  prepress: PrepressState
  files: PrintFile[]
  /** null = o papel não vê o financeiro */
  quotesCount: number | null
  createdAt: string
  updatedAt: string
}

/** Passos da trilha que a Gráfica mexe (o resto é da aprovação, no card). */
export type PrintTrailStatus = 'APPROVED' | 'SENT_TO_PRINTER' | 'PROOF_RECEIVED' | 'DELIVERED'

export async function listPrintCards(groupId: string, filters: { status?: string; companyId?: string } = {}) {
  const { data } = await api.get<PrintCard[]>(mkt(groupId, '/print/cards'), { params: filters })
  return data
}

export async function createPrintCard(groupId: string, input: { companyId: string; title: string; printSpecs?: PrintSpecsPatch }) {
  const { data } = await api.post<PrintCard>(mkt(groupId, '/print/cards'), input)
  return data
}

export async function updatePrintSpecs(groupId: string, cardId: string, specs: PrintSpecsPatch) {
  const { data } = await api.patch<PrintCard>(mkt(groupId, `/print/cards/${encodeURIComponent(cardId)}/specs`), specs)
  return data
}

export async function openPrepress(groupId: string, cardId: string) {
  const { data } = await api.post<{ prepress: PrepressState }>(mkt(groupId, `/print/cards/${encodeURIComponent(cardId)}/prepress`))
  return data.prepress
}

export async function setPrepressDone(groupId: string, cardId: string, itemId: string, done: boolean) {
  const { data } = await api.patch<{ prepress: PrepressState }>(
    mkt(groupId, `/print/cards/${encodeURIComponent(cardId)}/prepress/${encodeURIComponent(itemId)}`),
    { done },
  )
  return data.prepress
}

export async function setPrintStatus(groupId: string, cardId: string, status: PrintTrailStatus, force = false) {
  const { data } = await api.post<PrintCard>(
    mkt(groupId, `/print/cards/${encodeURIComponent(cardId)}/status`),
    force ? { status, force } : { status },
  )
  return data
}
