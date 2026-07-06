import api from '../api'

/**
 * Personalização visual do QR persistida no backend. Todos os campos são
 * opcionais — ausência = usar o default (preto/branco, módulos quadrados).
 * As cores são literais (hex) escolhidas pelo usuário; NÃO são tokens de tema.
 */
export interface QrStyle {
  /** Cor dos módulos (pixels escuros do QR). Hex, ex.: "#0054e3". */
  colorDark?: string
  /** Cor do fundo. Hex — precisa ser claro/opaco o bastante p/ escanear. */
  colorLight?: string
  /** Formato dos módulos. */
  dotStyle?: 'square' | 'rounded' | 'dots' | 'classy'
  /** Formato dos três "olhos" (cantos). */
  cornerStyle?: 'square' | 'rounded' | 'dot'
  /** Logo no centro (URL http(s) OU data URL base64). */
  logoUrl?: string
}

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
  /** true se o usuário logado é o CRIADOR (só ele edita/cancela/exclui). */
  isMine: boolean
  /** 'company' quando o QR é compartilhado com uma empresa; 'personal' caso contrário. */
  scope: 'personal' | 'company'
  /** Nome do criador — exibido em QRs de empresa que não são meus. */
  ownerName: string | null
  /** Nome da empresa dona do QR (null em QRs pessoais). Resolvido no backend. */
  companyName: string | null
  /** Personalização visual persistida (null = sem estilo customizado). */
  style: QrStyle | null
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
  /** Setar = QR compartilhado com a empresa; null/omitido = pessoal. */
  companyId?: string | null
  active?: boolean
  /** Personalização visual (só os campos preenchidos). */
  style?: QrStyle
}

export type UpdateQrInput = Partial<{
  targetUrl: string
  label: string
  active: boolean
  companyId: string | null
  style: QrStyle
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
