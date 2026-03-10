import { jwtDecode } from 'jwt-decode'

interface DecodedToken {
  sub: string
  name: string
  email: string
  iat: number
  exp: number
}

export function getUserToken() {
  const token = localStorage.getItem('token')

  if (!token) {
    console.log('token não encontrado!')
    return null
  }

  const tokenDecoded = jwtDecode<DecodedToken>(token)

  return tokenDecoded
}
