import { useQuery } from '@tanstack/vue-query'
import eventsService from '@/service/events/events-service'

export function useUpcomingEvents(limit = 5) {
  return useQuery({
    queryKey: ['events', 'upcoming', limit],
    queryFn: () => eventsService.getUpcomingEvents(limit),
    staleTime: 1000 * 60,
  })
}
