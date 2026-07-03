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

/**
 * Normaliza a URL da API vinda do env. Sem o esquema (`https://`), o axios
 * trata a baseURL como caminho RELATIVO e todas as chamadas viram 404 no
 * próprio domínio do front — foi exatamente o que derrubou produção quando a
 * env no Vercel foi salva como "srhub.up.railway.app". Aqui a gente aceita a
 * env com ou sem esquema e com/sem barra final.
 */
export function apiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  // localhost sem esquema é dev → http; qualquer outro host assume https.
  const scheme = /^(localhost|127\.|0\.0\.0\.0)/.test(raw) ? 'http' : 'https'
  return `${scheme}://${raw}`
}

const api = axios.create({
  baseURL: apiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
})

export const publicApi = axios.create({
  baseURL: apiBaseUrl(),
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
    // O toast morre com o assign; a LoginView lê essa flag e reexibe o aviso.
    sessionStorage.setItem('loginReason', 'expired')
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
