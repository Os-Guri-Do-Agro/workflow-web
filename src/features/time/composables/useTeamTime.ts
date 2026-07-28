import { useQuery } from '@tanstack/vue-query'
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import timeService, { type TeamLiveEntry } from '@/service/time/time-service'
import companiesServices from '@/service/companies/companies-services'
import realtimeService from '@/service/realtime/realtime-service'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { dayKey, elapsedSince } from '@/utils/duration'

interface Member {
  userId: string
  userName: string
  role: string
}

/** Forma bruta de `GET /company/:id/members` (role + joinedAt + user). */
interface RawMember {
  role?: string
  userId?: string
  user?: { id?: string; name?: string; email?: string }
}

export interface TeamRow {
  userId: string
  userName: string
  /** Posição no ranking do período (1 = quem mais registrou). Empate mantém ordem. */
  rank: number
  /** Timer rodando agora (ou null se ocioso). */
  running: TeamLiveEntry | null
  /** Segundos do timer corrente (derivado de startedAt, atualizado por tick). */
  elapsedSec: number
  /** Total do período (do company-report). */
  totalSec: number
  /** Fatia do total da equipe no período (0-100), para a barra do ranking. */
  pct: number
  /** É o usuário logado (destaque "Você" na lista). */
  isMe: boolean
}

/** Um dia do gráfico de ritmo da equipe. */
export interface TeamPulseDay {
  key: string
  sec: number
  wd: string
  isToday: boolean
}

/** Erro HTTP com response (axios) sem depender do tipo do axios aqui. */
function statusOf(err: unknown): number | undefined {
  const maybe = err as { response?: { status?: number } } | null
  return maybe?.response?.status
}

/**
 * Erro 4xx não melhora com insistência: 403 é backend antigo (visão restrita a
 * ADMIN) e 404 é rota que ainda não existe lá. Sem esta guarda o Vue Query
 * reagendava a chamada três vezes com backoff e a tela ficava presa no
 * esqueleto por dezenas de segundos em vez de explicar o que houve.
 */
function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  const status = statusOf(error)
  if (status && status >= 400 && status < 500) return false
  return failureCount < 2
}

/** Range fixo dos últimos 7 dias (gráfico de ritmo, independente do preset). */
function last7Range(): { from: string; to: string } {
  const now = new Date()
  const to = new Date(now)
  to.setHours(23, 59, 59, 999)
  const from = new Date(now)
  from.setDate(from.getDate() - 6)
  from.setHours(0, 0, 0, 0)
  return { from: from.toISOString(), to: to.toISOString() }
}

/**
 * T5 (spec time-tracking-v2) — dados da aba Equipe.
 *
 * Junta quatro fontes para a empresa ativa (x-company-id via interceptor):
 * - membros da empresa (roster completo, inclusive quem não trackeou nada);
 * - timers rodando AGORA (`company-live`, semente do estado ao vivo);
 * - totais do período (`company-report`, por usuário/tarefa/dia);
 * - ritmo dos últimos 7 dias (mesmo endpoint com range fixo, para o gráfico não
 *   virar uma barra só quando o filtro é "Hoje").
 * E atualiza em tempo real pelos eventos `time:team-started/stopped` na room da
 * empresa. O cronômetro é derivado de `startedAt` no cliente (server é a fonte).
 *
 * Deixou de ser exclusivo de ADMIN (jul/2026): a visão virou o ranking da
 * equipe, aberto a qualquer membro. O servidor continua exigindo membership na
 * empresa, então o isolamento entre empresas não mudou.
 */
export function useTeamTime(range: Ref<{ from: string; to: string }>) {
  const workspace = useWorkspaceStore()
  const { me } = useCurrentUser()
  const companyId = computed(() => workspace.activeCompanyId)
  const enabled = computed(() => !!companyId.value)

  const membersQuery = useQuery({
    queryKey: computed(() => ['time', 'team-members', companyId.value]),
    queryFn: async () => {
      const raw = await companiesServices.getCompanyMembers(companyId.value!)
      const list: RawMember[] = Array.isArray(raw) ? raw : (raw?.data ?? [])
      return list.map((m) => ({
        userId: m.user?.id ?? m.userId ?? '',
        userName: m.user?.name ?? 'Sem nome',
        role: m.role ?? 'WORKER',
      })) as Member[]
    },
    enabled,
    staleTime: 1000 * 60,
    retry: retryUnlessClientError,
  })

  const liveQuery = useQuery({
    queryKey: computed(() => ['time', 'company-live', companyId.value]),
    queryFn: () => timeService.companyLive(),
    enabled,
    staleTime: 1000 * 5,
    retry: retryUnlessClientError,
  })

  const reportQuery = useQuery({
    queryKey: computed(() => ['time', 'company-report', companyId.value, range.value]),
    queryFn: () =>
      timeService.companyReport({
        from: range.value.from,
        to: range.value.to,
        tzOffset: new Date().getTimezoneOffset(),
      }),
    enabled,
    staleTime: 1000 * 15,
    retry: retryUnlessClientError,
  })

  // Ritmo de 7 dias: mesma chave de cache do report quando o range coincide
  // (preset "7 dias"), então nesse caso não há request extra.
  const pulseRange = ref(last7Range())
  const pulseQuery = useQuery({
    queryKey: computed(() => ['time', 'company-report', companyId.value, pulseRange.value]),
    queryFn: () =>
      timeService.companyReport({
        from: pulseRange.value.from,
        to: pulseRange.value.to,
        tzOffset: new Date().getTimezoneOffset(),
      }),
    enabled,
    staleTime: 1000 * 60,
    retry: retryUnlessClientError,
  })

  // Running entries por userId (semente do liveQuery + updates via socket).
  const runningByUser = ref<Record<string, TeamLiveEntry>>({})
  watch(
    () => liveQuery.data.value,
    (data) => {
      const map: Record<string, TeamLiveEntry> = {}
      for (const e of data?.running ?? []) map[e.userId] = e
      runningByUser.value = map
    },
    { immediate: true },
  )

  // Cronômetro vivo compartilhado: só tica enquanto há alguém rodando.
  const now = ref(Date.now())
  let intervalId: number | null = null
  function ensureTicker() {
    if (intervalId === null) {
      intervalId = window.setInterval(() => (now.value = Date.now()), 1000)
    }
  }
  function stopTicker() {
    if (intervalId !== null) {
      window.clearInterval(intervalId)
      intervalId = null
    }
  }
  watch(
    () => Object.keys(runningByUser.value).length,
    (n) => (n > 0 ? ensureTicker() : stopTicker()),
    { immediate: true },
  )

  // Socket: reflete start/stop dos membros na room da empresa em tempo real.
  let unsub: (() => void) | null = null
  onMounted(() => {
    unsub = realtimeService.connect({
      teamTimeStarted: (e) => {
        runningByUser.value = { ...runningByUser.value, [e.userId]: e }
      },
      teamTimeStopped: (p) => {
        const next = { ...runningByUser.value }
        delete next[p.userId]
        runningByUser.value = next
      },
      // Reconexão: perdeu eventos enquanto offline; recarrega o estado ao vivo.
      reconnect: () => void liveQuery.refetch(),
    }) as (() => void) | null
  })
  onUnmounted(() => {
    unsub?.()
    stopTicker()
  })

  const totalsByUser = computed(() => {
    const map: Record<string, number> = {}
    for (const u of reportQuery.data.value?.byUser ?? []) map[u.userId] = u.totalSec
    return map
  })

  const teamTotalSec = computed(() => reportQuery.data.value?.totalSec ?? 0)

  const rows = computed<TeamRow[]>(() => {
    void now.value // dependência do ticker para o cronômetro vivo
    const members = membersQuery.data.value ?? []
    // Sem roster (membros ainda carregando ou negados), o próprio relatório serve
    // de lista: quem registrou tempo aparece do mesmo jeito.
    const fromReport: Member[] = (reportQuery.data.value?.byUser ?? []).map((u) => ({
      userId: u.userId,
      userName: u.name,
      role: 'WORKER',
    }))
    const base = members.length ? members : fromReport
    const seen = new Set(base.map((m) => m.userId))
    // Quem está rodando mas não veio no roster (borda) também aparece.
    const extra: Member[] = []
    for (const [userId, e] of Object.entries(runningByUser.value)) {
      if (!seen.has(userId)) extra.push({ userId, userName: e.userName, role: 'WORKER' })
    }

    const total = teamTotalSec.value
    const myId = me.value?.id

    return [...base, ...extra]
      .map((m) => {
        const running = runningByUser.value[m.userId] ?? null
        const totalSec = totalsByUser.value[m.userId] ?? 0
        return {
          userId: m.userId,
          userName: m.userName,
          rank: 0,
          running,
          elapsedSec: running ? elapsedSince(running.startedAt) : 0,
          totalSec,
          pct: total > 0 ? Math.round((totalSec / total) * 100) : 0,
          isMe: !!myId && m.userId === myId,
        }
      })
      // Ranking puro por tempo registrado: quem está rodando agora não "fura a
      // fila" (a lista é placar do período, não fila de atividade).
      .sort((a, b) => {
        if (b.totalSec !== a.totalSec) return b.totalSec - a.totalSec
        return a.userName.localeCompare(b.userName)
      })
      .map((r, i) => ({ ...r, rank: i + 1 }))
  })

  /** Top 3 do período com tempo > 0 (o pódio some quando ninguém registrou). */
  const podium = computed(() => rows.value.filter((r) => r.totalSec > 0).slice(0, 3))

  const myRow = computed(() => rows.value.find((r) => r.isMe) ?? null)

  const activeCount = computed(() => Object.keys(runningByUser.value).length)

  /** Pessoas com tempo registrado no período (base honesta da média por pessoa). */
  const contributorCount = computed(() => rows.value.filter((r) => r.totalSec > 0).length)

  const avgPerPersonSec = computed(() =>
    contributorCount.value ? Math.round(teamTotalSec.value / contributorCount.value) : 0,
  )

  const billableSec = computed(() => reportQuery.data.value?.billableSec ?? 0)
  const billablePct = computed(() =>
    teamTotalSec.value ? Math.round((billableSec.value / teamTotalSec.value) * 100) : 0,
  )

  /** Onde a equipe gastou o tempo (top 5 tarefas do período). */
  const byActivity = computed(() => {
    const list = reportQuery.data.value?.byActivity ?? []
    const total = teamTotalSec.value || 1
    return [...list]
      .sort((a, b) => b.totalSec - a.totalSec)
      .slice(0, 5)
      .map((a) => ({
        title: a.title,
        sec: a.totalSec,
        pct: Math.round((a.totalSec / total) * 100),
      }))
  })

  /** Ritmo da equipe nos últimos 7 dias (cronológico), para o mini gráfico. */
  const pulse = computed<TeamPulseDay[]>(() => {
    const byKey = new Map((pulseQuery.data.value?.byDay ?? []).map((d) => [d.day.slice(0, 10), d.totalSec]))
    const now2 = new Date()
    const todayKey = dayKey(now2.toISOString())
    const out: TeamPulseDay[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now2)
      d.setDate(now2.getDate() - i)
      const key = dayKey(d.toISOString())
      out.push({
        key,
        sec: byKey.get(key) ?? 0,
        wd: d.toLocaleDateString('pt-BR', { weekday: 'narrow' }).toUpperCase(),
        isToday: key === todayKey,
      })
    }
    return out
  })

  const pulseMax = computed(() => Math.max(1, ...pulse.value.map((d) => d.sec)))

  /**
   * Backend anterior à abertura da visão de equipe (deploy pendente): responde
   * 403 (ou 404 no /company-live que ainda não existe lá) para quem não é ADMIN.
   * A tela mostra um aviso específico em vez de "erro ao carregar".
   */
  const isForbidden = computed(() => {
    const codes = [statusOf(liveQuery.error.value), statusOf(reportQuery.error.value)]
    return codes.some((c) => c === 403 || c === 404)
  })

  const isError = computed(
    () => !isForbidden.value && (liveQuery.isError.value || reportQuery.isError.value),
  )

  // Falhou é falhou: sem esta guarda, uma query que segue "pending" depois do
  // erro mantinha o esqueleto na tela para sempre, escondendo o aviso.
  const isLoading = computed(
    () =>
      !isForbidden.value &&
      !isError.value &&
      (membersQuery.isLoading.value || liveQuery.isLoading.value || reportQuery.isLoading.value),
  )

  function refetch() {
    void membersQuery.refetch()
    void liveQuery.refetch()
    void reportQuery.refetch()
    void pulseQuery.refetch()
  }

  return {
    rows,
    podium,
    myRow,
    activeCount,
    contributorCount,
    teamTotalSec,
    avgPerPersonSec,
    billableSec,
    billablePct,
    byActivity,
    pulse,
    pulseMax,
    isLoading,
    isError,
    isForbidden,
    refetch,
  }
}
