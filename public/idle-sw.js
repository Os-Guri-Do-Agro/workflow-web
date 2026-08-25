/**
 * Service worker do Nevo — SÓ notificação (spec timer-ociosidade).
 *
 * Existe por um motivo único: notificação com BOTÕES de ação só é possível via
 * `ServiceWorkerRegistration.showNotification()`; `new Notification()` não
 * suporta `actions` em browser nenhum. E o alerta de ociosidade precisa que a
 * pessoa aja de onde ela estiver, com o navegador minimizado.
 *
 * NÃO registre handler de `fetch` aqui. Sem ele, este worker não intercepta
 * nem armazena requisição alguma, então não tem como servir bundle velho nem
 * atrapalhar deploy. É a condição que torna aceitável ter um SW no projeto.
 */

self.addEventListener('install', () => {
  // Assume o controle já na primeira carga; sem cache, não há o que migrar.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/**
 * Web Push (spec timer-avisa-antes-de-parar).
 *
 * Este é o único caminho que funciona com a aba fechada, e é por ele que chegam
 * o aviso "vou encerrar seu timer" e o anúncio do corte por esquecimento. O
 * payload é o JSON montado pelo PushService do backend.
 *
 * O try/catch em volta do parse não é decoração: push sem corpo (ou com corpo
 * que não é o nosso) chegaria como exceção e o navegador exibiria a notificação
 * genérica "Este site foi atualizado em segundo plano", que é pior do que uma
 * mensagem nossa mal formatada.
 */
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const title = payload.title || 'Nevo'
  const options = {
    body: payload.body || '',
    icon: '/brand/marca.png',
    badge: '/brand/marca.png',
    tag: payload.tag || 'nevo-push',
    // `kind` é o que distingue aviso real de teste no roteamento das ações; sem
    // ele o clique num teste poderia mexer no timer de verdade.
    data: { kind: payload.kind || 'unknown', ...(payload.data || {}) },
    requireInteraction: true,
    actions: payload.actions || [],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  // Clique no corpo da notificação chega sem `action`.
  const action = event.action || 'open'
  const data = event.notification.data || {}
  event.notification.close()
  event.waitUntil(routeAction(action, data))
})

async function routeAction(action, data) {
  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  const target = windows.find((client) => 'focus' in client)

  if (target) {
    await target.focus()
    target.postMessage({ type: 'nevo-idle-action', action, data })
    return
  }

  // Nenhuma janela aberta: postMessage não sobreviveria ao boot, então a ação
  // viaja na URL e o app a consome ao iniciar. O `kind` vai junto porque é ele
  // que distingue um aviso real de uma notificação de teste — sem isso, "Parar
  // agora" de um teste pararia o timer de verdade.
  const kind = encodeURIComponent(data.kind || 'unknown')
  await self.clients.openWindow(
    `/?idleAction=${encodeURIComponent(action)}&idleKind=${kind}`,
  )
}
