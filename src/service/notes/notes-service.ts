import api from '../api'
import type {
  Note,
  NoteAccessEntry,
  NoteAccessLevel,
  NoteFilters,
  NoteFolder,
  NoteFolderInput,
  NoteListItem,
  NoteShareLink,
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

  // ─── Compartilhamento ───────────────────────────────────────────────────

  async getAccess(noteId: string): Promise<NoteAccessEntry[]> {
    const response = await api.get(`/notes/${noteId}/access`)
    return response.data
  },

  async grantAccess(noteId: string, userId: string, level: NoteAccessLevel): Promise<NoteAccessEntry[]> {
    const response = await api.post(`/notes/${noteId}/access`, { userId, level })
    return response.data
  },

  async updateAccess(noteId: string, userId: string, level: NoteAccessLevel): Promise<NoteAccessEntry[]> {
    const response = await api.patch(`/notes/${noteId}/access/${userId}`, { level })
    return response.data
  },

  async revokeAccess(noteId: string, userId: string): Promise<NoteAccessEntry[]> {
    const response = await api.delete(`/notes/${noteId}/access/${userId}`)
    return response.data
  },

  async getShareLinks(noteId: string): Promise<NoteShareLink[]> {
    const response = await api.get(`/notes/${noteId}/share-link`)
    return response.data
  },

  async createShareLink(noteId: string, accessLevel: NoteAccessLevel): Promise<NoteShareLink> {
    const response = await api.post(`/notes/${noteId}/share-link`, { accessLevel })
    return response.data
  },

  async claimLink(token: string): Promise<{ noteId: string }> {
    const response = await api.post(`/notes/claim/${token}`)
    return response.data
  },
}

export default notesService
