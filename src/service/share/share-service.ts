import api, { publicApi } from '../api'
import type { RoadmapYearResponse } from '../roadmap/roadmap-monthly-service'

export type ShareResourceType = 'board' | 'roadmap' | 'BOARD' | 'ROADMAP'

export interface ShareLink {
  token: string
  resourceType: ShareResourceType
  resourceId: string
  path: string
  createdAt: string
}

export interface PublicBoardResponse {
  board: {
    id: string
    title: string
    thumbnailUrl: string | null
    updatedAt: string
  }
  ydocStateBase64: string
  readOnly: boolean
}

export type PublicRoadmapResponse = RoadmapYearResponse & {
  readOnly: boolean
}

const shareService = {
  async list() {
    const response = await api.get<ShareLink[]>('/share')
    return response.data
  },

  async shareBoard(boardId: string) {
    const response = await api.post<ShareLink>(`/share/board/${boardId}`)
    return response.data
  },

  async shareRoadmap(year: number) {
    const response = await api.post<ShareLink>(`/share/roadmap/${year}`)
    return response.data
  },

  async revoke(token: string) {
    const response = await api.delete<{ message: string }>(`/share/${token}`)
    return response.data
  },

  async publicBoard(token: string) {
    const response = await publicApi.get<PublicBoardResponse>(`/public/board/${token}`)
    return response.data
  },

  async publicRoadmap(token: string) {
    const response = await publicApi.get<PublicRoadmapResponse>(`/public/roadmap/${token}`)
    return response.data
  },

  async publicNote(token: string) {
    const response = await publicApi.get<import('@/features/notes/types').PublicNote>(
      `/public/note/${token}`,
    )
    return response.data
  },

  async revokeNoteLink(token: string) {
    const response = await api.delete<{ message: string; revokedAccesses: number }>(`/share/${token}`)
    return response.data
  },
}

export default shareService
