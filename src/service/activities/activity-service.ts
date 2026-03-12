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

  getActivityById(id: string): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.get(`/activity/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao buscar atividade',
    )
  }

  patchActivity(id: string, data: any): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.patch(`/activity/${id}`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao atualizar atividade',
    )
  }

  deleteActivity(id: string): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.delete(`/activity/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao deletar atividade',
    )
  }

  postActivityAttachment(id: string, data: FormData): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.post(`/activity/${id}/attachment`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
          'Content-Type': 'multipart/form-data',
        },
      }),
      'Erro ao fazer upload do anexo',
    )
  }

  deleteAttachment(attachmentId: string): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.delete(`/activity/attachment/${attachmentId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao deletar anexo',
    )
  }

  postSuggest(id: string): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.post(
        `/activity/${id}/suggest`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-company-id': companyId,
          },
        },
      ),
      'Erro ao sugerir atividade',
    )
  }
}

export default new activityService()
