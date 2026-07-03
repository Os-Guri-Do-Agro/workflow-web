import { io, type Socket } from 'socket.io-client'
import type { AppNotification } from '@/service/inbox/inbox-service'

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

export interface RealtimeHandlers {
  notificationNew?: (notification: AppNotification) => void
  feedNew?: (event: FeedEventPayload) => void
  commentNew?: (comment: CommentPayload) => void
  presenceUpdate?: (presence: PresenceUpdatePayload) => void
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
