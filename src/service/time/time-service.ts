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
  source: TimeEntrySource
  createdAt: string
  updatedAt: string
  company?: { id: string; name: string } | null
  activity?: { id: string; title: string } | null
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

  async stop() {
    const response = await api.post<TimeEntry>('/time/stop')
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

  // x-company-id é anexado automaticamente pelo interceptor (empresa ativa).
  async companyReport(filters?: ReportFilters) {
    const response = await api.get<CompanyReport>('/time/company-report', { params: filters })
    return response.data
  },

  // Timers rodando agora da equipe (ADMIN). x-company-id via interceptor.
  async companyLive() {
    const response = await api.get<CompanyLive>('/time/company-live')
    return response.data
  },
}

export default timeService
