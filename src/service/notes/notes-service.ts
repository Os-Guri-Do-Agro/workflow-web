import api from '../api'

const notesService = {
  async getNotes(filters?: { folderId?: string; search?: string; tag?: string }) {
    const params = new URLSearchParams()
    if (filters?.folderId) params.append('folderId', filters.folderId)
    if (filters?.search) params.append('search', filters.search)
    if (filters?.tag) params.append('tag', filters.tag)
    
    const response = await api.get(`/notes?${params.toString()}`)
    return response.data
  },

  async getFolders() {
    const response = await api.get('/notes/folders')
    return response.data
  },

  async getNote(id: string) {
    const response = await api.get(`/notes/${id}`)
    return response.data
  },

  async createNote(data: { title: string; content: string; folderId?: string | null; tags?: string[] }) {
    const response = await api.post('/notes', data)
    return response.data
  },

  async updateNote(id: string, data: { title?: string; content?: string; folderId?: string | null; tags?: string[] }) {
    const response = await api.patch(`/notes/${id}`, data)
    return response.data
  },

  async deleteNote(id: string) {
    const response = await api.delete(`/notes/${id}`)
    return response.data
  },

  async togglePin(id: string) {
    const response = await api.post(`/notes/${id}/pin`)
    return response.data
  },
}

export default notesService
