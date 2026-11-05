import api from '../api'

/** Resposta de `POST /company/:companyId/members/:userId/access-link`. */
export interface AccessLinkResult {
  /** Endereço completo para a pessoa criar a senha (vale 7 dias, uso único). */
  link: string
  /** `true` quando a API também mandou o link por e-mail (SendGrid configurado). */
  emailed: boolean
  expiresAt: string
  user: { id: string; name: string; email: string }
}

class companieService {
  private async handleRequest<T>(request: Promise<{ data: T }>, errorMessage: string): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error: any) {
      console.error(`${errorMessage}: ${error.message}`, error)
      throw error
    }
  }

  postCompany(data: any): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.post('/company', data, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao criar empresa',
    )
  }

  /**
   * Adiciona UM usuário à empresa com uma role. Só ADMIN da empresa alvo passa
   * (`@RequireRole(ADMIN)` + revalidação no service do backend).
   *
   * Não existe `POST /company/:id/admin`: a rota nunca foi implementada e o
   * modal de adicionar usuário batia nela (404 silencioso virando toast de erro
   * genérico). Promover alguém a admin é esta mesma chamada com `role: 'ADMIN'`.
   */
  postUserCompany(id: string, data: any): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.post(`/company/${id}/member`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao adicionar membro à empresa',
    )
  }

  getCompany(): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get('/company', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao buscar empresas',
    )
  }

  getCompanyMembers(id: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get(`/company/${id}/members`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao buscar membros da empresa',
    )
  }

  getCompanyAll(): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get('/company/all', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao buscar todas as empresas',
    )
  }

  postCompanyMemberLote(id: string, data: any): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.post(`/company/${id}/member/lote`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao adicionar membros à empresa em lote',
    )
  }

  /**
   * Link de primeiro acesso de um membro. Só ADMIN da empresa (e de todas as
   * empresas da pessoa). O `x-company-id` vai explícito com a empresa do card:
   * a empresa ativa do topo pode ser outra, onde quem clica nem é admin.
   */
  createAccessLink(companyId: string, userId: string): Promise<AccessLinkResult> {
    return this.handleRequest(
      // Corpo `{}`, não `null`: o body-parser estrito do Express recusa "null" com 400.
      api.post(`/company/${companyId}/members/${userId}/access-link`, {}, {
        headers: { 'x-company-id': companyId },
      }),
      'Erro ao gerar link de acesso',
    )
  }

  companyWithMetrics(): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get('/company/with-metrics', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao buscar empresas com métricas',
    )
  }
}

export default new companieService()
