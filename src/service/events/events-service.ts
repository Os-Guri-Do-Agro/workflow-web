import api from '../api'

const eventsService = {
  async getEvents(filters?: { start?: string; end?: string }) {
    const params = new URLSearchParams()
    if (filters?.start) params.append('start', filters.start)
    if (filters?.end) params.append('end', filters.end)

    const response = await api.get(`/events?${params.toString()}`)
    return response.data
  },

  async getGoogleAuthUrl() {
    return await api.get('/auth/google/link')
  },

  async getUpcomingEvents(limit: number = 5) {
    const response = await api.get(`/events/upcoming?limit=${limit}`)
    return response.data
  },

  async getEvent(id: string) {
    const response = await api.get(`/events/${id}`)
    return response.data
  },

  async createEvent(data: {
    title: string
    description?: string
    startDate: string
    endDate?: string
    type: string
    activityId?: string
    attendees?: string[]
    recurrence?: string
  }) {
    const response = await api.post('/events', data)
    return response.data
  },

  async updateEvent(id: string, data: {
    title?: string
    description?: string
    startDate?: string
    endDate?: string
    type?: string
    activityId?: string
    attendees?: string[]
    recurrence?: string
  }) {
    const response = await api.patch(`/events/${id}`, data)
    return response.data
  },

  async deleteEvent(id: string) {
    const response = await api.delete(`/events/${id}`)
    return response.data
  },
}

export default eventsService
