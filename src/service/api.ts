import axios, { type AxiosError, type AxiosResponseHeaders, type RawAxiosResponseHeaders } from 'axios'
import { toast } from 'vue-sonner'

export interface ApiErrorEnvelope {
  statusCode: number
  error: string
  message: string | string[]
  path: string
  timestamp: string
  requestId?: string
}

export type ApiRequestError = AxiosError<ApiErrorEnvelope> & {
  requestId?: string
  userMessage?: string
}

type ResponseHeaders = RawAxiosResponseHeaders | AxiosResponseHeaders

function headerValue(headers: ResponseHeaders | undefined, key: string) {
  const value = headers?.[key] ?? headers?.[key.toLowerCase()]
  return Array.isArray(value) ? value.join(', ') : value?.toString()
}

export function getApiErrorMessage(error: unknown, fallback = 'Não foi possível concluir a operação') {
  if (!axios.isAxiosError<ApiErrorEnvelope>(error)) return error instanceof Error ? error.message : fallback

  const message = error.response?.data?.message
  if (Array.isArray(message)) return message.join(', ')
  return message || error.message || fallback
}

export function getApiRequestId(error: unknown) {
  if (!axios.isAxiosError<ApiErrorEnvelope>(error)) return undefined
  return (error as ApiRequestError).requestId || error.response?.data?.requestId || headerValue(error.response?.headers, 'x-request-id')
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
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

/** Limpa as chaves de sessão (token + empresa ativa). Preserva preferências de UI. */
export function clearSession() {
  localStorage.removeItem('token')
  localStorage.removeItem('activeCompany')
}

let handlingSessionExpiry = false

/**
 * Sessão expirada/inválida (HTTP 401): limpa o token e manda pro login.
 * - Só age se havia sessão (evita loop em páginas públicas).
 * - Redirect "hard" garante reset total de estado (Pinia, Vue Query, sockets).
 * - Flag evita múltiplos redirects quando vários requests dão 401 juntos.
 */
function handleSessionExpired() {
  if (handlingSessionExpiry) return
  if (!localStorage.getItem('token')) return
  handlingSessionExpiry = true
  clearSession()
  if (!window.location.pathname.startsWith('/login')) {
    toast.error('Sua sessão expirou. Faça login novamente.')
    // Preserva a rota atual para voltar exatamente aonde estava após relogar.
    const current = window.location.pathname + window.location.search
    const redirect = current && current !== '/' ? `?redirect=${encodeURIComponent(current)}` : ''
    window.location.assign(`/login${redirect}`)
  } else {
    handlingSessionExpiry = false
  }
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorEnvelope>) => {
    const requestError = error as ApiRequestError
    const requestId = error.response?.data?.requestId || headerValue(error.response?.headers, 'x-request-id')
    if (requestId) requestError.requestId = requestId
    requestError.userMessage = getApiErrorMessage(error)

    // 401 = token expirado/inválido → desloga. Exceto na própria tentativa de
    // login (senha errada também retorna 401 e deve só mostrar o erro na tela).
    const isLoginAttempt = (error.config?.url ?? '').includes('/auth/login')
    if (error.response?.status === 401 && !isLoginAttempt) {
      handleSessionExpired()
    }
    return Promise.reject(requestError)
  },
)

export default api
