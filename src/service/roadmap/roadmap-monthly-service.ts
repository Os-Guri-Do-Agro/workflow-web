import api from '../api'

export type RoadmapCategory = 'milestone' | 'meeting' | 'delivery' | 'recording' | 'note' | 'risk'

export interface RoadmapFocus {
  id: string
  monthId?: string
  text: string
  order: number
}

export interface RoadmapPhoto {
  id: string
  monthId?: string
  url: string
  fileName: string
  contentType: string
  size: number
}

export interface RoadmapEntry {
  id: string
  monthId?: string
  date: string
  title: string
  description: string | null
  category: RoadmapCategory
  source: string
}

export interface RoadmapMonth {
  id: string | null
  key: string
  year: number
  month: number
  title: string
  main: string
  order: number
  persisted: boolean
  focusItems: RoadmapFocus[]
  photos: RoadmapPhoto[]
  entries: RoadmapEntry[]
}

export interface RoadmapYearResponse {
  year: number
  months: RoadmapMonth[]
}

export interface CreateRoadmapMonthInput {
  key: string
  year: number
  month: number
  title?: string
  main?: string
  order?: number
}

export type UpdateRoadmapMonthInput = Partial<Pick<CreateRoadmapMonthInput, 'title' | 'main' | 'order'>>
export type UpdateRoadmapFocusInput = Partial<Pick<RoadmapFocus, 'text' | 'order'>>
export type CreateRoadmapEntryInput = {
  date: string
  title: string
  description?: string | null
  category: RoadmapCategory
  source?: string
}
export type UpdateRoadmapEntryInput = Partial<CreateRoadmapEntryInput>

const roadmapMonthlyService = {
  async getYear(year: number) {
    const response = await api.get<RoadmapYearResponse>('/roadmap/monthly', { params: { year } })
    return response.data
  },

  async ensureMonth(input: CreateRoadmapMonthInput) {
    const response = await api.post<RoadmapMonth>('/roadmap/monthly', input)
    return response.data
  },

  async updateMonth(monthId: string, input: UpdateRoadmapMonthInput) {
    const response = await api.patch<RoadmapMonth>(`/roadmap/monthly/${monthId}`, input)
    return response.data
  },

  async removeMonth(monthId: string) {
    const response = await api.delete<{ message: string }>(`/roadmap/monthly/${monthId}`)
    return response.data
  },

  async addFocus(monthId: string, input: { text: string; order?: number }) {
    const response = await api.post<RoadmapFocus & { monthId: string }>(`/roadmap/monthly/${monthId}/focus`, input)
    return response.data
  },

  async updateFocus(monthId: string, focusId: string, input: UpdateRoadmapFocusInput) {
    const response = await api.patch<RoadmapFocus>(`/roadmap/monthly/${monthId}/focus/${focusId}`, input)
    return response.data
  },

  async removeFocus(monthId: string, focusId: string) {
    const response = await api.delete<{ message: string }>(`/roadmap/monthly/${monthId}/focus/${focusId}`)
    return response.data
  },

  async uploadPhotos(monthId: string, files: File[]) {
    const form = new FormData()
    files.forEach((file) => form.append('files', file))

    const response = await api.post<RoadmapPhoto[]>(`/roadmap/monthly/${monthId}/photos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  async removePhoto(monthId: string, photoId: string) {
    const response = await api.delete<{ message: string }>(`/roadmap/monthly/${monthId}/photos/${photoId}`)
    return response.data
  },

  async addEntry(monthId: string, input: CreateRoadmapEntryInput) {
    const response = await api.post<RoadmapEntry & { monthId: string }>(`/roadmap/monthly/${monthId}/entries`, input)
    return response.data
  },

  async addQuickNote(monthId: string, date: string, title: string, description?: string | null) {
    return roadmapMonthlyService.addEntry(monthId, {
      date,
      title,
      description,
      category: 'note',
      source: 'quick_note',
    })
  },

  async updateEntry(monthId: string, entryId: string, input: UpdateRoadmapEntryInput) {
    const response = await api.patch<RoadmapEntry>(`/roadmap/monthly/${monthId}/entries/${entryId}`, input)
    return response.data
  },

  async removeEntry(monthId: string, entryId: string) {
    const response = await api.delete<{ message: string }>(`/roadmap/monthly/${monthId}/entries/${entryId}`)
    return response.data
  },
}

export default roadmapMonthlyService
