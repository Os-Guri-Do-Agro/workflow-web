import { reactive } from 'vue'
import type { Router } from 'vue-router'
import { unsubscribePushOnLogout } from '@/composables/usePushSubscription'
import { clearSession } from '@/service/api'
import { cancelPendingWork, pendingWorkCount } from '@/service/session-hooks'

/**
 * Sair da conta, de qualquer lugar (menu do usuário, menu Iniciar do modo XP,
 * paleta de comandos). Com envio da ala Marketing ainda subindo, pergunta
 * antes: sair cancela a fila (o servidor apaga o que ficou pela metade
 * enquanto a sessão ainda vale) e a próxima conta da aba começa sem nada.
 *
 * A confirmação é uma só, montada no `App.vue` (`LogoutGuard.vue`): os menus
 * que chamam isto fecham na hora e não podem segurar um diálogo.
 */
export const logoutPrompt = reactive({
  open: false,
  pending: 0,
  busy: false,
})
/** Fora do `reactive` (o Vue desembrulharia os refs do roteador). */
let promptRouter: Router | null = null

async function finish(router: Router) {
  // O push deste navegador sai antes da sessão (a API precisa do token).
  await unsubscribePushOnLogout()
  // clearSession preserva preferências de UI (tema, acento, shell).
  clearSession()
  void router.push('/login')
}

export function requestLogout(router: Router) {
  const pending = pendingWorkCount()
  if (!pending) {
    void finish(router)
    return
  }
  promptRouter = router
  Object.assign(logoutPrompt, { open: true, pending, busy: false })
}

export async function confirmLogout() {
  const router = promptRouter
  if (!router || logoutPrompt.busy) return
  logoutPrompt.busy = true
  try {
    await cancelPendingWork()
  } finally {
    logoutPrompt.busy = false
    logoutPrompt.open = false
    promptRouter = null
  }
  await finish(router)
}

export function dismissLogout() {
  if (logoutPrompt.busy) return
  logoutPrompt.open = false
  promptRouter = null
}
