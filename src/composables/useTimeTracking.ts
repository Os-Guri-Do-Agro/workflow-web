import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, onMounted, onUnmounted, ref, unref, watch, type MaybeRef } from 'vue'
import timeService, {
  type EntriesFilters,
  type ManualEntryInput,
  type StartTimerInput,
  type TimeEntry,
  type UpdateEntryInput,
} from '@/service/time/time-service'
import realtimeService from '@/service/realtime/realtime-service'
import { elapsedSince } from '@/utils/duration'
import { unlockTimerAudio } from '@/composables/useTimerSounds'
import { onTabVisible } from '@/utils/tab-visibility'

export const timeKeys = {
  all: ['time'] as const,
  current: ['time', 'current'] as const,
  entries: ['time', 'entries'] as const,
  entriesList: (filters?: EntriesFilters) => ['time', 'entries', filters ?? {}] as const,
  summary: ['time', 'summary'] as const,
  summaryFor: (filters?: { from?: string; to?: string; tzOffset?: number }) =>
    ['time', 'summary', filters ?? {}] as const,
  /** Banco de horas (spec banco-de-horas): saldo, ritmo e projeção. */
  balance: ['time', 'balance'] as const,
  companyBalance: ['time', 'company-balance'] as const,
}

// ─── Singleton compartilhado (F7) ─────────────────────────────────────────────
// O relógio tickado (`sharedNow`) e a subscription realtime vivem no módulo:
// widget + view + título compartilham 1 só interval e 1 só socket handler, em vez
// de 2-3 intervals concorrentes. O interval só roda quando há timer em andamento
// (economia de CPU quando parado) e é desligado quando o último consumer desmonta.
const sharedNow = ref(Date.now())
let consumerCount = 0
let intervalId: number | null = null
let realtimeUnsub: (() => boolean) | null = null
let unbindVisibility: (() => void) | null = null

function ensureTicker() {
  if (intervalId === null) {
    intervalId = window.setInterval(() => {
      sharedNow.value = Date.now()
    }, 1000)
  }
  // O tique de 1s é congelado pelo browser em aba oculta, e é exatamente aí que
  // o timer costuma rodar (a pessoa está trabalhando em outra aba). Sem isto, ao
  // voltar o cronômetro ficava parado no valor velho até o próximo tique.
  if (!unbindVisibility) {
    unbindVisibility = onTabVisible(() => {
      sharedNow.value = Date.now()
    })
  }
}

function stopTicker() {
  if (intervalId !== null) {
    window.clearInterval(intervalId)
    intervalId = null
  }
  unbindVisibility?.()
  unbindVisibility = null
}

/**
 * Timer do usuário + cronômetro vivo derivado de `startedAt` (o servidor é a
 * fonte de verdade; o cliente só conta segundos para exibição). Também escuta
 * `time:started`/`time:stopped` para sincronizar abas/dispositivos.
 */
export function useTimeTracking() {
  const queryClient = useQueryClient()

  const current = useQuery({
    queryKey: timeKeys.current,
    queryFn: () => timeService.current(),
    staleTime: 1000 * 10,
  })

  // Só consideramos "rodando" quando veio de fato um entry com startedAt. Uma
  // resposta inesperada (array vazio, objeto sem data) é truthy e fazia o widget
  // entrar em modo cronômetro sem ter de onde contar.
  const running = computed<TimeEntry | null>(() => {
    const entry = current.data.value
    if (!entry || Array.isArray(entry) || typeof entry.startedAt !== 'string') return null
    return entry
  })
  const isRunning = computed(() => !!running.value && !running.value.endedAt)

  // Segundos decorridos = agora − startedAt (recalculado a cada tick de 1s).
  const elapsedSec = computed(() => {
    void sharedNow.value // dependência reativa para o ticker
    if (!running.value) return 0
    return elapsedSince(running.value.startedAt)
  })

  const invalidateAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: timeKeys.current }),
      queryClient.invalidateQueries({ queryKey: timeKeys.entries }),
      queryClient.invalidateQueries({ queryKey: timeKeys.summary }),
      // Parar o cronômetro precisa mexer o saldo NA HORA: um banco de horas que
      // só atualiza no refresh não é acompanhamento, é relatório.
      queryClient.invalidateQueries({ queryKey: timeKeys.balance }),
      queryClient.invalidateQueries({ queryKey: timeKeys.companyBalance }),
    ])

  const start = useMutation({
    mutationFn: (input: StartTimerInput) => {
      // DENTRO do gesto, e não no `onSuccess`: a ativação transitória do clique
      // não sobrevive ao await da rede, e é ela que autoriza o áudio. Sem esta
      // linha, o alerta de ociosidade (que toca horas depois, sem clique algum)
      // encontra o AudioContext suspenso e sai mudo.
      unlockTimerAudio()
      return timeService.start(input)
    },
    onSuccess: (entry) => {
      queryClient.setQueryData(timeKeys.current, entry)
      void invalidateAll()
    },
  })

  const onStopped = () => {
    queryClient.setQueryData(timeKeys.current, null)
    void invalidateAll()
  }

  const stop = useMutation({
    mutationFn: () => timeService.stop(),
    onSuccess: onStopped,
  })

  // Corte por ociosidade: fecha a entrada no instante da última atividade real.
  // Mutation separada (e não um parâmetro opcional em `stop`) porque o tipo de
  // variável do vue-query tornaria obrigatório passar argumento nas dezenas de
  // `stop.mutateAsync()` que já existem.
  const stopAt = useMutation({
    mutationFn: (endedAt: string) => timeService.stop(endedAt),
    onSuccess: onStopped,
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

  // Liga/desliga o ticker compartilhado conforme há timer rodando.
  watch(isRunning, (v) => (v ? ensureTicker() : stopTicker()), { immediate: true })

  onMounted(() => {
    consumerCount += 1
    // Só o primeiro consumer abre a subscription realtime (handler único).
    if (consumerCount === 1) {
      realtimeUnsub = realtimeService.connect({
        timeStarted: (entry) => {
          queryClient.setQueryData(timeKeys.current, entry)
          void invalidateAll()
        },
        timeStopped: () => {
          queryClient.setQueryData(timeKeys.current, null)
          void invalidateAll()
        },
      }) as (() => boolean) | null
    }
  })

  onUnmounted(() => {
    consumerCount -= 1
    // Último consumer saiu: encerra socket handler e interval.
    if (consumerCount <= 0) {
      consumerCount = 0
      realtimeUnsub?.()
      realtimeUnsub = null
      stopTicker()
    }
  })

  return {
    current,
    running,
    isRunning,
    elapsedSec,
    start,
    stop,
    stopAt,
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

/**
 * Totais do usuário (por dia + por empresa) para a view. R12 — envia o
 * `tzOffset` local por padrão (getTimezoneOffset em minutos), para o backend
 * agrupar byDay no fuso do usuário; o caller pode sobrescrever no filtro.
 */
export function useTimeSummary(
  filters: MaybeRef<{ from?: string; to?: string; tzOffset?: number }> = {},
  // Período "Tudo" é a consulta cara do backend e o histórico antigo não muda:
  // quem chama pode pedir cache mais longo. Ver `useTimePeriod.staleTime`.
  staleTime: MaybeRef<number> = 1000 * 15,
) {
  const withTz = computed(() => {
    const f = unref(filters)
    return { tzOffset: new Date().getTimezoneOffset(), ...f }
  })
  return useQuery({
    queryKey: computed(() => timeKeys.summaryFor(withTz.value)),
    queryFn: () => timeService.summary(withTz.value),
    staleTime: computed(() => unref(staleTime)),
  })
}
