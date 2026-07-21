import api from '../api'
import type {
  Note,
  NoteFilters,
  NoteFolder,
  NoteFolderInput,
  NoteListItem,
  NoteWriteInput,
} from '@/features/notes/types'

const notesService = {
  async getNotes(filters?: NoteFilters): Promise<NoteListItem[]> {
    const params = new URLSearchParams()
    if (filters?.folderId) params.append('folderId', filters.folderId)
    if (filters?.search) params.append('search', filters.search)
    if (filters?.tag) params.append('tag', filters.tag)

    const query = params.toString()
    const response = await api.get(`/notes${query ? `?${query}` : ''}`)
    return response.data
  },

  async getNote(id: string): Promise<Note> {
    const response = await api.get(`/notes/${id}`)
    return response.data
  },

  async createNote(data: NoteWriteInput): Promise<Note> {
    const response = await api.post('/notes', data)
    return response.data
  },

  async updateNote(id: string, data: NoteWriteInput): Promise<Note> {
    const response = await api.patch(`/notes/${id}`, data)
    return response.data
  },

  async deleteNote(id: string): Promise<Note> {
    const response = await api.delete(`/notes/${id}`)
    return response.data
  },

  async togglePin(id: string): Promise<Note> {
    const response = await api.post(`/notes/${id}/pin`)
    return response.data
  },

  // ─── Pastas ───────────────────────────────────────────────────────────────
  // Os quatro endpoints já existiam no backend desde a migration
  // `20260328082937_notes_events_user_based`; só o GET era consumido.

  async getFolders(): Promise<NoteFolder[]> {
    const response = await api.get('/notes/folders')
    return response.data
  },

  async createFolder(data: NoteFolderInput): Promise<NoteFolder> {
    const response = await api.post('/notes/folders', data)
    return response.data
  },

  async updateFolder(id: string, data: Partial<NoteFolderInput>): Promise<NoteFolder> {
    const response = await api.patch(`/notes/folders/${id}`, data)
    return response.data
  },

  async deleteFolder(id: string): Promise<NoteFolder> {
    const response = await api.delete(`/notes/folders/${id}`)
    return response.data
  },
}

export default notesService
