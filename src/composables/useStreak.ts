import { useQuery, useQueryClient, type QueryClient } from '@tanstack/vue-query'
import { computed, onScopeDispose, ref, toValue, type MaybeRefOrGetter } from 'vue'
import streakService from '@/service/streak/streak-service'
import { localDayKey, moodFor } from '@/components/nevo/nevo-assets'
import { useActiveCompanyId } from '@/stores/authStores'
import { safeStorage } from '@/utils/safe-storage'
import { onTabVisible } from '@/utils/tab-visibility'

/**
 * Sequência diária do Nevo no Vue Query (spec sequencia-diaria-nevo).
 *
 * `me` não leva empresa na chave de propósito: a sequência é da PESSOA, somada
 * em todas as empresas (D6). A da equipe leva, porque lista os membros da
 * empresa ativa. Invalidar `streakKeys.all` atualiza as duas (é o que o sync
 * por socket faz em `useRealtimeQuerySync`).
 */
export const streakKeys = {
  all: ['streak'] as const,
  me: () => ['streak', 'me'] as const,
  team: (companyId: string | null) => ['streak', 'team', companyId] as const,
}

const STALE_MS = 60 * 1000
const POLL_MS = 5 * 60 * 1000

/** Status HTTP de um erro do axios, sem depender do tipo do axios aqui. */
function statusOf(err: unknown): number | undefined {
  const maybe = err as { response?: { status?: number } } | null
  return maybe?.response?.status
}

/**
 * 404 = backend ainda sem a rota (deploy da API pendente); 403 = rota existe
 * mas nega. Nos dois casos quem consome ESCONDE a UI da sequência em vez de
 * mostrar erro: é o rollout "backend primeiro, front degrada" da spec.
 */
function isUnavailable(err: unknown): boolean {
  const status = statusOf(err)
  return status === 404 || status === 403
}

/** 4xx não melhora com insistência; 5xx e rede ganham duas novas tentativas. */
function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  const status = statusOf(error)
  if (status && status >= 400 && status < 500) return false
  return failureCount < 2
}

/**
 * Sem rota no backend não adianta perguntar de novo a cada 5 min: para o
 * polling e deixa só o foco na janela (barato) descobrir quando a rota chegar.
 */
function pollUnlessUnavailable(query: { state: { error: unknown } }): number | false {
  return isUnavailable(query.state.error) ? false : POLL_MS
}

// ─── Virada do dia (singleton) ────────────────────────────────────────────────
// Chip, home e comemoração usam `useStreak` ao mesmo tempo; um relógio só serve
// todos. Ele existe porque, à meia-noite, nada no servidor avisa o cliente: sem
// isto a semana e o "hoje" ficavam no dia anterior até o próximo polling. O
// mesmo tique alimenta a hora usada no humor (depois das 17h vira "em risco").
const clockHour = ref(new Date().getHours())
let lastDay = localDayKey()
let clockUsers = 0
let clockTimer: number | null = null
let unbindVisible: (() => void) | null = null
let clockClient: QueryClient | null = null

function tickClock() {
  const now = new Date()
  clockHour.value = now.getHours()
  const today = localDayKey(now)
  if (today === lastDay) return
  lastDay = today
  // Prefixo `['streak']`: me e equipe mudam juntos na virada.
  void clockClient?.invalidateQueries({ queryKey: streakKeys.all })
}

function acquireClock(client: QueryClient) {
  clockClient = client
  clockUsers++
  if (clockTimer !== null) return
  // 60 s basta: a virada só precisa aparecer "logo", não no segundo exato.
  clockTimer = window.setInterval(tickClock, 60 * 1000)
  // Aba oculta congela o setInterval; ao voltar, confere na hora.
  unbindVisible = onTabVisible(tickClock)
}

function releaseClock() {
  clockUsers = Math.max(0, clockUsers - 1)
  if (clockUsers > 0) return
  if (clockTimer !== null) window.clearInterval(clockTimer)
  clockTimer = null
  unbindVisible?.()
  unbindVisible = null
}

/**
 * Resumo da sequência do usuário logado.
 *
 * - `available`: false quando a API respondeu 404/403 (rota ainda não existe).
 *   Consumidores devem esconder a UI inteira nesse caso.
 * - `isError`: erro de verdade (5xx, rede) com a rota disponível; mostre o
 *   estado de erro com "tentar de novo".
 * - `mood`: humor do Nevo (pose, animação, título e frase), recalculado quando
 *   os dados chegam e quando a hora local muda.
 */
export function useStreak() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: streakKeys.me(),
    queryFn: () => streakService.me(),
    staleTime: STALE_MS,
    refetchInterval: pollUnlessUnavailable,
    refetchOnWindowFocus: true,
    retry: retryUnlessClientError,
  })

  acquireClock(queryClient)
  onScopeDispose(releaseClock)

  const available = computed(() => !isUnavailable(query.error.value))
  const isError = computed(() => query.isError.value && available.value)
  const mood = computed(() => moodFor(query.data.value, clockHour.value))

  return {
    streak: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError,
    available,
    refetch: query.refetch,
    mood,
  }
}

/**
 * Sequência da equipe (membros da empresa, ranking de pontos, sequência do time).
 *
 * `companyId`:
 * - omitido: usa a empresa ativa (store + localStorage, mesmo padrão da inbox);
 * - informado (valor, ref ou getter): usa esse; `null` desliga a consulta.
 *
 * A empresa vai na chave E no header da chamada, então a resposta nunca é de
 * uma empresa servida na chave de outra.
 */
export function useStreakTeam(companyId?: MaybeRefOrGetter<string | null>) {
  const queryClient = useQueryClient()
  const activeCompanyId = useActiveCompanyId()

  const resolvedCompanyId = computed<string | null>(() => {
    if (companyId !== undefined) return toValue(companyId) ?? null
    return activeCompanyId.companyId ?? safeStorage.getItem('activeCompany')
  })

  const query = useQuery({
    queryKey: computed(() => streakKeys.team(resolvedCompanyId.value)),
    queryFn: () => streakService.team(resolvedCompanyId.value),
    enabled: computed(() => !!resolvedCompanyId.value),
    staleTime: STALE_MS,
    refetchInterval: pollUnlessUnavailable,
    refetchOnWindowFocus: true,
    retry: retryUnlessClientError,
  })

  acquireClock(queryClient)
  onScopeDispose(releaseClock)

  const available = computed(() => !isUnavailable(query.error.value))
  const isError = computed(() => query.isError.value && available.value)

  return {
    team: query.data,
    companyId: resolvedCompanyId,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError,
    available,
    refetch: query.refetch,
  }
}
