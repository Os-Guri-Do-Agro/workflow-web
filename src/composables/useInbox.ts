import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, onMounted, onUnmounted } from 'vue'
import inboxService from '@/service/inbox/inbox-service'
import realtimeService from '@/service/realtime/realtime-service'
import { useActiveCompanyId } from '@/stores/authStores'

// O backend filtra a inbox pela empresa do header x-company-id: sem o id na
// chave, trocar de empresa servia a lista/contagem da empresa anterior.
export const inboxKeys = {
  all: ['inbox'] as const,
  list: (companyId: string | null) => ['inbox', 'list', companyId] as const,
  unreadCount: (companyId: string | null) => ['inbox', 'unread-count', companyId] as const,
}

export function useInbox() {
  const queryClient = useQueryClient()
  const activeCompanyId = useActiveCompanyId()
  let unsubscribeRealtime: (() => boolean) | null = null

  const companyId = computed(() => activeCompanyId.companyId ?? localStorage.getItem('activeCompany'))

  const notifications = useQuery({
    queryKey: computed(() => inboxKeys.list(companyId.value)),
    queryFn: () => inboxService.list(false),
    staleTime: 1000 * 30,
  })

  const unreadCount = useQuery({
    queryKey: computed(() => inboxKeys.unreadCount(companyId.value)),
    queryFn: () => inboxService.unreadCount(),
    refetchInterval: 1000 * 30,
    staleTime: 1000 * 20,
  })

  const invalidateInbox = () =>
    queryClient.invalidateQueries({ queryKey: inboxKeys.all })

  const markRead = useMutation({
    mutationFn: (id: string) => inboxService.markRead(id),
    onSuccess: invalidateInbox,
  })

  const markAllRead = useMutation({
    mutationFn: () => inboxService.markAllRead(),
    onSuccess: invalidateInbox,
  })

  const dismiss = useMutation({
    mutationFn: (id: string) => inboxService.dismiss(id),
    onSuccess: invalidateInbox,
  })

  onMounted(() => {
    unsubscribeRealtime = realtimeService.connect({
      notificationNew: () => {
        void invalidateInbox()
      },
      // Outra aba/dispositivo do mesmo usuário leu ou apagou algo.
      notificationSync: () => {
        void invalidateInbox()
      },
      // Notificações emitidas enquanto o socket esteve fora não têm replay.
      reconnect: () => {
        void invalidateInbox()
      },
    }) as (() => boolean) | null
  })

  onUnmounted(() => {
    unsubscribeRealtime?.()
  })

  return {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    dismiss,
  }
}
