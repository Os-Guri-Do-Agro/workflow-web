import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import inboxService from '@/service/inbox/inbox-service'

export const inboxKeys = {
  all: ['inbox'] as const,
  list: ['inbox', 'list'] as const,
  unreadCount: ['inbox', 'unread-count'] as const,
}

export function useInbox() {
  const queryClient = useQueryClient()

  const notifications = useQuery({
    queryKey: inboxKeys.list,
    queryFn: () => inboxService.list(false),
    staleTime: 1000 * 30,
  })

  const unreadCount = useQuery({
    queryKey: inboxKeys.unreadCount,
    queryFn: () => inboxService.unreadCount(),
    refetchInterval: 1000 * 30,
    staleTime: 1000 * 20,
  })

  const invalidateInbox = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: inboxKeys.list }),
      queryClient.invalidateQueries({ queryKey: inboxKeys.unreadCount }),
    ])

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

  return {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    dismiss,
  }
}
