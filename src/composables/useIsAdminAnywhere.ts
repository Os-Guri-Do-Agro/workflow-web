import { computed } from 'vue'
import { jwtDecode } from 'jwt-decode'
import { useWorkspaceStore } from '@/stores/workspaceStores'

/**
 * O usuário é ADMIN em ALGUMA empresa? É o gate da página Acessos Públicos
 * (nav + atalho no QR): ela é agregada, então não depende da empresa ativa —
 * quem administra qualquer empresa entra e vê apenas os tokens dela.
 *
 * A DECISÃO é pelo JWT de propósito: é a mesma fonte do guard da rota
 * (`isAdminAnywhere` em `router/index.ts`), e é o padrão do app para gates de
 * papel (`meta.requiredRole` também lê o JWT). Decidir pelo store aqui faria
 * o item aparecer no drawer e a rota bloquear em seguida, para quem foi
 * promovido a ADMIN e ainda não refez login.
 *
 * O store entra só como DEPENDÊNCIA REATIVA: sem ele, o computed leria
 * `localStorage` uma vez e congelaria (localStorage não é reativo). Ao hidratar
 * o workspace, o computed reavalia e o item aparece sem precisar de refresh.
 *
 * O gate é cosmético: quem manda é o backend (`listAllForUser` filtra por
 * membership ADMIN no banco).
 */
export function useIsAdminAnywhere() {
  const workspace = useWorkspaceStore()

  return computed(() => {
    void workspace.companies.length
    const token = localStorage.getItem('token')
    if (!token) return false
    try {
      const decoded = jwtDecode<{ companies?: { role: string }[] }>(token)
      return (decoded.companies ?? []).some((c) => c.role === 'ADMIN')
    } catch {
      return false
    }
  })
}
