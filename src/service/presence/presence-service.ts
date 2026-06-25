import api from '../api'

export interface PresenceResponse {
  online: string[]
}

const presenceService = {
  async getPresence() {
    const response = await api.get<PresenceResponse>('/presence')
    return response.data
  },
}

export default presenceService
