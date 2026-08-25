import api from '../api'

export type TimeEntrySource = 'TIMER' | 'MANUAL'

export interface TimeEntry {
  id: string
  userId: string
  description: string
  startedAt: string
  endedAt: string | null
  durationSec: number | null
  companyId: string | null
  activityId: string | null
  billable: boolean
  // true quando o timer foi encerrado automaticamente (esquecido >12h / cap 24h).
  autoStopped: boolean
  /**
   * Por que a entrada fechou: `user` | `idle` | `stale` | `cap` | `forgotten` |
   * `resolved`. É o que separa o corte que ESTA máquina pediu (`idle`, já
   * anunciado pelo guard) daquele que o servidor decidiu sozinho.
   */
  closeReason?: string | null
  source: TimeEntrySource
  createdAt: string
  updatedAt: string
  company?: { id: string; name: string } | null
  activity?: { id: string; title: string } | null
}

/** Resposta do heartbeat: o servidor é o árbitro do que é atividade. */
export type HeartbeatResult =
  | { running: false }
  | {
      running: true
      entryId: string
      startedAt: string
      /** Maior atividade conhecida somando TODOS os dispositivos da pessoa. */
      lastActivityAt: string
      serverTime: string
    }

/** O que a tela de reconciliação precisa saber sobre a entrada largada. */
export interface AbandonedEntry {
  entry: TimeEntry
  lastActivityAt: string
  lastSeenAt: string
  /** Segundos entre a última atividade e agora — o que está em jogo. */
  pendingSec: number
}

export type ResolveAction = 'activity' | 'now' | 'custom' | 'discard' | 'continue'

// ─── Banco de horas (spec banco-de-horas) ─────────────────────────────────────

export interface BalanceDay {
  day: string
  workedSec: number
  /** Meta daquele dia. Zero em fim de semana e feriado nacional. */
  targetSec: number
  /** Nome do feriado nacional, quando houver. */
  holiday: string | null
}

export interface TimeBalance {
  from: string
  to: string
  workedSec: number
  targetSec: number
  /** Positivo = crédito, negativo = dívida. */
  balanceSec: number
  businessDays: number
  /** Dias úteis já cobrados (é o número que corresponde a `targetSec`). */
  businessDaysElapsed: number
  /** Dias úteis que ainda faltam, contando hoje. */
  daysLeft: number
  /** Média por dia útil COM registro. Null quando não há amostra. */
  paceSec: number | null
  /** Saldo estimado no fim do período no ritmo atual. Null sem amostra. */
  projectedBalanceSec: number | null
  byDay: BalanceDay[]
}

export interface CompanyBalancePerson {
  userId: string
  name: string
  email: string
  workedSec: number
  targetSec: number
  balanceSec: number
  paceSec: number | null
  projectedBalanceSec: number | null
  /** Quanto do tempo dela foi NESTA empresa (a jornada é da pessoa, não daqui). */
  companySec: number
}

export interface CompanyBalance {
  companyId: string
  from: string
  to: string
  people: CompanyBalancePerson[]
}

export interface WorkScheduleInput {
  validFrom?: string
  monSec: number
  tueSec: number
  wedSec: number
  thuSec: number
  friSec: number
  satSec: number
  sunSec: number
}

export interface WorkScheduleInfo {
  /** Null = usando o padrão da casa. */
  current: (WorkScheduleInput & { validFrom: string }) | null
  defaultDaySec: number
  history: { validFrom: string; weekSec: number }[]
}

export interface StartTimerInput {
  description?: string
  companyId?: string | null
  activityId?: string | null
  billable?: boolean
}

export interface ManualEntryInput {
  description?: string
  startedAt: string
  endedAt: string
  companyId?: string | null
  activityId?: string | null
  billable?: boolean
}

export type UpdateEntryInput = Partial<{
  description: string
  startedAt: string
  endedAt: string
  // "" limpa o vínculo; string preenche.
  companyId: string
  activityId: string
  billable: boolean
}>

export interface EntriesFilters {
  from?: string
  to?: string
  companyId?: string
  activityId?: string
  take?: number
  skip?: number
}

export interface TimeSummary {
  totalSec: number
  billableSec: number
  byDay: Array<{ day: string; totalSec: number }>
  byCompany: Array<{ companyId: string | null; name: string; totalSec: number }>
}

export interface CompanyReport {
  companyId: string
  totalSec: number
  billableSec: number
  byUser: Array<{ userId: string; name: string; totalSec: number }>
  byActivity: Array<{ activityId: string | null; title: string; totalSec: number }>
  byDay: Array<{ day: string; totalSec: number }>
  /**
   * Tempo por pessoa E por dia — base do heatmap de constância do ranking. Só
   * dias com registro entram. Ausente em backend anterior a ago/2026.
   */
  byUserDay?: Array<{ userId: string; day: string; totalSec: number }>
}

/** Filtros dos relatórios. `tzOffset` (minutos, getTimezoneOffset) agrupa byDay no fuso local. */
export interface ReportFilters {
  from?: string
  to?: string
  tzOffset?: number
}

/** Timer de um membro rodando agora, como o ADMIN vê na aba Equipe (v2 T5). */
export interface TeamLiveEntry {
  entryId: string
  userId: string
  userName: string
  description: string
  startedAt: string
  companyId: string | null
  activityId: string | null
  activityTitle: string | null
  billable: boolean
}

/** Payload de `time:team-stopped` (o membro parou; a linha volta a "ocioso"). */
export interface TeamStoppedPayload {
  userId: string
  entryId: string
}

export interface CompanyLive {
  companyId: string
  running: TeamLiveEntry[]
}

const timeService = {
  async start(data: StartTimerInput) {
    const response = await api.post<TimeEntry>('/time/start', data)
    return response.data
  },

  /**
   * Para o timer. `endedAt` (ISO) fecha num instante PASSADO — corte por
   * ociosidade: o tempo entre a última atividade real e agora não entra em
   * total nenhum. Sem o parâmetro, fecha em agora, como sempre.
   */
  async stop(endedAt?: string) {
    const response = await api.post<TimeEntry>(
      '/time/stop',
      endedAt ? { endedAt } : undefined,
    )
    return response.data
  },

  /**
   * Sinal de vida do cronômetro (spec timer-confiavel). Diz ATÉ QUANDO este
   * cliente viu atividade e recebe de volta a verdade do servidor — que pode
   * ser mais recente, se outro dispositivo da pessoa estiver ativo.
   */
  async heartbeat(lastActivityAt: string, source: 'system' | 'extension' | 'tab') {
    const response = await api.post<HeartbeatResult>('/time/heartbeat', {
      lastActivityAt,
      source,
    })
    return response.data
  },

  /** Entrada aberta cujo cliente sumiu (reboot, sleep, navegador morto). */
  async abandoned() {
    const response = await api.get<AbandonedEntry | null>('/time/abandoned')
    return response.data
  },

  /** Aplica a decisão da pessoa sobre a entrada abandonada. */
  async resolveEntry(id: string, action: ResolveAction, endedAt?: string) {
    const response = await api.post<TimeEntry | { id: string; discarded: true }>(
      `/time/entries/${id}/resolve`,
      { action, ...(endedAt ? { endedAt } : {}) },
    )
    return response.data
  },

  async current() {
    const response = await api.get<TimeEntry | null>('/time/current')
    return response.data
  },

  async getEntries(filters?: EntriesFilters) {
    const response = await api.get<TimeEntry[]>('/time/entries', { params: filters })
    return response.data
  },

  async createManual(data: ManualEntryInput) {
    const response = await api.post<TimeEntry>('/time/entries', data)
    return response.data
  },

  async updateEntry(id: string, data: UpdateEntryInput) {
    const response = await api.patch<TimeEntry>(`/time/entries/${id}`, data)
    return response.data
  },

  async deleteEntry(id: string) {
    const response = await api.delete<{ id: string }>(`/time/entries/${id}`)
    return response.data
  },

  async summary(filters?: ReportFilters) {
    const response = await api.get<TimeSummary>('/time/summary', { params: filters })
    return response.data
  },

  /**
   * Relatório agregado de UMA empresa. Sem `companyId` vale a empresa ativa (o
   * interceptor injeta o header); com ele, a chamada é explícita — é assim que
   * a visão de GRUPO lê várias empresas do usuário em paralelo.
   */
  async companyReport(filters?: ReportFilters, companyId?: string) {
    const response = await api.get<CompanyReport>('/time/company-report', {
      params: filters,
      ...(companyId ? { headers: { 'x-company-id': companyId } } : {}),
    })
    return response.data
  },

  // ─── Banco de horas (spec banco-de-horas) ───────────────────────────────────

  /**
   * Saldo do período. `from`/`to` são datas civis (YYYY-MM-DD), e não instantes:
   * banco de horas trabalha com dias, e um ISO completo criaria períodos com
   * meio dia de sobra numa ponta.
   */
  async balance(from: string, to: string) {
    const response = await api.get<TimeBalance>('/time/balance', {
      params: { from, to, tzOffset: new Date().getTimezoneOffset() },
    })
    return response.data
  },

  /** Fechamento da equipe (ADMIN da empresa ativa). */
  async companyBalance(from: string, to: string, companyId?: string) {
    const response = await api.get<CompanyBalance>('/time/company-balance', {
      params: { from, to, tzOffset: new Date().getTimezoneOffset() },
      ...(companyId ? { headers: { 'x-company-id': companyId } } : {}),
    })
    return response.data
  },

  async getSchedule() {
    const response = await api.get<WorkScheduleInfo>('/time/schedule')
    return response.data
  },

  /**
   * O `tzOffset` vai junto porque, sem `validFrom` explícito, o servidor usa
   * "hoje" — e hoje em UTC não é hoje aqui depois das 21h.
   */
  async setSchedule(input: WorkScheduleInput) {
    const response = await api.patch('/time/schedule', input, {
      params: { tzOffset: new Date().getTimezoneOffset() },
    })
    return response.data
  },

  /** Timers rodando agora numa empresa (mesma regra de `companyReport`). */
  async companyLive(companyId?: string) {
    const response = await api.get<CompanyLive>(
      '/time/company-live',
      companyId ? { headers: { 'x-company-id': companyId } } : undefined,
    )
    return response.data
  },
}

export default timeService
