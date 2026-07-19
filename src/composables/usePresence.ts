import { computed, onMounted, onUnmounted, ref } from 'vue'
import presenceService from '@/service/presence/presence-service'
import realtimeService from '@/service/realtime/realtime-service'

export function usePresence() {
  const onlineUserIds = ref<string[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let unsubscribeRealtime: (() => boolean) | null = null

  const onlineCount = computed(() => onlineUserIds.value.length)

  async function refresh() {
    loading.value = true
    error.value = null

    try {
      const presence = await presenceService.getPresence()
      onlineUserIds.value = presence.online
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Erro ao carregar presença'
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void refresh()
    unsubscribeRealtime = realtimeService.connect({
      reconnect: () => void refresh(),
      presenceUpdate: ({ companyId, online }) => {
        // Presença é por empresa e o socket ouve todas as do usuário: sem o
        // filtro, a lista da empresa ativa era sobrescrita pela de outra.
        const activeCompany = localStorage.getItem('activeCompany')
        if (activeCompany && companyId !== activeCompany) return
        onlineUserIds.value = online
      },
    }) as (() => boolean) | null
  })

  onUnmounted(() => {
    unsubscribeRealtime?.()
  })

  return {
    onlineUserIds,
    onlineCount,
    loading,
    error,
    refresh,
  }
}
