import axios, { type AxiosError, type AxiosResponseHeaders, type RawAxiosResponseHeaders } from 'axios'

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

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorEnvelope>) => {
    const requestError = error as ApiRequestError
    const requestId = error.response?.data?.requestId || headerValue(error.response?.headers, 'x-request-id')
    if (requestId) requestError.requestId = requestId
    requestError.userMessage = getApiErrorMessage(error)
    return Promise.reject(requestError)
  },
)

export default api
