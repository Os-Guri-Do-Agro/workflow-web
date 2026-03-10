import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const companyId = localStorage.getItem('activeCompany')
  if (companyId) {
    config.headers['x-company-id'] = companyId
  }
  return config
})

export default api
