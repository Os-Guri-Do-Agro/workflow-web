import api from '../../api'

/** Resposta do `reveal`: só os campos SECRET, já decifrados. */
export interface RevealedVariable {
  id: string
  name: string
  fields: { key: string; value: string }[]
}

/** Evento do Histórico da variável (`GET /company-variable/:id/history`). */
export interface VariableHistoryEvent {
  id: string
  verb: string
  summary: string
  createdAt: string
  actorId: string
  actor: { id: string; name: string; email: string } | null
}

class companyVariableService {
  private async handleRequest<T>(request: Promise<{ data: T }>, errorMessage: string): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error: any) {
      console.error(`${errorMessage}: ${error.message}`, error)
      throw error
    }
  }

  postCompanyVariable(data: any): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.post(`/company-variable`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao criar variável',
    )
  }

  getCompanyVariables(): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.get(`/company-variable`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao buscar variáveis',
    )
  }

  patchCompanyVariable(id: string, data: any): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.patch(`/company-variable/${id}`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao atualizar variável',
    )
  }

  deleteCompanyVariable(id: string): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.delete(`/company-variable/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao deletar variável',
    )
  }

  /**
   * Revela um campo SECRET (ou todos, sem `field`). A API grava quem viu ANTES
   * de responder; é o único caminho para o valor, porque a listagem chega
   * mascarada.
   */
  revealVariable(id: string, field?: string): Promise<RevealedVariable> {
    return this.handleRequest(
      api.post(`/company-variable/${id}/reveal`, field ? { field } : {}),
      'Erro ao revelar segredo',
    )
  }

  /** Revela os segredos de várias variáveis de uma vez (exportar `.env`). */
  revealVariables(ids: string[]): Promise<RevealedVariable[]> {
    return this.handleRequest(
      api.post('/company-variable/reveal', { ids }),
      'Erro ao revelar segredos',
    )
  }

  getVariableHistory(id: string): Promise<VariableHistoryEvent[]> {
    return this.handleRequest(
      api.get(`/company-variable/${id}/history`),
      'Erro ao buscar histórico da variável',
    )
  }

  uploadVariableImage(id: string, file: File): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    const formData = new FormData()
    formData.append('file', file)
    return this.handleRequest(
      api.post(`/company-variable/${id}/image`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
          'Content-Type': 'multipart/form-data',
        },
      }),
      'Erro ao fazer upload da imagem',
    )
  }
}

export default new companyVariableService()
