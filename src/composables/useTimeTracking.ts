import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, onMounted, onUnmounted, ref, unref, type MaybeRef } from 'vue'
import timeService, {
  type EntriesFilters,
  type ManualEntryInput,
  type StartTimerInput,
  type TimeEntry,
  type UpdateEntryInput,
} from '@/service/time/time-service'
import realtimeService from '@/service/realtime/realtime-service'
import { elapsedSince } from '@/utils/duration'

export const timeKeys = {
  all: ['time'] as const,
  current: ['time', 'current'] as const,
  entries: ['time', 'entries'] as const,
  entriesList: (filters?: EntriesFilters) => ['time', 'entries', filters ?? {}] as const,
  summary: ['time', 'summary'] as const,
  summaryFor: (filters?: { from?: string; to?: string }) =>
    ['time', 'summary', filters ?? {}] as const,
}

/**
 * Timer do usuário + cronômetro vivo derivado de `startedAt` (o servidor é a
 * fonte de verdade; o cliente só conta segundos para exibição). Também escuta
 * `time:started`/`time:stopped` para sincronizar abas/dispositivos.
 */
export function useTimeTracking() {
  const queryClient = useQueryClient()
  let unsubscribeRealtime: (() => boolean) | null = null
  let ticker: number | null = null
  const now = ref(Date.now())

  const current = useQuery({
    queryKey: timeKeys.current,
    queryFn: () => timeService.current(),
    staleTime: 1000 * 10,
  })

  const running = computed<TimeEntry | null>(() => current.data.value ?? null)
  const isRunning = computed(() => !!running.value && !running.value.endedAt)

  // Segundos decorridos = agora − startedAt (recalculado a cada tick de 1s).
  const elapsedSec = computed(() => {
    void now.value // dependência reativa para o ticker
    if (!running.value) return 0
    return elapsedSince(running.value.startedAt)
  })

  const invalidateAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: timeKeys.current }),
      queryClient.invalidateQueries({ queryKey: timeKeys.entries }),
      queryClient.invalidateQueries({ queryKey: timeKeys.summary }),
    ])

  const start = useMutation({
    mutationFn: (input: StartTimerInput) => timeService.start(input),
    onSuccess: (entry) => {
      queryClient.setQueryData(timeKeys.current, entry)
      void invalidateAll()
    },
  })

  const stop = useMutation({
    mutationFn: () => timeService.stop(),
    onSuccess: () => {
      queryClient.setQueryData(timeKeys.current, null)
      void invalidateAll()
    },
  })

  const createManual = useMutation({
    mutationFn: (input: ManualEntryInput) => timeService.createManual(input),
    onSuccess: () => void invalidateAll(),
  })

  const updateEntry = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEntryInput }) =>
      timeService.updateEntry(id, data),
    onSuccess: () => void invalidateAll(),
  })

  const deleteEntry = useMutation({
    mutationFn: (id: string) => timeService.deleteEntry(id),
    onSuccess: () => void invalidateAll(),
  })

  onMounted(() => {
    ticker = window.setInterval(() => {
      now.value = Date.now()
    }, 1000)

    unsubscribeRealtime = realtimeService.connect({
      timeStarted: (entry) => {
        queryClient.setQueryData(timeKeys.current, entry)
        void invalidateAll()
      },
      timeStopped: () => {
        queryClient.setQueryData(timeKeys.current, null)
        void invalidateAll()
      },
    }) as (() => boolean) | null
  })

  onUnmounted(() => {
    if (ticker) window.clearInterval(ticker)
    unsubscribeRealtime?.()
  })

  return {
    current,
    running,
    isRunning,
    elapsedSec,
    start,
    stop,
    createManual,
    updateEntry,
    deleteEntry,
    invalidateAll,
  }
}

/** Lista reativa de entradas (aceita filtros reativos). */
export function useTimeEntries(filters: MaybeRef<EntriesFilters> = {}) {
  return useQuery({
    queryKey: computed(() => timeKeys.entriesList(unref(filters))),
    queryFn: () => timeService.getEntries(unref(filters)),
    staleTime: 1000 * 15,
  })
}

/** Totais do usuário (por dia + por empresa) para a view. */
export function useTimeSummary(filters: MaybeRef<{ from?: string; to?: string }> = {}) {
  return useQuery({
    queryKey: computed(() => timeKeys.summaryFor(unref(filters))),
    queryFn: () => timeService.summary(unref(filters)),
    staleTime: 1000 * 15,
  })
}
