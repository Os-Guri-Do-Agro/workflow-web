import api from '../api'

export interface BoardMeta {
  id: string
  companyId: string
  title: string
  createdById: string
  thumbnailUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface BoardSnapshot {
  id: string
  title: string
  ydocStateBase64: string
}

export interface CreateBoardInput {
  title?: string
}

export interface UpdateBoardInput {
  title?: string
  thumbnailUrl?: string | null
}

const boardsService = {
  async list() {
    const response = await api.get<BoardMeta[]>('/boards')
    return response.data
  },

  async create(input: CreateBoardInput = {}) {
    const response = await api.post<BoardMeta>('/boards', input)
    return response.data
  },

  async get(id: string) {
    const response = await api.get<BoardMeta>(`/boards/${id}`)
    return response.data
  },

  async snapshot(id: string) {
    const response = await api.get<BoardSnapshot>(`/boards/${id}/snapshot`)
    return response.data
  },

  async update(id: string, input: UpdateBoardInput) {
    const response = await api.patch<BoardMeta>(`/boards/${id}`, input)
    return response.data
  },

  async duplicate(id: string) {
    const response = await api.post<BoardMeta>(`/boards/${id}/duplicate`)
    return response.data
  },

  async remove(id: string) {
    const response = await api.delete<{ message: string }>(`/boards/${id}`)
    return response.data
  },

  async uploadThumbnail(id: string, file: File) {
    const form = new FormData()
    form.append('file', file)

    const response = await api.post<BoardMeta>(`/boards/${id}/thumbnail`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },
}

export default boardsService
