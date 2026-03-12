import api from '../api'

class ticketService {
  private async handleRequest<T>(request: Promise<{ data: T }>, errorMessage: string): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error: any) {
      console.error(`${errorMessage}: ${error.message}`, error)
      throw error
    }
  }

  postTicket(data: any): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.post('/ticket', data, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao criar ticket',
    )
  }

  getTickets(): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.get('/ticket', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao buscar tickets',
    )
  }

  patchTicket(id: string, data: any): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.patch(`/ticket/${id}`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao atualizar ticket',
    )
  }

  deletTicket(id: string): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.delete(`/ticket/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao deletar ticket',
    )
  }
}

export default new ticketService()
