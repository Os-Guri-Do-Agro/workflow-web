import { jwtDecode } from 'jwt-decode'

interface DecodedToken {
  sub: string
  name: string
  email: string
  companies: Array<{
    companyId: string
    name: string
    cnpj: string
    role: 'WORKER' | 'CLIENT'
  }>
  iat: number
  exp: number
}

const newToken = getUserToken()

export function getUserToken() {
  const token = localStorage.getItem('token')

  if (!token) {
    console.log('token não encontrado!')
    return null
  }

  const tokenDecoded = jwtDecode<DecodedToken>(token)

  return tokenDecoded
}

export function isWorker(): boolean {
  if (!newToken) return false
  
  const activeCompanyId = localStorage.getItem('activeCompany')
  if (!activeCompanyId) return false
  
  const company = newToken.companies.find(c => c.companyId === activeCompanyId)
  return company?.role === 'WORKER'
}
