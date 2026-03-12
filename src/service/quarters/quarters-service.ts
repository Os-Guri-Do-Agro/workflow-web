import api from '../api'

class quarterService {
  private async handleRequest<T>(request: Promise<{ data: T }>, errorMessage: string): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error: any) {
      console.error(`${errorMessage}: ${error.message}`, error)
      throw error
    }
  }

  getCompanyQuarters(companyId: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get(`/company/${companyId}/quarters`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao buscar setores',
    )
  }

  getCompanyBoards(monthId: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get(`/month/${monthId}/board`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao buscar atividades',
    )
  }

  patchActivityStatus(id: string, status: string): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.patch(
        `/activity/${id}/status`,
        { status },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-company-id': companyId,
          },
        },
      ),
      'Erro ao atualizar atividade',
    )
  }

  getCompanyRoadMap(companyId: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get(`/company/${companyId}/roadmap`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao buscar roadmap',
    )
  }

  postReport(id: string, data: any): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.post(`/quarter/${id}/report`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao gerar relatório',
    )
  }

  postImproveReport(id: string, data: any): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.post(`/quarter/${id}/report/improve`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao sugerir relatório',
    )
  }

  getReport(id: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get(`/quarter/${id}/report`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao buscar relatório',
    )
  }
}

export default new quarterService()
