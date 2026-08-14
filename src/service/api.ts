import axios, { type AxiosError, type AxiosResponseHeaders, type RawAxiosResponseHeaders } from 'axios'
import { toast } from 'vue-sonner'
import { safeSessionStorage, safeStorage } from '@/utils/safe-storage'

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

  // Sem resposta = falha de rede ou timeout. O `error.message` do axios aqui é
  // "Network Error" / "timeout of Xms exceeded": texto em inglês, do jeito que
  // nunca deve chegar ao usuário. O fallback de quem chamou é mais útil.
  if (!error.response) return fallback

  const message = error.response.data?.message
  if (Array.isArray(message)) return message.join(', ')
  return message || fallback
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
  // `safeStorage` e não `localStorage` direto: o acesso ao storage LANÇA em
  // navegador com bloqueio de armazenamento para o site (Firefox com proteção
  // rígida, Opera/Brave com escudo, janela privada, política corporativa). Se
  // lançasse aqui, toda chamada de API morreria antes de sair e a tela ficaria
  // inacessível — só para quem tem aquela configuração, o que faz o problema
  // parecer específico de um navegador.
  const token = safeStorage.getItem('token')
  const companyId = safeStorage.getItem('activeCompany')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  // x-company-id: respeita o que a requisição já definiu explicitamente (ex.: o
  // dialog de Tokens/pastas opera numa empresa específica que pode ≠ da ativa
  // global). Só cai no activeCompany do localStorage quando a request não mandou.
  if (companyId && config.headers['x-company-id'] == null) {
    config.headers['x-company-id'] = companyId
  }

  return config
})

/**
 * Limpa as chaves de sessão (token + empresa ativa), derruba o socket e zera o
 * cache do Vue Query. Preserva preferências de UI.
 *
 * O import é dinâmico de propósito: `session-reset` puxa o realtime-service, que
 * puxa este módulo de volta (apiBaseUrl). Resolver isso em runtime evita o ciclo
 * estático entre os três.
 */
export function clearSession() {
  safeStorage.removeItem('token')
  safeStorage.removeItem('activeCompany')
  void import('@/service/realtime/session-reset').then((m) => m.resetSessionState())
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
  if (!safeStorage.getItem('token')) return
  handlingSessionExpiry = true
  clearSession()
  if (!window.location.pathname.startsWith('/login')) {
    toast.error('Sua sessão expirou. Faça login novamente.')
    // O toast morre com o assign; a LoginView lê essa flag e reexibe o aviso.
    safeSessionStorage.setItem('loginReason', 'expired')
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
