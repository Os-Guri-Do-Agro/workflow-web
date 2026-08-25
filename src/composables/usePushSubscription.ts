import { ref } from 'vue'
import pushService from '@/service/push/push-service'
import { notificationPermission, SW_URL } from '@/composables/useSystemNotification'

/**
 * Assinatura de Web Push (spec timer-avisa-antes-de-parar).
 *
 * O que isto resolve, e por que não bastava a notificação que já existia: a
 * `Notification API` só dispara enquanto há página viva. O corte do timer
 * esquecido acontece num cron do servidor, tipicamente quando a pessoa fechou o
 * navegador e foi embora. Push é o único canal que atravessa isso.
 *
 * Estado deliberadamente tolerante a falha: navegador sem suporte, backend sem
 * VAPID ou permissão negada apenas deixam `subscribed` em false. O produto
 * continua funcionando com o comportamento anterior, sem erro na cara de
 * ninguém, porque nenhuma dessas condições é algo que a pessoa possa consertar
 * no meio do trabalho.
 */

const supported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window

export const pushSubscribed = ref(false)
/** null = ainda não perguntamos ao backend. */
export const pushAvailable = ref<boolean | null>(null)

/**
 * A chave VAPID chega em base64url e o `applicationServerKey` exige bytes.
 * O padding é reposto à mão porque base64url o omite, e `atob` recusa sem ele.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normal = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normal)
  // `new ArrayBuffer(...)` explícito em vez de `new Uint8Array(n)`: o tipo
  // solto é `Uint8Array<ArrayBufferLike>`, que abarca SharedArrayBuffer e não
  // satisfaz o `BufferSource` exigido por `applicationServerKey`.
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

let inFlight: Promise<boolean> | null = null

export function usePushSubscription() {
  /**
   * Garante que este navegador está assinado. Idempotente e barata de repetir:
   * quando já existe assinatura, reenvia ao backend apenas para atualizar
   * `lastSeenAt` e zerar falhas acumuladas de uma assinatura que voltou a viver.
   *
   * Não pede permissão: quem pede é `useSystemNotification.requestPermission`,
   * de dentro do gesto do usuário. Aqui só agimos com a permissão já concedida.
   */
  async function ensureSubscribed(): Promise<boolean> {
    if (!supported) {
      pushAvailable.value = false
      return false
    }
    if (notificationPermission.value !== 'granted') return false
    if (inFlight) return inFlight

    inFlight = (async () => {
      try {
        const config = await pushService.config()
        pushAvailable.value = config.enabled
        if (!config.enabled || !config.publicKey) return false

        // Registrar ANTES de esperar o `ready`, e não confiar que outro
        // caminho já registrou: `navigator.serviceWorker.ready` é uma promise
        // que NUNCA resolve enquanto não houver worker ativo. Num boot com a
        // permissão já concedida, `ensureRegistration` do useSystemNotification
        // só roda na primeira notificação, então esperar aqui travaria a
        // assinatura para sempre, em silêncio e sem erro nenhum.
        // Registrar a mesma URL duas vezes é idempotente.
        await navigator.serviceWorker.register(SW_URL, { scope: '/' })
        const registration = await navigator.serviceWorker.ready
        const existing = await registration.pushManager.getSubscription()
        const subscription =
          existing ??
          (await registration.pushManager.subscribe({
            // Sem isto o navegador recusa: push silencioso não é permitido, e a
            // promessa de sempre mostrar notificação é o que o habilita.
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(config.publicKey),
          }))

        await pushService.subscribe(subscription.toJSON())
        pushSubscribed.value = true
        return true
      } catch {
        // Rede fora, VAPID trocada, permissão revogada no meio: nada disso
        // merece interromper quem está tentando registrar horas.
        pushSubscribed.value = false
        return false
      } finally {
        inFlight = null
      }
    })()

    return inFlight
  }

  /** Cancela a assinatura deste navegador, no navegador e no backend. */
  async function unsubscribe(): Promise<void> {
    if (!supported) return
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) return
      const { endpoint } = subscription
      await subscription.unsubscribe()
      await pushService.unsubscribe(endpoint)
    } catch {
      // Idem: cancelar é melhor-esforço.
    } finally {
      pushSubscribed.value = false
    }
  }

  return {
    supported,
    available: pushAvailable,
    subscribed: pushSubscribed,
    ensureSubscribed,
    unsubscribe,
    sendTest: (message?: string) => pushService.test(message),
  }
}
