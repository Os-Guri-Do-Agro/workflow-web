import { useQuery } from '@tanstack/vue-query'
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import timeService, { type TeamLiveEntry } from '@/service/time/time-service'
import companiesServices from '@/service/companies/companies-services'
import realtimeService from '@/service/realtime/realtime-service'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { elapsedSince } from '@/utils/duration'

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
  /** Timer rodando agora (ou null se ocioso). */
  running: TeamLiveEntry | null
  /** Segundos do timer corrente (derivado de startedAt, atualizado por tick). */
  elapsedSec: number
  /** Total do período (do company-report). */
  totalSec: number
}

/**
 * T5 (spec time-tracking-v2) — dados da aba Equipe do ADMIN.
 *
 * Junta três fontes para a empresa ativa (x-company-id via interceptor):
 * - membros da empresa (roster completo, inclusive quem não trackeou nada);
 * - timers rodando AGORA (`company-live`, semente do estado ao vivo);
 * - totais do período (`company-report`, por usuário).
 * E atualiza em tempo real pelos eventos `time:team-started/stopped` na room da
 * empresa. O cronômetro é derivado de `startedAt` no cliente (server é a fonte).
 */
export function useTeamTime(range: Ref<{ from: string; to: string }>) {
  const workspace = useWorkspaceStore()
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
  })

  const liveQuery = useQuery({
    queryKey: computed(() => ['time', 'company-live', companyId.value]),
    queryFn: () => timeService.companyLive(),
    enabled,
    staleTime: 1000 * 5,
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

  const rows = computed<TeamRow[]>(() => {
    void now.value // dependência do ticker para o cronômetro vivo
    const members = membersQuery.data.value ?? []
    const seen = new Set(members.map((m) => m.userId))
    // Quem está rodando mas não veio no roster (borda) também aparece.
    const extra: Member[] = []
    for (const [userId, e] of Object.entries(runningByUser.value)) {
      if (!seen.has(userId)) extra.push({ userId, userName: e.userName, role: 'WORKER' })
    }
    return [...members, ...extra]
      .map((m) => {
        const running = runningByUser.value[m.userId] ?? null
        return {
          userId: m.userId,
          userName: m.userName,
          running,
          elapsedSec: running ? elapsedSince(running.startedAt) : 0,
          totalSec: totalsByUser.value[m.userId] ?? 0,
        }
      })
      .sort((a, b) => {
        // Rodando primeiro; depois maior total; depois nome.
        if (!!a.running !== !!b.running) return a.running ? -1 : 1
        if (b.totalSec !== a.totalSec) return b.totalSec - a.totalSec
        return a.userName.localeCompare(b.userName)
      })
  })

  const activeCount = computed(() => Object.keys(runningByUser.value).length)
  const teamTotalSec = computed(() => reportQuery.data.value?.totalSec ?? 0)

  const isLoading = computed(
    () => membersQuery.isLoading.value || liveQuery.isLoading.value,
  )
  const isError = computed(() => membersQuery.isError.value || liveQuery.isError.value)

  function refetch() {
    void membersQuery.refetch()
    void liveQuery.refetch()
    void reportQuery.refetch()
  }

  return { rows, activeCount, teamTotalSec, isLoading, isError, refetch }
}
