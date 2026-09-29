/**
 * Fonte ÚNICA de status e prioridade das tarefas (spec board-tarefas-redesign,
 * D3 e D6). Board do mês, `/board`, painel, página de detalhe, formulário,
 * rotinas e Roadmap leem daqui: rótulo, cor e ícone.
 *
 * Existia uma escala de prioridade por tela, e duas delas eram opostas: a mesma
 * tarefa com `priorityNumber = 0` aparecia como "P0 Baixíssima" verde no board
 * do mês e "P0 Crítica" vermelha no `/board`. Ícone de status também eram dois
 * conjuntos. Qualquer escala nova entra AQUI, nunca num `Record` local.
 *
 * Os ícones são desenhados à mão em SVG (os do protótipo aprovado), não Lucide:
 * status é círculo vazio, meio cheio, tracejado com ponto e check cheio;
 * prioridade é barras (Baixa, Média, Alta) ou o quadrado de "!" (Urgente).
 * Cada ícone é um componente funcional que aceita `size`, então encaixa em
 * `<component :is="spec.icon" :size="14" />` como um ícone Lucide.
 */
import { h, type FunctionalComponent, type VNode } from 'vue'
import { dateOnlyDiffDays } from '@/utils/date'
import type { ActivityStatus } from './activity-types'

export interface TaskIconProps {
  size?: number | string
}

export type TaskIcon = FunctionalComponent<TaskIconProps>

/** Cria um ícone de 16x16 (viewBox) que escala por `size`. Sempre decorativo. */
function svgIcon(name: string, draw: () => VNode[]): TaskIcon {
  const Icon: TaskIcon = (props) => {
    const size = props.size ?? 14
    return h(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
        class: 'task-icon',
      },
      draw(),
    )
  }
  Icon.props = ['size']
  Icon.displayName = name
  return Icon
}

// ── Status ───────────────────────────────────────────────────────────────────

export interface StatusSpec {
  value: ActivityStatus
  label: string
  /** Cor do status (ícone e marcações pequenas). Nunca fundo de coluna ou borda. */
  token: string
  icon: TaskIcon
}

const TODO_C = 'var(--task-status-todo)'
const PROG_C = 'var(--task-status-prog)'
const TEST_C = 'var(--task-status-test)'
const DONE_C = 'var(--task-status-done)'

const StatusTodoIcon = svgIcon('StatusTodoIcon', () => [
  h('circle', { cx: 8, cy: 8, r: 6, style: { stroke: TODO_C }, 'stroke-width': 1.6 }),
])

const StatusProgressIcon = svgIcon('StatusProgressIcon', () => [
  h('circle', { cx: 8, cy: 8, r: 6, style: { stroke: PROG_C }, 'stroke-width': 1.6 }),
  h('path', { d: 'M8 4a4 4 0 0 1 0 8z', style: { fill: PROG_C } }),
])

const StatusTestingIcon = svgIcon('StatusTestingIcon', () => [
  h('circle', {
    cx: 8,
    cy: 8,
    r: 6,
    style: { stroke: TEST_C },
    'stroke-width': 1.6,
    'stroke-dasharray': '2.4 1.8',
  }),
  h('circle', { cx: 8, cy: 8, r: 2.2, style: { fill: TEST_C } }),
])

const StatusDoneIcon = svgIcon('StatusDoneIcon', () => [
  h('circle', { cx: 8, cy: 8, r: 7, style: { fill: DONE_C } }),
  // O check na cor da superfície: no claro é branco, no escuro é o fundo do card.
  h('path', {
    d: 'm5 8.2 2 2 4-4.2',
    style: { stroke: 'var(--surface)' },
    'stroke-width': 1.8,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }),
])

/** Ordem das colunas do kanban: o segmented do painel segue exatamente esta. */
export const ACTIVITY_STATUSES: readonly StatusSpec[] = [
  { value: 'TODO', label: 'A fazer', token: TODO_C, icon: StatusTodoIcon },
  { value: 'IN_PROGRESS', label: 'Em andamento', token: PROG_C, icon: StatusProgressIcon },
  { value: 'IN_TESTING', label: 'Em teste', token: TEST_C, icon: StatusTestingIcon },
  { value: 'DONE', label: 'Concluído', token: DONE_C, icon: StatusDoneIcon },
] as const

const STATUS_FALLBACK = ACTIVITY_STATUSES[0]!

export function statusSpec(status: string | null | undefined): StatusSpec {
  // `TESTING` é grafia legada de registros antigos e ainda aparece na base.
  const normalized = status === 'TESTING' ? 'IN_TESTING' : status
  return ACTIVITY_STATUSES.find((s) => s.value === normalized) ?? STATUS_FALLBACK
}

// ── Prioridade (D3) ──────────────────────────────────────────────────────────

/**
 * Nível de exibição. O banco guarda `priorityNumber` de 0 a 5 e o mapeamento é
 * CRESCENTE, o mesmo do formulário e do board do mês, onde nasce a maioria dos
 * dados: 0 sem, 1 baixa, 2 média, 3 alta, 4 e 5 urgente. O script
 * `workflow-api/scripts/count-priorities.ts` conta os valores em produção para
 * o dono confirmar (ou corrigir) este mapeamento.
 */
export type PriorityLevel = 0 | 1 | 2 | 3 | 4

export interface PrioritySpec {
  /** Valor gravado quando a pessoa escolhe este nível. */
  value: PriorityLevel
  label: string
  /** Cor do sinal. Só Alta e Urgente têm cor; o resto é cinza. */
  token: string
  icon: TaskIcon
  /**
   * Aparece no card? Só Alta e Urgente: cor e ícone só onde muda decisão (D6).
   * Nas listas, selects e no painel o nível aparece sempre.
   */
  signal: boolean
}

const PRIO_MUTED = 'var(--text-3)'
const PRIO_HIGH = 'var(--prio-high)'
const PRIO_URGENT = 'var(--prio-urgent)'
const BAR_OFF = 'var(--border-strong)'

const NoPriorityIcon = svgIcon('NoPriorityIcon', () => [
  h('path', {
    d: 'M3 8h2M7 8h2M11 8h2',
    style: { stroke: PRIO_MUTED },
    'stroke-width': 1.6,
    'stroke-linecap': 'round',
  }),
])

/** Três barras crescentes; `lit` diz quantas acendem, `on` é a cor acesa. */
function barsIcon(name: string, lit: 1 | 2 | 3, on: string): TaskIcon {
  const bars = [
    { x: 2, y: 9, height: 5 },
    { x: 6.5, y: 6, height: 8 },
    { x: 11, y: 2, height: 12 },
  ]
  return svgIcon(name, () =>
    bars.map((bar, i) =>
      h('rect', {
        x: bar.x,
        y: bar.y,
        width: 3,
        height: bar.height,
        rx: 1,
        style: { fill: i < lit ? on : BAR_OFF },
      }),
    ),
  )
}

const LowPriorityIcon = barsIcon('LowPriorityIcon', 1, PRIO_MUTED)
const MediumPriorityIcon = barsIcon('MediumPriorityIcon', 2, PRIO_MUTED)
const HighPriorityIcon = barsIcon('HighPriorityIcon', 3, PRIO_HIGH)

const UrgentPriorityIcon = svgIcon('UrgentPriorityIcon', () => [
  h('rect', { x: 1, y: 1, width: 14, height: 14, rx: 3, style: { fill: PRIO_URGENT } }),
  h('path', {
    d: 'M8 4v5M8 11.5v.5',
    style: { stroke: 'var(--surface)' },
    'stroke-width': 2,
    'stroke-linecap': 'round',
  }),
])

/** Do menor para o maior: é a ordem dos chips e dos selects. */
export const ACTIVITY_PRIORITIES: readonly PrioritySpec[] = [
  { value: 0, label: 'Sem prioridade', token: PRIO_MUTED, icon: NoPriorityIcon, signal: false },
  { value: 1, label: 'Baixa', token: PRIO_MUTED, icon: LowPriorityIcon, signal: false },
  { value: 2, label: 'Média', token: PRIO_MUTED, icon: MediumPriorityIcon, signal: false },
  { value: 3, label: 'Alta', token: PRIO_HIGH, icon: HighPriorityIcon, signal: true },
  { value: 4, label: 'Urgente', token: PRIO_URGENT, icon: UrgentPriorityIcon, signal: true },
] as const

/**
 * `priorityNumber` (0 a 5, ou lixo) para o nível de exibição.
 *
 * Não usa `Number(x) || fallback`: 0 é valor válido e falsy. Negativo, NaN e
 * ausente viram "Sem prioridade"; 4 e 5 são os dois "Urgente".
 */
export function priorityLevel(priority: unknown): PriorityLevel {
  const n = Math.floor(Number(priority))
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n >= 4) return 4
  return n as PriorityLevel
}

export function prioritySpec(priority: unknown): PrioritySpec {
  return ACTIVITY_PRIORITIES[priorityLevel(priority)]!
}

/** Opções prontas para `AppSelect` (`{ label, value }`), do menor para o maior. */
export const PRIORITY_OPTIONS: { label: string; value: number }[] = ACTIVITY_PRIORITIES.map(
  (p) => ({ label: p.label, value: p.value }),
)

// ── Prazo ────────────────────────────────────────────────────────────────────

export type DueTone = 'late' | 'soon' | null

export interface DueSignal {
  /** "Hoje", "Atrasada 3d" ou "2 out". */
  label: string
  /**
   * `late` = venceu ou vence hoje (vermelho), `soon` = até 7 dias (laranja),
   * `null` = cinza. A regra é a do Linear. Tarefa concluída nunca tem tom.
   */
  tone: DueTone
  /** Data por extenso para o `title` e leitores de tela. */
  full: string
}

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/**
 * Um formatador só, criado uma vez: montar um `Intl.DateTimeFormat` por
 * chamada custava ~20 ms numa Lista de 200 linhas (cada card e cada linha pede
 * o próprio prazo a cada render).
 */
const DUE_FULL = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/**
 * Sinal do prazo para o card e a lista. O dia vem do componente UTC do ISO
 * (a API grava meio-dia UTC), igual a `formatDateOnly` e `dateOnlyDiffDays`.
 */
export function dueSignal(dueDate: string | null | undefined, done = false): DueSignal | null {
  if (!dueDate) return null
  const d = new Date(dueDate)
  if (Number.isNaN(d.getTime())) return null
  const short = `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`
  const full = DUE_FULL.format(d)
  if (done) return { label: short, tone: null, full }
  const days = dateOnlyDiffDays(dueDate)
  if (days < 0) return { label: `Atrasada ${-days}d`, tone: 'late', full }
  if (days === 0) return { label: 'Hoje', tone: 'late', full }
  return { label: short, tone: days <= 7 ? 'soon' : null, full }
}
