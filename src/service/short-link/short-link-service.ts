import api from '../api'

/**
 * Encurtador de URL para campanha (UTM).
 * Spec: workflow-api/docs/specs/2026/q3/q3-2/encurtador-utm.md
 *
 * O contrato tem uma sutileza que vale entender antes de mexer: `targetUrl` é a
 * URL **BASE, SEM UTM**, e `finalUrl` é a URL montada que o visitante recebe.
 * Quem monta é o servidor. NÃO remontar aqui: duas implementações da mesma
 * regra viram duas respostas diferentes para "que link eu vou divulgar".
 */

export interface ShortLink {
  id: string
  /** Slug em /l/<code>. */
  code: string
  ownerId: string
  companyId: string | null
  label: string
  /** URL base, sem os parâmetros de campanha. */
  targetUrl: string
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmTerm: string | null
  utmContent: string | null
  active: boolean
  clickCount: number
  createdAt: string
  updatedAt: string
  /** O link curto para divulgar (ex.: "https://api.nevo.app/l/abc123"). */
  shortUrl: string
  /** Destino com os UTM aplicados — é o que conferir antes de divulgar. */
  finalUrl: string
  /** true quando o usuário logado é o criador (só ele edita/exclui). */
  isMine: boolean
}

export interface ShortLinkClick {
  at: string
  ip: string | null
  userAgent: string | null
  referer: string | null
}

export interface ShortLinkMetrics extends ShortLink {
  byDay: Array<{ day: string; count: number }>
  byReferer: Array<{ referer: string; count: number }>
  recent: ShortLinkClick[]
}

export interface CreateShortLinkInput {
  /** Aceita a URL já com UTM colada: o servidor separa base e campanha. */
  targetUrl: string
  code?: string
  label?: string
  companyId?: string | null
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
  active?: boolean
}

export type UpdateShortLinkInput = Partial<Omit<CreateShortLinkInput, 'companyId'>>

export interface ShortLinkListParams {
  search?: string
  scope?: 'all' | 'mine' | 'company'
  companyId?: string
}

const shortLinkService = {
  async list(params: ShortLinkListParams = {}): Promise<ShortLink[]> {
    const response = await api.get<ShortLink[]>('/short-link', { params })
    return response.data
  },

  async getById(id: string): Promise<ShortLink> {
    const response = await api.get<ShortLink>(`/short-link/${id}`)
    return response.data
  },

  async metrics(id: string): Promise<ShortLinkMetrics> {
    const response = await api.get<ShortLinkMetrics>(`/short-link/${id}/metrics`)
    return response.data
  },

  async create(data: CreateShortLinkInput): Promise<ShortLink> {
    const response = await api.post<ShortLink>('/short-link', data)
    return response.data
  },

  async update(id: string, data: UpdateShortLinkInput): Promise<ShortLink> {
    const response = await api.patch<ShortLink>(`/short-link/${id}`, data)
    return response.data
  },

  async setActive(id: string, active: boolean): Promise<ShortLink> {
    const rota = active ? 'activate' : 'deactivate'
    const response = await api.post<ShortLink>(`/short-link/${id}/${rota}`)
    return response.data
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/short-link/${id}`)
  },
}

export default shortLinkService
