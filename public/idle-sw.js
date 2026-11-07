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
    // Mesma `tag` substitui a notificação em silêncio; com `renotify` (aviso da
    // ala, R2) a nova toca e aparece de novo. Sempre há `tag` aqui, que é o que
    // o navegador exige para aceitar o `renotify`.
    renotify: payload.renotify === true,
    // `kind` é o que distingue aviso real de teste no roteamento das ações; sem
    // ele o clique num teste poderia mexer no timer de verdade.
    data: { kind: payload.kind || 'unknown', ...(payload.data || {}) },
    // Aviso da ala Marketing (R2) some sozinho como uma notificação comum; o do
    // timer continua pedindo ação.
    requireInteraction: payload.kind !== 'marketing',
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

/**
 * Só caminho do próprio Nevo: começa com UMA barra (`//outro.site` e `/\outro`
 * levariam para fora) e, resolvido, fica na mesma origem. Devolve o caminho
 * limpo, ou null.
 */
function appPath(url) {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return null
  try {
    const parsed = new URL(url, self.location.origin)
    if (parsed.origin !== self.location.origin) return null
    return parsed.pathname + parsed.search + parsed.hash
  } catch {
    return null
  }
}

/**
 * Pede para a aba aberta trocar de tela pelo roteador (sem recarregar o app).
 * O app responde pelo canal; aba de uma versão anterior (sem o ouvinte) não
 * responde, e aí quem chama navega a janela.
 */
function askAppToOpen(client, path) {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => resolve(false), 1500)
    channel.port1.onmessage = () => {
      clearTimeout(timer)
      resolve(true)
    }
    try {
      client.postMessage({ type: 'nevo-open-url', url: path }, [channel.port2])
    } catch {
      clearTimeout(timer)
      resolve(false)
    }
  })
}

async function routeAction(action, data) {
  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  const target = windows.find((client) => 'focus' in client)

  // Aviso com destino (ala Marketing, R2 C1): o clique abre o link do aviso
  // (`/marketing/...?grupo=`). Com o Nevo aberto, a aba troca de tela pelo
  // roteador (antes recarregava o app inteiro); sem aba aberta, abre uma.
  const path = action === 'open' ? appPath(data.url) : null
  if (path) {
    const href = new URL(path, self.location.origin).href
    if (target) {
      await target.focus()
      if (await askAppToOpen(target, path)) return
      try {
        if ('navigate' in target) {
          await target.navigate(href)
          return
        }
      } catch {
        // Janela de fora do controle do worker: abre outra.
      }
    }
    await self.clients.openWindow(href)
    return
  }

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
