import api from '../api'

/** Contrato de `GET /push/public-key`. */
export interface PushConfig {
  /** false quando o backend está sem VAPID: o front não deve oferecer o recurso. */
  enabled: boolean
  publicKey: string | null
}

export default {
  config: () => api.get<PushConfig>('/push/public-key').then((r) => r.data),

  subscribe: (sub: PushSubscriptionJSON) =>
    api.post('/push/subscribe', {
      endpoint: sub.endpoint,
      keys: sub.keys,
    }),

  unsubscribe: (endpoint: string) =>
    api.delete('/push/subscribe', { data: { endpoint } }),

  /** Dispara um push para a própria pessoa (botão de teste em /settings). */
  test: (message?: string) =>
    api
      .post<{ sent: number; enabled: boolean }>('/push/test', { message })
      .then((r) => r.data),
}
