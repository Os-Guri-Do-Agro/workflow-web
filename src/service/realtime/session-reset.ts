import { queryClient } from '@/service/query-client'
import realtimeService from '@/service/realtime/realtime-service'

/**
 * Derruba tudo que sobrevive a um logout feito por navegação SPA (sem reload):
 * o socket (singleton de módulo, que continuava autenticado como o usuário
 * anterior e entregando eventos das empresas dele) e o cache do Vue Query
 * (dados da conta antiga apareciam pro próximo usuário na mesma aba).
 */
export function resetSessionState(): void {
  realtimeService.disconnect()
  queryClient.clear()
}

/**
 * Troca de empresa: descarta o cache remoto para nada da empresa anterior ser
 * servido enquanto o refetch não volta. Não derruba o socket porque as rooms
 * são de todas as empresas do usuário.
 */
export function resetCompanyScopedState(): void {
  queryClient.removeQueries()
}
