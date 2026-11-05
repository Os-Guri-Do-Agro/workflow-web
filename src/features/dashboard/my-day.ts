/**
 * "Meu dia" (spec v2-mobile-e-home, H1): as tarefas da pessoa, de todas as
 * empresas, separadas pelo que ela precisa decidir agora.
 *
 * Derivado do `GET /dashboard/workspace` que a home e o `/board` já pedem
 * (`activities[].isMine`), então não existe endpoint novo nem migration. Lógica
 * pura, sem Vue, para dar para conferir à mão e testar sem montar tela.
 *
 * Cada tarefa cai em UM grupo, o primeiro que ela satisfaz, nesta ordem:
 * 1. Atrasadas: prazo antes de hoje.
 * 2. Para hoje: prazo hoje.
 * 3. Em andamento: status Em andamento (sem prazo vencendo).
 * 4. Em teste: esperando quem testa.
 * 5. Próximos 7 dias: prazo de amanhã a 7 dias.
 * 6. Depois: o resto que ainda está A fazer.
 *
 * Fora do "Meu dia": Concluído (já foi) e Revisados (aprovado, esperando subir:
 * a próxima ação é do deploy, não da pessoa).
 */
import { dateOnlyDiffDays } from '@/utils/date'

export interface WorkspaceActivityLite {
  id: string
  title: string
  status: string
  priority?: number | null
  dueDate?: string | null
  isMine?: boolean
  companyId?: string
  companyName?: string
  monthId?: string
}

export type MyDayGroupKey = 'late' | 'today' | 'doing' | 'testing' | 'soon' | 'later'

export interface MyDayGroup {
  key: MyDayGroupKey
  label: string
  items: WorkspaceActivityLite[]
}

export interface MyDaySummary {
  groups: MyDayGroup[]
  /** Tarefas abertas da pessoa (soma dos grupos). */
  open: number
  late: number
  today: number
}

const GROUP_LABEL: Record<MyDayGroupKey, string> = {
  late: 'Atrasadas',
  today: 'Para hoje',
  doing: 'Em andamento',
  testing: 'Em teste',
  soon: 'Próximos 7 dias',
  later: 'Depois',
}

const GROUP_ORDER: MyDayGroupKey[] = ['late', 'today', 'doing', 'testing', 'soon', 'later']

const CLOSED = new Set(['DONE', 'REVIEWED'])

function normalizeStatus(status: string): string {
  return status === 'TESTING' ? 'IN_TESTING' : status
}

export function groupOf(activity: WorkspaceActivityLite, now: Date = new Date()): MyDayGroupKey | null {
  const status = normalizeStatus(activity.status)
  if (CLOSED.has(status)) return null
  const days = activity.dueDate ? dateOnlyDiffDays(activity.dueDate, now) : null
  if (days !== null && days < 0) return 'late'
  if (days === 0) return 'today'
  if (status === 'IN_PROGRESS') return 'doing'
  if (status === 'IN_TESTING') return 'testing'
  if (days !== null && days <= 7) return 'soon'
  return 'later'
}

/** Prazo mais perto primeiro; sem prazo vai para o fim; empate: maior prioridade. */
function compareItems(a: WorkspaceActivityLite, b: WorkspaceActivityLite): number {
  const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY
  const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY
  if (da !== db) return da - db
  return (Number(b.priority) || 0) - (Number(a.priority) || 0)
}

export function buildMyDay(activities: readonly WorkspaceActivityLite[] | null | undefined, now: Date = new Date()): MyDaySummary {
  const buckets: Record<MyDayGroupKey, WorkspaceActivityLite[]> = {
    late: [], today: [], doing: [], testing: [], soon: [], later: [],
  }
  for (const activity of activities ?? []) {
    if (!activity?.isMine) continue
    const key = groupOf(activity, now)
    if (key) buckets[key].push(activity)
  }
  const groups = GROUP_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    label: GROUP_LABEL[key],
    items: [...buckets[key]].sort(compareItems),
  }))
  return {
    groups,
    open: groups.reduce((sum, g) => sum + g.items.length, 0),
    late: buckets.late.length,
    today: buckets.today.length,
  }
}

/** Link que abre a tarefa no painel sobre o board, valendo para qualquer empresa. */
export function myDayTaskLink(activity: WorkspaceActivityLite): string {
  const params = new URLSearchParams({ task: activity.id })
  if (activity.companyId) params.set('company', activity.companyId)
  return `/board?${params.toString()}`
}
