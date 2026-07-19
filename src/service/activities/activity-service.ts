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

  /**
   * `companyId` explícito é obrigatório em telas agregadas (o /board mostra
   * atividades de TODAS as empresas). Sem ele o interceptor cai na empresa ativa
   * do localStorage e a API responde 404 ao mover card de outra empresa.
   */
  patchActivityStatus(id: string, status: string, companyId?: string): Promise<any> {
    return this.handleRequest(
      api.patch(
        `/activity/${id}/status`,
        { status },
        companyId ? { headers: { 'x-company-id': companyId } } : undefined,
      ),
      'Erro ao atualizar atividade',
    )
  }

  /** Move o card no kanban persistindo status + ordem manual (position 0-based). */
  moveActivity(id: string, data: { status: string; position: number }): Promise<any> {
    return this.handleRequest(
      api.patch(`/activity/${id}/move`, data),
      'Erro ao mover atividade',
    )
  }

  postActivity(data: any): Promise<any> {
    return this.handleRequest(
      api.post('/activity', data),
      'Erro ao criar atividade',
    )
  }

  /** Localiza a atividade no workspace (empresa + mês) para resolver links antigos `/activity/:id`. */
  locateActivity(id: string): Promise<{ companyId: string; monthId: string; taskId: string }> {
    return this.handleRequest(
      api.get(`/activity/${id}/locate`),
      'Erro ao localizar atividade',
    )
  }

  /** `companyId` explícito: o painel do /board abre cards de QUALQUER empresa. */
  getActivityById(id: string, companyId?: string): Promise<any> {
    return this.handleRequest(
      api.get(
        `/activity/${id}`,
        companyId ? { headers: { 'x-company-id': companyId } } : undefined,
      ),
      'Erro ao buscar atividade',
    )
  }

  /** Aceita patch parcial (`{ title }` sozinho, `{ dueDate: null }` para limpar). */
  patchActivity(id: string, data: any, companyId?: string): Promise<any> {
    return this.handleRequest(
      api.patch(
        `/activity/${id}`,
        data,
        companyId ? { headers: { 'x-company-id': companyId } } : undefined,
      ),
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
