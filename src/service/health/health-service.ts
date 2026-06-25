import { publicApi } from '../api'

export interface HealthStatus {
  status: string
  db: string
  uptime: number
  timestamp: string
}

const healthService = {
  async getHealth() {
    const response = await publicApi.get<HealthStatus>('/health')
    return response.data
  },
}

export default healthService
