import api from '../api'

class dashboardService {
  private async handleRequest<T>(request: Promise<{ data: T }>, errorMessage: string): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error: any) {
      console.error(`${errorMessage}: ${error.message}`, error)
      throw error
    }
  }

  getCompanyMetrics(companyId: string, quarter?: string, month?: number): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get(
        `/dashboard/company/${companyId}${quarter ? `?quarter=${quarter}` : month ? `?month=${month}` : ''}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      ),
      'Erro ao buscar metricas da empresa',
    )
  }
}

export default new dashboardService()
