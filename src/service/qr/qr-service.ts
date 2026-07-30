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

/** Filtros da listagem. Todos opcionais; o backend normaliza e aplica tetos. */
export interface QrListParams {
  page?: number
  limit?: number
  search?: string
  /** `all` | `personal` | `<companyId>` */
  scope?: string
  /** `<folderId>` | `none` */
  folderId?: string
}

/** Um projeto (ou "Pessoais") na navegação lateral, com o total DELE. */
export interface QrScopeCount {
  key: string
  label: string
  count: number
}

/**
 * Página da listagem.
 *
 * `total` acompanha o filtro ativo (é o número do paginador). `scopes` e
 * `totalAll` contam o conjunto inteiro sob a busca, ignorando projeto e pasta:
 * são os números da navegação, que precisam continuar dizendo quantos existem em
 * cada projeto mesmo com um filtro estreito aplicado.
 */
export interface QrListPage {
  items: QrCode[]
  total: number
  page: number
  limit: number
  scopes: QrScopeCount[]
  totalAll: number
}

/**
 * Deriva os escopos quando a resposta veio como array (API antiga).
 * Some junto com a guarda de retrocompatibilidade do `list`.
 */
function scopesFromItems(items: QrCode[]): QrScopeCount[] {
  const pessoais = items.filter((q) => !q.companyId).length
  const porEmpresa = new Map<string, QrScopeCount>()
  for (const q of items) {
    if (!q.companyId) continue
    const atual = porEmpresa.get(q.companyId)
    if (atual) atual.count += 1
    else {
      porEmpresa.set(q.companyId, {
        key: q.companyId,
        label: q.companyName || 'Empresa',
        count: 1,
      })
    }
  }
  return [
    ...(pessoais ? [{ key: 'personal', label: 'Pessoais', count: pessoais }] : []),
    ...[...porEmpresa.values()].sort((a, b) => b.count - a.count),
  ]
}

const qrService = {
  /**
   * Página da listagem.
   *
   * ## Por que tolera receber um array
   *
   * A API responde envelope quando recebe filtro e array quando não recebe.
   * Durante a janela de deploy o front novo pode falar com a API antiga, que não
   * conhece os filtros e devolve o array inteiro. Normalizar aqui, num lugar só,
   * faz a tela funcionar nos dois mundos sem espalhar `Array.isArray` por
   * componente. Quando a API nova estiver em produção esta guarda pode sair.
   */
  async list(params: QrListParams = {}): Promise<QrListPage> {
    const response = await api.get<QrCode[] | QrListPage>('/qr', { params })
    const data = response.data

    if (Array.isArray(data)) {
      return {
        items: data,
        total: data.length,
        page: 1,
        limit: data.length || 1,
        scopes: scopesFromItems(data),
        totalAll: data.length,
      }
    }
    return data
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
