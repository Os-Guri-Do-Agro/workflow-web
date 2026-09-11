/**
 * Rotinas (tarefas recorrentes) — camada HTTP.
 *
 * Espelha o contrato de `docs/specs/tarefas-recorrentes-frontend.md`. Os nomes e
 * os shapes aqui são os da API, **sem tradução**: a conversão para o vocabulário
 * da tela (`'daily'` minúsculo, `monthDay: 'last'`) mora em
 * `features/tasks/recurring/recurrence-api-mapping.ts`, de propósito. Service
 * que já devolve o tipo da tela esconde o contrato e transforma qualquer
 * divergência de campo num bug difícil de localizar.
 *
 * `Authorization` e `x-company-id` são injetados pelo interceptor de `api.ts`.
 */
import api from '../api'
import type { ActivityStatus } from '@/features/tasks/activity-types'

// ── O vocabulário da API ─────────────────────────────────────────────────────

export type ApiRecurrenceFrequency = 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'
export type ApiExceptionKind = 'SKIPPED' | 'RESCHEDULED'

export interface ApiRecurrenceRule {
  frequency: ApiRecurrenceFrequency
  /** 1..366 na API; a UI limita a 1..12, e está certa. */
  interval: number
  /** `0` = domingo … `6` = sábado. */
  weekdays: number[]
  /** 1..31. `null` quando a regra usa `monthDayLast`. */
  monthDay: number | null
  /** "último dia do mês" — vence o `monthDay`. */
  monthDayLast: boolean
  skipWeekends: boolean
  /** `YYYY-MM-DD`, dia puro. Em `ONCE`, é o prazo. */
  startDate: string
  /** `null` = sem fim. */
  endDate: string | null
}

export interface ApiRecurrenceException {
  /** A data ORIGINAL gerada pela regra: é a identidade da ocorrência. */
  occurrenceDate: string
  kind: ApiExceptionKind
  /** Preenchida só em `RESCHEDULED`. */
  newDate: string | null
}

export interface ApiRecurrenceTagLink {
  tag: { id: string; name: string; slug: string; color: string | null }
}

export interface ApiRecurrenceResponsible {
  userId?: string
  user: { id?: string; name: string; email?: string }
}

export interface ApiRecurrenceSubtask {
  title: string
  description: string | null
}

/** A rotina inteira, como `GET /activity-recurrence/:id` e a lista devolvem. */
export interface ApiRecurrence {
  id: string
  title: string
  description: string | null
  priorityNumber: number
  initialStatus: ActivityStatus
  active: boolean
  rule: ApiRecurrenceRule
  responsibles: ApiRecurrenceResponsible[]
  tags: ApiRecurrenceTagLink[]
  subtasks: ApiRecurrenceSubtask[]
  exceptions: ApiRecurrenceException[]
  /** As 3 próximas datas a partir de hoje. Conferência cruzada com o motor local. */
  nextOccurrences: string[]
  _count: { materialized: number; exceptions: number }
  createdAt: string
}

/**
 * O resumo que vem embutido no payload do board.
 *
 * Traz menos que a rotina inteira de propósito (sem descrição, tags nem
 * responsáveis): esses dados já vão repetidos em cada card, e o que a Agenda
 * precisa para desenhar a linha apagada de uma data dispensada é `title`,
 * `initialStatus` e as exceções.
 */
export interface ApiBoardRecurrence {
  id: string
  title: string
  initialStatus: ActivityStatus
  active: boolean
  rule: ApiRecurrenceRule
  /** Já recortadas pela janela do mês pedido. */
  exceptions: ApiRecurrenceException[]
}

/** A regra no corpo de escrita é a mesma da leitura — nenhum campo a mais. */
export type RecurrenceRuleInput = ApiRecurrenceRule

/**
 * Os campos que os dois verbos aceitam.
 *
 * Todos opcionais porque o `PATCH` tem a gramática do `PATCH /activity/:id`:
 * campo **ausente** não é tocado, e `tagIds`/`responsibleUserIds` são o
 * conjunto COMPLETO quando vêm (`[]` desvincula tudo).
 */
export interface RecurrenceFields {
  title?: string
  description?: string | null
  priorityNumber?: number
  initialStatus?: ActivityStatus
  active?: boolean
  /** Conjunto COMPLETO. Precisam ser membros da empresa, senão `400`. */
  responsibleUserIds?: string[]
  /** Conjunto COMPLETO. Tags que já existem. */
  tagIds?: string[]
  /** Tags criadas na hora — mesma gramática do `POST /activity`. */
  tagNames?: string[]
  subtasks?: ApiRecurrenceSubtask[]
  /** Substituída INTEIRA quando vem. Não há edição parcial de regra. */
  rule?: RecurrenceRuleInput
}

/** Criar exige o mínimo para a rotina existir. */
export interface RecurrenceCreatePayload extends RecurrenceFields {
  title: string
  rule: RecurrenceRuleInput
}

/** Editar aceita qualquer subconjunto — inclusive nenhum campo. */
export type RecurrenceUpdatePayload = RecurrenceFields

// ── Chamadas ─────────────────────────────────────────────────────────────────

const activityRecurrenceService = {
  /** Lista as rotinas da empresa, com a prévia das 3 próximas de cada uma. */
  async list(companyId: string): Promise<ApiRecurrence[]> {
    const { data } = await api.get<ApiRecurrence[]>(
      `/company/${companyId}/activity-recurrence`,
    )
    return data
  },

  async create(companyId: string, payload: RecurrenceCreatePayload): Promise<ApiRecurrence> {
    const { data } = await api.post<ApiRecurrence>(
      `/company/${companyId}/activity-recurrence`,
      payload,
    )
    return data
  },

  async get(id: string): Promise<ApiRecurrence> {
    const { data } = await api.get<ApiRecurrence>(`/activity-recurrence/${id}`)
    return data
  },

  /** Campo ausente não é tocado. `rule`, quando vem, substitui a regra inteira. */
  async update(id: string, payload: RecurrenceUpdatePayload): Promise<ApiRecurrence> {
    const { data } = await api.patch<ApiRecurrence>(`/activity-recurrence/${id}`, payload)
    return data
  },

  /**
   * Apaga a REGRA. As atividades já materializadas ficam e viram tarefas
   * comuns (`recurrenceId → null`) — podem ter tempo, comentário e anexo em
   * cima. `keptActivities` é quantas sobreviveram: serve para a confirmação
   * dizer o que vai restar, em vez de prometer um apagar que não acontece.
   */
  async remove(id: string): Promise<{ deleted: true; keptActivities: number }> {
    const { data } = await api.delete<{ deleted: true; keptActivities: number }>(
      `/activity-recurrence/${id}`,
    )
    return data
  },

  /**
   * Abre a tarefa de uma data sem nenhuma edição junto. **Idempotente**: chamar
   * duas vezes devolve a mesma atividade.
   *
   * Não é preciso chamar isto antes de escrever — as rotas de escrita de
   * atividade já aceitam o id virtual `rec:<id>:<data>` e materializam sozinhas.
   */
  async materialize(id: string, date: string): Promise<{ id: string }> {
    const { data } = await api.post<{ id: string }>(
      `/activity-recurrence/${id}/materialize`,
      { date },
    )
    return data
  },

  /**
   * Dispensa (`SKIPPED`) ou remarca (`RESCHEDULED`) uma data.
   *
   * `date` é sempre a data ORIGINAL da regra, inclusive ao remarcar: é a
   * identidade da ocorrência. Idempotente por `(rotina, data)`.
   */
  async upsertException(
    id: string,
    input: { date: string; kind: ApiExceptionKind; newDate?: string },
  ): Promise<ApiRecurrenceException> {
    const { data } = await api.post<ApiRecurrenceException>(
      `/activity-recurrence/${id}/exception`,
      input,
    )
    return data
  },

  /** Devolve a data ao calendário: o card virtual reaparece no próximo refetch. */
  async removeException(id: string, date: string): Promise<{ deleted: true }> {
    const { data } = await api.delete<{ deleted: true }>(
      `/activity-recurrence/${id}/exception/${date}`,
    )
    return data
  },
}

export default activityRecurrenceService
