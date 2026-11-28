import { ref } from 'vue'
import { jwtDecode } from 'jwt-decode'

/**
 * Existe sessão (token presente e dentro da validade)? Estado reativo para
 * quem vive fora das rotas logadas e não pode bater na API sem login: o
 * cronômetro do topo e a assinatura de push moram no `AppShell`, que também
 * está montado no `/login` e no `/redefinir-senha`, e antes disso cada um
 * disparava a chamada e levava 401 (spec v2-celular-roadmap-notas, N1).
 *
 * O token vive no `localStorage` (o login grava, o logout limpa e o guard
 * apaga o vencido), então o valor é relido a cada navegação (o `afterEach` do
 * router chama `syncSession`) e quando outra aba mexe no token.
 */
function readSession(): boolean {
  if (typeof localStorage === 'undefined') return false
  const token = localStorage.getItem('token')
  if (!token) return false
  try {
    const { exp } = jwtDecode<{ exp?: number }>(token)
    return !!exp && exp * 1000 > Date.now()
  } catch {
    return false
  }
}

export const hasSession = ref(readSession())

export function syncSession(): void {
  hasSession.value = readSession()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === 'token') syncSession()
  })
}
