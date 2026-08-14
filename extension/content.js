/**
 * Ponte entre a extensão e o app do Nevo.
 *
 * Roda no contexto da página, então conversa com ela por `window.postMessage` —
 * o app NÃO precisa conhecer o id da extensão, e a extensão não precisa de
 * `externally_connectable` amarrado a domínio fixo. Com o Nevo hospedado em
 * preview/produção/localhost, essa independência evita reempacotar a extensão a
 * cada ambiente novo.
 *
 * Só trafega um número: o instante da última atividade. Nada de URL, título de
 * aba, conteúdo ou identidade.
 */

const REQUEST = 'nevo-activity-request'
const REPLY = 'nevo-activity'

window.addEventListener('message', (event) => {
  // Só aceita pedido vindo da PRÓPRIA página (não de iframe de terceiro).
  if (event.source !== window) return
  if (event.data?.type !== REQUEST) return

  chrome.runtime.sendMessage({ type: REQUEST }, (response) => {
    // Extensão recarregada/desativada no meio: responde silêncio em vez de
    // estourar "Extension context invalidated" no console do app.
    if (chrome.runtime.lastError || !response) return
    window.postMessage(
      {
        type: REPLY,
        lastActivityAt: response.lastActivityAt,
        state: response.state,
        version: response.version,
      },
      window.location.origin,
    )
  })
})

// Anúncio de chegada: o app pode estar carregado antes da extensão responder ao
// primeiro pedido, e assim ele descobre a fonte melhor sem esperar o próximo
// ciclo.
window.postMessage({ type: 'nevo-activity-hello' }, window.location.origin)
