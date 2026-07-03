import { io, type Socket } from 'socket.io-client'
import type { AppNotification } from '@/service/inbox/inbox-service'
import type { TimeEntry } from '@/service/time/time-service'
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

export interface CommentPayload {
  id: string
  companyId: string
  entityType: 'ACTIVITY' | 'BOARD' | 'BUG_REPORT' | 'ROADMAP_MONTH'
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

export interface FeedEventPayload {
  id: string
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
  feedNew?: (event: FeedEventPayload) => void
  commentNew?: (comment: CommentPayload) => void
  presenceUpdate?: (presence: PresenceUpdatePayload) => void
  // Time tracking: sincroniza o widget entre abas/dispositivos do mesmo usuário.
  timeStarted?: (entry: TimeEntry) => void
  timeStopped?: (entry: TimeEntry) => void
  // Copiloto agente: streaming da resposta em tempo real.
  assistantDelta?: (payload: AssistantDeltaPayload) => void
  assistantTool?: (payload: AssistantToolPayload) => void
  assistantDone?: (payload: AssistantDonePayload) => void
  assistantError?: (payload: AssistantErrorPayload) => void
  connect?: () => void
  disconnect?: () => void
}

let socket: Socket | null = null
const handlers = new Set<RealtimeHandlers>()

function getSocket() {
  const token = localStorage.getItem('token')
  if (!token) return null

  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL, {
      auth: { token },
      path: '/socket.io',
      autoConnect: false,
    })
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

    nextSocket.off('notification:new')
    nextSocket.off('feed:new')
    nextSocket.off('comment:new')
    nextSocket.off('presence:update')
    nextSocket.off('time:started')
    nextSocket.off('time:stopped')
    nextSocket.off('assistant:delta')
    nextSocket.off('assistant:tool')
    nextSocket.off('assistant:done')
    nextSocket.off('assistant:error')
    nextSocket.off('connect')
    nextSocket.off('disconnect')

    nextSocket.on('notification:new', (notification: AppNotification) => {
      handlers.forEach((handler) => handler.notificationNew?.(notification))
    })
    nextSocket.on('feed:new', (event: FeedEventPayload) => {
      handlers.forEach((handler) => handler.feedNew?.(event))
    })
    nextSocket.on('comment:new', (comment: CommentPayload) => {
      handlers.forEach((handler) => handler.commentNew?.(comment))
    })
    nextSocket.on('presence:update', (presence: PresenceUpdatePayload) => {
      handlers.forEach((handler) => handler.presenceUpdate?.(presence))
    })
    nextSocket.on('time:started', (entry: TimeEntry) => {
      handlers.forEach((handler) => handler.timeStarted?.(entry))
    })
    nextSocket.on('time:stopped', (entry: TimeEntry) => {
      handlers.forEach((handler) => handler.timeStopped?.(entry))
    })
    nextSocket.on('assistant:delta', (payload: AssistantDeltaPayload) => {
      handlers.forEach((handler) => handler.assistantDelta?.(payload))
    })
    nextSocket.on('assistant:tool', (payload: AssistantToolPayload) => {
      handlers.forEach((handler) => handler.assistantTool?.(payload))
    })
    nextSocket.on('assistant:done', (payload: AssistantDonePayload) => {
      handlers.forEach((handler) => handler.assistantDone?.(payload))
    })
    nextSocket.on('assistant:error', (payload: AssistantErrorPayload) => {
      handlers.forEach((handler) => handler.assistantError?.(payload))
    })
    nextSocket.on('connect', () => {
      handlers.forEach((handler) => handler.connect?.())
    })
    nextSocket.on('disconnect', () => {
      handlers.forEach((handler) => handler.disconnect?.())
    })

    if (!nextSocket.connected) nextSocket.connect()
    return () => handlers.delete(nextHandlers)
  },

  disconnect() {
    handlers.clear()
    socket?.disconnect()
  },
}

export default realtimeService
