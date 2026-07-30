import posthog from 'posthog-js'

let initialized = false

/**
 * Acesso ao PostHog.
 *
 * Em localhost nada é inicializado, e todo `capture` é no-op: desenvolvimento não
 * polui o funil de produção. Para eventos de produto use `useAnalytics()`, que é
 * tipado; este composable é a camada crua embaixo dele.
 */
export function usePostHog() {
  const isLocalhost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

  if (!isLocalhost && !initialized) {
    posthog.init('phc_R2URgzaU31qEMn23Oic9OpMNfACJW8fvcNWne67ZgFq', {
      api_host: 'https://us.i.posthog.com',
      person_profiles: 'always',
    })
    initialized = true
  }

  return {
    posthog,
    capturePageview: () => {
      if (initialized) posthog.capture('$pageview')
    },
    /**
     * Envia um evento. Nunca lança: telemetria não pode derrubar a tela, e um
     * `capture` que estoura dentro de um handler de clique mataria a ação do
     * usuário junto.
     */
    capture: (name: string, props?: Record<string, unknown>) => {
      if (!initialized) return
      try {
        posthog.capture(name, props)
      } catch {
        // Silencioso de propósito: já falhou, avisar o usuário não ajuda ninguém.
      }
    },
    /** Liga a sessão do PostHog ao usuário e à empresa ativa. */
    identify: (userId: string, props?: Record<string, unknown>) => {
      if (!initialized) return
      try {
        posthog.identify(userId, props)
      } catch {
        // Idem.
      }
    },
  }
}
