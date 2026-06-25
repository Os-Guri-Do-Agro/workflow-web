import { computed, onMounted, onUnmounted, ref, watch, type MaybeRefOrGetter, toValue } from 'vue'
import collaborationService, { type CommentEntityType } from '@/service/collaboration/collaboration-service'
import type { CommentPayload } from '@/service/realtime/realtime-service'
import realtimeService from '@/service/realtime/realtime-service'
import { getUserToken } from '@/utils/authContent'

export function useComments(
  entityType: MaybeRefOrGetter<CommentEntityType>,
  entityId: MaybeRefOrGetter<string>,
) {
  const comments = ref<CommentPayload[]>([])
  const loading = ref(false)
  const sending = ref(false)
  const error = ref<string | null>(null)
  let unsubscribeRealtime: (() => boolean) | null = null

  const resolvedEntityType = computed(() => toValue(entityType))
  const resolvedEntityId = computed(() => toValue(entityId))

  async function refresh() {
    if (!resolvedEntityId.value) return
    loading.value = true
    error.value = null

    try {
      comments.value = await collaborationService.listComments(resolvedEntityType.value, resolvedEntityId.value)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Erro ao carregar comentários'
    } finally {
      loading.value = false
    }
  }

  async function create(body: string, mentions: string[] = []) {
    if (!body.trim() || !resolvedEntityId.value) return
    sending.value = true

    try {
      const created = await collaborationService.createComment({
        entityType: resolvedEntityType.value,
        entityId: resolvedEntityId.value,
        body: body.trim(),
        mentions,
      })
      upsertComment(created)
    } finally {
      sending.value = false
    }
  }

  async function remove(id: string) {
    await collaborationService.deleteComment(id)
    comments.value = comments.value.filter((comment) => comment.id !== id)
  }

  async function toggleReaction(comment: CommentPayload, emoji: string) {
    const previous = comments.value
    const user = currentUser()
    const userId = user?.id ?? 'me'
    const hasReaction = comment.reactions.some((reaction) => reaction.emoji === emoji && reaction.userId === userId)

    applyOptimisticReaction(comment.id, emoji, userId, hasReaction, user)

    try {
      if (hasReaction) {
        await collaborationService.removeReaction(comment.id, emoji)
      } else {
        await collaborationService.addReaction(comment.id, emoji)
      }
    } catch (err) {
      comments.value = previous
      throw err
    }
  }

  function currentUser() {
    try {
      const token = getUserToken()
      if (!token) return null
      return { id: token.sub, name: token.name, email: token.email }
    } catch {
      return null
    }
  }

  function applyOptimisticReaction(
    commentId: string,
    emoji: string,
    userId: string,
    shouldRemove: boolean,
    user: { id: string; name: string; email: string } | null,
  ) {
    comments.value = comments.value.map((item) => {
      if (item.id !== commentId) return item

      const reactions = shouldRemove
        ? item.reactions.filter((reaction) => !(reaction.emoji === emoji && reaction.userId === userId))
        : [
            ...item.reactions,
            {
              id: `optimistic-${commentId}-${emoji}-${userId}`,
              userId,
              emoji,
              user,
            },
          ]

      return { ...item, reactions }
    })
  }

  function upsertComment(comment: CommentPayload) {
    if (comment.entityType !== resolvedEntityType.value || comment.entityId !== resolvedEntityId.value) return

    const index = comments.value.findIndex((item) => item.id === comment.id)
    if (index >= 0) {
      comments.value[index] = comment
      return
    }
    comments.value = [comment, ...comments.value]
  }

  onMounted(() => {
    void refresh()
    unsubscribeRealtime = realtimeService.connect({
      commentNew: upsertComment,
    })
  })

  onUnmounted(() => {
    unsubscribeRealtime?.()
  })

  watch([resolvedEntityType, resolvedEntityId], () => {
    void refresh()
  })

  return {
    comments,
    loading,
    sending,
    error,
    refresh,
    create,
    remove,
    toggleReaction,
  }
}
