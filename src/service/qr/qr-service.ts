import api from '../api'

export interface QrCode {
  id: string
  code: string
  ownerId: string
  companyId?: string | null
  label: string
  targetUrl: string
  active: boolean
  scanCount: number
  createdAt: string
  updatedAt: string
  /** Conteúdo que vira a imagem do QR (ex.: "https://api.../q/abc123"). NÃO montar à mão. */
  redirectUrl: string
}

export interface QrScanRecent {
  at: string
  ip: string | null
  userAgent: string | null
  referer: string | null
}

export interface QrMetrics {
  code: string
  label: string
  targetUrl: string
  active: boolean
  scanCount: number
  redirectUrl: string
  byDay: Array<{ day: string; count: number }>
  recent: QrScanRecent[]
}

export interface CreateQrInput {
  targetUrl: string
  label?: string
  companyId?: string | null
  active?: boolean
}

export type UpdateQrInput = Partial<{
  targetUrl: string
  label: string
  active: boolean
  companyId: string | null
}>

const qrService = {
  async list() {
    const response = await api.get<QrCode[]>('/qr')
    return response.data
  },

  async get(id: string) {
    const response = await api.get<QrCode>(`/qr/${id}`)
    return response.data
  },

  async metrics(id: string) {
    const response = await api.get<QrMetrics>(`/qr/${id}/metrics`)
    return response.data
  },

  async create(data: CreateQrInput) {
    const response = await api.post<QrCode>('/qr', data)
    return response.data
  },

  async update(id: string, data: UpdateQrInput) {
    const response = await api.patch<QrCode>(`/qr/${id}`, data)
    return response.data
  },

  async cancel(id: string) {
    const response = await api.post<QrCode>(`/qr/${id}/cancel`)
    return response.data
  },

  async remove(id: string) {
    const response = await api.delete<{ message: string }>(`/qr/${id}`)
    return response.data
  },
}

export default qrService
