import api from '../api'

const dashboardService = {
  async getWorkspace() {
    const response = await api.get('/dashboard/workspace')
    return response.data
  },
  
  async getCompanyMetrics(companyId: string, quarter?: string, month?: number) {
    const params: any = {}
    if (quarter) params.quarter = quarter
    if (month) params.month = month
    
    const response = await api.get(`/dashboard/company/${companyId}`, { params })
    return response.data
  },
}

export default dashboardService
