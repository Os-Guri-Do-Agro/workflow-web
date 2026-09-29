import api from '../api'

/**
 * Uma mudança de status (`ActivityLog`), como `GET /backlog/*` devolve. É o
 * único histórico que a API registra: outros campos não entram aqui.
 */
export interface BacklogEntry {
  id: string
  activityId: string
  /** Título no momento da troca (a tarefa pode ter sido renomeada depois). */
  activityTitle?: string
  previousStatus: string | null
  newStatus: string
  changedAt: string
  changedById?: string
  changedBy?: { id: string; name: string } | null
}

class backlogService {
  private async handleRequest<T>(request: Promise<{ data: T }>, errorMessage: string): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error: unknown) {
      console.error(`${errorMessage}: ${(error as Error | null)?.message ?? ''}`, error)
      throw error
    }
  }

  getBacklogByCompany(companyId: string): Promise<BacklogEntry[]> {
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

  /**
   * Linha do tempo de status de UMA atividade (`GET /backlog/activity/:id`).
   * `companyId` explícito porque o painel do `/board` abre tarefa de qualquer
   * empresa, e o guard da API confere a empresa pelo `x-company-id`.
   */
  getBacklogByActivity(activityId: string, companyId?: string): Promise<BacklogEntry[]> {
    return this.handleRequest(
      api.get(
        `/backlog/activity/${activityId}`,
        companyId ? { headers: { 'x-company-id': companyId } } : undefined,
      ),
      'Erro ao buscar o histórico da atividade',
    )
  }
}

export default new backlogService()
