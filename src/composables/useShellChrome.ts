import { computed, shallowRef } from 'vue'

/**
 * Pedido de tela para a moldura de celular (spec v2-celular-roadmap-notas, D3):
 * quem precisa da altura toda (o editor de nota com o teclado aberto) pede para
 * a tab bar do `MobileShell` sair, e devolve quando não precisa mais.
 *
 * Cada pedido tem um dono (`reason`): dois pedidos ao mesmo tempo não brigam, e
 * a barra só volta quando o último devolve. O `inset` opcional é o que fica
 * ocupando o rodapé no lugar da tab bar (a barra de formatação da nota), para o
 * `--shell-bottom-inset` continuar dizendo a verdade aos toasts e recados.
 *
 * Estado de módulo, não Pinia: é efêmero (nunca persiste) e só o MobileShell lê.
 */
const requests = shallowRef(new Map<string, string | null>())

export function useShellChrome() {
  const tabbarHidden = computed(() => requests.value.size > 0)

  /** O que ocupa o rodapé enquanto a tab bar está fora (o primeiro que disse). */
  const bottomInsetOverride = computed(() => {
    for (const inset of requests.value.values()) if (inset) return inset
    return null
  })

  function hideTabbar(reason: string, inset: string | null = null) {
    if (requests.value.get(reason) === inset && requests.value.has(reason)) return
    const next = new Map(requests.value)
    next.set(reason, inset)
    requests.value = next
  }

  function showTabbar(reason: string) {
    if (!requests.value.has(reason)) return
    const next = new Map(requests.value)
    next.delete(reason)
    requests.value = next
  }

  return { tabbarHidden, bottomInsetOverride, hideTabbar, showTabbar }
}
