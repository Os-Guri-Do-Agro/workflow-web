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

const collaborationService = {
  async listComments(entityType: CommentEntityType, entityId: string) {
    const response = await api.get<CommentPayload[]>('/comments', {
      params: { entityType, entityId },
    })
    return response.data
  },

  async createComment(input: CreateCommentInput) {
    const response = await api.post<CommentPayload>('/comments', input)
    return response.data
  },

  async updateComment(id: string, body: string) {
    const response = await api.patch<CommentPayload>(`/comments/${id}`, { body })
    return response.data
  },

  async deleteComment(id: string) {
    const response = await api.delete<{ message: string }>(`/comments/${id}`)
    return response.data
  },

  async addReaction(id: string, emoji: string) {
    const response = await api.post<CommentPayload>(`/comments/${id}/reactions`, { emoji })
    return response.data
  },

  async removeReaction(id: string, emoji: string) {
    const response = await api.delete<CommentPayload>(`/comments/${id}/reactions/${encodeURIComponent(emoji)}`)
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
