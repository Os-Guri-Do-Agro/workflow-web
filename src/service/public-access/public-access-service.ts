import api from '../api'

/**
 * Cliente da página Acessos Públicos (spec docs/specs/acessos-publicos.md).
 *
 * A LISTAGEM é agregada (`/public-access/tokens`, todas as empresas onde sou
 * ADMIN); criação e revogação continuam nos endpoints por empresa do QR
 * (`/qr/api-tokens` + header `x-company-id`) — o token é o mesmo objeto, só a
 * superfície de gestão que mudou de lugar.
 */

export type ApiTokenScope = 'qr' | 'ocr'

export interface PublicAccessCompany {
  id: string
  name: string
}

export interface PublicAccessToken {
  id: string
  name: string
  tokenPrefix: string
  companyId: string
  /** null = acesso total (QR + OCR): tokens criados antes do escopo. */
  scope: ApiTokenScope | null
  defaultFolderId: string | null
  createdById: string
  createdByName: string
  /** Só o criador revoga: o back é a lei, isto habilita/desabilita o botão. */
  mine: boolean
  lastUsedAt: string | null
  revoked: boolean
  revokedAt: string | null
  createdAt: string
}

export interface PublicAccessList {
  companies: PublicAccessCompany[]
  tokens: PublicAccessToken[]
}

/** Resposta da criação: `token` (valor cru) só existe AQUI, uma vez. */
export interface PublicAccessTokenCreated extends PublicAccessToken {
  token: string
}

const publicAccessService = {
  async list() {
    const r = await api.get<PublicAccessList>('/public-access/tokens')
    return r.data
  },

  async create(
    companyId: string,
    data: {
      name: string
      scope?: ApiTokenScope | null
      defaultFolderId?: string | null
    },
  ) {
    const r = await api.post<PublicAccessTokenCreated>(
      '/qr/api-tokens',
      { ...data, scope: data.scope ?? undefined },
      { headers: { 'x-company-id': companyId } },
    )
    return r.data
  },

  async revoke(companyId: string, id: string) {
    const r = await api.delete<{ message: string }>(`/qr/api-tokens/${id}`, {
      headers: { 'x-company-id': companyId },
    })
    return r.data
  },
}

export default publicAccessService
