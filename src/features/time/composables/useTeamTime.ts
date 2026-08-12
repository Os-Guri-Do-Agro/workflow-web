import { useQueries } from '@tanstack/vue-query'
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import timeService, {
  type CompanyLive,
  type CompanyReport,
  type TeamLiveEntry,
} from '@/service/time/time-service'
import companiesServices from '@/service/companies/companies-services'
import realtimeService from '@/service/realtime/realtime-service'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { useCurrentUser } from '@/composables/useCurrentUser'
import {
  buildPulseBars,
  type PulseBar,
  type useTimePeriod,
} from '@/features/time/composables/useTimePeriod'
import { elapsedSince } from '@/utils/duration'
import { onTabVisible } from '@/utils/tab-visibility'

/** Instância do período compartilhada pela aba (ver `useTimePeriod`). */
type TimePeriodApi = ReturnType<typeof useTimePeriod>

/** `'group'` = todas as empresas do usuário somadas; senão, o id de uma empresa. */
export type TeamScope = 'group' | (string & {})

interface Member {
  userId: string
  userName: string
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
  /** Posição no ranking do período (1 = quem mais registrou). */
  rank: number
  /** Timer rodando agora (ou null se ocioso). */
  running: TeamLiveEntry | null
  /** Segundos do timer corrente (derivado de startedAt, atualizado por tique). */
  elapsedSec: number
  /** Total do período, somando todas as empresas do escopo. */
  totalSec: number
  /** Fatia do total do escopo (0-100), para a barra do ranking. */
  pct: number
  /** Empresas em que a pessoa registrou tempo no período (visão de grupo). */
  companies: string[]
  /** É o usuário logado (destaque "Você" na lista). */
  isMe: boolean
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

/** Semanas do heatmap de constância (o mesmo valor usado no Meu tempo). */
export const HEATMAP_WEEKS = 26

/**
 * Intervalo do heatmap, estável dentro do mesmo dia: é o que torna a chave de
 * cache reaproveitável entre montagens (e entre o Meu tempo e a Equipe).
 */
export function constancyWindow(): { from: string; to: string } {
  const to = new Date()
  to.setHours(23, 59, 59, 999)
  const from = new Date(to)
  from.setDate(from.getDate() - HEATMAP_WEEKS * 7)
  from.setHours(0, 0, 0, 0)
  return { from: from.toISOString(), to: to.toISOString() }
}


/**
 * T5 (spec time-tracking-v2) — dados da aba Equipe.
 *
 * Duas mudanças de escopo em jul/2026:
 * 1. deixou de ser exclusivo de ADMIN (virou o ranking, aberto a qualquer
 *    membro; o servidor segue exigindo membership em cada empresa);
 * 2. passou a somar VÁRIAS empresas. Na prática as empresas cadastradas são
 *    filiais do mesmo grupo e as pessoas trabalham em mais de uma, então
 *    ranquear uma empresa por vez partia a mesma equipe em placares
 *    separados. O escopo padrão é o grupo inteiro; dá para focar numa
 *    empresa pelo seletor.
 *
 * Cada empresa do escopo é uma chamada (o backend agrega por empresa); a soma
 * por pessoa, tarefa e dia é feita aqui.
 *
 * Recebe a instância inteira do `useTimePeriod` (e não só o range) porque o
 * gráfico de ritmo precisa do modo e do mês exibido para decidir a
 * granularidade das colunas. O range pode ser PARCIAL: no período "Tudo" não há
 * `from` nem `to`, e a API trata ausência como "sem filtro".
 */
export function useTeamTime(period: TimePeriodApi, scope: Ref<TeamScope>) {
  const { range, pulseRange, staleTime } = period
  const workspace = useWorkspaceStore()
  const { me } = useCurrentUser()

  /** Empresas do usuário; cai para a ativa enquanto o workspace não carregou. */
  const companies = computed<{ id: string; name: string }[]>(() => {
    const list = workspace.companies
    if (list.length) return list.map((c) => ({ id: c.id, name: c.name }))
    const active = workspace.activeCompanyId
    return active ? [{ id: active, name: 'Empresa' }] : []
  })

  const targets = computed(() =>
    scope.value === 'group' ? companies.value : companies.value.filter((c) => c.id === scope.value),
  )
  const targetIds = computed(() => targets.value.map((c) => c.id))
  const nameOfCompany = computed(() => new Map(companies.value.map((c) => [c.id, c.name])))

  const memberQueries = useQueries({
    queries: computed(() =>
      targetIds.value.map((id) => ({
        queryKey: ['time', 'team-members', id] as const,
        queryFn: async (): Promise<Member[]> => {
          const raw = await companiesServices.getCompanyMembers(id)
          const list: RawMember[] = Array.isArray(raw) ? raw : (raw?.data ?? [])
          return list.map((m) => ({
            userId: m.user?.id ?? m.userId ?? '',
            userName: m.user?.name ?? 'Sem nome',
          }))
        },
        staleTime: 1000 * 60,
        retry: retryUnlessClientError,
      })),
    ),
  })

  const liveQueries = useQueries({
    queries: computed(() =>
      targetIds.value.map((id) => ({
        queryKey: ['time', 'company-live', id] as const,
        queryFn: () => timeService.companyLive(id),
        staleTime: 1000 * 5,
        retry: retryUnlessClientError,
      })),
    ),
  })

  const reportQueries = useQueries({
    queries: computed(() =>
      targetIds.value.map((id) => ({
        queryKey: ['time', 'company-report', id, range.value] as const,
        queryFn: () =>
          timeService.companyReport(
            { ...range.value, tzOffset: new Date().getTimezoneOffset() },
            id,
          ),
        staleTime: staleTime.value,
        retry: retryUnlessClientError,
      })),
    ),
  })

  // Ritmo: fora do modo "Hoje" o range é o mesmo do período, então a chave
  // coincide com a do report acima e o Vue Query serve do cache, sem request
  // extra. Só o modo "Hoje" gera de fato uma segunda chamada (7 dias).
  const pulseQueries = useQueries({
    queries: computed(() =>
      targetIds.value.map((id) => ({
        queryKey: ['time', 'company-report', id, pulseRange.value] as const,
        queryFn: () =>
          timeService.companyReport(
            { ...pulseRange.value, tzOffset: new Date().getTimezoneOffset() },
            id,
          ),
        staleTime: staleTime.value,
        retry: retryUnlessClientError,
      })),
    ),
  })

  /**
   * Constância (heatmap): janela FIXA de 26 semanas, independente do período
   * escolhido. Regularidade só se enxerga em janela longa — com "Hoje"
   * selecionado o mapa teria uma coluna e não diria nada. Cache mais longo:
   * histórico fechado praticamente não muda.
   */
  // A janela é ancorada no DIA, não no instante: com `toISOString()` cheio, a
  // queryKey mudava a cada montagem (milissegundo diferente) e o cache de 5 min
  // nunca acertava — toda ida à aba refazia o relatório de 26 semanas de todas
  // as empresas.
  const constancyRange = computed(() => constancyWindow())

  const constancyQueries = useQueries({
    queries: computed(() =>
      targetIds.value.map((id) => ({
        queryKey: ['time', 'company-report', id, constancyRange.value] as const,
        queryFn: () =>
          timeService.companyReport(
            { ...constancyRange.value, tzOffset: new Date().getTimezoneOffset() },
            id,
          ),
        staleTime: 1000 * 60 * 5,
        retry: retryUnlessClientError,
      })),
    ),
  })

  const reports = computed(() =>
    reportQueries.value
      .map((q, i) => ({ companyId: targetIds.value[i], data: q.data as CompanyReport | undefined }))
      .filter((r): r is { companyId: string; data: CompanyReport } => !!r.data),
  )

  // ─── Estado ao vivo: semente das queries + eventos de socket ────────────────
  const runningByUser = ref<Record<string, TeamLiveEntry>>({})

  watch(
    () => liveQueries.value.map((q) => q.data as CompanyLive | undefined),
    (list) => {
      const map: Record<string, TeamLiveEntry> = {}
      for (const data of list) {
        for (const e of data?.running ?? []) map[e.userId] = e
      }
      runningByUser.value = map
    },
    { immediate: true, deep: true },
  )

  /**
   * O socket entrega eventos de TODAS as empresas do usuário. Focado numa
   * empresa, só entram os timers dela (ou os gerais, sem vínculo) — a mesma
   * regra que o servidor aplica no `company-live`.
   */
  function belongsToScope(entry: TeamLiveEntry): boolean {
    if (scope.value === 'group') return true
    return entry.companyId === scope.value || entry.companyId === null
  }

  // Cronômetro vivo compartilhado: só tica enquanto há alguém rodando.
  const now = ref(Date.now())
  let intervalId: number | null = null
  let unbindVisibility: (() => void) | null = null
  function ensureTicker() {
    if (intervalId === null) {
      intervalId = window.setInterval(() => (now.value = Date.now()), 1000)
    }
    // Aba oculta congela o interval; ao voltar, recalcula na hora (senão os
    // cronômetros da equipe aparecem parados no valor de minutos atrás).
    if (!unbindVisibility) {
      unbindVisibility = onTabVisible(() => (now.value = Date.now()))
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
  watch(
    () => Object.keys(runningByUser.value).length,
    (n) => (n > 0 ? ensureTicker() : stopTicker()),
    { immediate: true },
  )

  let unsub: (() => void) | null = null
  onMounted(() => {
    unsub = realtimeService.connect({
      teamTimeStarted: (e) => {
        if (!belongsToScope(e)) return
        runningByUser.value = { ...runningByUser.value, [e.userId]: e }
      },
      teamTimeStopped: (p) => {
        const next = { ...runningByUser.value }
        delete next[p.userId]
        runningByUser.value = next
      },
      // Reconexão: perdeu eventos enquanto offline; recarrega o estado ao vivo.
      reconnect: () => liveQueries.value.forEach((q) => void q.refetch()),
    }) as (() => void) | null
  })
  onUnmounted(() => {
    unsub?.()
    stopTicker()
  })

  // ─── Agregações do escopo ───────────────────────────────────────────────────
  const teamTotalSec = computed(() =>
    reports.value.reduce((acc, r) => acc + (r.data.totalSec ?? 0), 0),
  )

  const billableSec = computed(() =>
    reports.value.reduce((acc, r) => acc + (r.data.billableSec ?? 0), 0),
  )

  const billablePct = computed(() =>
    teamTotalSec.value ? Math.round((billableSec.value / teamTotalSec.value) * 100) : 0,
  )

  /** Tempo por pessoa somando as empresas do escopo (+ em quais ela apareceu). */
  const perUser = computed(() => {
    const map = new Map<string, { name: string; totalSec: number; companies: Set<string> }>()
    for (const r of reports.value) {
      const companyName = nameOfCompany.value.get(r.companyId) ?? 'Empresa'
      for (const u of r.data.byUser ?? []) {
        const entry = map.get(u.userId) ?? { name: u.name, totalSec: 0, companies: new Set<string>() }
        entry.totalSec += u.totalSec
        if (u.totalSec > 0) entry.companies.add(companyName)
        map.set(u.userId, entry)
      }
    }
    return map
  })

  const rows = computed<TeamRow[]>(() => {
    void now.value // dependência do ticker para o cronômetro vivo

    // Roster de todas as empresas do escopo, sem repetir quem está em várias.
    const roster = new Map<string, Member>()
    for (const q of memberQueries.value) {
      for (const m of (q.data as Member[] | undefined) ?? []) {
        if (m.userId && !roster.has(m.userId)) roster.set(m.userId, m)
      }
    }
    // Sem roster (ainda carregando ou negado), o próprio relatório serve de lista.
    if (roster.size === 0) {
      for (const [userId, u] of perUser.value) roster.set(userId, { userId, userName: u.name })
    }
    // Quem está rodando mas não veio no roster (borda) também aparece.
    for (const [userId, e] of Object.entries(runningByUser.value)) {
      if (!roster.has(userId)) roster.set(userId, { userId, userName: e.userName })
    }

    const total = teamTotalSec.value
    const myId = me.value?.id

    return [...roster.values()]
      .map((m) => {
        const running = runningByUser.value[m.userId] ?? null
        const agg = perUser.value.get(m.userId)
        const totalSec = agg?.totalSec ?? 0
        return {
          userId: m.userId,
          userName: agg?.name ?? m.userName,
          rank: 0,
          running,
          elapsedSec: running ? elapsedSince(running.startedAt) : 0,
          totalSec,
          pct: total > 0 ? Math.round((totalSec / total) * 100) : 0,
          companies: agg ? [...agg.companies] : [],
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

  /** Onde o escopo gastou o tempo (top 5 tarefas, somando empresas). */
  const byActivity = computed(() => {
    const map = new Map<string, number>()
    for (const r of reports.value) {
      for (const a of r.data.byActivity ?? []) {
        map.set(a.title, (map.get(a.title) ?? 0) + a.totalSec)
      }
    }
    const total = teamTotalSec.value || 1
    return [...map.entries()]
      .map(([title, sec]) => ({ title, sec, pct: Math.round((sec / total) * 100) }))
      .sort((a, b) => b.sec - a.sec)
      .slice(0, 5)
  })

  /** Quanto cada empresa do grupo contribuiu no período. */
  const byCompany = computed(() => {
    const total = teamTotalSec.value || 1
    return reports.value
      .map((r) => ({
        name: nameOfCompany.value.get(r.companyId) ?? 'Empresa',
        sec: r.data.totalSec ?? 0,
        pct: Math.round(((r.data.totalSec ?? 0) / total) * 100),
      }))
      .filter((c) => c.sec > 0)
      .sort((a, b) => b.sec - a.sec)
  })

  /** Ritmo do período (dias no mês, meses em "Tudo"), somando as empresas do escopo. */
  const pulse = computed<PulseBar[]>(() => {
    const byKey = new Map<string, number>()
    for (const q of pulseQueries.value) {
      for (const d of (q.data as CompanyReport | undefined)?.byDay ?? []) {
        const key = d.day.slice(0, 10)
        byKey.set(key, (byKey.get(key) ?? 0) + d.totalSec)
      }
    }
    return buildPulseBars(period.kind.value, period.anchor.value, byKey)
  })

  const pulseMax = computed(() => Math.max(1, ...pulse.value.map((d) => d.sec)))

  /** Constância do escopo inteiro: segundos por dia nas últimas 26 semanas. */
  const constancyByDay = computed<Map<string, number>>(() => {
    const map = new Map<string, number>()
    for (const q of constancyQueries.value) {
      for (const d of (q.data as CompanyReport | undefined)?.byDay ?? []) {
        const key = d.day.slice(0, 10)
        map.set(key, (map.get(key) ?? 0) + d.totalSec)
      }
    }
    return map
  })

  /**
   * Constância por pessoa, para a faixa no ranking. Vem de `byUserDay`, campo
   * criado para isto: o `byUser` só tem o total, e sem o recorte por dia não dá
   * para desenhar regularidade.
   */
  const constancyByUser = computed<Map<string, Map<string, number>>>(() => {
    const map = new Map<string, Map<string, number>>()
    for (const q of constancyQueries.value) {
      for (const d of (q.data as CompanyReport | undefined)?.byUserDay ?? []) {
        const key = d.day.slice(0, 10)
        const perDay = map.get(d.userId) ?? new Map<string, number>()
        perDay.set(key, (perDay.get(key) ?? 0) + d.totalSec)
        map.set(d.userId, perDay)
      }
    }
    return map
  })

  /** Acima de 12 colunas o gráfico precisa do modo denso do MiniBars. */
  const pulseDense = computed(() => pulse.value.length > 12)

  /**
   * Backend anterior à abertura da visão de equipe (deploy pendente): responde
   * 403 (ou 404 no /company-live que ainda não existe lá) para quem não é ADMIN.
   * Basta uma empresa do escopo negar para o placar ficar incompleto, então o
   * aviso aparece já no primeiro 403.
   */
  const isForbidden = computed(() =>
    [...liveQueries.value, ...reportQueries.value, ...constancyQueries.value].some((q) => {
      const code = statusOf(q.error)
      return code === 403 || code === 404
    }),
  )

  const isError = computed(
    () =>
      !isForbidden.value &&
      [...liveQueries.value, ...reportQueries.value, ...constancyQueries.value].some(
        (q) => q.isError,
      ),
  )

  // Falhou é falhou: sem esta guarda, uma query que segue "pending" depois do
  // erro mantinha o esqueleto na tela para sempre, escondendo o aviso.
  const isLoading = computed(
    () =>
      !isForbidden.value &&
      !isError.value &&
      (targetIds.value.length === 0 ||
        [...memberQueries.value, ...liveQueries.value, ...reportQueries.value].some(
          (q) => q.isLoading,
        )),
  )

  function refetch() {
    ;[
      ...memberQueries.value,
      ...liveQueries.value,
      ...reportQueries.value,
      ...pulseQueries.value,
      // Sem esta linha, "tentar de novo" deixava os heatmaps quebrados para sempre.
      ...constancyQueries.value,
    ].forEach((q) => void q.refetch())
  }

  return {
    companies,
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
    byCompany,
    pulse,
    pulseMax,
    pulseDense,
    constancyByDay,
    constancyByUser,
    isLoading,
    isError,
    isForbidden,
    refetch,
  }
}
