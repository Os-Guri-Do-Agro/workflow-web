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
  // viaja na URL e o app a consome ao iniciar.
  await self.clients.openWindow(`/?idleAction=${encodeURIComponent(action)}`)
}
