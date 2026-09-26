import { queryClient } from '@/service/query-client'
import realtimeService, {
  type ActivityEventPayload,
  type ActivityMovedPayload,
} from '@/service/realtime/realtime-service'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { getUserToken } from '@/utils/authContent'

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

// ─── Sequência diária (spec sequencia-diaria-nevo) ────────────────────────────
// A sequência é derivada no servidor de tempo, tarefas e feed; nenhum evento
// novo foi criado para ela. Os eventos que já existem bastam para saber QUANDO
// refazer o fetch. As chaves espelham `streakKeys` de `useStreak` (não importado
// daqui para o boot não puxar o composable inteiro).

/** Chaves pendentes, deduplicadas: uma rajada vira um fetch por chave. */
const pendingStreakKeys = new Map<string, readonly unknown[]>()

const flushStreakKeys = debounce(() => {
  const keys = [...pendingStreakKeys.values()]
  pendingStreakKeys.clear()
  // Chave mais curta já cobre as que começam com ela (invalidação por prefixo):
  // invalidar as duas cancelava o primeiro refetch e disparava outro request.
  const covered = (k: readonly unknown[]) =>
    keys.some((p) => p.length < k.length && p.every((part, i) => part === k[i]))
  keys.filter((k) => !covered(k)).forEach((k) => invalidate(k))
}, 400)

function queueStreakInvalidation(key: readonly unknown[]) {
  pendingStreakKeys.set(JSON.stringify(key), key)
  flushStreakKeys()
}

/** Tudo da sequência: a minha (`me`) e a de qualquer equipe montada. */
const STREAK_ALL = ['streak'] as const
/** Só as equipes (o prefixo pega todas as empresas). */
const STREAK_TEAM = ['streak', 'team'] as const

function myUserId(): string | null {
  return getUserToken()?.sub ?? null
}

/**
 * Evento feito por MIM mexe na minha sequência em qualquer empresa (ela é da
 * pessoa, não da empresa); feito por colega só mexe no placar da equipe DAQUELA
 * empresa. Por isso aqui não há o filtro de empresa ativa dos eventos de board.
 */
function invalidateStreakFor(actorId: string | null | undefined, companyId: string | null | undefined) {
  if (actorId && actorId === myUserId()) {
    queueStreakInvalidation(STREAK_ALL)
    return
  }
  queueStreakInvalidation(companyId ? [...STREAK_TEAM, companyId] : STREAK_TEAM)
}

/** Concluir (ou reabrir) tarefa é uma das duas formas de garantir o dia. */
function onStreakActivityMoved(payload: ActivityMovedPayload) {
  if (payload.status !== 'DONE' && payload.previousStatus !== 'DONE') return
  invalidateStreakFor(payload.actorId, payload.companyId)
}

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
    activityMoved: (payload) => {
      // A sequência vem antes do filtro de empresa ativa de `onActivityEvent`.
      onStreakActivityMoved(payload)
      onActivityEvent(payload)
    },
    // Timer do próprio usuário (room `user:`): foco é a outra forma de garantir
    // o dia, e o timer aberto já conta no "hoje". Sem filtro de empresa.
    timeStarted: () => queueStreakInvalidation(STREAK_ALL),
    timeStopped: () => queueStreakInvalidation(STREAK_ALL),
    // Timer de colega: mexe nos pontos da equipe. `team-stopped` não traz a
    // empresa, então invalida as equipes montadas (refetch só das ativas).
    teamTimeStarted: (entry) =>
      queueStreakInvalidation(entry.companyId ? [...STREAK_TEAM, entry.companyId] : STREAK_TEAM),
    teamTimeStopped: () => queueStreakInvalidation(STREAK_TEAM),
    // Colaboração (missão do dia e pontos): comentário e movimentação no feed.
    commentNew: (comment) => invalidateStreakFor(comment.authorId, comment.companyId),
    feedNew: (event) => invalidateStreakFor(event.actorId, event.companyId),
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
