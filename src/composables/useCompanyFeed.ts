import { onMounted, onUnmounted, ref } from 'vue'
import collaborationService from '@/service/collaboration/collaboration-service'
import realtimeService, { type FeedEventPayload } from '@/service/realtime/realtime-service'

export function useCompanyFeed(take = 50) {
  const feed = ref<FeedEventPayload[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let unsubscribeRealtime: (() => boolean) | null = null

  async function refresh() {
    loading.value = true
    error.value = null

    try {
      feed.value = await collaborationService.listFeed(take)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Erro ao carregar timeline'
    } finally {
      loading.value = false
    }
  }

  function prepend(event: FeedEventPayload) {
    feed.value = [event, ...feed.value.filter((item) => item.id !== event.id)].slice(0, take)
  }

  onMounted(() => {
    void refresh()
    unsubscribeRealtime = realtimeService.connect({
      feedNew: prepend,
      connect: () => void refresh(),
    })
  })

  onUnmounted(() => {
    unsubscribeRealtime?.()
  })

  return {
    feed,
    loading,
    error,
    refresh,
  }
}
