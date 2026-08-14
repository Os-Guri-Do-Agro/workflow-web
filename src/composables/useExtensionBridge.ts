import { onScopeDispose, ref } from 'vue'
import { detectionSource, markActivity, regressActivity } from '@/composables/idle-state'

/**
 * Ponte com a extensão do Nevo (spec timer-confiavel, P3).
 *
 * A extensão usa `chrome.idle`, que enxerga o sistema operacional inteiro SEM
 * pedir permissão ao usuário e continua valendo com a aba fechada. Quando ela
 * está instalada, vira a fonte de maior confiança e o app deixa de depender da
 * permissão web de detecção — que é justamente a que ninguém via.
 *
 * O protocolo é uma via só: o app pergunta por `window.postMessage`, a extensão
 * responde com um número (o instante da última atividade). Nada de identidade,
 * URL ou conteúdo trafega.
 */

const REQUEST = 'nevo-activity-request'
const REPLY = 'nevo-activity'
const HELLO = 'nevo-activity-hello'

/** Frequência da pergunta. A extensão detecta em 60s; perguntar mais é ruído. */
const POLL_MS = 20_000

/** Sem resposta neste tempo, consideramos que a extensão não está instalada. */
const SILENCE_MS = 90_000

export const extensionDetected = ref(false)
export const extensionVersion = ref<string | null>(null)

let installed = false

export function useExtensionBridge() {
  if (installed || typeof window === 'undefined') {
    return { extensionDetected, extensionVersion }
  }
  installed = true

  let lastReply = 0
  let timer: number | null = null

  function ask() {
    window.postMessage({ type: REQUEST }, window.location.origin)

    // Silêncio prolongado: a extensão foi desinstalada ou desativada no meio da
    // sessão. Rebaixa a fonte para o app voltar a exigir a permissão web em vez
    // de seguir confiando num sinal que não chega mais.
    if (extensionDetected.value && Date.now() - lastReply > SILENCE_MS) {
      extensionDetected.value = false
      extensionVersion.value = null
      if (detectionSource.value === 'extension') detectionSource.value = 'tab'
    }
  }

  function onMessage(event: MessageEvent) {
    if (event.source !== window) return
    const data = event.data as {
      type?: string
      lastActivityAt?: number
      state?: string
      version?: string
    }

    // A extensão acabou de entrar: pergunta na hora em vez de esperar o ciclo.
    if (data?.type === HELLO) {
      ask()
      return
    }
    if (data?.type !== REPLY || typeof data.lastActivityAt !== 'number') return

    lastReply = Date.now()
    extensionDetected.value = true
    extensionVersion.value = data.version ?? null

    // A extensão vence a aba: ela enxerga o computador inteiro. Só não passa na
    // frente da API do navegador, que dá o mesmo sinal sem intermediário.
    if (detectionSource.value !== 'system') detectionSource.value = 'extension'

    // `regress` além de `mark`: a extensão é a fonte mais confiável, então ela
    // também CORRIGE PARA TRÁS um mousemove residual da aba que mascararia a
    // ausência real da pessoa.
    if (data.state === 'active') markActivity(data.lastActivityAt)
    else regressActivity(data.lastActivityAt)
  }

  window.addEventListener('message', onMessage)
  ask()
  timer = window.setInterval(ask, POLL_MS)

  onScopeDispose(() => {
    window.removeEventListener('message', onMessage)
    if (timer !== null) window.clearInterval(timer)
    installed = false
  })

  return { extensionDetected, extensionVersion }
}
