import { jwtDecode } from 'jwt-decode'

export function getUserToken() {
  const token = localStorage.getItem('token')

  if (!token) {
    console.log('token não encontrado!')
    return null
  }

  const tokenDecoded = jwtDecode(token)

  console.log('token decodificado: ', tokenDecoded)

  return tokenDecoded
}
