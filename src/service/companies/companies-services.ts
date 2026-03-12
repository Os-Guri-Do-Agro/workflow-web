import api from '../api'

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
}

export default new companieService()
