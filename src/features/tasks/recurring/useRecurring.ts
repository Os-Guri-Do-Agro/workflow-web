/**
 * O ponto único de entrada das tarefas recorrentes.
 *
 * Escolhe entre o modo LOCAL (`localStorage`, o protótipo) e o modo API a
 * partir da flag `RECURRING_API_ENABLED`, e normaliza os dois numa superfície
 * só — **assíncrona**, porque é a forma que o modo remoto exige e envolver o
 * local em `Promise.resolve` custa nada. Assim a tela tem um caminho só, em vez
 * de um `if (isRemote)` em cada handler.
 *
 * A flag é constante de build, então a escolha é determinística por instância
 * de componente: chamar um composable ou outro aqui é seguro.
 */
import type { Ref } from 'vue'
import { RECURRING_API_ENABLED } from '@/config/feature-flags'
import type { ActivityStatus } from '../activity-types'
import type { BoardOccurrence, RecurringOccurrence, RecurringTemplate } from './recurrence-types'
import { useRecurringTasks } from './useRecurringTasks'
import {
  useRecurringApi,
  type BoardCardLike,
  type RecurringBoardPayload,
} from './useRecurringApi'

export interface UseRecurringArgs {
  monthKey: Ref<string>
  companyId: Ref<string>
  /** O payload do board. Ignorado no modo local. */
  board: Ref<RecurringBoardPayload | undefined>
  /** Todos os cards do board, reais e virtuais. Ignorado no modo local. */
  cards: Ref<BoardCardLike[]>
}

export interface RecurringApi {
  templates: Ref<RecurringTemplate[]>
  monthOccurrences: Ref<RecurringOccurrence[]>
  boardOccurrences: Ref<BoardOccurrence[]>
  monthlyFixed: Ref<RecurringOccurrence[]>
  scheduled: Ref<RecurringOccurrence[]>
  createTemplate: (
    template: Omit<RecurringTemplate, 'id' | 'createdAt'>,
    responsibleUserIds?: string[],
  ) => Promise<RecurringTemplate>
  updateTemplate: (
    id: string,
    patch: Partial<RecurringTemplate>,
    responsibleUserIds?: string[],
  ) => Promise<void>
  /** Devolve quantas atividades materializadas sobreviveram (`0` no local). */
  removeTemplate: (id: string) => Promise<number>
  toggleActive: (id: string) => Promise<void>
  moveToMonth: (id: string, targetMonthKey: string) => Promise<string | null>
  setOccurrenceStatus: (occurrenceId: string, status: ActivityStatus) => Promise<void>
  skipOccurrence: (occurrenceId: string) => Promise<void>
  restoreOccurrence: (occurrenceId: string) => Promise<void>
  /** `false` quando não havia o que desfazer — a data já virou tarefa de verdade. */
  resetOccurrence: (occurrenceId: string) => Promise<boolean>
  templateById: (id: string) => RecurringTemplate | null
  countInMonth: (id: string) => number
  countRuleInMonth: (rule: RecurringTemplate['rule']) => number
  /** `true` quando as escritas saem para a API. A tela usa para o texto certo. */
  isRemote: boolean
}

export function useRecurring(args: UseRecurringArgs): RecurringApi {
  if (RECURRING_API_ENABLED) {
    const remote = useRecurringApi(args)
    return {
      templates: remote.templates,
      monthOccurrences: remote.monthOccurrences,
      boardOccurrences: remote.boardOccurrences,
      monthlyFixed: remote.monthlyFixed,
      scheduled: remote.scheduled,
      createTemplate: (template, ids = []) => remote.createTemplate(template, ids),
      updateTemplate: (id, patch, ids) => remote.updateTemplate(id, patch, ids),
      removeTemplate: (id) => remote.removeTemplate(id),
      toggleActive: (id) => remote.toggleActive(id),
      moveToMonth: (id, key) => remote.moveToMonth(id, key),
      setOccurrenceStatus: (id, status) => remote.setOccurrenceStatus(id, status),
      skipOccurrence: (id) => remote.skipOccurrence(id),
      restoreOccurrence: (id) => remote.restoreOccurrence(id),
      resetOccurrence: (id) => remote.resetOccurrence(id),
      templateById: remote.templateById,
      countInMonth: remote.countInMonth,
      countRuleInMonth: remote.countRuleInMonth,
      isRemote: true,
    }
  }

  const local = useRecurringTasks(args.monthKey, args.companyId)
  return {
    templates: local.templates as Ref<RecurringTemplate[]>,
    monthOccurrences: local.monthOccurrences as Ref<RecurringOccurrence[]>,
    boardOccurrences: local.boardOccurrences as Ref<BoardOccurrence[]>,
    monthlyFixed: local.monthlyFixed as Ref<RecurringOccurrence[]>,
    scheduled: local.scheduled as Ref<RecurringOccurrence[]>,
    // O modo local é síncrono; envolver em Promise é o que dá à tela um
    // caminho só. Nenhuma destas pode falhar, então não há erro a propagar.
    createTemplate: (template) => Promise.resolve(local.createTemplate(template)),
    updateTemplate: (id, patch) => {
      local.updateTemplate(id, patch)
      return Promise.resolve()
    },
    removeTemplate: (id) => {
      local.removeTemplate(id)
      return Promise.resolve(0)
    },
    toggleActive: (id) => {
      local.toggleActive(id)
      return Promise.resolve()
    },
    moveToMonth: (id, key) => Promise.resolve(local.moveToMonth(id, key)),
    setOccurrenceStatus: (id, status) => {
      local.setOccurrenceStatus(id, status)
      return Promise.resolve()
    },
    skipOccurrence: (id) => {
      local.skipOccurrence(id)
      return Promise.resolve()
    },
    restoreOccurrence: (id) => {
      local.restoreOccurrence(id)
      return Promise.resolve()
    },
    resetOccurrence: (id) => {
      local.resetOccurrence(id)
      return Promise.resolve(true)
    },
    templateById: local.templateById,
    countInMonth: local.countInMonth,
    countRuleInMonth: local.countRuleInMonth,
    isRemote: false,
  }
}

/** `'YYYY-MM'` do board, quando o servidor já mandou a janela do mês. */
export function monthKeyFromBoard(board: RecurringBoardPayload | undefined): string | null {
  if (board?.from) return board.from.slice(0, 7)
  if (board?.year && board?.monthNumber) {
    return `${board.year}-${String(board.monthNumber).padStart(2, '0')}`
  }
  return null
}

/** Os cards de todas as colunas, numa lista só. */
export function flattenBoardCards(
  payload: Record<string, unknown> | undefined,
  statuses: readonly string[],
): BoardCardLike[] {
  if (!payload) return []
  const out: BoardCardLike[] = []
  for (const status of statuses) {
    const column = payload[status]
    if (Array.isArray(column)) out.push(...(column as BoardCardLike[]))
  }
  return out
}

export const isBoardVirtualCard = (card: { id?: string; isVirtual?: boolean }) =>
  card.isVirtual === true || (typeof card.id === 'string' && card.id.startsWith('rec:'))

