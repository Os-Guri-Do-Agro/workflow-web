import api from '../api'
import type { FeedEventPayload, CommentPayload } from '@/service/realtime/realtime-service'

export type CommentEntityType = 'ACTIVITY' | 'BOARD' | 'BUG_REPORT' | 'ROADMAP_MONTH'

export interface CreateCommentInput {
  entityType: CommentEntityType
  entityId: string
  body: string
  mentions?: string[]
}

export interface DigestResponse {
  summary: string
  events: number
}

/**
 * Empresa explícita para telas que misturam empresas (o `/board` agregado abre
 * tarefa de qualquer empresa). Sem ela, o interceptor manda a empresa ATIVA, e o
 * comentário de uma tarefa de outra empresa era listado vazio e, pior, gravado na
 * empresa errada (achado da revisão cruzada de 2026-11-05).
 */
function companyHeader(companyId?: string | null) {
  return companyId ? { headers: { 'x-company-id': companyId } } : {}
}

const collaborationService = {
  async listComments(entityType: CommentEntityType, entityId: string, companyId?: string | null) {
    const response = await api.get<CommentPayload[]>('/comments', {
      params: { entityType, entityId },
      ...companyHeader(companyId),
    })
    return response.data
  },

  /** `companyId` explícito quando a tela mistura empresas (o `/board`). */
  async createComment(input: CreateCommentInput, companyId?: string | null) {
    const response = await api.post<CommentPayload>(
      '/comments',
      input,
      companyId ? { headers: { 'x-company-id': companyId } } : undefined,
    )
    return response.data
  },

  async updateComment(id: string, body: string, companyId?: string | null) {
    const response = await api.patch<CommentPayload>(`/comments/${id}`, { body }, companyHeader(companyId))
    return response.data
  },

  async deleteComment(id: string, companyId?: string | null) {
    const response = await api.delete<{ message: string }>(`/comments/${id}`, companyHeader(companyId))
    return response.data
  },

  async addReaction(id: string, emoji: string, companyId?: string | null) {
    const response = await api.post<CommentPayload>(`/comments/${id}/reactions`, { emoji }, companyHeader(companyId))
    return response.data
  },

  async removeReaction(id: string, emoji: string, companyId?: string | null) {
    const response = await api.delete<CommentPayload>(
      `/comments/${id}/reactions/${encodeURIComponent(emoji)}`,
      companyHeader(companyId),
    )
    return response.data
  },

  async listFeed(take = 50) {
    const response = await api.get<FeedEventPayload[]>('/feed', { params: { take } })
    return response.data
  },

  async digest(days?: number) {
    const response = await api.post<DigestResponse>('/copilot/digest', { days })
    return response.data
  },
}

export default collaborationService
