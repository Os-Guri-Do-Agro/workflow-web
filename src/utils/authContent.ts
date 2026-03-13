import userService from '@/service/user/user-service'
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
    return null
  }

  const tokenDecoded = jwtDecode<DecodedToken>(token)

  return tokenDecoded
}


export async function getInfoAuth() {
  if (!newToken) return false
  const activeCompanyId = localStorage.getItem('activeCompany')
  const response = await userService.getInfoAuth()
  const compareRole = response.companies.find((company: any) => company.companyId === activeCompanyId)
  return compareRole.role === 'WORKER'
}
