import { ref } from 'vue'

/**
 * Notificação do sistema operacional (spec timer-ociosidade).
 *
 * É a peça central do alerta de ociosidade: precisa alcançar quem está com o
 * navegador minimizado ou em outro monitor. No Windows o toast aparece no canto
 * e depois recolhe sozinho para a Central de Ações — `requireInteraction` NÃO
 * o mantém fixo na tela, e com o Assistente de Foco ligado ele vai direto para
 * lá. Por isso favicon e título piscando continuam sendo o sinal persistente:
 * a notificação chama, eles insistem.
 *
 * Os botões de ação exigem service worker (`public/idle-sw.js`); sem ele o
 * fallback é uma notificação sem botões, cujo clique foca a aba.
 */

/** Exportado porque o push também precisa garantir ESTE worker registrado. */
export const SW_URL = '/idle-sw.js'
const ICON = '/brand/marca.png'

export type IdleNotificationAction = 'continue' | 'stop' | 'recover' | 'open'

/**
 * De qual notificação veio a ação. Sem isto, o botão "Parar agora" de uma
 * notificação de TESTE pararia o timer de verdade: quem escuta o canal só via o
 * nome da ação e não tinha como distinguir a origem.
 */
export type NotificationKind = 'idle-warning' | 'idle-cut' | 'idle-test' | 'unknown'

/** Notificação de service worker aceita botões; o lib.dom ainda não descreve isso. */
interface NotificationOptionsWithActions extends NotificationOptions {
  actions?: Array<{ action: string; title: string }>
}

interface NotifyOptions {
  tag: string
  title: string
  body: string
  actions?: Array<{ action: IdleNotificationAction; title: string }>
  /** `kind` identifica a origem e é o que separa aviso real de teste. */
  data: { kind: NotificationKind } & Record<string, unknown>
}

/** O que aconteceu ao tentar notificar (o chamador decide o que dizer). */
export type NotifyResult = 'sent-with-actions' | 'sent-without-actions' | 'blocked' | 'failed'

const supported = typeof window !== 'undefined' && 'Notification' in window

export const notificationPermission = ref<NotificationPermission>(
  supported ? Notification.permission : 'denied',
)

let registration: ServiceWorkerRegistration | null = null
let messageBound = false
type ActionHandler = (action: IdleNotificationAction, kind: NotificationKind) => void
const actionHandlers = new Set<ActionHandler>()

function emitAction(action: IdleNotificationAction, kind: NotificationKind) {
  for (const handler of actionHandlers) handler(action, kind)
}

/** Ações vindas do service worker (clique na notificação) e da URL de abertura. */
function bindActionChannel() {
  if (messageBound || typeof navigator === 'undefined') return
  messageBound = true

  navigator.serviceWorker?.addEventListener('message', (event: MessageEvent) => {
    const payload = event.data as {
      type?: string
      action?: IdleNotificationAction
      data?: { kind?: NotificationKind }
    }
    if (payload?.type === 'nevo-idle-action' && payload.action) {
      emitAction(payload.action, payload.data?.kind ?? 'unknown')
    }
  })

  // Janela aberta pelo clique na notificação com o app fechado.
  const url = new URL(window.location.href)
  const fromUrl = url.searchParams.get('idleAction') as IdleNotificationAction | null
  const kindFromUrl = (url.searchParams.get('idleKind') as NotificationKind | null) ?? 'unknown'
  if (fromUrl) {
    url.searchParams.delete('idleAction')
    url.searchParams.delete('idleKind')
    window.history.replaceState({}, '', url.toString())
    // Depois do boot: os consumidores ainda estão sendo montados.
    setTimeout(() => emitAction(fromUrl, kindFromUrl), 0)
  }
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (registration) return registration
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  if (notificationPermission.value !== 'granted') return null
  try {
    registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' })
    await navigator.serviceWorker.ready
    bindActionChannel()
    return registration
  } catch {
    // Sem SW o recurso continua, só perde os botões da notificação.
    return null
  }
}

export function useSystemNotification() {
  bindActionChannel()

  /**
   * Pede a permissão. DEVE ser chamada dentro do gesto do usuário (clique): a
   * ativação transitória expira em segundos e se perde depois de um `await` de
   * rede, e aí o navegador recusa o prompt.
   */
  async function requestPermission(): Promise<NotificationPermission> {
    if (!supported) return 'denied'
    if (Notification.permission !== 'default') {
      notificationPermission.value = Notification.permission
      void ensureRegistration()
      return Notification.permission
    }
    try {
      const result = await Notification.requestPermission()
      notificationPermission.value = result
      if (result === 'granted') await ensureRegistration()
      return result
    } catch {
      return 'denied'
    }
  }

  /** Envia (ou substitui, pela `tag`) uma notificação e diz como ela saiu. */
  async function notify(options: NotifyOptions): Promise<NotifyResult> {
    if (!supported || Notification.permission !== 'granted') return 'blocked'
    const reg = await ensureRegistration()
    const common = {
      body: options.body,
      icon: ICON,
      badge: ICON,
      tag: options.tag,
      data: options.data,
      requireInteraction: true,
    }
    if (reg) {
      // `actions` existe apenas nas notificações de service worker e ainda não
      // está no lib.dom do TypeScript; daí o tipo local.
      const withActions: NotificationOptionsWithActions = {
        ...common,
        actions: options.actions,
      }
      try {
        await reg.showNotification(options.title, withActions)
        return 'sent-with-actions'
      } catch {
        return 'failed'
      }
    }
    try {
      const notification = new Notification(options.title, common)
      notification.onclick = () => {
        window.focus()
        notification.close()
        emitAction('open', options.data.kind)
      }
      return 'sent-without-actions'
    } catch {
      // Alguns browsers proíbem o construtor quando há SW; já tentamos o SW antes.
      return 'failed'
    }
  }

  /** Fecha o que ainda estiver na Central de Ações com essa `tag`. */
  async function close(tag: string): Promise<void> {
    const reg = registration ?? (await ensureRegistration())
    if (!reg) return
    const open = await reg.getNotifications({ tag })
    for (const notification of open) notification.close()
  }

  /** Assina os cliques da notificação. Devolve a função de desinscrição. */
  function onAction(handler: ActionHandler): () => void {
    actionHandlers.add(handler)
    return () => actionHandlers.delete(handler)
  }

  return {
    supported,
    permission: notificationPermission,
    requestPermission,
    notify,
    close,
    onAction,
  }
}
