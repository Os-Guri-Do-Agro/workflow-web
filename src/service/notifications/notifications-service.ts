import api from '../api'

class notificationsService {
  private async handleRequest<T>(request: Promise<{ data: T }>, errorMessage: string): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error: any) {
      console.error(`${errorMessage}: ${error.message}`, error)
      throw error
    }
  }

  listCompanies(): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get('/notifications/companies', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao listar empresas',
    )
  }

  enableAll(): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.post(
        '/notifications/enable-all',
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      ),
      'Erro ao ativar notificações',
    )
  }

  disableAll(): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.post(
        '/notifications/disable-all',
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      ),
      'Erro ao desativar notificações',
    )
  }

  updateCompany(
    companyId: string,
    data: { discordWebhookUrl?: string | null; notificationsEnabled?: boolean },
  ): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.patch(`/notifications/company/${companyId}`, data, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao atualizar empresa',
    )
  }

  runNow(): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.post(
        '/notifications/run-now',
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      ),
      'Erro ao disparar cron manualmente',
    )
  }
}

export default new notificationsService()
