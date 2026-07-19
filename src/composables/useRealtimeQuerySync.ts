import { queryClient } from '@/service/query-client'
import realtimeService, {
  type ActivityEventPayload,
} from '@/service/realtime/realtime-service'
import { useWorkspaceStore } from '@/stores/workspaceStores'

/** Empresa ativa no momento (localStorage é a fonte usada pelo interceptor da API). */
function activeCompanyId(): string | null {
  return localStorage.getItem('activeCompany')
}

/**
 * Só refaz o fetch de query MONTADA (`refetchType: 'active'`). As demais ficam
 * marcadas como obsoletas e se atualizam quando a tela que as usa aparecer.
 */
function invalidate(key: readonly unknown[]) {
  void queryClient.invalidateQueries({ queryKey: key, refetchType: 'active' })
}

/** Agrupa rajadas de eventos numa invalidação só (evita tempestade de requests). */
function debounce(fn: () => void, wait: number) {
  let timer: number | null = null
  return () => {
    if (timer !== null) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = null
      fn()
    }, wait)
  }
}

/**
 * Rotas cujo conteúdo vem do store de workspace (Pinia), não do Vue Query, e que
 * por isso não são cobertas por invalidação de query. `/board` fica de fora de
 * propósito: a própria BoardView já recarrega via useActivityBoardRealtime.
 */
const WORKSPACE_STORE_ROUTES = ['/', '/dashboard']

function refreshWorkspaceStore() {
  if (!WORKSPACE_STORE_ROUTES.includes(window.location.pathname)) return
  const workspace = useWorkspaceStore()
  // Sem dado carregado não há nada a atualizar (e o fetch é caro).
  if (!workspace.workspaceData) return
  void workspace.fetchWorkspace()
}

/** Queries escopadas por empresa que qualquer mudança de atividade invalida. */
function invalidateActivityScopedQueries() {
  const companyId = activeCompanyId()
  invalidate(['boards'])
  invalidate(['dashboard', 'workspace'])
  invalidate(['metrics'])
  if (companyId) {
    invalidate(['backlog', companyId])
    invalidate(['quarters', companyId])
  }
  refreshWorkspaceStore()
}

const invalidateActivityScoped = debounce(invalidateActivityScopedQueries, 400)

/** Catch-up amplo: usado na reconexão e ao voltar pra aba depois de um tempo. */
const invalidateEverythingActive = debounce(() => {
  void queryClient.invalidateQueries({ refetchType: 'active' })
  refreshWorkspaceStore()
}, 400)

/** Depois deste tempo escondida, a aba é considerada desatualizada o bastante. */
const STALE_HIDDEN_MS = 30 * 1000
let hiddenSince: number | null = null

let started = false

/**
 * Liga o cache do Vue Query nos eventos de socket, uma vez por carga do app.
 *
 * Existe fora dos componentes de propósito: as views que precisam reagir (board,
 * dashboard, backlog) nem sempre estão montadas quando o evento chega, e as que
 * estão passam a receber o dado novo sem precisar de código próprio.
 */
export function startRealtimeQuerySync(): void {
  if (started) return
  started = true

  const onActivityEvent = (payload: ActivityEventPayload) => {
    // O socket entra nas rooms de TODAS as empresas do usuário: evento de outra
    // empresa não pode sujar (nem forçar refetch) o contexto da empresa ativa.
    const companyId = activeCompanyId()
    if (companyId && payload.companyId !== companyId) return
    invalidateActivityScoped()
  }

  // `subscribe` (e não `connect`) porque isto roda no boot, antes do login: sem
  // token não há socket ainda, mas o handler fica registrado e passa a valer
  // assim que a primeira tela autenticada abrir a conexão.
  realtimeService.subscribe({
    activityChanged: onActivityEvent,
    activityMoved: onActivityEvent,
    notificationSync: () => {
      invalidate(['inbox'])
    },
    notificationNew: () => {
      invalidate(['inbox'])
    },
    // Reconexão: não há replay de eventos perdidos, então o jeito honesto de
    // voltar ao estado correto é refazer o fetch do que está na tela.
    reconnect: () => invalidateEverythingActive(),
  })

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenSince = Date.now()
      return
    }
    const away = hiddenSince === null ? 0 : Date.now() - hiddenSince
    hiddenSince = null
    // Piscadas rápidas (alt-tab) não justificam refetch: o refetchOnWindowFocus
    // do Vue Query já cobre as queries obsoletas.
    if (away >= STALE_HIDDEN_MS) invalidateEverythingActive()
  })
}
