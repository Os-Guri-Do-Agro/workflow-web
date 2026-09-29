<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick, toRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  History,
  Plus,
  CloudOff,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Keyboard,
} from 'lucide-vue-next'
import TaskForm, { type TaskFormSubtask } from '@/components/tasks/TaskForm.vue'
import { plainToHtml } from '@/features/tasks/description-html'
import AppDialog from '@/components/ui/AppDialog.vue'
import KanbanBoard, { type KanbanMovePayload } from '@/components/tasks/KanbanBoard.vue'
import TaskLanes from '@/components/tasks/TaskLanes.vue'
import TaskBoardToolbar from '@/features/tasks/components/TaskBoardToolbar.vue'
import TaskDetailPanel from '@/features/tasks/components/TaskDetailPanel.vue'
import TaskListView from '@/features/tasks/components/TaskListView.vue'
import TaskShortcutsDialog from '@/features/tasks/components/TaskShortcutsDialog.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import activityService from '@/service/activities/activity-service'
import companiesServices from '@/service/companies/companies-services'
import { isMarkdownFilename } from '@/utils/file-kind'
import { getInfoAuth } from '@/utils/authContent'
import { dateOnlyToUtcNoonIso, isoToDateOnly, todayDateOnly } from '@/utils/date'
import { normalizePriority } from '@/utils/priority'
import { useToast } from '@/composables/useToast'
import { useCompanyBoards } from '@/composables/useCompanyBoards'
import { useCompanyQuarters } from '@/composables/useCompanyQuarters'
import { useBacklog } from '@/composables/useBacklog'
import { useActivityBoardRealtime } from '@/composables/useActivityBoardRealtime'
import { useBoardFilters } from '@/features/tasks/composables/useBoardFilters'
import { useTaskKeyboard } from '@/features/tasks/composables/useTaskKeyboard'
import {
  useQuickCreate,
  type QuickCreatePerson,
  type QuickCreateTarget,
} from '@/features/tasks/composables/useQuickCreate'
import { groupByPerson, NOBODY_LANE } from '@/features/tasks/board-lanes'
import { isPendingTaskId } from '@/features/tasks/pending-task'
import { taskKey } from '@/features/tasks/task-key'
import { statusSpec } from '@/features/tasks/task-meta'
import { resolveDropIndex } from '@/features/tasks/board-order'
import type { ActivityDetail } from '@/features/tasks/activity-types'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import type { ActivityMovedPayload } from '@/service/realtime/realtime-service'
import { useQueryClient } from '@tanstack/vue-query'
// ── Repetição (ver docs/specs/tarefas-recorrentes-frontend.md)
// Recorrência é um CAMPO da tarefa, então ela vive aqui dentro, no board do mês,
// e não numa tela paralela: dois lugares para procurar a mesma tarefa seria
// exatamente o problema que a feature tenta resolver.
//
// `useRecurring` decide entre o estado local (`localStorage`) e a API pela flag
// `RECURRING_API_ENABLED`. A tela fala com uma superfície só.
import RecurringAgenda from '@/features/tasks/recurring/components/RecurringAgenda.vue'
import RecurrenceManagerDialog from '@/features/tasks/recurring/components/RecurrenceManagerDialog.vue'
import {
  useRecurring,
  monthKeyFromBoard,
  flattenBoardCards,
  isBoardVirtualCard,
} from '@/features/tasks/recurring/useRecurring'
import type { RecurringBoardPayload } from '@/features/tasks/recurring/useRecurringApi'
import { migrateLocalRecurrences } from '@/features/tasks/recurring/migrate-local-recurrences'
import { resolveBoardMonthKey } from '@/features/tasks/recurring/month-key'
import {
  describeRule,
  emptyRule,
  monthLabel,
  shiftMonthKey,
} from '@/features/tasks/recurring/recurrence-engine'
import {
  isOccurrenceId,
  parseOccurrenceId,
  type BoardOccurrence,
  type RecurrenceRule,
  type RecurringTemplate,
} from '@/features/tasks/recurring/recurrence-types'

// ── Tipos locais (shape real da API de tarefas/quarters deste módulo) ──
type BoardStatus = 'TODO' | 'IN_PROGRESS' | 'IN_TESTING' | 'DONE'

interface TaskResponsible {
  /** Card real traz o id; o de rotina só o nome. */
  userId?: string
  user: { id?: string; name: string }
}

interface BoardTaskTag {
  id: string
  name: string
  slug: string
  color: string | null
}

interface BoardTask {
  id: string
  title?: string
  priorityNumber?: number
  responsibles?: TaskResponsible[]
  /** Linha da pivot, como a API devolve. O filtro casa por `slug`. */
  tags?: Array<{ tag: BoardTaskTag }>
  dueDate?: string | null
  /** Vem com os escalares da atividade; é o que alimenta "Atualizadas 24h". */
  updatedAt?: string
  /** Rotina que materializou a tarefa (modo API). */
  recurrenceId?: string | null
  subtasks?: Array<{ id: string; title: string; status: string }>
  /** Presente só nos cards gerados por uma repetição (protótipo, §recorrência). */
  recurrence?: string
  /**
   * Quantas OUTRAS datas desta mesma repetição caem no mês e ficaram fora do
   * board. `0`/ausente = o card é tudo que existe. Vira o contador que leva
   * para a Agenda — colapsar as datas sem dizer quantas some com a informação.
   */
  recurrenceHidden?: number
  /**
   * Dessas escondidas, quantas já passaram sem ninguém encostar. É o que impede
   * o quadro de quem ignorou a rotina a semana toda parecer igual ao de quem
   * está em dia.
   */
  recurrenceOverdue?: number
}

type BoardColumns = Record<BoardStatus, BoardTask[]>

interface CompanyMember {
  id: string
  name: string
  email?: string
}

interface ActivityFormModel {
  title: string
  description: string
  priorityNumber: number
  dueDate: string
  assignees: string[]
  attachments: File[]
  tags: BoardTaskTag[]
  docTitle: string
  docContent: string
  /** Título + descrição: a subtarefa deixou de nascer obrigatoriamente vazia. */
  subtasks: TaskFormSubtask[]
  /** Coluna em que a tarefa nasce (antes era sempre `TODO`, imposto pela API). */
  initialStatus: BoardStatus
  /** Repetição. `once` = a tarefa avulsa de sempre. */
  rule: RecurrenceRule
}

const EMPTY_FORM = (): ActivityFormModel => ({
  title: '',
  description: '',
  priorityNumber: 0,
  dueDate: '',
  assignees: [],
  attachments: [],
  tags: [],
  docTitle: '',
  docContent: '',
  subtasks: [],
  initialStatus: 'TODO',
  rule: emptyRule(),
})

interface RawMonth {
  id: string
  name: string
  /** Nem toda resposta traz; quando traz, é a fonte mais confiável do mês. */
  number?: number | null
  year?: number | null
}

interface RawQuarter {
  id?: string
  /** A API manda `label` ("Q3"). Ler `name` era o que sumia com o trimestre. */
  label?: string
  name?: string
  months?: RawMonth[]
}

/** Erro de request (axios-like) — usado para extrair a mensagem do backend. */
interface RequestError {
  response?: { data?: { message?: string } }
}

function apiErrorMessage(e: unknown, fallback: string): string {
  const msg = (e as RequestError)?.response?.data?.message
  return msg ?? fallback
}

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()

const dialog = ref(false)
const creating = ref(false)

// ── Vista na URL (`?vista=lista`, `agenda`, `historico`) ──
// O link abre na mesma vista e o F5 não devolve para o Board, que é o padrão e
// não aparece na URL.
type TasksTab = 'board' | 'list' | 'agenda' | 'history'
const TAB_PARAM: Record<TasksTab, string | null> = {
  board: null,
  list: 'lista',
  agenda: 'agenda',
  history: 'historico',
}
const tabFromQuery = (value: unknown): TasksTab =>
  (Object.keys(TAB_PARAM) as TasksTab[]).find((t) => TAB_PARAM[t] !== null && TAB_PARAM[t] === value) ??
  'board'
const currentTab = ref<TasksTab>(tabFromQuery(route.query.vista))

// URL → vista: voltar/avançar do navegador e link colado.
watch(
  () => route.query.vista,
  (value) => {
    const tab = tabFromQuery(value)
    if (tab !== currentTab.value) currentTab.value = tab
  },
)

// Vista → URL por `replace`: trocar de vista não é navegar (o voltar sai do
// board ou fecha o painel, como nos filtros).
watch(currentTab, (tab) => {
  const param = TAB_PARAM[tab]
  const current = typeof route.query.vista === 'string' ? route.query.vista : null
  if (current === param) return
  const query = { ...route.query }
  if (param) query.vista = param
  else delete query.vista
  void router.replace({ query })
})
const members = ref<CompanyMember[]>([])
const isWorkerRole = ref(false)
/**
 * O papel chega de `/user/me`, depois do mount. Até lá o painel não se declara
 * "só leitura": abrir por link direto (`?task=`) piscava os campos de
 * desabilitado para editável (quem decide até lá é o papel do token).
 */
const roleResolved = ref(false)
const { success: showSuccess, error: showError, info: showInfo } = useToast()
const formActivity = ref<ActivityFormModel>(EMPTY_FORM())

// Local mutable tasks ref for optimistic drag-and-drop updates
const tasks = ref<BoardColumns>({ TODO: [], IN_PROGRESS: [], IN_TESTING: [], DONE: [] })

const STATUSES: BoardStatus[] = ['TODO', 'IN_PROGRESS', 'IN_TESTING', 'DONE']

// ── Reactive query keys ──
const companyId = computed(() => localStorage.getItem('activeCompany') ?? '')

// Nome da empresa ativa: é dele que sai o prefixo da chave do card (`PJ-K7Q2XM`).
// A lista de empresas chega pelo AppShell; até lá a chave aparece sem prefixo.
const workspace = useWorkspaceStore()
const companyName = computed(
  () => workspace.companies.find((c) => c.id === companyId.value)?.name ?? '',
)
const monthId = computed(() => route.params.month as string)

// ── Vue Query — data loads independently, no blocking ──
const {
  data: tasksData,
  isLoading: tasksLoading,
  isError: tasksError,
  refetch: refetchBoards,
} = useCompanyBoards(monthId)
const { data: quartersData } = useCompanyQuarters(companyId)
const { data: backlogData } = useBacklog(companyId)

/**
 * De onde o card saiu na última mudança otimista de coluna ou de mês que veio
 * por `applyPanelPatch` (painel e massa da Lista). É o que faz o rollback
 * devolver o card ao MESMO lugar: sem isto, a coluna antiga recebia o card no
 * fim, e o card que tinha ido para outro mês não voltava mais (não havia de
 * onde tirá-lo). `task` só existe quando o card saiu do board (troca de mês).
 */
const patchOrigin = new Map<string, { status: BoardStatus; index: number; task?: BoardTask }>()

/**
 * Sync da query para o ref local (que o arraste otimista muta).
 *
 * Os cards VIRTUAIS são retirados aqui: com a API de rotinas, o servidor manda
 * as ocorrências ainda não materializadas dentro das colunas, e elas não podem
 * viver em `tasks` — é esse ref que o arraste faz `splice`, e mover um card que
 * não tem linha no banco mexeria numa posição que não existe. Elas voltam ao
 * quadro por `boardOccurrences`, já colapsadas em uma linha por regra.
 */
function syncFromQuery(val: unknown) {
  if (!val) return
  const source = val as BoardColumns
  const real = { ...source } as BoardColumns
  for (const status of STATUSES) {
    // Cópia rasa de cada card: o `data` do Vue Query é readonly (profundo), e
    // escrever num card dele falhava em silêncio. O board precisa mexer no
    // card na hora (renomear no próprio card, patch do painel); o refetch
    // traz a verdade do servidor por cima logo depois.
    real[status] = (source[status] ?? [])
      .filter((t: BoardTask) => !isBoardVirtualCard(t))
      .map((t: BoardTask) => ({ ...toRaw(t) }))
  }
  tasks.value = real
  // A tela voltou a ser a do servidor: nenhum rollback pendente vale mais.
  patchOrigin.clear()
}

watch(tasksData, (val) => syncFromQuery(val), { immediate: true })

const loading = computed(() => tasksLoading.value)

const backLog = computed(() => backlogData.value ?? [])

const quartersList = computed<RawQuarter[]>(() => {
  const raw = quartersData.value as RawQuarter[] | { data?: RawQuarter[] } | undefined
  return Array.isArray(raw) ? raw : (raw?.data ?? [])
})

/** Mês atual + rótulo do trimestre que o contém (vai no breadcrumb, não num eyebrow). */
const currentMonthInfo = computed<{ month: RawMonth; quarterName: string | null } | null>(() => {
  for (const quarter of quartersList.value) {
    const month = quarter.months?.find((m) => m.id === monthId.value)
    if (month) return { month, quarterName: quarter.label ?? quarter.name ?? null }
  }
  return null
})

/**
 * Meses em sequência, na ordem do menu lateral (trimestres por rótulo, meses
 * por número, como a API já devolve). É o que o `‹ Setembro ›` percorre: do
 * último mês de um trimestre ele passa para o primeiro do seguinte.
 */
const monthSequence = computed(() =>
  quartersList.value.flatMap((q) => (q.months ?? []).map((m) => ({ id: m.id, name: m.name }))),
)
const monthIndex = computed(() => monthSequence.value.findIndex((m) => m.id === monthId.value))
const prevMonth = computed(() =>
  monthIndex.value > 0 ? monthSequence.value[monthIndex.value - 1] ?? null : null,
)
const nextMonth = computed(() =>
  monthIndex.value >= 0 ? monthSequence.value[monthIndex.value + 1] ?? null : null,
)

// ── Repetição: o mês do board em calendário de verdade ──────────────────────
//
// `/tasks/:month` navega por `monthId` (uuid) e o contrato atual não devolve o
// intervalo de datas do mês. `resolveBoardMonthKey` é a costura do protótipo
// (ela some quando a §8 do contrato de backend existir).
/**
 * O payload cru do board.
 *
 * Com a API de rotinas ligada ele traz `monthNumber`, `from`, `to` e
 * `recurrences` (as regras do mês com as exceções já recortadas). `tasks` é a
 * cópia local mutável das colunas, e não serve aqui: o arraste otimista mexe
 * nela, e a janela do mês tem que vir do servidor sem passar por isso.
 */
const boardPayload = computed<RecurringBoardPayload | undefined>(
  () => tasksData.value as RecurringBoardPayload | undefined,
)

/** Todos os cards do mês, reais e virtuais, numa lista só. */
const boardCards = computed(() => flattenBoardCards(tasksData.value, STATUSES))

/**
 * O mês do board em calendário de verdade.
 *
 * O servidor agora manda a janela (`from`/`to`), então não há o que adivinhar.
 * `resolveBoardMonthKey` fica como rede de segurança para o backend que ainda
 * não tem esse commit — e é a única razão de `month-key.ts` continuar existindo.
 */
const monthCalendarKey = computed(
  () =>
    monthKeyFromBoard(boardPayload.value) ??
    resolveBoardMonthKey(
      currentMonthInfo.value?.month ?? null,
      STATUSES.flatMap((s) => (tasks.value[s] ?? []).map((t) => t.dueDate)),
    ),
)

const {
  templates: recurrenceTemplates,
  boardOccurrences,
  monthlyFixed,
  scheduled: scheduledOccurrences,
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
  countInMonth,
  isRemote: recurrenceIsRemote,
} = useRecurring({
  monthKey: monthCalendarKey,
  companyId,
  board: boardPayload,
  cards: boardCards,
})

const recurringCount = computed(
  () => recurrenceTemplates.value.filter((t) => t.rule.frequency !== 'once').length,
)

/** A ocorrência com a cara de card do board. */
const occurrenceToBoardTask = (occurrence: BoardOccurrence): BoardTask => ({
  id: occurrence.id,
  title: occurrence.title,
  priorityNumber: occurrence.priorityNumber,
  dueDate: dateOnlyToUtcNoonIso(occurrence.date),
  responsibles: occurrence.assignees.map((name) => ({ user: { name } })),
  tags: occurrence.tags.map((tag) => ({ tag })),
  subtasks: occurrence.subtasks.map((sub, i) => ({
    id: `${occurrence.id}#${i}`,
    title: sub.title,
    status: 'TODO',
  })),
  recurrence: describeRule(templateById(occurrence.templateId)?.rule ?? emptyRule()),
  recurrenceHidden: occurrence.hiddenInMonth,
  recurrenceOverdue: occurrence.overdueInMonth,
})

/**
 * O board do mês: atividades reais + UMA linha por repetição.
 *
 * O board é a superfície do MÊS, mas uma rotina diária é uma coisa do DIA:
 * despejar as 22 datas de "todo dia útil" nas colunas trata a repetição como 22
 * tarefas diferentes. `boardOccurrences` já entrega só a ocorrência corrente de
 * cada regra (mais as que a pessoa começou e não terminou); o resto do mês é a
 * aba Agenda, para onde o contador do card leva.
 *
 * As geradas entram no FIM de cada coluna. Card virtual não tem ordem manual
 * (não existe linha no servidor para gravá-la), e intercalá-las pela data faria
 * a ordem que a pessoa arrumou à mão mudar sozinha a cada refetch.
 *
 * Os otimistas da criação inline (S4) vêm logo depois dos reais, que é onde o
 * card de verdade vai ficar quando o POST voltar. Moram fora de `tasks`: o
 * refetch substitui aquele ref inteiro e os apagaria no meio do caminho.
 */
// ── Criação inline (spec board-tarefas-redesign, D5) ──
const quickCreate = useQuickCreate({
  tasks,
  monthId,
  responsibleFor: (target) => quickCreateResponsible(target),
  onQueued: (card, target) => void nextTick(() => warnIfHidden(card.id, target.status)),
  onCreated: (card, target) => announceCreated(card, target),
  refresh: () => refreshTasks(),
})
const { composer, restore: composerRestore } = quickCreate

const boardTasks = computed<BoardColumns>(() => {
  const merged = { TODO: [], IN_PROGRESS: [], IN_TESTING: [], DONE: [] } as BoardColumns
  for (const status of STATUSES) {
    merged[status] = [...(tasks.value[status] ?? []), ...quickCreate.pending.value[status]]
  }
  for (const occurrence of boardOccurrences.value) {
    merged[occurrence.status].push(occurrenceToBoardTask(occurrence))
  }
  return merged
})

/**
 * Traz o board do servidor E reaplica em `tasks`, mesmo quando nada mudou lá.
 *
 * O `watch(tasksData)` sozinho não basta para desfazer um otimismo: com o
 * structural sharing do Vue Query, um refetch igual ao cache devolve a MESMA
 * referência, o watch não roda e o card ficava onde a escrita recusada o
 * deixou (título, coluna, mês). Aqui a cópia local é refeita do cache depois
 * de todo refetch pedido, e isso vale também quando o próprio refetch falha:
 * o cache guarda o último estado que o servidor confirmou, que é o que a tela
 * deve mostrar depois de uma escrita recusada. Lê do cache, e não do
 * `tasksData`, porque o observador do Vue Query só publica no próximo tique.
 */
const refreshTasks = async () => {
  const key = ['boards', monthId.value] as const
  await queryClient.refetchQueries({ queryKey: key })
  // Trocou de mês no meio do caminho: o cache pedido já não é o da tela.
  if (key[1] !== monthId.value) return
  syncFromQuery(queryClient.getQueryData(key))
}

const findMembers = async () => {
  const id = localStorage.getItem('activeCompany')
  if (!id) return
  try {
    const response = (await companiesServices.getCompanyMembers(id)) as
      | CompanyMember[]
      | { data?: CompanyMember[] }
    members.value = Array.isArray(response) ? response : response.data ?? []
  } catch (error: unknown) {
    showError(apiErrorMessage(error, 'Erro ao buscar membros'))
  }
}

/**
 * Cria a REPETIÇÃO (protótipo: nada sai para o servidor).
 *
 * Fica separado da criação normal porque o que se grava é outra coisa: um
 * modelo, não uma tarefa. As ocorrências saem dele a cada render — materializar
 * doze meses de "toda segunda" na criação seria o trabalho manual da virada de
 * mês, só que automatizado.
 */
const createRecurrence = async () => {
  const form = formActivity.value
  // O modelo carrega NOMES porque é isso que os cards e avatares desenham; os
  // IDS vão à parte, em `responsibleUserIds`, que é o que a API quer. No modo
  // local o segundo é ignorado.
  const nameById = new Map(members.value.map((m) => [m.id, m.name]))
  const responsibleUserIds = form.assignees.filter((id) => nameById.has(id))
  const template: Omit<RecurringTemplate, 'id' | 'createdAt'> = {
    title: form.title.trim(),
    description: form.description || '',
    priorityNumber: normalizePriority(form.priorityNumber, 0),
    initialStatus: form.initialStatus,
    assignees: form.assignees.map((id) => nameById.get(id) ?? id),
    tags: form.tags,
    subtasks: form.subtasks
      .map((s) => ({ title: s.title.trim(), description: s.description.trim() }))
      .filter((s) => s.title),
    rule: form.rule,
    active: true,
  }
  creating.value = true
  try {
    if (editingRecurrenceId.value) {
      await updateTemplate(editingRecurrenceId.value, template, responsibleUserIds)
      showSuccess('Repetição atualizada')
    } else {
      await createTemplate(template, responsibleUserIds)
      showSuccess(`Repetição criada: ${describeRule(template.rule).toLowerCase()}`)
    }
  } catch (error: unknown) {
    // O formulário FICA ABERTO no erro: fechar levaria junto o que a pessoa
    // escreveu, e ela teria que redigitar a regra inteira para tentar de novo.
    showError(apiErrorMessage(error, 'Não foi possível salvar a repetição'))
    return
  } finally {
    creating.value = false
  }

  editingRecurrenceId.value = null
  formActivity.value = EMPTY_FORM()
  dialog.value = false
}

const createActivity = async () => {
  if (!formActivity.value.title) return

  // Recorrente vai pelo caminho da rotina (API ou local, conforme a flag).
  // Avulsa continua em `POST /activity`, como sempre foi.
  if (formActivity.value.rule.frequency !== 'once') {
    await createRecurrence()
    return
  }

  // Repetição editada para "Não repete": o modelo sai de cena e a tarefa vira
  // uma atividade de verdade. Sem isto, sobrariam as duas — a real recém-criada
  // e o modelo antigo continuando a gerar cards.
  if (editingRecurrenceId.value) {
    removeTemplate(editingRecurrenceId.value)
    editingRecurrenceId.value = null
  }

  creating.value = true
  try {
    const payload = {
      title: formActivity.value.title,
      description: formActivity.value.description || '',
      priorityNumber: normalizePriority(formActivity.value.priorityNumber, 0),
      // dueDate pode chegar como 'YYYY-MM-DD' ou ISO — normaliza para meio-dia UTC
      dueDate: dateOnlyToUtcNoonIso(
        formActivity.value.dueDate ? isoToDateOnly(formActivity.value.dueDate) : todayDateOnly(),
      ),
      monthId: monthId.value,
      responsibleUserIds: formActivity.value.assignees || [],
      // As tags já existem (o TagInput cria via `POST /tag`, que é idempotente),
      // então aqui só vinculamos.
      tagIds: formActivity.value.tags.map((t) => t.id),
    }
    const created = await activityService.postActivity(payload)

    // A API cria sempre em `TODO`. Quando a pessoa escolheu outra coluna, o
    // segundo passo é o que honra a escolha — sem ele o campo do formulário
    // seria decorativo. A §10.1 do contrato de backend pede `status` no POST
    // para isto virar uma requisição só.
    if (formActivity.value.initialStatus !== 'TODO') {
      try {
        await activityService.moveActivity(created.id, {
          status: formActivity.value.initialStatus,
          position: 0,
        })
      } catch (error: unknown) {
        showError(apiErrorMessage(error, 'A tarefa foi criada, mas ficou em "A fazer"'))
      }
    }

    // Documento e anexos são pós-criação: a atividade precisa existir para ter
    // dono. Falha aqui NÃO desfaz a tarefa criada, só avisa qual parte não foi.
    const doc = formActivity.value.docContent.trim()
    if (doc) {
      try {
        await activityService.postDoc(created.id, {
          title: formActivity.value.docTitle.trim() || 'Leia primeiro',
          content: formActivity.value.docContent,
          isPrimary: true,
        })
      } catch (error: unknown) {
        showError(apiErrorMessage(error, 'A tarefa foi criada, mas o documento falhou'))
      }
    }

    // Subtarefas: SEQUENCIAIS de propósito. Cada criação renumera `position`
    // no servidor, e em paralelo duas disputariam a mesma posição — a ordem em
    // que a pessoa digitou é justamente a informação que ela quis passar.
    const subtasks = formActivity.value.subtasks
      .map((s) => ({ title: s.title.trim(), description: s.description.trim() }))
      .filter((s) => s.title)
    for (const { title, description } of subtasks) {
      try {
        await activityService.postActivity({
          title,
          // O campo do formulário é texto plano; `plainToHtml` dá a ele a mesma
          // forma que o editor de descrição produz, para a leitura não ter dois
          // casos. Antes isto era `''` fixo: a subtarefa nascia sem descrição
          // por decisão do código, não da pessoa.
          description: plainToHtml(description),
          priorityNumber: normalizePriority(formActivity.value.priorityNumber, 0),
          dueDate: payload.dueDate,
          monthId: monthId.value,
          parentId: created.id,
          responsibleUserIds: [],
        })
      } catch (error: unknown) {
        showError(apiErrorMessage(error, `Não foi possível criar a subtarefa "${title}"`))
      }
    }

    // Em paralelo, com erro por arquivo: um recusado (tamanho, extensão) não
    // pode impedir os outros de subir nem apagar a tarefa recém-criada.
    await Promise.all(
      formActivity.value.attachments.map(async (file) => {
        const fd = new FormData()
        fd.append('file', file)
        try {
          // `.md` só chega aqui se a pessoa escolheu "Anexo" no formulário; o
          // servidor exige essa declaração para não criar anexo `.md` por
          // acidente. Ver `upload-rules.ts`.
          await activityService.postActivityAttachment(created.id, fd, {
            asFile: isMarkdownFilename(file.name),
          })
        } catch (error: unknown) {
          showError(apiErrorMessage(error, `Não foi possível enviar "${file.name}"`))
        }
      }),
    )

    await refreshTasks()
    formActivity.value = EMPTY_FORM()
    dialog.value = false
    showSuccess('Tarefa criada')
  } catch (error: unknown) {
    showError(apiErrorMessage(error, 'Erro ao criar atividade'))
  } finally {
    creating.value = false
  }
}

onMounted(async () => {
  isWorkerRole.value = (await getInfoAuth()) || false
  roleResolved.value = true
  findMembers()
  if (route.query.new === '1') {
    dialog.value = true
    // Tira só o `new`: os filtros da URL continuam valendo.
    const query = { ...route.query }
    delete query.new
    void router.replace({ query })
  }
  void migrateRecurrences()
})

/**
 * Sobe para a API, uma vez por empresa, as rotinas criadas enquanto a feature
 * era local. O registro local NUNCA é apagado — ele é o backup.
 *
 * Avisa na tela mesmo quando dá tudo certo: rotina aparecendo sozinha no quadro,
 * sem explicação, é indistinguível de bug.
 */
const migrateRecurrences = async () => {
  if (!recurrenceIsRemote || !companyId.value) return
  try {
    const report = await migrateLocalRecurrences(companyId.value)
    if (!report.found) return
    if (report.migrated) {
      showSuccess(
        `${report.migrated} repetição${report.migrated > 1 ? 'ões' : ''} que estava${report.migrated > 1 ? 'm' : ''} só neste navegador foi enviada para o servidor`,
      )
      await refreshTasks()
    }
    if (report.failed.length) {
      showError(
        `Não consegui enviar: ${report.failed.join(', ')}. Continuam guardadas neste navegador.`,
      )
    }
  } catch (error: unknown) {
    showError(apiErrorMessage(error, 'Não foi possível migrar as repetições locais'))
  }
}

// ── Filtros (toolbar sempre à vista, spec board-tarefas-redesign D8) ──
//
// Estado, URL, memória por empresa e predicados moram em `useBoardFilters`.
// Os filtros rodam sobre `boardTasks`, que é COMPUTADO do mesmo `tasks` que o
// arraste e o realtime mutam: nenhuma cópia de card fica para trás.
/** Membros como `{ id, name }` (a API manda `{ userId, user }`; o tipo antigo, `{ id, name }`). */
const memberPeople = computed(() =>
  members.value
    .map((member) => {
      const raw = member as CompanyMember & { userId?: string; user?: { id?: string; name?: string } }
      return { id: raw.user?.id ?? raw.userId ?? raw.id ?? '', name: raw.user?.name ?? raw.name ?? '' }
    })
    .filter((m) => m.id && m.name),
)

const filters = useBoardFilters({
  route,
  router,
  companyId,
  companyName,
  columns: boardTasks,
  members: memberPeople,
})

const filteredTasks = computed<BoardColumns>(() => filters.filtered.value)

// Soma SÓ as colunas de status: a resposta do board também carrega `monthId`,
// e um Object.values cru contava essa chave como "1 atividade" a mais.
const totalTasks = computed(() =>
  STATUSES.reduce((acc, s) => acc + (boardTasks.value[s]?.length ?? 0), 0),
)

const toolbar = ref<InstanceType<typeof TaskBoardToolbar> | null>(null)

/** Remove a atividade de todas as colunas locais e devolve o objeto (ou null). */
const removeFromColumns = (taskId: string): BoardTask | null => {
  let removed: BoardTask | null = null
  for (const status of STATUSES) {
    const list = tasks.value[status]
    if (!list) continue
    const idx = list.findIndex((t) => t.id === taskId)
    if (idx !== -1) removed = list.splice(idx, 1)[0] ?? removed
  }
  return removed
}

// ── Arraste: update otimista (splice na posição) + persistência via /move ──
const handleMove = async (payload: KanbanMovePayload) => {
  const { taskId, status } = payload

  // Card gerado por repetição: a mudança é do DIA, não do modelo. Mover a
  // segunda-feira para "Concluído" não pode dar a semana inteira como feita.
  //
  // No modo LOCAL isso vira um override e nada sai para o servidor. No modo
  // REMOTO cai no caminho normal de propósito: `PATCH /activity/:id/move`
  // aceita o id virtual `rec:<regra>:<data>` e MATERIALIZA a ocorrência dentro
  // da mesma transação: o card é arrastado e fica onde foi solto, e o refetch
  // o traz de volta já como atividade real.
  if (isOccurrenceId(taskId) && !recurrenceIsRemote) {
    void setOccurrenceStatus(taskId, status as BoardStatus)
    return
  }

  const movedTask = removeFromColumns(taskId)
  const target = tasks.value[status as BoardStatus] ?? []

  // O índice que o board manda é o da lista VISÍVEL. Com filtro ligado, a
  // coluna completa tem cards escondidos no meio, e aplicar o índice visível
  // nela gravava a posição errada. A posição absoluta sai do vizinho que a
  // pessoa viu (ver `board-order.ts`); sem filtro, as duas contas coincidem.
  const position = resolveDropIndex(
    target.map((t) => t.id),
    payload.visibleIds,
    taskId,
    payload.position,
  )
  if (movedTask) target.splice(position, 0, movedTask)

  try {
    await activityService.moveActivity(taskId, { status, position })
    // Materializou: o card trocou de identidade (`rec:…` virou cuid) e deixou
    // de ser virtual. Sem o refetch a tela continuaria com o id antigo, e o
    // próximo arraste tentaria materializar de novo uma data que já é tarefa.
    if (isOccurrenceId(taskId)) await refreshTasks()
  } catch (error: unknown) {
    showError(apiErrorMessage(error, 'Erro ao mover atividade'))
    await refreshTasks() // revert on failure
  }
}

// ── Realtime: aplica movimentos vindos de outras abas/usuários ──
const applyRemoteMove = (p: ActivityMovedPayload) => {
  if (p.monthId !== monthId.value) return // outro mês → ignora
  const moved = removeFromColumns(p.activityId)
  if (!moved) return // card não carregado neste cliente — o refresh do reconnect cobre
  const target = tasks.value[p.status as BoardStatus]
  if (!target) return
  if (p.position === null) {
    target.push(moved) // Fase 1 (sem ordem manual): joga no fim
  } else {
    const idx = Math.max(0, Math.min(p.position, target.length))
    target.splice(idx, 0, moved)
  }
}

useActivityBoardRealtime(applyRemoteMove, refreshTasks)

// ── Rename task (inline editing) ──
const handleRenameTask = async (taskId: string, newTitle: string, previousTitle?: string) => {
  // Renomear um card gerado muda o MODELO: o título é dele, não de uma data.
  // Vale para todas as repetições, e a pessoa precisa saber disso.
  //
  // Vale nos dois modos, e no remoto é uma escolha: `PATCH /activity/rec:…`
  // funcionaria, mas MATERIALIZARIA a ocorrência e renomearia só aquele dia —
  // o oposto do que a pessoa pediu ao editar o título de um card de rotina.
  const occurrence = parseOccurrenceId(taskId)
  if (occurrence) {
    try {
      await updateTemplate(occurrence.templateId, { title: newTitle })
      showSuccess('Título alterado na repetição. Vale para todas as datas.')
    } catch (error: unknown) {
      showError(apiErrorMessage(error, 'Erro ao renomear a repetição'))
      await refreshTasks()
    }
    return
  }

  try {
    await activityService.patchActivity(taskId, { title: newTitle })
  } catch {
    showError('Erro ao renomear atividade')
    // O card já mostrava o nome recusado (otimista do próprio card): volta na
    // hora, e o refetch a seguir confirma com o que o servidor tem.
    const card = findBoardTask(taskId)?.task
    if (card && previousTitle !== undefined && card.title === newTitle) card.title = previousTitle
    await refreshTasks()
  }
}

// ── Delete ──
const confirmDelete = ref(false)
const taskToDelete = ref<BoardTask | null>(null)
const deleting = ref<string | null>(null)

const openDeleteConfirm = (task: BoardTask) => {
  // Excluir um card gerado dispensa SÓ aquele dia; a repetição continua. Não
  // pede confirmação porque não destrói nada: o botão de desfazer é o próprio
  // calendário da aba Agenda, onde a data dispensada volta em um clique.
  if (isOccurrenceId(task.id)) {
    void skipOccurrence(task.id)
      .then(() => showSuccess('Dispensada só nesta data. A repetição continua valendo.'))
      .catch((error: unknown) =>
        showError(apiErrorMessage(error, 'Não foi possível dispensar esta data')),
      )
    return
  }
  taskToDelete.value = task
  confirmDelete.value = true
}

const deleteTask = async () => {
  if (!taskToDelete.value) return
  const id = taskToDelete.value.id
  deleting.value = id
  try {
    await activityService.deleteActivity(id)
    await refreshTasks()
    confirmDelete.value = false
    showSuccess('Tarefa excluída')
    // Excluída pelo "…" do painel: o painel não pode ficar aberto sobre nada.
    if (openTaskId.value === id) closePanel()
  } catch (error: unknown) {
    showError(apiErrorMessage(error, 'Erro ao excluir'))
  } finally {
    deleting.value = null
    taskToDelete.value = null
  }
}

// ── Painel de detalhe sobre o board (spec board-tarefas-redesign, D9) ──────
//
// A tarefa aberta vive na URL (`?task=`), como no `/board`: o link é
// compartilhável, sobrevive ao F5 e o voltar do navegador fecha o painel. O
// board continua montado atrás, com filtro, scroll e colunas intactos. A página
// cheia (`/tasks/:month/:taskId`) continua existindo: é o "Abrir em página" do
// painel, e os links antigos seguem valendo.
const openTaskId = computed(() =>
  typeof route.query.task === 'string' && route.query.task ? route.query.task : null,
)

/**
 * `true` quando fomos NÓS que empilhamos a entrada `?task=` no histórico. Aí o
 * X e o Esc fecham voltando, e o "voltar" do navegador faz exatamente a mesma
 * coisa. Quem chegou por link direto não tem para onde voltar dentro do board:
 * fecha por `replace`, sem sair da tela.
 */
let panelPushed = false

/** Troca por J/K: o painel novo entra sem animação (senão pisca a cada tecla). */
const panelSwitching = ref(false)

const openDetails = (activity: { id: string }) => {
  // Card gerado não tem página de detalhe: ele não existe no servidor. O que a
  // pessoa quer ver ao clicar é a REGRA que o criou.
  if (isOccurrenceId(activity.id)) {
    recurrenceManager.value = true
    return
  }
  // Card otimista da criação inline: a tarefa ainda não existe no servidor.
  if (isPendingTaskId(activity.id)) return
  if (openTaskId.value === activity.id) return
  panelSwitching.value = false
  panelPushed = true
  void router.push({ query: { ...route.query, task: activity.id } })
}

function closePanel() {
  if (!openTaskId.value) return
  if (panelPushed) {
    router.back()
    return
  }
  const query = { ...route.query }
  delete query.task
  void router.replace({ query })
}

function focusCard(id: string) {
  document
    .querySelector<HTMLElement>(`.board-wrap [data-id="${CSS.escape(id)}"]`)
    ?.focus({ preventScroll: false })
}

// Fechou (X, Esc, scrim ou voltar do navegador): o foco volta para o card da
// tarefa que estava aberta, que depois de J/K não é a do primeiro clique.
watch(openTaskId, (id, previous) => {
  if (id) return
  panelPushed = false
  panelSwitching.value = false
  if (previous) void nextTick(() => focusCard(previous))
})

/**
 * J/K e setas com o painel aberto trocam a tarefa. A ordem é a mesma do foco no
 * board (a que a pessoa VÊ, tirada do DOM, sem rotina virtual e sem card
 * otimista) e mora no `useTaskKeyboard`, um caminho só para os dois casos.
 * `replace`: trocar de tarefa não empilha histórico, então um "voltar" fecha o
 * painel em vez de refazer o caminho card por card.
 */
function switchPanelTo(id: string) {
  panelSwitching.value = true
  void router.replace({ query: { ...route.query, task: id } })
}

const findBoardTask = (id: string): { task: BoardTask; status: BoardStatus } | null => {
  for (const status of STATUSES) {
    const task = (tasks.value[status] ?? []).find((t) => t.id === id)
    if (task) return { task, status }
  }
  return null
}

/** Rótulo da rotina que materializou a tarefa aberta (linha "Rotina" do painel). */
const openTaskRecurrenceLabel = computed(() => {
  const id = openTaskId.value
  const task = id ? findBoardTask(id)?.task : null
  if (!task?.recurrenceId) return null
  const template = templateById(task.recurrenceId)
  return template ? describeRule(template.rule) : null
})

/**
 * O painel grava campo a campo e manda cada patch para cá (otimista, depois o
 * confirmado e, se falhar, o rollback). Aplicar no `tasks` local é o que faz o
 * card mudar na mesma hora, sem esperar o refetch que o painel também dispara.
 *
 * Status vai para o FIM da coluna nova, o mesmo lugar que o eco do realtime
 * (`activity:moved` com `position: null`) põe.
 */
const applyPanelPatch = (id: string, patch: Partial<ActivityDetail>) => {
  let found = findBoardTask(id)
  const origin = patchOrigin.get(id)
  // Resposta confirmada (traz o `updatedAt` do servidor): a mudança otimista
  // valeu e não há mais para onde voltar.
  const confirmed = !!patch.updatedAt && (patch.status !== undefined || patch.monthId !== undefined)
  if (!found) {
    // Rollback de uma troca de mês que falhou: o card tinha saído deste board e
    // volta para a coluna e a posição de onde saiu.
    if (origin?.task && patch.monthId === monthId.value) {
      const column = tasks.value[origin.status]
      column.splice(Math.min(origin.index, column.length), 0, origin.task)
      patchOrigin.delete(id)
      found = findBoardTask(id)
    } else if (confirmed) {
      patchOrigin.delete(id)
    }
    if (!found) return
  }
  const { task, status } = found
  if (patch.title !== undefined) task.title = patch.title
  if (patch.priorityNumber !== undefined) task.priorityNumber = patch.priorityNumber
  if (patch.dueDate !== undefined) task.dueDate = patch.dueDate
  if (patch.updatedAt) task.updatedAt = patch.updatedAt
  if (patch.tags !== undefined) task.tags = patch.tags ?? []
  if (patch.subtasks !== undefined) {
    // O `3/6` do card sai daqui: marcar uma subtarefa no painel já o atualiza.
    task.subtasks = (patch.subtasks ?? []).map((s) => ({ id: s.id, title: s.title, status: s.status }))
  }
  if (patch.responsibles !== undefined) {
    task.responsibles = (patch.responsibles ?? []).map((r) => ({
      userId: r.userId,
      user: { id: r.user.id, name: r.user.name },
    }))
  }
  if (patch.monthId && patch.monthId !== monthId.value) {
    // Foi para outro mês: sai deste board (o refetch dos dois meses confirma).
    // Guarda o card e o lugar dele: se o servidor recusar, o rollback volta aqui.
    const index = tasks.value[status].indexOf(task)
    const removed = removeFromColumns(id)
    if (removed) patchOrigin.set(id, { status: origin?.status ?? status, index: origin?.index ?? index, task: removed })
    return
  }
  const nextStatus = patch.status as BoardStatus | undefined
  if (nextStatus && nextStatus !== status && STATUSES.includes(nextStatus)) {
    const index = tasks.value[status].indexOf(task)
    const moved = removeFromColumns(id)
    if (moved) {
      const column = tasks.value[nextStatus]
      if (origin && !origin.task && origin.status === nextStatus) {
        // Voltou para a coluna de onde a mudança otimista o tirou (rollback):
        // mesma posição, e não o fim da coluna.
        column.splice(Math.min(origin.index, column.length), 0, moved)
        patchOrigin.delete(id)
      } else {
        column.push(moved)
        if (!origin) patchOrigin.set(id, { status, index })
      }
    }
  }
  if (confirmed) patchOrigin.delete(id)
}

/**
 * O lozenge do painel troca a coluna pelo mesmo caminho do "Mover para" do card:
 * `PATCH /move` no fim da coluna nova, que grava o histórico, renumera a coluna e
 * avisa o realtime com a posição final. O `PATCH /status` não renumera: o card
 * ia para o fim e, no refetch, pulava para a posição antiga dele. O servidor
 * limita a posição ao tamanho da coluna, então o comprimento local basta.
 */
const writePanelStatus = (id: string, status: string): Promise<ActivityDetail> =>
  activityService.moveActivity(id, {
    status,
    position: tasks.value[status as BoardStatus]?.length ?? 0,
  })

const deleteFromPanel = (task: { id: string; title: string }) => {
  openDeleteConfirm(findBoardTask(task.id)?.task ?? task)
}

// ── Agrupar por pessoa (spec board-tarefas-redesign, D12) ──────────────────
// As linhas saem das colunas JÁ FILTRADAS, que saem do mesmo `tasks` que o
// arraste e o realtime mutam: nada é cópia (realtime e `applyRemoteMove`
// continuam valendo). Linhas recolhidas valem até sair da tela.
const groupedByPerson = computed(() => filters.groupBy.value === 'person')

const lanes = computed(() =>
  groupedByPerson.value
    ? groupByPerson(filteredTasks.value, filters.personKey, filters.isMe)
    : [],
)

const collapsedLanes = ref<string[]>([])

function toggleLane(key: string) {
  collapsedLanes.value = collapsedLanes.value.includes(key)
    ? collapsedLanes.value.filter((k) => k !== key)
    : [...collapsedLanes.value, key]
}

// Trocar o agrupamento tira o campo de criação de onde ele estava.
watch(groupedByPerson, () => quickCreate.close())

// ── Criação inline: onde abre, quem nasce responsável, avisos ──────────────
/** Quem tinha o foco quando o campo abriu (o card do C, o "+" da coluna...). */
let composerOpener: HTMLElement | null = null

/**
 * Abre o campo inline. No board simples, na coluna; agrupado, na célula da
 * linha (que é expandida se estiver recolhida).
 */
function openComposer(status: BoardStatus, laneKey: string | null = null) {
  if (!isWorkerRole.value) return
  composerOpener = document.activeElement as HTMLElement | null
  if (laneKey) collapsedLanes.value = collapsedLanes.value.filter((k) => k !== laneKey)
  quickCreate.open({ status, laneKey })
}

/** Linha em que o C cria: a do card em foco, a sua, ou a primeira. */
function keyboardLaneKey(): string | null {
  const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(
    '[data-lane-key]',
  )?.dataset.laneKey
  if (focused && lanes.value.some((l) => l.key === focused)) return focused
  return lanes.value.find((l) => l.isMe)?.key ?? lanes.value[0]?.key ?? null
}

/** C: criar inline na primeira coluna (o formulário completo é o botão). */
function createFromKeyboard() {
  if (!isWorkerRole.value) return
  // Mês vazio não tem colunas na tela: vai o formulário completo.
  if (totalTasks.value === 0) {
    dialog.value = true
    return
  }
  currentTab.value = 'board'
  if (!groupedByPerson.value) {
    openComposer('TODO')
    return
  }
  const laneKey = keyboardLaneKey()
  if (laneKey) openComposer('TODO', laneKey)
  else dialog.value = true // agrupado e o filtro escondeu todas as linhas
}

function onComposerCancel(status: BoardStatus, reason: 'escape' | 'blur') {
  const target = composer.value
  const opener = composerOpener
  composerOpener = null
  quickCreate.close()
  if (reason !== 'escape') return
  // Esc devolve o foco para quem abriu; se ele sumiu (o próprio "Criar"
  // vira o campo), para o "Criar" daquela coluna ou o "+" daquela linha.
  void nextTick(() => {
    if (opener?.isConnected && boardWrap.value?.contains(opener)) {
      opener.focus()
      return
    }
    const selector = target?.laneKey
      ? `[data-lane-create="${CSS.escape(target.laneKey)}"]`
      : `[data-create="${status}"]`
    boardWrap.value?.querySelector<HTMLElement>(selector)?.focus()
  })
}

/**
 * Membro da empresa pela chave da linha. A chave é o id; quem só aparece em
 * rotina também chega como id, porque o `personKey` resolve o nome pelos
 * membros (`memberPeople`).
 */
function memberPerson(id: string | null | undefined): QuickCreatePerson | null {
  if (!id) return null
  const member = memberPeople.value.find((m) => m.id === id)
  return member ? { id: member.id, name: member.name } : null
}

/**
 * Quem nasce responsável. No board simples, quem criou (como no protótipo
 * aprovado: com "Só minhas" ligado a tarefa não some da tela). Agrupado, o dono
 * da linha onde o campo abriu; em "Sem responsável", ninguém.
 */
function quickCreateResponsible(target: QuickCreateTarget): QuickCreatePerson | null {
  if (target.laneKey) return target.laneKey === NOBODY_LANE ? null : memberPerson(target.laneKey)
  return memberPerson(filters.me.id)
}

/** Criou com um filtro que esconde a tarefa: avisa, senão parece que não criou. */
function warnIfHidden(id: string, status: BoardStatus) {
  if ((filteredTasks.value[status] ?? []).some((t) => t.id === id)) return
  showInfo('Tarefa criada, mas o filtro ligado a esconde. "Limpar filtros" mostra de novo.')
}

/** Anúncio para leitor de tela: o card aparece sem mudar o foco do campo. */
const liveMessage = ref('')

function announceCreated(card: BoardTask, target: QuickCreateTarget) {
  const key = taskKey(card, companyName.value)
  liveMessage.value = `${key ? `${key} criada` : 'Tarefa criada'} em ${statusLabel(target.status)}`
}

// ── Teclado do board (spec D10; os atalhos moram em `useTaskKeyboard`) ─────
// Só C, / e ? valem fora do Board: a Lista cuida do próprio J/K/X/Enter. Com o
// painel aberto, J/K e ↑/↓ trocam a tarefa. Tudo ignorado com foco em campo de
// texto, com modificador (Ctrl+C é copiar) e com menu ou diálogo na frente.
const boardWrap = ref<HTMLElement | null>(null)
const shortcutsOpen = ref(false)

useTaskKeyboard({
  boardActive: () => currentTab.value === 'board',
  root: () => boardWrap.value,
  openTaskId: () => openTaskId.value,
  grouped: () => groupedByPerson.value,
  blocked: () => confirmDelete.value || dialog.value || shortcutsOpen.value,
  onCreate: createFromKeyboard,
  onSearch: () => toolbar.value?.focusSearch(),
  onHelp: () => {
    shortcutsOpen.value = true
  },
  onOpen: (id) => openDetails({ id }),
  onSwitchPanel: switchPanelTo,
  onExpandLanes: () => {
    collapsedLanes.value = []
  },
  onCollapseLanes: () => {
    collapsedLanes.value = lanes.value.map((l) => l.key)
  },
})

/**
 * `‹ Setembro ›`: leva o recorte junto ("Só minhas" em setembro segue em
 * outubro), e a vista também (quem está na Lista continua na Lista).
 */
const goToMonth = (id: string) => {
  const vista = TAB_PARAM[currentTab.value]
  void router.push({
    path: `/tasks/${id}`,
    query: { ...filters.filterQuery.value, ...(vista ? { vista } : {}) },
  })
}

/**
 * Formulário completo com a coluna já escolhida: é o "+" da vista Lista. No
 * Board, o "+" e o "Criar" da coluna abrem a criação inline (`openComposer`).
 * O rascunho que estiver no formulário continua (fechar o diálogo não apaga o
 * que a pessoa digitou); só a coluna de destino muda.
 */
const openCreateIn = (status: BoardStatus) => {
  if (!isWorkerRole.value) return
  formActivity.value = { ...formActivity.value, initialStatus: status }
  dialog.value = true
}

const monthName = computed(() => currentMonthInfo.value?.month.name ?? '')

// Rótulo e cor de status saem do task-meta, a mesma fonte das colunas.
const statusLabel = (status: string) => statusSpec(status).label
const statusColor = (status: string) => statusSpec(status).token

/** Um formatador para o Histórico inteiro (antes, um `toLocaleString` por entrada a cada render). */
const HISTORY_DATE = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * O Histórico já ordenado (mais recente primeiro) e com a data formatada UMA
 * vez por carga do `/backlog`, não a cada render. Com milhares de entradas,
 * formatar no template custava centenas de ms por tecla na busca e por J/K.
 */
const sortedHistory = computed(() =>
  backLog.value
    .map((entry) => ({ entry, at: new Date(entry.changedAt).getTime() }))
    .sort((a, b) => b.at - a.at)
    .map(({ entry, at }) => ({ ...entry, when: Number.isFinite(at) ? HISTORY_DATE.format(at) : '' })),
)

// ── Repetição: gerenciador e ações de modelo ────────────────────────────────

const recurrenceManager = ref(false)

/** Editar a regra reabre o formulário de tarefa com o modelo dentro. */
const editRecurrence = (template: RecurringTemplate) => {
  const idsByName = new Map(members.value.map((m) => [m.name, m.id]))
  formActivity.value = {
    ...EMPTY_FORM(),
    title: template.title,
    description: template.description,
    priorityNumber: template.priorityNumber,
    initialStatus: template.initialStatus,
    assignees: template.assignees.map((name) => idsByName.get(name) ?? name),
    tags: template.tags,
    subtasks: template.subtasks.map((s) => ({ ...s })),
    dueDate: template.rule.startDate,
    rule: { ...template.rule },
  }
  // Editar substitui: o formulário atual é de criação, então gravar por cima
  // significa apagar o modelo antigo. Explícito aqui, e não escondido no store.
  editingRecurrenceId.value = template.id
  recurrenceManager.value = false
  dialog.value = true
}

const editingRecurrenceId = ref<string | null>(null)

/**
 * Fechar o formulário no meio de uma edição descarta o vínculo E o rascunho.
 *
 * Sem isso, o próximo "Nova Atividade" abriria preenchido com uma tarefa que já
 * existe e, ao salvar, sobrescreveria a repetição que a pessoa só tinha ido
 * espiar. Fica num `watch` e não no `@close` porque Esc e clique no scrim
 * fecham o `AppDialog` sem passar pelo botão.
 */
watch(dialog, (open) => {
  if (open || !editingRecurrenceId.value) return
  editingRecurrenceId.value = null
  formActivity.value = EMPTY_FORM()
})

const removeRecurrence = async (template: RecurringTemplate) => {
  try {
    const kept = await removeTemplate(template.id)
    // O servidor devolve quantas atividades sobreviveram. Dizer o número é o
    // que separa "excluí a regra" de "apaguei o histórico": as tarefas que já
    // nasceram dela continuam lá, com o tempo e os comentários que receberam.
    showSuccess(
      kept > 0
        ? `Repetição excluída. ${kept} tarefa${kept > 1 ? 's' : ''} já criada${kept > 1 ? 's' : ''} continua${kept > 1 ? 'm' : ''} no quadro.`
        : 'Repetição excluída',
    )
  } catch (error: unknown) {
    showError(apiErrorMessage(error, 'Não foi possível excluir a repetição'))
  }
}

const toggleRecurrence = async (template: RecurringTemplate) => {
  const pausing = template.active
  try {
    await toggleActive(template.id)
    showSuccess(pausing ? 'Repetição pausada' : 'Repetição retomada')
  } catch (error: unknown) {
    showError(apiErrorMessage(error, 'Não foi possível alterar a repetição'))
  }
}

/**
 * Muda o prazo da repetição para o mês seguinte.
 *
 * É a resposta direta ao ritual de recopiar o quadro na virada: em vez de
 * recriar tudo em novembro, muda-se a data e o mês vem junto.
 */
const moveRecurrenceToNextMonth = async (template: RecurringTemplate) => {
  try {
    const landed = await moveToMonth(template.id, shiftMonthKey(monthCalendarKey.value, 1))
    if (landed) showSuccess(`Prazo movido: a tarefa foi para ${monthLabel(landed)}`)
  } catch (error: unknown) {
    showError(apiErrorMessage(error, 'Não foi possível mover o prazo'))
  }
}

// Alturas fake do skeleton: colunas com "cargas" diferentes leem como um board
// de verdade carregando, não como quatro barras genéricas.
const skeletonLanes = [
  [76, 64, 92, 64],
  [88, 64],
  [64, 76],
  [64, 92, 64, 76, 64],
]
</script>

<template>
  <div class="tasks-page">
    <!-- Cabeçalho enxuto: o mês com ‹ ›, as vistas, as rotinas e o criar. O
         contexto (Tarefas / Q3) mora no breadcrumb da topbar, não num eyebrow
         em cima do título. A contagem por status já está em cada coluna. -->
    <header class="board-head">
      <div class="month-nav">
        <button
          type="button"
          class="icon-btn hit"
          :disabled="!prevMonth"
          :aria-label="prevMonth ? `Mês anterior, ${prevMonth.name}` : 'Não há mês anterior'"
          :title="prevMonth?.name"
          @click="prevMonth && goToMonth(prevMonth.id)"
        >
          <ChevronLeft :size="16" :stroke-width="1.8" />
        </button>
        <h1 class="board-title">{{ monthName || 'Carregando…' }}</h1>
        <button
          type="button"
          class="icon-btn hit"
          :disabled="!nextMonth"
          :aria-label="nextMonth ? `Próximo mês, ${nextMonth.name}` : 'Não há próximo mês'"
          :title="nextMonth?.name"
          @click="nextMonth && goToMonth(nextMonth.id)"
        >
          <ChevronRight :size="16" :stroke-width="1.8" />
        </button>
      </div>

      <div class="views" role="group" aria-label="Vista">
        <button
          type="button"
          class="views__btn hit"
          :aria-pressed="currentTab === 'board'"
          @click="currentTab = 'board'"
        >
          Board
        </button>
        <!-- Lista (D11): as mesmas tarefas filtradas, uma por linha, com
             seleção múltipla e edição em massa. -->
        <button
          type="button"
          class="views__btn hit"
          :aria-pressed="currentTab === 'list'"
          @click="currentTab = 'list'"
        >
          Lista
        </button>
        <!-- Agenda: o mesmo mês visto por dia. É onde as tarefas geradas por
             repetição aparecem no calendário, e onde uma data pode ser
             dispensada sem mexer na regra. -->
        <button
          type="button"
          class="views__btn hit"
          :aria-pressed="currentTab === 'agenda'"
          @click="currentTab = 'agenda'"
        >
          Agenda
        </button>
        <!-- "Histórico" (D13): é o registro de mudanças de status da empresa,
             não um backlog. O nome antigo prometia outra coisa. -->
        <button
          type="button"
          class="views__btn hit"
          :aria-pressed="currentTab === 'history'"
          @click="currentTab = 'history'"
        >
          Histórico
        </button>
      </div>

      <!-- Agrupar (D12): opção de exibição do Board, não filtro. Vai para a
           URL (`agrupar=pessoa`) e para o "Lembrar filtro". -->
      <div v-show="currentTab === 'board'" class="group-by" role="group" aria-label="Agrupar o board">
        <span class="group-by__label" aria-hidden="true">Agrupar</span>
        <div class="views">
          <button
            type="button"
            class="views__btn hit"
            :aria-pressed="!groupedByPerson"
            @click="filters.setGroupBy('none')"
          >
            Nenhum
          </button>
          <button
            type="button"
            class="views__btn hit"
            :aria-pressed="groupedByPerson"
            @click="filters.setGroupBy('person')"
          >
            Pessoa
          </button>
        </div>
      </div>

      <span class="head-spacer" />

      <button
        type="button"
        class="icon-btn hit"
        aria-label="Atalhos do teclado"
        aria-keyshortcuts="?"
        title="Atalhos do teclado (?)"
        @click="shortcutsOpen = true"
      >
        <Keyboard :size="16" :stroke-width="1.8" />
      </button>

      <!-- Repetições do mês. Um diálogo, e não uma tela: recorrência é uma
           propriedade da tarefa, e uma entrada própria na navegação criaria
           dois lugares para procurar a mesma tarefa. -->
      <button
        type="button"
        class="btn hit"
        title="Tarefas que se repetem sozinhas"
        @click="recurrenceManager = true"
      >
        Rotinas
        <span v-if="recurringCount > 0" class="btn__count">{{ recurringCount }}</span>
      </button>

      <!-- Formulário completo. O C cria inline na primeira coluna (S4), por
           isso a tecla não aparece aqui: ela faz outra coisa. -->
      <button
        v-if="isWorkerRole"
        type="button"
        class="btn btn--primary hit"
        title="Criar com todos os campos: responsáveis, prazo, tags e documento"
        @click="dialog = true"
      >
        Nova tarefa
      </button>
    </header>

    <!-- Toolbar SEMPRE à vista no Board (D8). Na Agenda e no Histórico ela não
         filtra nada, e um filtro que não age mentiria sobre a tela. No mês
         vazio também sai (só chips zerados), a não ser que haja filtro ligado
         para desligar. -->
    <TaskBoardToolbar
      v-show="
        (currentTab === 'board' || currentTab === 'list') &&
        (totalTasks > 0 || filters.activeCount.value > 0)
      "
      ref="toolbar"
      class="board-toolbar"
      :filters="filters"
    />

    <!-- Corpo: skeleton → erro → board/agenda/histórico -->
    <div class="tasks-body">
      <!-- Loading: skeleton em forma de board (nada de spinner no meio da tela) -->
      <div v-if="loading" class="skel-board" aria-label="Carregando tarefas" aria-busy="true">
        <div v-for="(lane, li) in skeletonLanes" :key="li" class="skel-lane">
          <div class="skel-lane__head">
            <Skeleton type="block" height="20px" />
          </div>
          <Skeleton
            v-for="(h, ci) in lane"
            :key="ci"
            type="block"
            :height="`${h}px`"
            class="skel-card"
          />
        </div>
      </div>

      <!-- Erro: mensagem útil + retry -->
      <EmptyState
        v-else-if="tasksError"
        :icon="CloudOff"
        title="Não deu para carregar o board"
        description="A conexão com o servidor falhou. Verifique sua internet e tente de novo."
      >
        <template #action>
          <button class="btn hit" @click="refetchBoards()">
            <RefreshCw :size="14" />
            Tentar de novo
          </button>
        </template>
      </EmptyState>

      <template v-else>
        <!-- Board view -->
        <div v-show="currentTab === 'board'" ref="boardWrap" class="board-wrap">
          <EmptyState
            v-if="totalTasks === 0"
            :title="monthName ? `Nenhuma tarefa em ${monthName.toLowerCase()}.` : 'Nenhuma tarefa neste mês.'"
          >
            <template v-if="isWorkerRole" #action>
              <button type="button" class="btn btn--primary hit" @click="dialog = true">
                <Plus :size="14" :stroke-width="2" />
                Criar tarefa
              </button>
            </template>
          </EmptyState>
          <!-- Agrupado por pessoa (D12): linhas por responsável; arraste só
               dentro da linha. -->
          <TaskLanes
            v-else-if="groupedByPerson"
            :lanes="lanes"
            :readonly="!isWorkerRole"
            :company-name="companyName"
            :collapsed-keys="collapsedLanes"
            :composer="composer?.laneKey ? { laneKey: composer.laneKey, status: composer.status } : null"
            :composer-restore="composerRestore"
            @move-task="handleMove"
            @open-details="openDetails"
            @delete-task="openDeleteConfirm"
            @rename-task="handleRenameTask"
            @show-occurrences="currentTab = 'agenda'"
            @toggle-lane="toggleLane"
            @create-in="(status, laneKey) => openComposer(status, laneKey)"
            @quick-create="(_status, title) => quickCreate.submit(title)"
            @composer-cancel="onComposerCancel"
          />
          <KanbanBoard
            v-else
            :tasks="filteredTasks"
            :readonly="!isWorkerRole"
            :company-name="companyName"
            :composer-status="composer && !composer.laneKey ? composer.status : null"
            :composer-restore="composerRestore"
            @move-task="handleMove"
            @open-details="openDetails"
            @delete-task="openDeleteConfirm"
            @rename-task="handleRenameTask"
            @show-occurrences="currentTab = 'agenda'"
            @create-in="(status) => openComposer(status)"
            @quick-create="(_status, title) => quickCreate.submit(title)"
            @composer-cancel="onComposerCancel"
          />
        </div>

        <!-- Lista (D11). Montada só quando está à vista: as linhas não ficam no
             DOM atrás do Board, e a seleção começa vazia a cada visita. -->
        <div v-if="currentTab === 'list'" class="list-wrap">
          <EmptyState
            v-if="totalTasks === 0"
            :title="monthName ? `Nenhuma tarefa em ${monthName.toLowerCase()}.` : 'Nenhuma tarefa neste mês.'"
          >
            <template v-if="isWorkerRole" #action>
              <button type="button" class="btn btn--primary hit" @click="dialog = true">
                <Plus :size="14" :stroke-width="2" />
                Criar tarefa
              </button>
            </template>
          </EmptyState>
          <TaskListView
            v-else
            :tasks="filteredTasks"
            :company-name="companyName"
            :readonly="!isWorkerRole"
            :members="members"
            :quarters="quartersList"
            :month-id="monthId"
            :open-task-id="openTaskId"
            :apply-patch="applyPanelPatch"
            :write-status="writePanelStatus"
            :refresh="refreshTasks"
            @open="openDetails"
            @create-in="openCreateIn"
            @switch-panel="switchPanelTo"
          />
        </div>

        <!-- Agenda view: o mês por dia, com as ocorrências das repetições -->
        <div v-show="currentTab === 'agenda'" class="agenda-wrap">
          <RecurringAgenda
            :month-key="monthCalendarKey"
            :scheduled="scheduledOccurrences"
            :fixed="monthlyFixed"
            @open="recurrenceManager = true"
            @skip="skipOccurrence($event.id)"
            @restore="restoreOccurrence($event.id)"
            @reset="resetOccurrence($event.id)"
          />
        </div>

        <!-- Histórico: mudanças de status da empresa, da mais recente para a mais
             antiga. `v-if`, e não `v-show`: escondido, ele era redesenhado a
             cada render do board (uma tecla na busca, um J/K), e com milhares
             de entradas isso custava centenas de ms por tecla. -->
        <div v-if="currentTab === 'history'" class="backlog-panel">
          <div v-if="sortedHistory.length === 0" class="backlog-empty">
            <History :size="36" class="backlog-empty-icon" />
            <span>Nenhuma mudança de status registrada</span>
            <span class="backlog-empty-sub">Cada troca de coluna aparece aqui</span>
          </div>

          <div v-else class="backlog-list">
            <div
              v-for="entry in sortedHistory"
              :key="entry.id"
              class="backlog-item"
            >
              <div
                class="backlog-dot"
                :style="{ backgroundColor: statusColor(entry.newStatus) }"
              />
              <div class="backlog-info">
                <span class="backlog-title">{{ entry.activityTitle }}</span>
                <span class="backlog-meta">
                  {{ entry.changedBy?.name }} ·
                  <span
                    v-if="entry.previousStatus"
                    class="backlog-status-badge"
                    :style="{ color: statusColor(entry.previousStatus) }"
                  >{{ statusLabel(entry.previousStatus) }}</span>
                  <span v-else>Novo</span>
                  →
                  <span
                    class="backlog-status-badge"
                    :style="{ color: statusColor(entry.newStatus) }"
                  >{{ statusLabel(entry.newStatus) }}</span>
                </span>
              </div>
              <span class="backlog-time">{{ entry.when }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Delete dialog (primitive do design system, não v-dialog) -->
    <ConfirmDialog
      v-model="confirmDelete"
      danger
      title="Excluir tarefa"
      :message="`Tem certeza que deseja excluir “${taskToDelete?.title ?? ''}”? Essa ação não pode ser desfeita.`"
      confirm-label="Excluir"
      :loading="!!deleting"
      @confirm="deleteTask"
    />

    <!-- Create task dialog (casca AppDialog; o TaskForm põe header/corpo/footer) -->
    <AppDialog
      v-model="dialog"
      :label="editingRecurrenceId ? 'Editar repetição' : 'Nova tarefa'"
      size="lg"
      :loading="creating"
    >
      <TaskForm
        v-if="dialog"
        v-model="formActivity"
        :members="members"
        :company-id="companyId"
        :loading="creating"
        :editing="!!editingRecurrenceId"
        @close="dialog = false"
        @submit="createActivity"
      />
    </AppDialog>

    <!-- Repetições do mês -->
    <RecurrenceManagerDialog
      v-model="recurrenceManager"
      :templates="recurrenceTemplates"
      :month-key="monthCalendarKey"
      :count-in-month="countInMonth"
      @edit="editRecurrence"
      @remove="removeRecurrence"
      @toggle="toggleRecurrence"
      @move-to-next-month="moveRecurrenceToNextMonth"
    />

    <!-- Ajuda do teclado (tecla ?) -->
    <TaskShortcutsDialog v-model="shortcutsOpen" :grouped="groupedByPerson" />

    <!-- Criação inline: o card aparece acima do campo e o foco fica no campo;
         quem usa leitor de tela ouve que a tarefa foi criada. -->
    <p class="sr-only" aria-live="polite">{{ liveMessage }}</p>

    <!-- Detalhe em painel sobre o board (D9). `key` por tarefa: trocar por J/K
         desmonta o painel anterior, e o autosave pendente dele grava na tarefa
         certa (o id nunca muda por baixo de uma gravação em voo). -->
    <TaskDetailPanel
      v-if="openTaskId"
      :key="openTaskId"
      :task-id="openTaskId"
      :company-id="companyId"
      :company-name="companyName"
      :readonly="roleResolved && !isWorkerRole"
      :recurrence-label="openTaskRecurrenceLabel"
      :instant="panelSwitching"
      :write-status="writePanelStatus"
      :apply-patch="applyPanelPatch"
      deletable
      @close="closePanel"
      @delete="deleteFromPanel"
    />
  </div>
</template>

<style scoped>
/* ─── Layout: a página ocupa a viewport e o board rola POR COLUNA.
   Antes o scroll era da página inteira: a coluna mais cheia esticava as
   outras em painéis vazios gigantes. ─── */
.tasks-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 24px dos lados: com a sidebar de 248px, sobram 1144px em 1440, o exato das
     quatro colunas de 280px mais três vãos de 8px (spec board-tarefas, D5).
     Em cima, duas faixas de 44px (o alvo mínimo da spec) uma sobre a outra,
     sem se sobrepor: o cabeçalho em 0..44 e a toolbar em 44..88. É o menor
     topo possível com alvos de 44px em duas linhas; o 1º card fica em 88px
     mais os 36px do cabeçalho da coluna. */
  padding: 6px 24px 0;
  max-width: 1600px;
  /*
   * Ancorada à esquerda, como Dashboard, Meu tempo e Drive. Centralizada, ela
   * descolava da sidebar em monitor largo, e trocar de aba parecia mover a
   * página inteira: o board era a única tela que fazia isso.
   */
  margin: 0;
  width: 100%;
}

.tasks-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.board-wrap {
  flex: 1;
  min-height: 0;
}

.list-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ─── Alvo de 44px com desenho de 32px ───
   A área de clique cresce para cima e para baixo sem ocupar altura no layout
   (acessibilidade 50+ da spec). Cada controle da linha fecha exatamente a
   faixa de 44px dela, e a faixa da toolbar começa onde a do cabeçalho acaba:
   nenhum clique perto de um botão cai no vizinho de cima ou de baixo. */
.hit {
  position: relative;
}

/* O ::after se mede pela caixa de padding: num botão com borda de 1px, 7px
   para cada lado dão os 44px contados da borda de fora. */
.hit::after {
  content: '';
  position: absolute;
  inset: -7px 0;
}

/* ─── Cabeçalho ─── */
.board-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  min-height: 32px;
  /* 6 + 32 + 12 = 50: a toolbar começa 6px depois do fim da faixa de 44px. */
  margin-bottom: 12px;
  flex-shrink: 0;
}

.month-nav {
  display: flex;
  align-items: center;
  gap: 2px;
}

.board-title {
  margin: 0 4px;
  min-width: 96px;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
  white-space: nowrap;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.icon-btn.hit::after {
  inset: -7px;
}

.icon-btn:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}

.icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.views {
  display: flex;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: visible;
}

.views__btn {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-3);
  font: inherit;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
}

.views__btn.hit::after {
  inset: -8px 0;
}

.views__btn:hover {
  color: var(--text);
}

.views__btn[aria-pressed='true'] {
  background: var(--surface-3);
  color: var(--text);
  font-weight: 500;
}

.head-spacer {
  flex: 1 1 0;
}

/* "Agrupar  Nenhum | Pessoa": o rótulo fora da caixa, o segmentado igual ao
   das vistas. */
.group-by {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-by__label {
  font-size: 13px;
  color: var(--text-3);
  white-space: nowrap;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
}

.btn:hover {
  background: var(--surface-2);
}

.btn__count {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.btn--primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--accent-fg);
  font-weight: 500;
}

.btn--primary:hover {
  background: var(--accent);
  filter: brightness(1.06);
}

.icon-btn:focus-visible,
.views__btn:focus-visible,
.btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.board-toolbar {
  margin-bottom: 6px;
  flex-shrink: 0;
}

/* ─── Skeleton board ─── */
.skel-board {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 8px;
  overflow: hidden;
}

.skel-lane {
  flex: 0 0 280px;
  padding: 6px 8px 0;
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
}

.skel-lane__head {
  width: 55%;
  margin-bottom: 14px;
}

.skel-card {
  margin-bottom: 6px;
  border-radius: var(--radius-sm);
}

/* ─── Agenda (mês por dia) ─── */
.agenda-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 16px;
}

/* ─── Backlog ─── */
.backlog-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin-bottom: 16px;
}

.backlog-list {
  flex: 1;
  overflow-y: auto;
}

.backlog-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  transition: background 0.1s ease;
}

.backlog-item:last-child { border-bottom: none; }
.backlog-item:hover { background: var(--surface-2); }

.backlog-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.backlog-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.backlog-title {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.backlog-meta {
  font-size: 12px;
  color: var(--text-3);
}

.backlog-status-badge {
  font-weight: 600;
}

.backlog-time {
  font-size: 11.5px;
  color: var(--text-4);
  white-space: nowrap;
  flex-shrink: 0;
}

.backlog-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 6px;
  padding: 48px;
  font-size: 14px;
  color: var(--text-3);
}

.backlog-empty-icon {
  color: var(--text-4);
  opacity: 0.6;
}

.backlog-empty-sub {
  font-size: 12.5px;
  color: var(--text-4);
}

/* ─── Mobile ─── */
@media (max-width: 640px) {
  .tasks-page {
    padding: 10px 14px 0;
  }

  .head-spacer {
    display: none;
  }
}
</style>
