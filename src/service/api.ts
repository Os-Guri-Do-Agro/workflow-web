import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:3535',
  // baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  const companyId = localStorage.getItem('activeCompany')
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  
  if (companyId) {
    config.headers['x-company-id'] = companyId
  }
  
  return config
})

export default api
