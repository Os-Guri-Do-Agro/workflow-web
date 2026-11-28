import { onBeforeUnmount, type Ref } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import realtimeService from '@/service/realtime/realtime-service'
import {
  bookingService,
  type BookingOverview,
  type BookingScope,
  type EventTypeInput,
  type UpsertPageInput,
} from '@/service/booking/booking-service'

export const bookingKeys = {
  all: ['booking'] as const,
  overview: ['booking', 'overview'] as const,
}

/**
 * Estado do painel de Agendamentos. Toda escrita de configuração devolve o
 * overview inteiro do servidor, que vira o cache na hora: a tela nunca mostra
 * uma versão "otimista" da regra de horário que o servidor possa ter recusado.
 */
export function useBookingSettings() {
  const queryClient = useQueryClient()

  const overview = useQuery({
    queryKey: bookingKeys.overview,
    queryFn: () => bookingService.overview(),
    staleTime: 30_000,
  })

  const setOverview = (data: BookingOverview) =>
    queryClient.setQueryData(bookingKeys.overview, data)

  const savePage = useMutation({
    mutationFn: (input: UpsertPageInput) => bookingService.upsertPage(input),
    onSuccess: setOverview,
  })

  const createEventType = useMutation({
    mutationFn: (input: EventTypeInput) => bookingService.createEventType(input),
    onSuccess: setOverview,
  })

  const updateEventType = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<EventTypeInput> }) =>
      bookingService.updateEventType(id, input),
    onSuccess: setOverview,
  })

  const archiveEventType = useMutation({
    mutationFn: (id: string) => bookingService.archiveEventType(id),
    onSuccess: setOverview,
  })

  /** Reconfere a conexão com o Google agora (ignora o cache de 5 min do servidor). */
  async function recheckGoogle() {
    setOverview(await bookingService.overview(true))
  }

  return {
    overview,
    savePage,
    createEventType,
    updateEventType,
    archiveEventType,
    recheckGoogle,
  }
}

/**
 * Reunião marcada/remarcada/cancelada pela página pública: a lista e os
 * contadores de "próximas" mexem sem F5. Chamado UMA vez, pela view; os
 * componentes filhos usam `useBookingSettings` à vontade (o Vue Query
 * deduplica as queries, mas assinatura de socket não se deduplica sozinha).
 */
export function useBookingRealtime() {
  const queryClient = useQueryClient()
  const unsubscribe = realtimeService.subscribe({
    bookingChanged: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all })
    },
  })
  onBeforeUnmount(unsubscribe)
}

export function useHostBookings(scope: Ref<BookingScope>) {
  return useQuery({
    queryKey: [...bookingKeys.all, 'bookings', scope] as const,
    queryFn: () => bookingService.listBookings(scope.value),
    staleTime: 15_000,
  })
}
