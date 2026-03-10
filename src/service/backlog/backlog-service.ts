import api from '../api'

class backlogService {
  private async handleRequest<T>(request: Promise<{ data: T }>, errorMessage: string): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error: any) {
      console.error(`${errorMessage}: ${error.message}`, error)
      throw error
    }
  }

  getBacklogByCompany(companyId: string): Promise<any[]> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get(`/backlog/company/${companyId}/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao buscar backlog',
    )
  }
}

export default new backlogService()
