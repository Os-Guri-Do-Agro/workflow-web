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

      // ─── Coleta automática desligada, de propósito ────────────────────────
      //
      // NÃO é otimização: foi medido e não muda a latência de clique. Na tela de
      // QR (18 códigos, 6.086 nós de SVG), 25 cliques nos filtros de pasta com e
      // sem estas opções deram o mesmo: 5ms a 280ms, estável. Quem mexer aqui
      // procurando ganho de desempenho não vai achar.
      //
      // O motivo é outro: o que o produto quer saber já está em `useAnalytics()`,
      // como lista fechada de eventos com propriedades cobradas pelo typecheck.
      // A coleta automática cria um segundo funil, com outro vocabulário, que
      // ninguém lê. Duas fontes discordando é pior que uma fonte só.

      // Inventa nome de evento a partir da árvore do DOM. Nada aqui é lido: o
      // que se pergunta ao PostHog está na união `ProductEvent`.
      autocapture: false,

      // O `dead-clicks-autocapture.js` que aparece falhando no console de quem
      // usa bloqueador de anúncios. Cai junto com o autocapture.
      capture_dead_clicks: false,

      // Descrição de tarefa e nome de cliente entram no editor de texto rico. A
      // gravação de sessão levaria esse conteúdo para fora, e ninguém assiste.
      disable_session_recording: true,

      // Correção de contagem: o router já dispara `capturePageview()` a cada
      // navegação, e o default deste pacote (sem `defaults` declarado) é `true`,
      // que dispara sozinho no init. A primeira visita de cada sessão estava
      // sendo contada duas vezes.
      capture_pageview: false,
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
