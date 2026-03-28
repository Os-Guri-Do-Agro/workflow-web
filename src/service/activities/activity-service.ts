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
    return this.handleRequest(
      api.patch(`/activity/${id}/status`, { status }),
      'Erro ao atualizar atividade',
    )
  }

  postActivity(data: any): Promise<any> {
    return this.handleRequest(
      api.post('/activity', data),
      'Erro ao criar atividade',
    )
  }

  getActivityById(id: string): Promise<any> {
    return this.handleRequest(
      api.get(`/activity/${id}`),
      'Erro ao buscar atividade',
    )
  }

  patchActivity(id: string, data: any): Promise<any> {
    return this.handleRequest(
      api.patch(`/activity/${id}`, data),
      'Erro ao atualizar atividade',
    )
  }

  deleteActivity(id: string): Promise<any> {
    return this.handleRequest(
      api.delete(`/activity/${id}`),
      'Erro ao deletar atividade',
    )
  }

  postActivityAttachment(id: string, data: FormData): Promise<any> {
    return this.handleRequest(
      api.post(`/activity/${id}/attachment`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
      'Erro ao fazer upload do anexo',
    )
  }

  deleteAttachment(attachmentId: string): Promise<any> {
    return this.handleRequest(
      api.delete(`/activity/attachment/${attachmentId}`),
      'Erro ao deletar anexo',
    )
  }

  postSuggest(id: string): Promise<any> {
    return this.handleRequest(
      api.post(`/activity/${id}/suggest`, {}),
      'Erro ao sugerir atividade',
    )
  }
}

export default new activityService()
