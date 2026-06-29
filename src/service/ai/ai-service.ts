import api from '../api'

export type EntityType =
  | 'ACTIVITY'
  | 'ROADMAP_MONTH'
  | 'ROADMAP_ENTRY'
  | 'EVENT'
  | 'BOARD'
  | 'BUG_REPORT'

export interface SearchStatus {
  indexed: boolean
  lastIndexedAt: string | null
}

export interface SearchHit {
  entityType: EntityType
  entityId: string
  title: string
  snippet: string
  score: number
  link: string
}

export interface AskResponse {
  answer: string
  sources: SearchHit[]
}

export interface Diagram {
  title: string
  nodes: { id: string; label: string; kind?: string }[]
  edges: { from: string; to: string; label?: string }[]
}

const aiService = {
  async searchStatus() {
    const response = await api.get<SearchStatus>('/search/status')
    return response.data
  },

  async search(query: string, k = 8) {
    const response = await api.post<SearchHit[]>('/search', { query, k })
    return response.data
  },

  async reindex() {
    const response = await api.post<{ indexed: number }>('/search/reindex')
    return response.data
  },

  async ask(question: string) {
    const response = await api.post<AskResponse>('/copilot/ask', { question })
    return response.data
  },

  async diagram(prompt: string) {
    const response = await api.post<Diagram>('/copilot/diagram', { prompt })
    return response.data
  },

  async improve(text: string, instruction?: string) {
    const response = await api.post<{ text: string }>('/copilot/improve', { text, instruction })
    return response.data
  },

  async roadmap(prompt: string, year?: number) {
    const response = await api.post('/copilot/roadmap', { prompt, year })
    return response.data
  },
}

export default aiService
