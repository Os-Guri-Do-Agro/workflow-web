import api from '../api'

export type EventType =
  | 'MEETING'
  | 'DEADLINE'
  | 'REMINDER'
  | 'SPRINT'
  | 'RETROSPECTIVE'
  | 'TASK'
  | 'PERSONAL'

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  startDate: string
  endDate: string | null
  type: EventType
  recurrence: string | null
  createdById?: string
  companyId?: string | null
  activityId?: string | null
  attendees?: string[]
  googleEventId?: string | null
  meetLink?: string | null
  createdAt?: string
  updatedAt?: string
  activity?: { id: string; title: string } | null
}

export interface CreateEventInput {
  title: string
  description?: string | null
  startDate: string
  endDate?: string | null
  type: EventType
  recurrence?: string | null
  activityId?: string | null
  attendees?: string[]
}

export type UpdateEventInput = Partial<CreateEventInput>

const eventsService = {
  async getEvents(filters?: { start?: string; end?: string }) {
    const response = await api.get<CalendarEvent[]>('/events', { params: filters })
    return response.data
  },

  async getGoogleAuthUrl(): Promise<string> {
    const response = await api.get<{ url: string }>('/auth/google/link')
    return response.data.url
  },

  async getGoogleStatus(): Promise<boolean> {
    const response = await api.get<{ connected: boolean }>('/auth/google/status')
    return !!response.data?.connected
  },

  async disconnectGoogle() {
    const response = await api.delete('/auth/google/link')
    return response.data
  },

  async getUpcomingEvents(limit: number = 5) {
    const response = await api.get<
      Pick<CalendarEvent, 'id' | 'title' | 'startDate' | 'endDate' | 'description' | 'type'>[]
    >('/events/upcoming', {
      params: { limit },
    })
    return response.data
  },

  async getEvent(id: string) {
    const response = await api.get<CalendarEvent>(`/events/${id}`)
    return response.data
  },

  async createEvent(data: CreateEventInput) {
    const response = await api.post<CalendarEvent>('/events', data)
    return response.data
  },

  async updateEvent(id: string, data: UpdateEventInput) {
    const response = await api.patch<CalendarEvent>(`/events/${id}`, data)
    return response.data
  },

  async deleteEvent(id: string) {
    const response = await api.delete(`/events/${id}`)
    return response.data
  },
}

export default eventsService
