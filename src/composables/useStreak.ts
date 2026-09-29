import { useQuery, useQueryClient, type QueryClient } from '@tanstack/vue-query'
import { computed, onScopeDispose, ref, toValue, type MaybeRefOrGetter } from 'vue'
import streakService, {
  type StreakMe,
  type StreakTeam,
  type StreakTeamMember,
} from '@/service/streak/streak-service'
import { localDayKey, moodFor } from '@/components/nevo/nevo-assets'
import { timeKeys } from '@/composables/useTimeTracking'
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
  if (today !== lastDay) {
    lastDay = today
    // Prefixo `['streak']`: me e equipe mudam juntos na virada.
    void clockClient?.invalidateQueries({ queryKey: streakKeys.all })
    return
  }
  checkFocusGoal(today)
}

// ─── Meta de foco batida com o cronômetro RODANDO ────────────────────────────
// Pela D2 o timer aberto (começado hoje) já conta no dia, então o dia vira
// garantido no minuto 30 com o timer ainda rodando. Nenhum evento marca esse
// instante (só `time:started`/`time:stopped`): sem isto o chip, a missão de
// foco e a festa esperavam o polling de 5 min. O mesmo tique de 60 s confere se
// a meta já deve ter sido batida desde o último dado e pede o `/me` uma vez.
let focusNudgedFor = 0

function checkFocusGoal(today: string) {
  const client = clockClient
  if (!client) return
  const s = client.getQueryData<StreakMe>(streakKeys.me())
  const updatedAt = client.getQueryState(streakKeys.me())?.dataUpdatedAt ?? 0
  if (!s || s.securedToday || !updatedAt || updatedAt === focusNudgedFor) return
  const focus = s.missions.find((m) => m.key === 'focus')
  if (!focus || focus.done) return
  // Timer aberto E começado hoje: um esquecido desde ontem não soma (D2
  // refinada), e sem esta checagem o pedido se repetiria a cada minuto.
  const entry = client.getQueryData<{ startedAt?: unknown; endedAt?: unknown } | null>(
    timeKeys.current,
  )
  if (!entry || typeof entry.startedAt !== 'string' || entry.endedAt) return
  if (localDayKey(new Date(entry.startedAt)) !== today) return
  const dueAt = updatedAt + Math.max(0, focus.target - focus.current) * 60 * 1000
  if (Date.now() < dueAt) return
  focusNudgedFor = updatedAt
  void client.invalidateQueries({ queryKey: streakKeys.me() })
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
 * A MINHA linha da equipe com os números do `/me`.
 *
 * O `/streak/team` responde de um cache de 30 s no servidor (por empresa, fuso
 * e dia, compartilhado por todo mundo da empresa), e o `/streak/me` não tem
 * cache. Logo depois de garantir o dia, o refetch da equipe podia trazer a foto
 * de antes: a home dizia "Dia garantido!" e o painel logo abaixo, "ainda não
 * garantiu hoje". A minha linha passa a vir do `/me` (mesmo dia civil), e o
 * resumo de "quantos garantiram" acompanha. Colegas continuam vindo da equipe
 * (o `useRealtimeQuerySync` rebusca a equipe de novo quando o cache vence).
 *
 * Devolve o MESMO objeto quando nada muda, para não disparar quem observa.
 */
export function withMyStreak(team: StreakTeam, me: StreakMe | null | undefined): StreakTeam {
  if (!me || me.date !== team.date) return team
  const idx = team.members.findIndex((m) => m.isMe)
  const old = team.members[idx]
  if (!old) return team
  const mine: StreakTeamMember = {
    ...old,
    current: me.current,
    best: me.best,
    securedToday: me.securedToday,
    todayIsRest: me.todayIsRest,
    tier: { key: me.tier.key, label: me.tier.label },
    week: me.week.map(({ date, secured, rest, perfect, isToday }) => ({
      date,
      secured,
      rest,
      perfect,
      isToday,
    })),
    points: { week: me.points.week },
  }
  const same =
    mine.current === old.current &&
    mine.best === old.best &&
    mine.securedToday === old.securedToday &&
    mine.todayIsRest === old.todayIsRest &&
    mine.tier.key === old.tier.key &&
    mine.points.week === old.points.week &&
    JSON.stringify(mine.week) === JSON.stringify(old.week)
  if (same) return team

  const members = team.members.slice()
  members[idx] = mine
  // Mesma ordem da API: pontos da semana, depois sequência, depois nome.
  members.sort(
    (a, b) =>
      b.points.week - a.points.week || b.current - a.current || a.user.name.localeCompare(b.user.name),
  )
  const delta = Number(mine.securedToday) - Number(old.securedToday)
  return {
    ...team,
    members,
    summary: { ...team.summary, securedToday: Math.max(0, team.summary.securedToday + delta) },
  }
}

/**
 * Sequência da equipe (membros da empresa, ranking de pontos, sequência do time).
 * A linha de quem está logado vem do `/me` (ver `withMyStreak`).
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

  // Mesma consulta do chip e da home (o Vue Query deduplica).
  const { streak: me } = useStreak()
  const team = computed(() => (query.data.value ? withMyStreak(query.data.value, me.value) : undefined))

  const available = computed(() => !isUnavailable(query.error.value))
  const isError = computed(() => query.isError.value && available.value)

  return {
    team,
    companyId: resolvedCompanyId,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError,
    available,
    refetch: query.refetch,
  }
}
