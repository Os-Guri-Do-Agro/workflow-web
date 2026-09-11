/**
 * Tarefas recorrentes — modo API.
 *
 * Expõe a MESMA superfície que `useRecurringTasks` (o modo local), para os
 * componentes não saberem de onde o dado veio. Quem escolhe entre os dois é
 * `useRecurring.ts`, a partir da flag `RECURRING_API_ENABLED`.
 *
 * Duas diferenças de fundo em relação ao modo local, e elas explicam quase todo
 * o arquivo:
 *
 * 1. **Ocorrência tocada aqui é `Activity` de verdade.** No protótipo, arrastar
 *    um card gravava um `override` e a ocorrência continuava derivada. Com a
 *    API, a primeira escrita MATERIALIZA: a partir daí ela é uma tarefa comum,
 *    que já vem nas colunas do board como qualquer outra. Por isso o colapso
 *    (§2.1 do contrato) se aplica **só aos cards virtuais** — materializada não
 *    se esconde, é trabalho real de alguém.
 *
 * 2. **O servidor já expandiu a regra para o board.** Os cards virtuais chegam
 *    prontos, nas colunas certas. O motor local continua existindo para a
 *    AGENDA, que precisa do mês inteiro — inclusive das datas dispensadas, que
 *    o board (corretamente) não devolve como card.
 */
import { computed, type Ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import activityRecurrenceService, {
  type ApiBoardRecurrence,
  type ApiRecurrence,
} from '@/service/activities/activity-recurrence-service'
import activityService from '@/service/activities/activity-service'
import type { ActivityStatus } from '../activity-types'
import type {
  BoardOccurrence,
  RecurringOccurrence,
  RecurringTemplate,
} from './recurrence-types'
import { occurrenceKey, parseOccurrenceId } from './recurrence-types'
import { dateInMonth, expandRule, monthKeyOf, monthRange, today } from './recurrence-engine'
import { currentDay } from './current-day'
import {
  ruleToApi,
  templateFromApi,
  templateFromBoard,
  templateToApi,
} from './recurrence-api-mapping'

/** O recorte do payload do board que interessa às rotinas. */
export interface RecurringBoardPayload {
  monthNumber?: number
  year?: number
  /** `YYYY-MM-DD` inclusivo. É a janela que o servidor expandiu. */
  from?: string
  to?: string
  recurrences?: ApiBoardRecurrence[]
}

/** Card do board, no mínimo que este arquivo precisa ler. */
export interface BoardCardLike {
  id: string
  status?: string
  isVirtual?: boolean
  recurrenceId?: string | null
  occurrenceDate?: string | null
}

export interface UseRecurringApiArgs {
  monthKey: Ref<string>
  companyId: Ref<string>
  board: Ref<RecurringBoardPayload | undefined>
  /** Todos os cards do board, de todas as colunas, reais e virtuais. */
  cards: Ref<BoardCardLike[]>
}

export function useRecurringApi(args: UseRecurringApiArgs) {
  const { monthKey, companyId, board, cards } = args
  const queryClient = useQueryClient()

  // ── As rotinas completas (diálogo de gestão) ──
  //
  // O resumo do board não traz descrição, tags nem responsáveis (§2.3): eles já
  // vão repetidos em cada card. O diálogo de gestão precisa deles, então lê a
  // lista completa — uma consulta por empresa, não por mês navegado.
  const listQuery = useQuery({
    queryKey: computed(() => ['activity-recurrence', companyId.value]),
    queryFn: () => activityRecurrenceService.list(companyId.value),
    enabled: computed(() => !!companyId.value),
  })

  const full = computed<ApiRecurrence[]>(() => listQuery.data.value ?? [])

  /**
   * Os modelos para a tela.
   *
   * Preferimos a lista completa; o resumo do board entra como preenchimento
   * para a rotina que o board conhece e a lista ainda não carregou. Sem isso, a
   * primeira pintura do mês ficaria sem o rótulo da regra nos cards.
   */
  const templates = computed<RecurringTemplate[]>(() => {
    const byId = new Map<string, RecurringTemplate>()
    for (const row of board.value?.recurrences ?? []) {
      byId.set(row.id, templateFromBoard(row))
    }
    for (const row of full.value) byId.set(row.id, templateFromApi(row))
    return [...byId.values()]
  })

  const templateById = (id: string) => templates.value.find((t) => t.id === id) ?? null

  // ── Índices do payload do board ──

  /** As exceções do mês, por rotina: `<recurrenceId>` → `<data original>` → tipo. */
  const exceptionsByRecurrence = computed(() => {
    const out = new Map<string, Map<string, { kind: string; newDate: string | null }>>()
    for (const row of board.value?.recurrences ?? []) {
      const perDate = new Map<string, { kind: string; newDate: string | null }>()
      for (const e of row.exceptions ?? []) {
        perDate.set(e.occurrenceDate, { kind: e.kind, newDate: e.newDate })
      }
      out.set(row.id, perDate)
    }
    return out
  })

  const isVirtual = (card: BoardCardLike) =>
    card.isVirtual === true || card.id.startsWith('rec:')

  /** Os cards virtuais que o servidor devolveu, agrupados por rotina. */
  const virtualByRecurrence = computed(() => {
    const out = new Map<string, BoardCardLike[]>()
    for (const card of cards.value) {
      if (!isVirtual(card)) continue
      const parsed = parseOccurrenceId(card.id)
      const id = card.recurrenceId ?? parsed?.templateId
      if (!id) continue
      const list = out.get(id)
      if (list) list.push(card)
      else out.set(id, [card])
    }
    for (const list of out.values()) {
      list.sort((a, b) => (a.occurrenceDate ?? '').localeCompare(b.occurrenceDate ?? ''))
    }
    return out
  })

  /**
   * As ocorrências que JÁ viraram `Activity`: `<recurrenceId>:<data>` → status.
   *
   * É o que impede a mesma data de ser contada como atrasada depois de feita, e
   * o que dá `touched` à Agenda. Depende de o board serializar `recurrenceId` e
   * `occurrenceDate` como DIA PURO nas atividades reais (§2.4 do contrato) —
   * se um dia voltarem como instante ISO, o casamento falha em silêncio e o dia
   * aparece duas vezes no quadro.
   */
  const materialized = computed(() => {
    const out = new Map<string, { id: string; status: ActivityStatus }>()
    for (const card of cards.value) {
      if (isVirtual(card) || !card.recurrenceId || !card.occurrenceDate) continue
      out.set(`${card.recurrenceId}:${card.occurrenceDate.slice(0, 10)}`, {
        id: card.id,
        status: (card.status as ActivityStatus) ?? 'TODO',
      })
    }
    return out
  })

  // ── A Agenda: o mês inteiro, dispensadas incluídas ──

  const range = computed(() => {
    const from = board.value?.from
    const to = board.value?.to
    // A janela do servidor manda; `monthRange` é o fallback de quando o board
    // ainda não chegou (primeira pintura) ou veio de um backend antigo.
    return from && to ? { start: from, end: to } : monthRange(monthKey.value)
  })

  const monthOccurrences = computed<RecurringOccurrence[]>(() => {
    const out: RecurringOccurrence[] = []
    for (const template of templates.value) {
      const exceptions = exceptionsByRecurrence.value.get(template.id)
      const dates = expandRule(template.rule, range.value.start, range.value.end)
      for (const date of dates) {
        const exception = exceptions?.get(date)
        const real = materialized.value.get(`${template.id}:${date}`)
        // Pausada só entra pelo que já foi tocado: pausar interrompe a geração
        // daqui para a frente, não apaga o que já estava em andamento.
        if (!template.active && !real && !exception) continue
        out.push({
          id: occurrenceKey(template.id, date),
          templateId: template.id,
          title: template.title,
          description: template.description,
          priorityNumber: template.priorityNumber,
          status: real?.status ?? template.initialStatus,
          date: exception?.kind === 'RESCHEDULED' && exception.newDate ? exception.newDate : date,
          assignees: template.assignees,
          tags: template.tags,
          subtasks: template.subtasks,
          frequency: template.rule.frequency,
          touched: !!real || !!exception,
          skipped: exception?.kind === 'SKIPPED',
        })
      }
    }
    return out.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.priorityNumber - b.priorityNumber ||
        a.title.localeCompare(b.title),
    )
  })

  const monthlyFixed = computed(() =>
    monthOccurrences.value.filter((o) => o.frequency === 'monthly'),
  )
  const scheduled = computed(() =>
    monthOccurrences.value.filter((o) => o.frequency !== 'monthly'),
  )

  // ── O board: uma linha por regra, só entre os VIRTUAIS ──

  /**
   * As materializadas já estão nas colunas como atividades comuns e não entram
   * aqui — colapsar tarefa real seria esconder trabalho de alguém. O que se
   * colapsa é a fila de datas que ainda não existe.
   */
  const boardOccurrences = computed<BoardOccurrence[]>(() => {
    const now = currentDay.value
    const out: BoardOccurrence[] = []

    for (const [recurrenceId, list] of virtualByRecurrence.value) {
      const template = templateById(recurrenceId)
      const dates = list.map((c) => c.occurrenceDate ?? '').filter(Boolean)
      const current =
        dates.find((d) => d === now) ??
        dates.find((d) => d > now) ??
        dates[dates.length - 1]
      if (!current || !template) continue

      const card = list.find((c) => c.occurrenceDate === current)
      // Virtual é, por definição, nunca tocada: toda data passada que ficou de
      // fora do quadro é dívida.
      const overdue = dates.filter((d) => d !== current && d < now).length

      out.push({
        id: card?.id ?? occurrenceKey(recurrenceId, current),
        templateId: recurrenceId,
        title: template.title,
        description: template.description,
        priorityNumber: template.priorityNumber,
        status: (card?.status as ActivityStatus) ?? template.initialStatus,
        date: current,
        assignees: template.assignees,
        tags: template.tags,
        subtasks: template.subtasks,
        frequency: template.rule.frequency,
        touched: false,
        skipped: false,
        hiddenInMonth: dates.length - 1,
        overdueInMonth: overdue,
      })
    }

    return out.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.priorityNumber - b.priorityNumber ||
        a.title.localeCompare(b.title),
    )
  })

  // ── Escrita ──

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['activity-recurrence', companyId.value] }),
      queryClient.invalidateQueries({ queryKey: ['boards'] }),
    ])
  }

  async function createTemplate(
    template: Omit<RecurringTemplate, 'id' | 'createdAt'>,
    responsibleUserIds: string[] = [],
  ): Promise<RecurringTemplate> {
    const created = await activityRecurrenceService.create(
      companyId.value,
      templateToApi(template, responsibleUserIds),
    )
    await invalidate()
    return templateFromApi(created)
  }

  async function updateTemplate(
    id: string,
    patch: Partial<RecurringTemplate>,
    responsibleUserIds?: string[],
  ): Promise<void> {
    // `rule` substitui a regra INTEIRA quando vem (§3.2): não existe edição
    // parcial, porque "mudei só o interval" é ambíguo para `weekdays`/`monthDay`.
    await activityRecurrenceService.update(id, {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description || null } : {}),
      ...(patch.priorityNumber !== undefined ? { priorityNumber: patch.priorityNumber } : {}),
      ...(patch.initialStatus !== undefined ? { initialStatus: patch.initialStatus } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.tags !== undefined ? { tagIds: patch.tags.map((t) => t.id) } : {}),
      ...(responsibleUserIds !== undefined ? { responsibleUserIds } : {}),
      ...(patch.subtasks !== undefined
        ? {
            subtasks: patch.subtasks.map((s) => ({
              title: s.title,
              description: s.description || null,
            })),
          }
        : {}),
      ...(patch.rule !== undefined ? { rule: ruleToApi(patch.rule) } : {}),
    })
    await invalidate()
  }

  /** Apaga a REGRA. As tarefas já criadas ficam; devolve quantas sobreviveram. */
  async function removeTemplate(id: string): Promise<number> {
    const { keptActivities } = await activityRecurrenceService.remove(id)
    await invalidate()
    return keptActivities
  }

  async function toggleActive(id: string): Promise<void> {
    const template = templateById(id)
    if (!template) return
    await activityRecurrenceService.update(id, { active: !template.active })
    await invalidate()
  }

  async function moveToMonth(id: string, targetMonthKey: string): Promise<string | null> {
    const template = templateById(id)
    if (!template) return null
    const nextStart = dateInMonth(template.rule.startDate, targetMonthKey)
    await activityRecurrenceService.update(id, {
      rule: ruleToApi({ ...template.rule, startDate: nextStart }),
    })
    await invalidate()
    return monthKeyOf(nextStart)
  }

  // ── Escrita na ocorrência ──

  /**
   * Mover um card virtual não passa por aqui: as rotas de escrita de atividade
   * aceitam o id `rec:<id>:<data>` e materializam sozinhas (§4). Esta função
   * existe só para a paridade de superfície com o modo local.
   */
  async function setOccurrenceStatus(
    occurrenceId: string,
    status: ActivityStatus,
  ): Promise<void> {
    await activityService.moveActivity(occurrenceId, { status, position: 0 })
    await invalidate()
  }

  /** Dispensa a data. Idempotente por `(rotina, data)`. */
  async function skipOccurrence(occurrenceId: string): Promise<void> {
    const parsed = parseOccurrenceId(occurrenceId)
    if (!parsed) return
    await activityRecurrenceService.upsertException(parsed.templateId, {
      date: parsed.date,
      kind: 'SKIPPED',
    })
    await invalidate()
  }

  /** Devolve a data ao calendário: o card virtual reaparece no refetch. */
  async function restoreOccurrence(occurrenceId: string): Promise<void> {
    const parsed = parseOccurrenceId(occurrenceId)
    if (!parsed) return
    await activityRecurrenceService.removeException(parsed.templateId, parsed.date)
    await invalidate()
  }

  /**
   * "Voltar ao que o modelo diz".
   *
   * Só desfaz EXCEÇÃO. Quando a data já virou tarefa, desfazer significaria
   * apagar uma `Activity` que pode ter tempo, comentário e anexo em cima — e
   * isso não pode acontecer por um botão de "restaurar padrão". Devolve `false`
   * nesse caso, para a tela dizer que o caminho é apagar a tarefa.
   */
  async function resetOccurrence(occurrenceId: string): Promise<boolean> {
    const parsed = parseOccurrenceId(occurrenceId)
    if (!parsed) return false
    const hasException = exceptionsByRecurrence.value
      .get(parsed.templateId)
      ?.has(parsed.date)
    if (!hasException) return false
    await restoreOccurrence(occurrenceId)
    return true
  }

  // ── Consultas auxiliares ──

  function countInMonth(id: string): number {
    const template = templateById(id)
    if (!template) return 0
    return expandRule(template.rule, range.value.start, range.value.end).length
  }

  function countRuleInMonth(rule: RecurringTemplate['rule']): number {
    return expandRule(rule, range.value.start, range.value.end).length
  }

  return {
    templates,
    monthOccurrences,
    boardOccurrences,
    monthlyFixed,
    scheduled,
    createTemplate,
    updateTemplate,
    removeTemplate,
    toggleActive,
    moveToMonth,
    setOccurrenceStatus,
    skipOccurrence,
    restoreOccurrence,
    resetOccurrence,
    templateById,
    countRuleInMonth,
    countInMonth,
    /** `true` quando as escritas vão para a API — a tela usa para o texto certo. */
    isRemote: true as const,
    today,
  }
}
