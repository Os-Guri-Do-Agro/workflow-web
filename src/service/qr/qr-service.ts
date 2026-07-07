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
  /** Pasta onde o QR está (null = fora de pasta). */
  folderId?: string | null
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
  /** Pasta (mesmo escopo do QR). */
  folderId?: string | null
  active?: boolean
  /** Personalização visual (só os campos preenchidos). */
  style?: QrStyle
}

export type UpdateQrInput = Partial<{
  targetUrl: string
  label: string
  active: boolean
  companyId: string | null
  folderId: string | null
  style: QrStyle
}>

// ─── Pastas ────────────────────────────────────────────────────────────────
export interface QrFolder {
  id: string
  name: string
  companyId: string | null
  scope: 'personal' | 'company'
  qrCount: number
  createdAt: string
}

// ─── Tokens de API (microserviço) ────────────────────────────────────────────
export interface QrApiToken {
  id: string
  name: string
  tokenPrefix: string
  companyId: string
  defaultFolderId: string | null
  lastUsedAt: string | null
  revoked: boolean
  revokedAt: string | null
  createdAt: string
}

/** Resposta da criação: `token` (valor cru) só existe AQUI, uma vez. */
export interface QrApiTokenCreated extends QrApiToken {
  token: string
}

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

  /** Exclusão exige a senha do usuário (confirmação estilo git). */
  async remove(id: string, password: string) {
    const response = await api.delete<{ message: string }>(`/qr/${id}`, {
      data: { password },
    })
    return response.data
  },

  // ─── Pastas ─────────────────────────────────────────────────────────────
  async listFolders(companyId?: string | null) {
    const response = await api.get<QrFolder[]>('/qr/folders', {
      params: companyId ? { companyId } : undefined,
    })
    return response.data
  },

  async createFolder(data: { name: string; companyId?: string | null }) {
    const response = await api.post<QrFolder>('/qr/folders', data)
    return response.data
  },

  async renameFolder(id: string, name: string) {
    const response = await api.patch<QrFolder>(`/qr/folders/${id}`, { name })
    return response.data
  },

  async removeFolder(id: string, password: string) {
    const response = await api.delete<{ message: string }>(`/qr/folders/${id}`, {
      data: { password },
    })
    return response.data
  },

  // ─── Tokens de API (microserviço) — ADMIN, escopo via x-company-id ─────────
  async listTokens(companyId: string) {
    const response = await api.get<QrApiToken[]>('/qr/api-tokens', {
      headers: { 'x-company-id': companyId },
    })
    return response.data
  },

  async createToken(
    companyId: string,
    data: { name: string; defaultFolderId?: string | null },
  ) {
    const response = await api.post<QrApiTokenCreated>('/qr/api-tokens', data, {
      headers: { 'x-company-id': companyId },
    })
    return response.data
  },

  async revokeToken(companyId: string, id: string) {
    const response = await api.delete<{ message: string }>(
      `/qr/api-tokens/${id}`,
      { headers: { 'x-company-id': companyId } },
    )
    return response.data
  },
}

export default qrService
