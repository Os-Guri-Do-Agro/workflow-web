import {
  CheckCircle2,
  Circle,
  Clock,
  FlaskConical,
  type LucideIcon,
} from 'lucide-vue-next'
import { normalizePriority } from '@/utils/priority'
import type { ActivityStatus } from './activity-types'

export interface StatusSpec {
  value: ActivityStatus
  label: string
  token: string
  icon: LucideIcon
}

/** Ordem das colunas do kanban: o segmented do painel segue exatamente esta. */
export const ACTIVITY_STATUSES: readonly StatusSpec[] = [
  { value: 'TODO', label: 'A fazer', token: 'var(--status-todo)', icon: Circle },
  { value: 'IN_PROGRESS', label: 'Em andamento', token: 'var(--status-prog)', icon: Clock },
  { value: 'IN_TESTING', label: 'Em teste', token: 'var(--status-test)', icon: FlaskConical },
  { value: 'DONE', label: 'Concluído', token: 'var(--status-done)', icon: CheckCircle2 },
] as const

const STATUS_FALLBACK = ACTIVITY_STATUSES[0]!

export function statusSpec(status: string | null | undefined): StatusSpec {
  // `TESTING` é grafia legada de registros antigos e ainda aparece na base.
  const normalized = status === 'TESTING' ? 'IN_TESTING' : status
  return ACTIVITY_STATUSES.find((s) => s.value === normalized) ?? STATUS_FALLBACK
}

export interface PrioritySpec {
  value: number
  /** Rótulo curto para chips e pills ("P0"). */
  short: string
  /** Rótulo completo para selects e leitores de tela ("P0 · Crítica"). */
  label: string
  token: string
}

/**
 * Escala P0 = mais crítica, igual à do `/board` e à referência Azure/Jira que o
 * dono cita. O detalhe antigo e o kanban do mês usavam escalas invertidas entre
 * si; aqui o painel novo fica alinhado com o board onde ele abre.
 */
export const ACTIVITY_PRIORITIES: readonly PrioritySpec[] = [
  { value: 0, short: 'P0', label: 'P0 · Crítica', token: 'var(--err)' },
  { value: 1, short: 'P1', label: 'P1 · Alta', token: 'var(--warn)' },
  { value: 2, short: 'P2', label: 'P2 · Média', token: 'var(--info)' },
  { value: 3, short: 'P3', label: 'P3 · Baixa', token: 'var(--text-3)' },
] as const

export function prioritySpec(priority: unknown): PrioritySpec {
  // `normalizePriority` porque P0 vale 0 e `Number(x) || fallback` rebaixaria.
  const value = normalizePriority(priority, 1)
  const known = ACTIVITY_PRIORITIES.find((p) => p.value === value)
  if (known) return known
  return {
    value,
    short: `P${value}`,
    label: `P${value}`,
    token: 'var(--text-3)',
  }
}
