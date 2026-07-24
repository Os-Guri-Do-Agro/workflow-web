import { io, type Socket } from 'socket.io-client'
import { apiBaseUrl } from '@/service/api'
import type { AppNotification } from '@/service/inbox/inbox-service'
import type { TimeEntry, TeamLiveEntry, TeamStoppedPayload } from '@/service/time/time-service'
import type { SearchHit } from '@/service/ai/ai-service'

export interface PublicUser {
  id: string
  name: string
  email: string
}

/** Usuário mencionado num comentário (attachComments) — name/email podem faltar. */
export interface MentionedUser {
  id: string
  name?: string
  email?: string
}

export type CommentEntityKind = 'ACTIVITY' | 'BOARD' | 'BUG_REPORT' | 'ROADMAP_MONTH'

export interface CommentPayload {
  id: string
  companyId: string
  entityType: CommentEntityKind
  entityId: string
  authorId: string
  author: PublicUser | null
  body: string
  mentions: string[]
  mentionedUsers?: MentionedUser[]
  createdAt: string
  updatedAt: string
  reactions: Array<{ id: string; userId: string; emoji: string; user: PublicUser | null }>
}

/** Contrato de `comment:deleted` (o comentário já não existe: só as chaves). */
export interface CommentDeletedPayload {
  id: string
  companyId: string
  entityType: CommentEntityKind
  entityId: string
  actorId: string
  at: string
}

export interface FeedEventPayload {
  id: string
  /** Empresa dona do evento — o socket recebe TODAS as empresas do usuário. */
  companyId: string
  actorId: string
  actor: PublicUser | null
  verb: 'created' | 'updated' | 'status_changed' | 'commented' | 'shared'
  entityType: string
  entityId: string
  summary: string
  createdAt: string
}

export interface PresenceUpdatePayload {
  companyId: string
  online: string[]
}

/** Contrato de `notification:read` / `notification:cleared` (room do usuário). */
export interface NotificationSyncPayload {
  /** Ids afetados; null quando a ação foi "marcar todas". */
  ids: string[] | null
  at: string
}

// ─── Kanban realtime (arraste de atividades) ────────────────────────────────
export type ActivityBoardStatus = 'TODO' | 'IN_PROGRESS' | 'IN_TESTING' | 'DONE'

export type ActivityChangeType = 'created' | 'updated' | 'deleted' | 'moved'

/**
 * Contrato comum dos eventos de atividade (`activity:created|updated|deleted`).
 * Payload magro de propósito: quem escuta decide entre atualizar o cache ou
 * refazer o fetch.
 */
export interface ActivityEventPayload {
  activityId: string
  companyId: string
  monthId: string
  /** Não-nulo quando é subtarefa (o card do board é o pai). */
  parentId: string | null
  change: ActivityChangeType
  actorId: string
  at: string
}

/** Contrato do evento `activity:moved` (emitido pelo backend em updateStatus/move). */
export interface ActivityMovedPayload extends ActivityEventPayload {
  change: 'moved'
  status: ActivityBoardStatus
  previousStatus: ActivityBoardStatus
  /** Índice 0-based na coluna destino; null quando não há ordem manual (troca de status). */
  position: number | null
  updatedAt: string
}

// ─── Copiloto agente (streaming) ────────────────────────────────────────────
export interface AssistantDeltaPayload {
  runId: string
  text: string
}
export interface AssistantToolPayload {
  runId: string
  tool: string
  label: string
}
export interface AssistantDonePayload {
  runId: string
  sources: SearchHit[]
}
export interface AssistantErrorPayload {
  runId: string
  message: string
}

export interface RealtimeHandlers {
  notificationNew?: (notification: AppNotification) => void
  /** `notification:read` e `notification:cleared` (outras abas do mesmo usuário). */
  notificationSync?: (payload: NotificationSyncPayload) => void
  feedNew?: (event: FeedEventPayload) => void
  commentNew?: (comment: CommentPayload) => void
  commentUpdated?: (comment: CommentPayload) => void
  commentDeleted?: (payload: CommentDeletedPayload) => void
  presenceUpdate?: (presence: PresenceUpdatePayload) => void
  // Kanban: propaga arraste/reordenação de atividades entre abas/dispositivos.
  activityMoved?: (payload: ActivityMovedPayload) => void
  /** Criação, edição, remoção e anexo de atividade. */
  activityChanged?: (payload: ActivityEventPayload) => void
  // Time tracking: sincroniza o widget entre abas/dispositivos do mesmo usuário.
  timeStarted?: (entry: TimeEntry) => void
  timeStopped?: (entry: TimeEntry) => void
  // Visão de equipe (ADMIN): timer de um membro começou/parou, na room da empresa.
  teamTimeStarted?: (entry: TeamLiveEntry) => void
  teamTimeStopped?: (payload: TeamStoppedPayload) => void
  // Copiloto agente: streaming da resposta em tempo real.
  assistantDelta?: (payload: AssistantDeltaPayload) => void
  assistantTool?: (payload: AssistantToolPayload) => void
  assistantDone?: (payload: AssistantDonePayload) => void
  assistantError?: (payload: AssistantErrorPayload) => void
  connect?: () => void
  /**
   * Só nas RE-conexões (a primeira não conta). É aqui que se faz catch-up: o
   * `connect` dispara também no load frio e duplicava o fetch inicial.
   */
  reconnect?: () => void
  disconnect?: () => void
}

let socket: Socket | null = null
/** Token usado no handshake do socket atual — detecta troca de usuário na mesma aba. */
let handshakeToken: string | null = null
let hasConnectedOnce = false
const handlers = new Set<RealtimeHandlers>()

/** Registra UM listener por evento que repassa pro Set de handlers. */
function fanout<P>(
  target: Socket,
  event: string,
  pick: (handler: RealtimeHandlers) => ((payload: P) => void) | undefined,
) {
  target.on(event, (payload: P) => {
    handlers.forEach((handler) => pick(handler)?.(payload))
  })
}

function bindEvents(target: Socket) {
  fanout<AppNotification>(target, 'notification:new', (h) => h.notificationNew)
  fanout<NotificationSyncPayload>(target, 'notification:read', (h) => h.notificationSync)
  fanout<NotificationSyncPayload>(target, 'notification:cleared', (h) => h.notificationSync)
  fanout<FeedEventPayload>(target, 'feed:new', (h) => h.feedNew)
  fanout<CommentPayload>(target, 'comment:new', (h) => h.commentNew)
  fanout<CommentPayload>(target, 'comment:updated', (h) => h.commentUpdated)
  fanout<CommentDeletedPayload>(target, 'comment:deleted', (h) => h.commentDeleted)
  fanout<PresenceUpdatePayload>(target, 'presence:update', (h) => h.presenceUpdate)
  fanout<ActivityMovedPayload>(target, 'activity:moved', (h) => h.activityMoved)
  fanout<ActivityEventPayload>(target, 'activity:created', (h) => h.activityChanged)
  fanout<ActivityEventPayload>(target, 'activity:updated', (h) => h.activityChanged)
  fanout<ActivityEventPayload>(target, 'activity:deleted', (h) => h.activityChanged)
  fanout<TimeEntry>(target, 'time:started', (h) => h.timeStarted)
  fanout<TimeEntry>(target, 'time:stopped', (h) => h.timeStopped)
  fanout<TeamLiveEntry>(target, 'time:team-started', (h) => h.teamTimeStarted)
  fanout<TeamStoppedPayload>(target, 'time:team-stopped', (h) => h.teamTimeStopped)
  fanout<AssistantDeltaPayload>(target, 'assistant:delta', (h) => h.assistantDelta)
  fanout<AssistantToolPayload>(target, 'assistant:tool', (h) => h.assistantTool)
  fanout<AssistantDonePayload>(target, 'assistant:done', (h) => h.assistantDone)
  fanout<AssistantErrorPayload>(target, 'assistant:error', (h) => h.assistantError)

  target.on('connect', () => {
    const isReconnect = hasConnectedOnce
    hasConnectedOnce = true
    handlers.forEach((handler) => handler.connect?.())
    // Reconexão: quem estava montado perdeu eventos enquanto o socket esteve
    // fora e precisa de catch-up. No primeiro connect não há nada a recuperar.
    if (isReconnect) handlers.forEach((handler) => handler.reconnect?.())
  })
  target.on('disconnect', () => {
    handlers.forEach((handler) => handler.disconnect?.())
  })
}

/** Derruba o socket atual e zera o estado do módulo (sem mexer nos handlers). */
function teardownSocket() {
  if (!socket) return
  socket.removeAllListeners()
  socket.disconnect()
  socket = null
  handshakeToken = null
  hasConnectedOnce = false
}

function getSocket() {
  const token = localStorage.getItem('token')
  if (!token) return null

  // Token diferente do usado no handshake = outro usuário logou nesta aba. O
  // socket antigo segue autenticado como o anterior (trocar `auth` não refaz o
  // handshake de um socket já conectado), então ele tem que cair.
  if (socket && handshakeToken !== token) teardownSocket()

  if (!socket) {
    // apiBaseUrl normaliza a env (com/sem https://) — env crua sem esquema
    // faria o socket apontar pro host errado, igual ao axios.
    socket = io(apiBaseUrl(), {
      auth: { token },
      path: '/socket.io',
      autoConnect: false,
    })
    handshakeToken = token
    bindEvents(socket)
  }

  socket.auth = { token }
  return socket
}

const realtimeService = {
  connect(handlers: RealtimeHandlers = {}) {
    const nextSocket = getSocket()
    if (!nextSocket) return null

    const unsubscribe = this.subscribe(handlers)
    if (!nextSocket.connected) nextSocket.connect()
    return unsubscribe
  },

  subscribe(nextHandlers: RealtimeHandlers) {
    handlers.add(nextHandlers)
    const nextSocket = getSocket()
    if (!nextSocket) {
      return () => handlers.delete(nextHandlers)
    }

    if (!nextSocket.connected) nextSocket.connect()
    return () => handlers.delete(nextHandlers)
  },

  /** Está conectado agora? Usado por quem precisa saber se o realtime está vivo. */
  isConnected() {
    return socket?.connected ?? false
  },

  /**
   * Derruba a conexão (logout). Os handlers NÃO são descartados: os de
   * componente saem sozinhos no unmount, e os de módulo (sincronização de cache,
   * copiloto) precisam continuar valendo para o próximo login na mesma aba.
   */
  disconnect() {
    teardownSocket()
  },
}

export default realtimeService
