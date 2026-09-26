import api from '../api'

/**
 * Sequência Diária (spec docs/specs/2026/q3/q3-3/sequencia-diaria-nevo.md).
 *
 * Tudo é DERIVADO no servidor a partir do que já existe (tempo registrado,
 * tarefas concluídas, movimentação no feed). O dia é o dia civil de quem
 * pergunta, por isso toda chamada leva `tzOffset`: sem ele, depois das 21h no
 * Brasil o "hoje" do servidor já é amanhã.
 */

export type StreakTierKey =
  | 'none'
  | 'basico'
  | 'progresso'
  | 'determinado'
  | 'especialista'
  | 'lendario'

export type StreakMilestoneKey = 'basico' | 'constancia' | 'disciplina' | 'avancado' | 'lendario'

export interface StreakDay {
  /** YYYY-MM-DD no dia civil do usuário. */
  date: string
  /** Meta do dia cumprida: 30 min de foco OU 1 tarefa concluída. */
  secured: boolean
  /** Dia sem meta na jornada (fim de semana, feriado). Não quebra a sequência. */
  rest: boolean
  /** As 3 missões cumpridas (foco + tarefa + colaboração). */
  perfect: boolean
  focusSec: number
  tasksDone: number
  collab: number
  isToday: boolean
}

export type StreakMissionKey = 'focus' | 'task' | 'collab'

export interface StreakMission {
  key: StreakMissionKey
  label: string
  hint: string
  current: number
  target: number
  done: boolean
}

export interface StreakMilestone {
  days: number
  key: StreakMilestoneKey
  label: string
  reached: boolean
}

export interface StreakTier {
  key: StreakTierKey
  label: string
  min: number
  max: number | null
}

export interface StreakMe {
  date: string
  tzOffset: number
  current: number
  best: number
  securedToday: boolean
  perfectToday: boolean
  todayIsRest: boolean
  /** Tem sequência viva e hoje ainda não foi garantido. */
  atRisk: boolean
  /** Tamanho da última sequência que quebrou (0 se nenhuma na janela). */
  previous: number
  /** Primeiro dia perdido que quebrou `previous`. */
  brokenOn: string | null
  tier: StreakTier
  nextTier: { key: StreakTierKey; label: string; at: number } | null
  milestones: StreakMilestone[]
  nextMilestone: { days: number; label: string; remaining: number } | null
  /** Sempre as 3, na ordem foco, tarefa, colaboração. */
  missions: StreakMission[]
  /** Segunda a domingo da semana local de hoje. */
  week: StreakDay[]
  /** Últimos 35 dias até hoje, do mais antigo ao mais novo. */
  recent: StreakDay[]
  points: { today: number; week: number }
  rules: { focusGoalSec: number; windowDays: number }
}

export interface StreakTeamDay {
  date: string
  secured: boolean
  rest: boolean
  perfect: boolean
  isToday: boolean
}

export interface StreakTeamMember {
  user: { id: string; name: string }
  isMe: boolean
  current: number
  best: number
  securedToday: boolean
  todayIsRest: boolean
  tier: { key: StreakTierKey; label: string }
  week: StreakTeamDay[]
  points: { week: number }
}

export interface StreakTeam {
  date: string
  companyId: string
  /** Ordenado por pontos da semana, depois sequência, depois nome. */
  members: StreakTeamMember[]
  summary: { securedToday: number; active: number; total: number; teamStreak: number }
}

function tzOffset(): number {
  return new Date().getTimezoneOffset()
}

const streakService = {
  async me() {
    const response = await api.get<StreakMe>('/streak/me', { params: { tzOffset: tzOffset() } })
    return response.data
  },

  /** Equipe da empresa ativa (ou da informada, com override do header). */
  async team(companyId?: string | null) {
    const response = await api.get<StreakTeam>('/streak/team', {
      params: { tzOffset: tzOffset() },
      ...(companyId ? { headers: { 'x-company-id': companyId } } : {}),
    })
    return response.data
  },
}

export default streakService
