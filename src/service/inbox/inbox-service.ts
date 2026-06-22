import api from '../api'

export interface AppNotification {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  createdAt: string
}

const inboxService = {
  async list(unread = false) {
    const response = await api.get<AppNotification[]>('/inbox', { params: { unread } })
    return response.data
  },

  async unreadCount() {
    const response = await api.get<{ count: number }>('/inbox/unread-count')
    return response.data
  },

  async markRead(id: string) {
    const response = await api.patch<{ message: string }>(`/inbox/${id}/read`)
    return response.data
  },

  async markAllRead() {
    const response = await api.post<{ updated: number }>('/inbox/read-all')
    return response.data
  },

  async dismiss(id: string) {
    const response = await api.delete<{ message: string }>(`/inbox/${id}`)
    return response.data
  },
}

export default inboxService
