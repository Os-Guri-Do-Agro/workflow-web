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

export function getUserToken() {
  const token = localStorage.getItem('token')

  if (!token) {
    return null
  }

  // Token corrompido não pode derrubar o boot do app (tela branca).
  try {
    return jwtDecode<DecodedToken>(token)
  } catch {
    return null
  }
}


export async function getInfoAuth() {
  // Lê o token na hora da chamada — capturar em escopo de módulo congelava o
  // estado do boot (sem token) e escondia botões até o F5 pós-login.
  if (!getUserToken()) return false
  const activeCompanyId = localStorage.getItem('activeCompany')
  try {
    const response = await userService.getInfoAuth()
    const compareRole = response.companies.find((company: any) => company.companyId === activeCompanyId)
    if (!compareRole) return false
    return EDITOR_ROLES.includes(compareRole.role as CompanyRole)
  } catch {
    // Check de papel: falha de rede não deve propagar e travar onMounted das views.
    return false
  }
}
