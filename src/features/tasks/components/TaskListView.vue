<script setup lang="ts">
/**
 * Vista Lista do board do mês (spec board-tarefas-redesign, D11; direção C do
 * protótipo aprovado). As MESMAS tarefas do Board, já filtradas pela toolbar,
 * agrupadas por status em grupos recolhíveis, uma por linha de 36px:
 *
 *   checkbox · prioridade · chave · status · título · tags · 3/6 · prazo · pessoas
 *
 * O que a Lista acrescenta ao Board é a seleção múltipla e a barra de massa
 * (Status, Responsável, Prioridade, Mês e Excluir).
 *
 * Regras que não são óbvias:
 * - A lista NÃO guarda cópia de tarefa: lê as colunas filtradas do TasksView e
 *   aplica o otimismo pelo mesmo `applyPatch` do painel (S3), que mexe no ref
 *   que o arraste e o realtime também mexem.
 * - Rotina virtual (`rec:*`) aparece, mas sem checkbox e fora da seleção (não
 *   tem linha no banco). O clique dela é o do board: abre o gerenciador. O card
 *   otimista da criação inline (`tmp:*`) também: esmaecido, sem chave, sem
 *   checkbox e fora da seleção e do J/K do painel, até o POST responder.
 * - Status em massa vai em SÉRIE pelo `PATCH /move` no fim da coluna (o mesmo
 *   caminho do lozenge do painel). Em paralelo, dois `/move` saindo da mesma
 *   coluna renumeram as mesmas linhas em ordem cruzada dentro de transações
 *   (`compactColumn` + `reorderColumn` na API) e o Postgres aborta um deles por
 *   deadlock. Em série, a ordem final no servidor é também a ordem da tela, e
 *   nada pula no refetch. Prioridade, responsável, mês e exclusão só tocam a
 *   própria linha e vão em paralelo (`Promise.allSettled`).
 * - Teclado (J/K, setas, Enter/O, X, Esc) só existe enquanto a Lista está
 *   montada e sem menu ou diálogo na frente; o do board (`useTaskKeyboard`)
 *   fica com C, / e ?. Com o painel aberto sobre a Lista, J/K e ↑/↓ trocam a
 *   tarefa do painel na ordem da LISTA (`switch-panel`).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { ChevronDown, ListChecks, Plus, Repeat } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { tagColorVar } from '@/components/ui/tag-palette'
import activityService from '@/service/activities/activity-service'
import { useToast } from '@/composables/useToast'
import { avatarTone, initials } from '@/utils/avatar'
import { safeStorage } from '@/utils/safe-storage'
import {
  ACTIVITY_STATUSES,
  dueSignal,
  priorityLevel,
  prioritySpec,
  statusSpec,
  type DueSignal,
  type PriorityLevel,
  type PrioritySpec,
  type StatusSpec,
} from '../task-meta'
import { taskKey } from '../task-key'
import { isOccurrenceId } from '../recurring/recurrence-types'
import { isPendingTaskId } from '../pending-task'
import { useTaskSelection } from '../composables/useTaskSelection'
import { isOverlayOverPanel } from '../composables/useTaskKeyboard'
import type { ActivityDetail, ActivityResponsible, ActivityStatus } from '../activity-types'
import TaskBulkBar, { type BulkMonthGroup, type BulkPerson } from './TaskBulkBar.vue'

/** O mínimo do card do board que a linha lê (o `BoardTask` do TasksView cabe aqui). */
export interface TaskListTask {
  id: string
  title?: string
  priorityNumber?: number
  dueDate?: string | null
  responsibles?: Array<{ userId?: string; user: { id?: string; name: string } }>
  tags?: Array<{ tag: { id: string; name: string; slug: string; color: string | null } }>
  subtasks?: Array<{ id: string; title: string; status: string }>
  /** Rótulo da regra, só no card virtual de rotina ("Toda semana · seg"). */
  recurrence?: string
}

/** `/company/:id/members` devolve `{ userId, user }`; tipos antigos têm `{ id, name }`. */
interface ListMember {
  id?: string
  name?: string
  userId?: string
  user?: { id?: string; name?: string } | null
}

interface ListQuarter {
  id?: string
  label?: string
  name?: string
  months?: Array<{ id: string; name: string }>
}

const props = withDefaults(
  defineProps<{
    /** Colunas JÁ filtradas pela toolbar (reais e rotinas virtuais). */
    tasks: Partial<Record<ActivityStatus, TaskListTask[]>>
    /** Prefixo da chave (`PJ-K7Q2XM`). */
    companyName?: string | null
    /** Sem checkbox, sem barra de massa e sem "+" (quem não edita a empresa). */
    readonly?: boolean
    members?: ListMember[]
    quarters?: ListQuarter[]
    /** Mês do board: o menu "Mês" oferece os outros meses do trimestre e os vizinhos. */
    monthId: string
    /** Tarefa aberta no painel (`?task=`): a linha fica marcada e recebe o foco ao fechar. */
    openTaskId?: string | null
    /** Otimismo no ref do board (o `applyPanelPatch` do TasksView). */
    applyPatch: (id: string, patch: Partial<ActivityDetail>) => void
    /** Troca de status pelo caminho do board (`PATCH /move` no fim da coluna). */
    writeStatus: (id: string, status: string) => Promise<unknown>
    /**
     * Refetch do board do mês que também reaplica o resultado nas colunas (o
     * `refreshTasks` do TasksView). Um `invalidateQueries` sozinho não desfazia
     * o otimismo: o refetch igual ao cache não muda a referência do `data`.
     */
    refresh: () => Promise<unknown>
  }>(),
  { companyName: null, readonly: false, members: () => [], quarters: () => [], openTaskId: null },
)

const emit = defineEmits<{
  /** Clique ou Enter numa linha. Rotina virtual: quem chama abre o gerenciador. */
  open: [task: TaskListTask]
  /** "+" do cabeçalho do grupo: criar já com o status escolhido. */
  'create-in': [status: ActivityStatus]
  /** J/K com o painel aberto: trocar a tarefa do painel (sem empilhar histórico). */
  'switch-panel': [id: string]
}>()

const queryClient = useQueryClient()
const { success: showSuccess, error: showError, info: showInfo } = useToast()

// ── Linhas ───────────────────────────────────────────────────────────────────

const MAX_TAGS = 2
const MAX_AVATARS = 2

interface ListRow {
  task: TaskListTask
  id: string
  status: ActivityStatus
  virtual: boolean
  /** Card otimista da criação inline (`tmp:*`): ainda não existe no servidor. */
  pending: boolean
  key: string | null
  title: string
  prio: PrioritySpec
  due: DueSignal | null
  tags: Array<{ id: string; name: string; color: string }>
  extraTags: string[]
  sub: { done: number; total: number } | null
  people: string[]
  extraPeople: string[]
}

function toRow(task: TaskListTask, status: ActivityStatus): ListRow {
  const tags = (task.tags ?? []).map((link) => link.tag)
  const people = (task.responsibles ?? []).map((r) => r.user.name)
  const subtasks = task.subtasks ?? []
  return {
    task,
    id: task.id,
    status,
    virtual: isOccurrenceId(task.id),
    pending: isPendingTaskId(task.id),
    key: taskKey(task, props.companyName),
    title: task.title ?? '',
    prio: prioritySpec(task.priorityNumber),
    due: dueSignal(task.dueDate, status === 'DONE'),
    tags: tags.slice(0, MAX_TAGS).map((t) => ({ id: t.id, name: t.name, color: tagColorVar(t) })),
    extraTags: tags.slice(MAX_TAGS).map((t) => t.name),
    sub: subtasks.length
      ? { done: subtasks.filter((s) => s.status === 'DONE').length, total: subtasks.length }
      : null,
    people: people.slice(0, MAX_AVATARS),
    extraPeople: people.slice(MAX_AVATARS),
  }
}

// ── Grupos recolhíveis (preferência de quem olha, como a coluna recolhida) ──

const COLLAPSED_KEY = 'workflow:tasks-list:collapsed-groups:v1'
const STATUS_VALUES = ACTIVITY_STATUSES.map((s) => s.value)

function readCollapsed(): ActivityStatus[] {
  try {
    const parsed: unknown = JSON.parse(safeStorage.getItem(COLLAPSED_KEY) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter((s): s is ActivityStatus => STATUS_VALUES.includes(s))
      : []
  } catch {
    return []
  }
}

const collapsed = ref<ActivityStatus[]>(readCollapsed())

function toggleGroup(status: ActivityStatus) {
  collapsed.value = collapsed.value.includes(status)
    ? collapsed.value.filter((s) => s !== status)
    : [...collapsed.value, status]
  if (collapsed.value.length) safeStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed.value))
  else safeStorage.removeItem(COLLAPSED_KEY)
}

interface ListGroup {
  spec: StatusSpec
  rows: ListRow[]
  collapsed: boolean
}

const groups = computed<ListGroup[]>(() =>
  ACTIVITY_STATUSES.map((spec) => ({
    spec,
    rows: (props.tasks[spec.value] ?? []).map((t) => toRow(t, spec.value)),
    collapsed: collapsed.value.includes(spec.value),
  })),
)

const allRows = computed(() => groups.value.flatMap((g) => g.rows))
/** O que está na tela: grupos abertos, na ordem de cima para baixo. */
const visibleRows = computed(() => groups.value.flatMap((g) => (g.collapsed ? [] : g.rows)))
const totalShown = computed(() => allRows.value.length)

/**
 * Linha com tarefa de verdade no servidor: nem rotina virtual (`rec:*`) nem o
 * card otimista da criação inline (`tmp:*`). Só estas entram na seleção, na
 * massa e na troca de tarefa do painel.
 */
const isReal = (row: ListRow) => !row.virtual && !row.pending

// ── Seleção ──────────────────────────────────────────────────────────────────

const canSelect = computed(() => !props.readonly)

const selection = useTaskSelection({
  order: computed(() => visibleRows.value.filter(isReal).map((r) => r.id)),
  available: computed(() => new Set(allRows.value.filter(isReal).map((r) => r.id))),
})

/** As selecionadas na ordem da lista (grupos recolhidos incluídos). */
const selectedRows = () => allRows.value.filter((r) => selection.isSelected(r.id))

const selecting = computed(() => canSelect.value && selection.count.value > 0)

// ── Foco de teclado (tabindex itinerante: um Tab entra na lista, não 200) ──

const focusedId = ref<string | null>(null)
const rootEl = ref<HTMLElement | null>(null)

const rowEl = (id: string) =>
  rootEl.value?.querySelector<HTMLElement>(`.row[data-id="${CSS.escape(id)}"]`) ?? null

const tabStop = computed(() => {
  const ids = visibleRows.value.map((r) => r.id)
  return focusedId.value && ids.includes(focusedId.value) ? focusedId.value : (ids[0] ?? null)
})

function focusRow(id: string) {
  focusedId.value = id
  void nextTick(() => {
    const el = rowEl(id)
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'nearest' })
  })
}

function stepFocus(delta: 1 | -1) {
  const ids = visibleRows.value.map((r) => r.id)
  if (!ids.length) return
  const at = focusedId.value ? ids.indexOf(focusedId.value) : -1
  const next = at === -1 ? ids[0] : ids[Math.max(0, Math.min(ids.length - 1, at + delta))]
  if (next) focusRow(next)
}

// ── Gestos do mouse ─────────────────────────────────────────────────────────

function onRowClick(row: ListRow, event: MouseEvent) {
  focusedId.value = row.id
  const modified = event.ctrlKey || event.metaKey || event.shiftKey
  if (modified && canSelect.value) {
    // Rotina e card otimista não entram na seleção; o gesto de selecionar não
    // abre nada neles.
    if (!isReal(row)) return
    if (event.shiftKey) selection.selectRange(row.id)
    else selection.toggle(row.id)
    return
  }
  emit('open', row.task)
}

function onCheckbox(row: ListRow, event: MouseEvent) {
  focusedId.value = row.id
  if (event.shiftKey) selection.selectRange(row.id)
  else selection.toggle(row.id)
}

// ── Teclado da lista ─────────────────────────────────────────────────────────

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

const isVisibleOverlay = (selector: string) =>
  [...document.querySelectorAll<HTMLElement>(selector)].some((el) => el.getClientRects().length > 0)

/**
 * Painel aberto sobre a Lista: J/K e ↑/↓ trocam a tarefa do painel na ordem da
 * LISTA (grupos abertos, sem rotina virtual, que abre o gerenciador). O teclado
 * do board (`useTaskKeyboard`) só faz isso com o Board à frente.
 */
function stepPanel(delta: 1 | -1) {
  const current = props.openTaskId
  const order = visibleRows.value.filter(isReal).map((r) => r.id)
  if (!current || !order.length) return
  const at = order.indexOf(current)
  const next = at === -1 ? order[delta > 0 ? 0 : order.length - 1] : order[at + delta]
  if (next && next !== current) emit('switch-panel', next)
}

function onKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) return
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (isTypingTarget(event.target)) return
  const key = event.key
  const next = key === 'j' || key === 'J' || key === 'ArrowDown'
  const prev = key === 'k' || key === 'K' || key === 'ArrowUp'

  if (props.openTaskId) {
    // O painel é um diálogo; o que bloqueia é menu ou outro diálogo por cima
    // dele (confirmação de exclusão, criação, visualizador de arquivo, destino
    // do markdown). Esc e o resto são do painel.
    if (isVisibleOverlay('[role="menu"], .dlg-overlay') || isOverlayOverPanel(event.target)) return
    if (next || prev) {
      event.preventDefault()
      stepPanel(next ? 1 : -1)
    }
    return
  }

  // Menu (status, filtros) ou diálogo (criação, rotinas, confirmação) na frente.
  if (isVisibleOverlay('[role="menu"], [role="dialog"], [role="alertdialog"]')) return

  const target = event.target as HTMLElement | null
  // Esc limpa a seleção de qualquer lugar da lista, inclusive da própria barra.
  if (key === 'Escape') {
    if (selection.count.value > 0) {
      event.preventDefault()
      selection.clear()
    }
    return
  }
  // Na barra, o teclado é dos botões dela.
  if (target?.closest?.('.bulk')) return
  // Enter/O num botão de verdade (toolbar, "+" do grupo) é do botão.
  const onButton = !!target?.closest?.('button, a[href]')

  if (next || prev) {
    event.preventDefault()
    stepFocus(next ? 1 : -1)
  } else if ((key === 'Enter' || key === 'o' || key === 'O') && !onButton) {
    const row = visibleRows.value.find((r) => r.id === focusedId.value)
    if (!row) return
    event.preventDefault()
    emit('open', row.task)
  } else if (key === 'x' || key === 'X') {
    if (!canSelect.value) return
    const row = visibleRows.value.find((r) => r.id === focusedId.value)
    if (!row || !isReal(row)) return
    event.preventDefault()
    if (event.shiftKey) selection.selectRange(row.id)
    else selection.toggle(row.id)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// Painel: J/K dentro dele trocam a tarefa, e a linha acompanha; ao fechar, o
// foco volta para a linha da tarefa que estava aberta (a do último J/K).
watch(
  () => props.openTaskId,
  (id, previous) => {
    if (id) {
      focusedId.value = id
      void nextTick(() => rowEl(id)?.scrollIntoView({ block: 'nearest' }))
    } else if (previous) {
      void nextTick(() => focusRow(previous))
    }
  },
)

// ── Barra de massa: o que os menus mostram ──────────────────────────────────

const commonStatus = computed<ActivityStatus | null>(() => {
  const rows = selectedRows()
  const first = rows[0]?.status
  return first && rows.every((r) => r.status === first) ? first : null
})

const commonPriority = computed<PriorityLevel | null>(() => {
  const rows = selectedRows()
  if (!rows.length) return null
  const first = priorityLevel(rows[0]!.task.priorityNumber)
  return rows.every((r) => priorityLevel(r.task.priorityNumber) === first) ? first : null
})

const personId = (r: { userId?: string; user: { id?: string } }) => r.userId ?? r.user.id ?? ''

const memberList = computed(() =>
  (props.members ?? [])
    .map((m) => ({ id: m.user?.id ?? m.userId ?? m.id ?? '', name: m.user?.name ?? m.name ?? '' }))
    .filter((m) => m.id && m.name),
)

const bulkPeople = computed<BulkPerson[]>(() => {
  const rows = selectedRows()
  return memberList.value.map((m) => {
    const having = rows.filter((r) => (r.task.responsibles ?? []).some((x) => personId(x) === m.id)).length
    const state = having === 0 ? 'none' : having === rows.length ? 'all' : 'some'
    return { ...m, state }
  })
})

/** Os outros meses do trimestre e os dois vizinhos (que podem ser de outro trimestre). */
const monthGroups = computed<BulkMonthGroup[]>(() => {
  const flat = (props.quarters ?? []).flatMap((q, qi) =>
    (q.months ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      groupKey: q.id ?? `q${qi}`,
      groupLabel: q.label ?? q.name ?? '',
    })),
  )
  const at = flat.findIndex((m) => m.id === props.monthId)
  if (at === -1) return []
  const here = flat[at]!.groupKey
  const out: BulkMonthGroup[] = []
  flat.forEach((m, i) => {
    if (i === at) return
    if (m.groupKey !== here && i !== at - 1 && i !== at + 1) return
    let group = out.find((g) => g.key === m.groupKey)
    if (!group) {
      group = { key: m.groupKey, label: m.groupLabel, months: [] }
      out.push(group)
    }
    group.months.push({ id: m.id, name: m.name })
  })
  return out
})

// ── Aplicar em massa ────────────────────────────────────────────────────────

const busy = ref(false)

interface BulkOutcome {
  ok: string[]
  failed: string[]
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Grava cada tarefa e desfaz, uma a uma, as que falharem. Em série só quando a
 * ordem importa e o servidor renumera (status); o resto vai em paralelo.
 */
async function settleEach(
  ids: string[],
  write: (id: string) => Promise<unknown>,
  rollback: (id: string) => void,
  serial = false,
): Promise<BulkOutcome> {
  const ok: string[] = []
  const failed: string[] = []
  if (serial) {
    for (const id of ids) {
      try {
        await write(id)
        ok.push(id)
      } catch {
        rollback(id)
        failed.push(id)
      }
    }
    return { ok, failed }
  }
  const results = await Promise.allSettled(ids.map((id) => write(id)))
  results.forEach((result, i) => {
    const id = ids[i]!
    if (result.status === 'fulfilled') ok.push(id)
    else {
      rollback(id)
      failed.push(id)
    }
  })
  return { ok, failed }
}

/**
 * Traz a verdade do servidor: board do mês (e o de destino, se mudou), histórico
 * e detalhes. O board do mês vem pelo `refresh`, que também reaplica o
 * resultado nas colunas: é o que desfaz o que o rollback por item não desfaz
 * (a ordem da coluna, ou um valor mais novo que chegou no meio da massa). Os
 * outros meses só ficam velhos (`refetchType: 'none'`): um refetch do
 * `['boards']` inteiro em paralelo cancelaria o do `refresh`.
 */
async function refreshAfterBulk() {
  await queryClient.invalidateQueries({ queryKey: ['boards'], refetchType: 'none' })
  await Promise.all([
    props.refresh(),
    queryClient.invalidateQueries({ queryKey: ['backlog'] }),
    queryClient.invalidateQueries({ queryKey: ['activity'] }),
  ])
}

/**
 * Resumo em um toast ("3 atualizadas, 1 falhou"). O que falhou continua
 * selecionado para tentar de novo. Sem falha, a ação que tira a tarefa do
 * lugar (status, mês, exclusão) solta a seleção que ela usou (`release`, que
 * inclui as que já estavam no destino) e a barra some; prioridade e
 * responsável mantêm a seleção para encadear outra edição.
 */
function finish(
  outcome: BulkOutcome,
  successText: string,
  doneWord: { one: string; many: string },
  release: readonly string[] | null,
) {
  const { ok, failed } = outcome
  if (!failed.length) showSuccess(successText)
  else if (!ok.length)
    showError(
      failed.length === 1
        ? 'Não foi possível atualizar a tarefa. Ela continua selecionada.'
        : `Não foi possível atualizar as ${failed.length} tarefas. Elas continuam selecionadas.`,
    )
  else showError(`${plural(ok.length, doneWord.one, doneWord.many)}, ${plural(failed.length, 'falhou', 'falharam')}`)

  if (failed.length) selection.set(failed)
  else if (release) selection.remove(release)
}

const UPDATED = { one: 'atualizada', many: 'atualizadas' }

async function bulkStatus(status: ActivityStatus) {
  if (busy.value) return
  const label = statusSpec(status).label
  const picked = selectedRows()
  const targets = picked.filter((r) => r.status !== status)
  if (!targets.length) {
    showInfo(`Nada a mudar: já estão em ${label}`)
    return
  }
  busy.value = true
  const previous = new Map(targets.map((r) => [r.id, r.status]))
  // Na ordem da lista: cada uma vai para o fim da coluna nova, e a série de
  // `/move` abaixo grava a mesma ordem no servidor.
  for (const row of targets) props.applyPatch(row.id, { status })
  try {
    const outcome = await settleEach(
      targets.map((r) => r.id),
      (id) => props.writeStatus(id, status),
      (id) => props.applyPatch(id, { status: previous.get(id) }),
      true,
    )
    await refreshAfterBulk()
    finish(
      outcome,
      `${plural(outcome.ok.length, 'movida', 'movidas')} para ${label}`,
      UPDATED,
      picked.map((r) => r.id),
    )
  } finally {
    busy.value = false
  }
}

async function bulkPriority(level: PriorityLevel) {
  if (busy.value) return
  const label = prioritySpec(level).label
  const targets = selectedRows().filter((r) => priorityLevel(r.task.priorityNumber) !== level)
  if (!targets.length) {
    showInfo(`Nada a mudar: já estão com prioridade ${label}`)
    return
  }
  busy.value = true
  const previous = new Map(targets.map((r) => [r.id, r.task.priorityNumber ?? 0]))
  for (const row of targets) props.applyPatch(row.id, { priorityNumber: level })
  try {
    const outcome = await settleEach(
      targets.map((r) => r.id),
      (id) => activityService.patchActivity(id, { priorityNumber: level }),
      (id) => props.applyPatch(id, { priorityNumber: previous.get(id) ?? 0 }),
    )
    await refreshAfterBulk()
    finish(outcome, `Prioridade ${label} em ${plural(outcome.ok.length, 'tarefa', 'tarefas')}`, UPDATED, null)
  } finally {
    busy.value = false
  }
}

const asResponsibles = (list: TaskListTask['responsibles']): ActivityResponsible[] =>
  (list ?? []).map((r) => ({ userId: personId(r), user: { id: personId(r), name: r.user.name } }))

/**
 * Responsável: todas já têm a pessoa → tira de todas; senão → põe nas que
 * faltam. O PATCH leva a lista COMPLETA de cada tarefa (`responsibleUserIds`
 * substitui), então quem já estava continua.
 */
async function bulkPerson(person: BulkPerson) {
  if (busy.value) return
  const rows = selectedRows()
  const has = (r: ListRow) => (r.task.responsibles ?? []).some((x) => personId(x) === person.id)
  const removing = rows.length > 0 && rows.every(has)
  const targets = removing ? rows : rows.filter((r) => !has(r))
  if (!targets.length) return
  busy.value = true
  const previous = new Map(targets.map((r) => [r.id, asResponsibles(r.task.responsibles)]))
  const next = new Map(
    targets.map((r) => {
      const current = previous.get(r.id) ?? []
      return [
        r.id,
        removing
          ? current.filter((x) => x.userId !== person.id)
          : [...current, { userId: person.id, user: { id: person.id, name: person.name } }],
      ]
    }),
  )
  for (const row of targets) props.applyPatch(row.id, { responsibles: next.get(row.id) })
  try {
    const outcome = await settleEach(
      targets.map((r) => r.id),
      (id) => {
        const ids = (next.get(id) ?? []).map((x) => x.userId)
        // Sem id não dá para regravar a lista sem perder alguém: falha esta.
        if (ids.some((x) => !x)) return Promise.reject(new Error('responsável sem id'))
        return activityService.patchActivity(id, { responsibleUserIds: ids })
      },
      (id) => props.applyPatch(id, { responsibles: previous.get(id) ?? [] }),
    )
    await refreshAfterBulk()
    const first = person.name.trim().split(/\s+/)[0] ?? person.name
    const n = plural(outcome.ok.length, 'tarefa', 'tarefas')
    finish(outcome, removing ? `${first} saiu de ${n}` : `${first} agora é responsável por ${n}`, UPDATED, null)
  } finally {
    busy.value = false
  }
}

/**
 * Mês: `PATCH /activity/:id { monthId }` (o prazo acompanha o mês na API). As
 * tarefas saem deste board na hora; a que falhar volta para a coluna e a
 * posição de onde saiu (o `applyPatch` guarda o card), e o refetch confirma.
 */
async function bulkMonth(month: { id: string; name: string }) {
  if (busy.value || month.id === props.monthId) return
  const targets = selectedRows()
  if (!targets.length) return
  busy.value = true
  for (const row of targets) props.applyPatch(row.id, { monthId: month.id })
  try {
    const outcome = await settleEach(
      targets.map((r) => r.id),
      (id) => activityService.patchActivity(id, { monthId: month.id }),
      (id) => props.applyPatch(id, { monthId: props.monthId }),
    )
    await refreshAfterBulk()
    finish(
      outcome,
      `${plural(outcome.ok.length, 'movida', 'movidas')} para ${month.name}`,
      UPDATED,
      targets.map((r) => r.id),
    )
  } finally {
    busy.value = false
  }
}

// ── Excluir (com confirmação) ───────────────────────────────────────────────

const confirmOpen = ref(false)
const deleting = ref(false)
const deleteTargets = ref<ListRow[]>([])

const deleteMessage = computed(() => {
  const list = deleteTargets.value
  if (list.length === 1) {
    return `Tem certeza que deseja excluir “${list[0]!.title}”? Essa ação não pode ser desfeita.`
  }
  return `Tem certeza que deseja excluir ${list.length} tarefas? Essa ação não pode ser desfeita.`
})

/** HTTP status de um erro do axios (ou `undefined`). */
const httpStatus = (error: unknown) =>
  (error as { response?: { status?: number } } | null)?.response?.status

/**
 * Exclui uma tarefa. 404 conta como sucesso: a tarefa já não existe (outra
 * pessoa a excluiu enquanto a confirmação estava aberta), que é o que se pediu.
 * Tratá-la como falha deixava na seleção uma tarefa que nem está mais na lista.
 */
async function deleteOne(id: string): Promise<void> {
  try {
    await activityService.deleteActivity(id)
  } catch (error: unknown) {
    if (httpStatus(error) === 404) return
    throw error
  }
}

function requestDelete() {
  if (busy.value) return
  deleteTargets.value = selectedRows()
  if (deleteTargets.value.length) confirmOpen.value = true
}

async function confirmDelete() {
  if (deleting.value) return
  const ids = deleteTargets.value.map((r) => r.id)
  deleting.value = true
  busy.value = true
  try {
    const outcome = await settleEach(ids, deleteOne, () => {})
    await refreshAfterBulk()
    confirmOpen.value = false
    finish(
      outcome,
      outcome.ok.length === 1 ? 'Tarefa excluída' : `${outcome.ok.length} tarefas excluídas`,
      { one: 'excluída', many: 'excluídas' },
      ids,
    )
  } finally {
    deleting.value = false
    busy.value = false
  }
}

watch(confirmOpen, (open) => {
  if (!open && !deleting.value) deleteTargets.value = []
})
</script>

<template>
  <div
    ref="rootEl"
    class="list-view"
    :class="{ 'list-view--selecting': selecting, 'list-view--readonly': readonly }"
  >
    <div class="list-scroll">
      <div
        class="list"
        role="grid"
        aria-label="Tarefas do mês em lista"
        :aria-multiselectable="canSelect ? 'true' : undefined"
      >
        <div
          v-for="group in groups"
          :key="group.spec.value"
          class="grp"
          :class="{ 'grp--collapsed': group.collapsed }"
          role="rowgroup"
        >
          <div class="grp-h" role="row">
            <div class="grp-h__cell" role="rowheader">
              <button
                type="button"
                class="grp-h__toggle"
                :aria-expanded="!group.collapsed"
                :aria-label="`${group.collapsed ? 'Expandir' : 'Recolher'} ${group.spec.label}, ${plural(group.rows.length, 'tarefa', 'tarefas')}`"
                @click="toggleGroup(group.spec.value)"
              >
                <ChevronDown :size="14" :stroke-width="1.8" class="grp-h__chev" aria-hidden="true" />
                <component :is="group.spec.icon" :size="14" />
                <span class="grp-h__name">{{ group.spec.label }}</span>
                <span class="grp-h__count">{{ group.rows.length }}</span>
              </button>
              <button
                v-if="!readonly"
                type="button"
                class="grp-h__add"
                :aria-label="`Criar tarefa em ${group.spec.label}`"
                :title="`Criar tarefa em ${group.spec.label}`"
                @click="emit('create-in', group.spec.value)"
              >
                <Plus :size="14" :stroke-width="1.8" />
              </button>
            </div>
          </div>

          <template v-if="!group.collapsed">
            <div
              v-for="row in group.rows"
              :key="row.id"
              class="row"
              :class="{
                'row--selected': selection.isSelected(row.id),
                'row--done': row.status === 'DONE',
                'row--open': openTaskId === row.id,
                'row--virtual': row.virtual,
                'row--pending': row.pending,
              }"
              role="row"
              :data-id="row.id"
              :tabindex="tabStop === row.id ? 0 : -1"
              :aria-selected="canSelect && isReal(row) ? selection.isSelected(row.id) : undefined"
              :aria-busy="row.pending ? 'true' : undefined"
              @click="onRowClick(row, $event)"
              @focus="focusedId = row.id"
            >
              <span class="c-check" role="gridcell">
                <button
                  v-if="canSelect && isReal(row)"
                  type="button"
                  class="cb"
                  role="checkbox"
                  tabindex="-1"
                  :aria-checked="selection.isSelected(row.id)"
                  :aria-label="`Selecionar ${row.key ?? row.title}`"
                  @click.stop="onCheckbox(row, $event)"
                >
                  <span class="cb__box" aria-hidden="true">
                    <svg v-if="selection.isSelected(row.id)" width="10" height="10" viewBox="0 0 16 16" fill="none">
                      <path d="m3 8.5 3.2 3.2L13 4.8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </span>
                </button>
              </span>

              <span
                class="c-prio"
                role="gridcell"
                :aria-label="`Prioridade ${row.prio.label}`"
                :title="`Prioridade ${row.prio.label}`"
              >
                <component :is="row.prio.icon" :size="14" />
              </span>

              <span v-if="row.key" class="c-key" role="gridcell">{{ row.key }}</span>
              <!-- Card otimista: ainda sem chave (ela nasce com o id do servidor). -->
              <span v-else-if="row.pending" class="c-key" role="gridcell" title="Criando a tarefa" />
              <span
                v-else
                class="c-key c-key--rule"
                role="gridcell"
                :title="row.task.recurrence ? `Repete: ${row.task.recurrence}` : 'Rotina'"
              >
                <Repeat :size="12" :stroke-width="1.6" aria-hidden="true" />
                Rotina
              </span>

              <span class="c-status" role="gridcell" :aria-label="group.spec.label" :title="group.spec.label">
                <component :is="group.spec.icon" :size="14" />
              </span>

              <span class="c-title" role="gridcell" :title="row.title">{{ row.title }}</span>

              <span class="c-tags" role="gridcell">
                <span v-for="tag in row.tags" :key="tag.id" class="tag" :style="{ '--tc': tag.color }">
                  <span class="tag__dot" aria-hidden="true" />
                  <span class="tag__name">{{ tag.name }}</span>
                </span>
                <span v-if="row.extraTags.length" class="tag tag--more" :title="row.extraTags.join(', ')">
                  +{{ row.extraTags.length }}
                </span>
              </span>

              <span
                class="c-sub"
                role="gridcell"
                :title="row.sub ? `${row.sub.done} de ${row.sub.total} subtarefas concluídas` : undefined"
              >
                <template v-if="row.sub">
                  <ListChecks :size="12" :stroke-width="1.6" aria-hidden="true" />
                  {{ row.sub.done }}/{{ row.sub.total }}
                </template>
              </span>

              <span
                class="c-due"
                role="gridcell"
                :class="row.due?.tone ? `c-due--${row.due.tone}` : null"
                :title="row.due ? `Prazo: ${row.due.full}` : undefined"
              >
                {{ row.due?.label ?? '' }}
              </span>

              <span class="c-people" role="gridcell">
                <span
                  v-for="(name, i) in row.people"
                  :key="`${i}-${name}`"
                  class="avatar"
                  :style="{ '--av': avatarTone(name) }"
                  :title="name"
                >
                  {{ initials(name) }}
                </span>
                <span v-if="row.extraPeople.length" class="avatar avatar--more" :title="row.extraPeople.join(', ')">
                  +{{ row.extraPeople.length }}
                </span>
              </span>
            </div>
          </template>
        </div>
      </div>

      <p v-if="totalShown === 0" class="list-empty">Nenhuma tarefa com esses filtros.</p>
    </div>

    <Transition name="bulk">
      <div v-if="selecting" class="bulk-dock">
        <TaskBulkBar
          :count="selection.count.value"
          :busy="busy"
          :common-status="commonStatus"
          :common-priority="commonPriority"
          :people="bulkPeople"
          :month-groups="monthGroups"
          @status="bulkStatus"
          @priority="bulkPriority"
          @person="bulkPerson"
          @month="bulkMonth"
          @delete="requestDelete"
          @clear="selection.clear()"
        />
      </div>
    </Transition>

    <ConfirmDialog
      v-model="confirmOpen"
      danger
      :title="deleteTargets.length === 1 ? 'Excluir tarefa' : `Excluir ${deleteTargets.length} tarefas`"
      :message="deleteMessage"
      confirm-label="Excluir"
      :loading="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.list-view {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  container: task-list / inline-size;
}

.list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 16px;
}

/* Com a barra à vista, o fim da lista rola para cima dela. */
.list-view--selecting .list-scroll {
  padding-bottom: 88px;
}

/* `clip`, e não `hidden`: arredonda os cantos sem virar contêiner de rolagem,
   então o cabeçalho do grupo continua grudando no topo da área que rola. */
.list {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: clip;
}

/* ── Cabeçalho do grupo: ícone de status, nome e contagem ── */
.grp-h {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
}

.grp:not(:first-child) .grp-h {
  border-top: 1px solid var(--border);
  margin-top: -1px;
}

.grp-h__cell {
  display: flex;
  align-items: center;
  height: 36px;
  padding-right: 8px;
}

.grp-h__toggle {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 0 0 12px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.grp-h__toggle:focus-visible,
.grp-h__add:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.grp-h__chev {
  flex: none;
  color: var(--text-3);
  transition: transform var(--motion-fast) var(--motion-ease);
}

.grp--collapsed .grp-h__chev {
  transform: rotate(-90deg);
}

.grp-h__name {
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
  color: var(--text-2);
  white-space: nowrap;
}

.grp-h__count {
  font-size: 13px;
  line-height: 20px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.grp-h__add {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  opacity: 0;
}

.grp-h:hover .grp-h__add,
.grp-h__add:focus-visible {
  opacity: 1;
}

.grp-h__add:hover {
  background: var(--surface-3);
  color: var(--text);
}

/* ── Linha de 36px ── */
.row {
  display: grid;
  grid-template-columns: 40px 16px 76px 16px minmax(0, 1fr) auto 48px 88px 52px;
  align-items: center;
  column-gap: 8px;
  height: 36px;
  padding-right: 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
  user-select: none;
  /* J/K rolam até a linha sem ela ficar sob o cabeçalho que gruda no topo. */
  scroll-margin-top: 36px;
  scroll-margin-bottom: 8px;
}

.list-view--selecting .row {
  scroll-margin-bottom: 88px;
}

.grp:last-child .row:last-child {
  border-bottom: 0;
}

/* Hover sobe um degrau de fundo. Sem transição: 200 linhas, nada anima. */
.row:hover {
  background: var(--surface-2);
}

.row--open {
  background: var(--surface-2);
}

/* Otimista (criação inline ainda sem resposta): esmaece como o card do board. */
.row--pending {
  opacity: 0.64;
  cursor: progress;
}

.row--selected,
.row--selected:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}

.row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.list-view--readonly .row {
  grid-template-columns: 4px 16px 76px 16px minmax(0, 1fr) auto 48px 88px 52px;
}

/* ── Checkbox: aparece no hover, no foco, na seleção e com seleção ativa ── */
.c-check {
  display: flex;
  height: 100%;
}

.cb {
  width: 40px;
  height: 36px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.cb__box {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border: 1.5px solid var(--border-strong);
  border-radius: var(--radius-xs);
  background: var(--surface);
  color: var(--accent-fg);
  opacity: 0;
}

.row:hover .cb__box,
.row:focus-visible .cb__box,
.row--selected .cb__box,
.list-view--selecting .cb__box,
.cb:focus-visible .cb__box {
  opacity: 1;
}

.row--selected .cb__box {
  background: var(--accent);
  border-color: var(--accent);
}

.cb:hover .cb__box {
  border-color: var(--accent);
}

@media (hover: none) {
  .cb__box {
    opacity: 1;
  }
}

/* ── Células ── */
.c-prio,
.c-status {
  display: grid;
  place-items: center;
}

.c-key {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 16px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-key--rule {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: inherit;
}

.c-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.row--done .c-title {
  color: var(--text-2);
}

.c-tags {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 240px;
  min-width: 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-2);
  overflow: hidden;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.tag__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--tc);
  flex: none;
}

.tag__name {
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag--more {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  flex: none;
}

.c-sub,
.c-due {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.c-due--late {
  color: var(--due-late);
}

.c-due--soon {
  color: var(--due-soon);
}

/* ── Pessoas: discos de 20px, até 2 e "+N" ── */
.c-people {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.avatar {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--av);
  color: var(--surface);
  box-shadow: 0 0 0 1.5px var(--surface);
  /* A exceção aceita da spec: duas iniciais num disco de 20px não cabem em
     12px. O nome inteiro está no title. */
  font-size: 10px;
  line-height: 1;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.avatar + .avatar {
  margin-left: -4px;
}

.avatar--more {
  background: var(--surface-3);
  color: var(--text-2);
}

.list-empty {
  margin: 16px 0 0;
  font-size: 13px;
  color: var(--text-3);
  text-align: center;
}

/* ── Barra de massa: no rodapé da área, alinhada à coluna dos checkboxes ──
   À esquerda, e não centrada: o toast do app nasce no canto inferior direito
   e, centrada em 1440, a barra ficava com "Excluir" e "×" cobertos por ele
   depois de cada ação. */
.bulk-dock {
  position: absolute;
  left: 12px;
  bottom: 16px;
  z-index: 5;
  max-width: calc(100% - 24px);
}

.bulk-enter-active,
.bulk-leave-active {
  transition:
    opacity var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.bulk-enter-from,
.bulk-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* ── Largura: a lista cede colunas antes de espremer o título ── */
@container task-list (max-width: 860px) {
  .row {
    grid-template-columns: 40px 16px 76px 16px minmax(0, 1fr) 88px 52px;
  }

  .list-view--readonly .row {
    grid-template-columns: 4px 16px 76px 16px minmax(0, 1fr) 88px 52px;
  }

  .c-tags,
  .c-sub {
    display: none;
  }
}

@container task-list (max-width: 560px) {
  .row {
    grid-template-columns: 40px 16px 16px minmax(0, 1fr) 88px;
  }

  .list-view--readonly .row {
    grid-template-columns: 4px 16px 16px minmax(0, 1fr) 88px;
  }

  .c-key,
  .c-people {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .grp-h__chev,
  .bulk-enter-active,
  .bulk-leave-active {
    transition: none;
  }
}
</style>
