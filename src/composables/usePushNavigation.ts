import type { Router } from 'vue-router'

/**
 * Clique no push com o Nevo aberto (ala Marketing, R2 C1): o service worker
 * (`public/idle-sw.js`) foca a aba e manda `nevo-open-url`; aqui o roteador
 * troca de tela SEM recarregar o app (antes o worker navegava a janela e o app
 * inteiro subia de novo). A resposta pelo canal diz ao worker que a aba
 * cuidou; sem ela (aba de uma versão anterior), ele navega a janela.
 */

/** Só caminho do próprio Nevo: uma barra no começo, nada de `//outro.site`. */
export function safeAppPath(url: unknown): string | null {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return null
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.origin !== window.location.origin) return null
    return parsed.pathname + parsed.search + parsed.hash
  } catch {
    return null
  }
}

let started = false

export function startPushNavigation(router: Router) {
  if (started || typeof navigator === 'undefined' || !navigator.serviceWorker) return
  started = true
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as { type?: string; url?: unknown } | null
    if (msg?.type !== 'nevo-open-url') return
    const path = safeAppPath(msg.url)
    event.ports?.[0]?.postMessage({ ok: !!path })
    if (path) void router.push(path).catch(() => undefined)
  })
  // Mensagem que chegou antes deste ouvinte fica na fila até aqui.
  navigator.serviceWorker.startMessages?.()
}
