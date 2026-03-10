import api from '../api'

class activityService {
  private async handleRequest<T>(request: Promise<{ data: T }>, errorMessage: string): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error: any) {
      console.error(`${errorMessage}: ${error.message}`, error)
      throw error
    }
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

  postActivity(data: any): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.post(`/activity`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao criar atividade',
    )
  }
}

export default new activityService()
