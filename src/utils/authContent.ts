import userService from '@/service/user/user-service'
import { jwtDecode } from 'jwt-decode'

type CompanyRole = 'OWNER' | 'ADMIN' | 'WORKER' | 'CLIENT' | 'VIEWER'

interface DecodedToken {
  sub: string
  name: string
  email: string
  companies: Array<{
    companyId: string
    name: string
    cnpj: string
    role: CompanyRole
  }>
  iat: number
  exp: number
}

const EDITOR_ROLES: CompanyRole[] = ['OWNER', 'ADMIN', 'WORKER']

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
  if (!compareRole) return false
  return EDITOR_ROLES.includes(compareRole.role as CompanyRole)
}
