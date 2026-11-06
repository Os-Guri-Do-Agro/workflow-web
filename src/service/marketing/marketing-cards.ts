import api from '../api'
import {
  mkt,
  uploadMarketingFile,
  type MarketingAsset,
  type MarketingUploadTicket,
} from './marketing-core'
import type { CardKind, CardNetwork, CardStatus } from '@/features/marketing/marketing-labels'

/**
 * Cliente da Aprovação (M1-A), contrato da spec
 * docs/specs/2026/q4/q4-2/ala-marketing/m1-aprovacao-calendario.md. Tudo em
 * `/marketing/g/:groupId/cards`; o servidor decide papel, marca e status, a
 * tela só esconde o que a pessoa não pode e mostra a frase da recusa.
 */

export interface MarketingPersonRef {
  id: string
  name: string
}

export interface MarketingCardCover {
  url: string | null
  previewUrl: string | null
  mimeType: string
}

export interface MarketingCardSummary {
  id: string
  companyId: string
  kind: CardKind
  title: string
  status: CardStatus
  networks: CardNetwork[]
  dueAt: string | null
  publishAt: string | null
  assignee: MarketingPersonRef | null
  currentVersion: { id: string; number: number } | null
  cover: MarketingCardCover | null
  commentsCount: number
  openAdjustments: number
  approvalValid: boolean
  overdue: boolean
  position: number
  archivedAt: string | null
  updatedAt: string
}

export interface MarketingCardAsset extends MarketingAsset {
  url: string | null
  previewUrl: string | null
  uploadedBy: MarketingPersonRef | null
}

export interface MarketingCardVersion {
  id: string
  number: number
  note: string | null
  createdAt: string
  createdBy: MarketingPersonRef | null
  assets: MarketingCardAsset[]
}

export type ChecklistKind = 'ADJUSTMENT' | 'PREPRESS' | 'TASK'

export interface MarketingChecklistItem {
  id: string
  kind: ChecklistKind
  text: string
  position: number
  commentId: string | null
  doneAt: string | null
  doneBy: MarketingPersonRef | null
  createdBy: MarketingPersonRef | null
  createdAt: string
}

export interface MarketingCardPermissions {
  canEdit: boolean
  canComment: boolean
  canApprove: boolean
  canDelete: boolean
  canUploadVersion: boolean
  allowedMoves: CardStatus[]
}

export interface MarketingCardDetail {
  id: string
  groupId: string
  companyId: string
  kind: CardKind
  title: string
  briefing: string | null
  status: CardStatus
  networks: CardNetwork[]
  captions: Partial<Record<CardNetwork, string>>
  hashtags: string[]
  dueAt: string | null
  publishAt: string | null
  publishedAt: string | null
  publishedUrl: string | null
  printSpecs: Record<string, string | number> | null
  position: number
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  assignee: MarketingPersonRef | null
  createdBy: MarketingPersonRef | null
  currentVersionId: string | null
  approvedVersionId: string | null
  approvedBy: MarketingPersonRef | null
  approvedAt: string | null
  approvalValid: boolean
  overdue: boolean
  campaign: { id: string; name: string; status: string } | null
  versions: MarketingCardVersion[]
  stagedAssets: MarketingCardAsset[]
  checklist: MarketingChecklistItem[]
  me: MarketingCardPermissions
}

export type CommentKind = 'COMMENT' | 'CHANGES_REQUESTED' | 'APPROVED' | 'SYSTEM'

export interface MarketingCardComment {
  id: string
  cardId: string
  versionId: string | null
  versionNumber: number | null
  assetId: string | null
  kind: CommentKind
  body: string
  mentions: string[]
  anchorX: number | null
  anchorY: number | null
  anchorTime: number | null
  resolvedAt: string | null
  resolvedBy: MarketingPersonRef | null
  author: MarketingPersonRef | null
  createdAt: string
  updatedAt: string
}

export interface CardListFilters {
  status?: string
  kind?: string
  track?: 'digital' | 'print'
  companyId?: string
  assigneeId?: string
  network?: string
  q?: string
  overdue?: boolean
  campaignId?: string
  archived?: boolean
}

export interface CreateCardInput {
  companyId: string
  title: string
  kind?: CardKind
  status?: 'IDEA' | 'IN_PRODUCTION'
  briefing?: string | null
  networks?: CardNetwork[]
  publishAt?: string | null
  dueAt?: string | null
  assigneeId?: string | null
  campaignId?: string | null
}

export interface UpdateCardInput {
  title?: string
  briefing?: string | null
  kind?: CardKind
  networks?: CardNetwork[]
  captions?: Partial<Record<CardNetwork, string>>
  hashtags?: string[]
  dueAt?: string | null
  publishAt?: string | null
  assigneeId?: string | null
  campaignId?: string | null
  printSpecs?: Record<string, string | number> | null
  publishedUrl?: string | null
}

export interface CreateCommentInput {
  body: string
  mentions?: string[]
  versionId?: string | null
  assetId?: string | null
  anchorX?: number | null
  anchorY?: number | null
  anchorTime?: number | null
}

const cards = (groupId: string, suffix = '') => mkt(groupId, `/cards${suffix}`)
const card = (groupId: string, cardId: string, suffix = '') =>
  cards(groupId, `/${encodeURIComponent(cardId)}${suffix}`)

export async function listCards(groupId: string, filters: CardListFilters = {}): Promise<MarketingCardSummary[]> {
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '' || value === false) continue
    params[key] = value === true ? '1' : String(value)
  }
  const { data } = await api.get<MarketingCardSummary[]>(cards(groupId), { params })
  return data
}

export async function getCard(groupId: string, cardId: string): Promise<MarketingCardDetail> {
  const { data } = await api.get<MarketingCardDetail>(card(groupId, cardId))
  return data
}

export async function createCard(groupId: string, input: CreateCardInput): Promise<MarketingCardDetail> {
  const { data } = await api.post<MarketingCardDetail>(cards(groupId), input)
  return data
}

export async function updateCard(groupId: string, cardId: string, input: UpdateCardInput): Promise<MarketingCardDetail> {
  const { data } = await api.patch<MarketingCardDetail>(card(groupId, cardId), input)
  return data
}

export async function moveCard(
  groupId: string,
  cardId: string,
  status: CardStatus,
  position?: number,
): Promise<MarketingCardDetail> {
  const { data } = await api.post<MarketingCardDetail>(card(groupId, cardId, '/move'), { status, position })
  return data
}

/** Sobe um arquivo SOLTO do card (fica para a próxima versão). */
export function uploadCardFile(
  groupId: string,
  cardId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<MarketingAsset> {
  return uploadMarketingFile(
    groupId,
    file,
    async (meta) => {
      const { data } = await api.post<MarketingUploadTicket>(card(groupId, cardId, '/assets'), meta)
      return data
    },
    onProgress,
  )
}

export async function deleteCardAsset(groupId: string, cardId: string, assetId: string) {
  await api.delete(card(groupId, cardId, `/assets/${encodeURIComponent(assetId)}`))
}

export async function createVersion(
  groupId: string,
  cardId: string,
  assetIds: string[],
  note?: string | null,
): Promise<MarketingCardDetail> {
  const { data } = await api.post<MarketingCardDetail>(card(groupId, cardId, '/versions'), { assetIds, note })
  return data
}

export async function approveCard(groupId: string, cardId: string, comment?: string | null): Promise<MarketingCardDetail> {
  const { data } = await api.post<MarketingCardDetail>(card(groupId, cardId, '/approve'), { comment })
  return data
}

export async function requestChanges(
  groupId: string,
  cardId: string,
  body: string,
  items?: string[],
): Promise<MarketingCardDetail> {
  const { data } = await api.post<MarketingCardDetail>(card(groupId, cardId, '/request-changes'), { body, items })
  return data
}

export async function archiveCard(groupId: string, cardId: string, archived: boolean): Promise<MarketingCardDetail> {
  const { data } = await api.post<MarketingCardDetail>(card(groupId, cardId, '/archive'), { archived })
  return data
}

export async function deleteCard(groupId: string, cardId: string) {
  const { data } = await api.delete<{ ok: boolean; removedFiles: number }>(card(groupId, cardId))
  return data
}

export async function listComments(groupId: string, cardId: string): Promise<MarketingCardComment[]> {
  const { data } = await api.get<MarketingCardComment[]>(card(groupId, cardId, '/comments'))
  return data
}

export async function createComment(groupId: string, cardId: string, input: CreateCommentInput): Promise<MarketingCardComment> {
  const { data } = await api.post<MarketingCardComment>(card(groupId, cardId, '/comments'), input)
  return data
}

export async function updateComment(groupId: string, cardId: string, commentId: string, body: string) {
  const { data } = await api.patch<MarketingCardComment>(
    card(groupId, cardId, `/comments/${encodeURIComponent(commentId)}`),
    { body },
  )
  return data
}

export async function deleteComment(groupId: string, cardId: string, commentId: string) {
  await api.delete(card(groupId, cardId, `/comments/${encodeURIComponent(commentId)}`))
}

export async function resolveComment(groupId: string, cardId: string, commentId: string, resolved: boolean) {
  const { data } = await api.post<MarketingCardComment>(
    card(groupId, cardId, `/comments/${encodeURIComponent(commentId)}/resolve`),
    { resolved },
  )
  return data
}

export async function addChecklistItem(groupId: string, cardId: string, text: string, kind: ChecklistKind = 'TASK') {
  await api.post(card(groupId, cardId, '/checklist'), { text, kind })
}

export async function updateChecklistItem(
  groupId: string,
  cardId: string,
  itemId: string,
  patch: { done?: boolean; text?: string },
) {
  await api.patch(card(groupId, cardId, `/checklist/${encodeURIComponent(itemId)}`), patch)
}

export async function deleteChecklistItem(groupId: string, cardId: string, itemId: string) {
  await api.delete(card(groupId, cardId, `/checklist/${encodeURIComponent(itemId)}`))
}
