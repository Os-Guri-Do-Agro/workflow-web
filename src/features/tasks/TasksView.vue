<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Columns3,
  History,
  SlidersHorizontal,
  Plus,
  X,
  Inbox,
  CloudOff,
  RefreshCw,
  CalendarDays,
  Repeat,
  Bookmark,
} from 'lucide-vue-next'
import TaskForm, { type TaskFormSubtask } from '@/components/tasks/TaskForm.vue'
import { plainToHtml } from '@/features/tasks/description-html'
import AppDialog from '@/components/ui/AppDialog.vue'
import KanbanBoard from '@/components/tasks/KanbanBoard.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import TagChip from '@/components/ui/TagChip.vue'
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
import { useTaskFilterMemory } from '@/features/tasks/composables/useTaskFilterMemory'
import type { ActivityMovedPayload } from '@/service/realtime/realtime-service'
import { useQueryClient } from '@tanstack/vue-query'
// ── Repetição (PROTÓTIPO, dado fictício — ver docs/specs/tarefas-recorrentes-backend-contract.md)
// Recorrência é um CAMPO da tarefa, então ela vive aqui dentro, no board do mês,
// e não numa tela paralela: dois lugares para procurar a mesma tarefa seria
// exatamente o problema que a feature tenta resolver.
import RecurringAgenda from '@/features/tasks/recurring/components/RecurringAgenda.vue'
import RecurrenceManagerDialog from '@/features/tasks/recurring/components/RecurrenceManagerDialog.vue'
import { useRecurringTasks } from '@/features/tasks/recurring/useRecurringTasks'
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
  user: { name: string }
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
const selectedUser = ref<string>('')
const currentTab = ref<'board' | 'agenda' | 'backlog'>('board')
const members = ref<CompanyMember[]>([])
const isWorkerRole = ref(false)
const { success: showSuccess, error: showError } = useToast()
const formActivity = ref<ActivityFormModel>(EMPTY_FORM())

// Local mutable tasks ref for optimistic drag-and-drop updates
const tasks = ref<BoardColumns>({ TODO: [], IN_PROGRESS: [], IN_TESTING: [], DONE: [] })

const STATUSES: BoardStatus[] = ['TODO', 'IN_PROGRESS', 'IN_TESTING', 'DONE']

// ── Reactive query keys ──
const companyId = computed(() => localStorage.getItem('activeCompany') ?? '')
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

// Sync tasks query data → local ref (preserves optimistic mutation support)
watch(tasksData, (val) => { if (val) tasks.value = val }, { immediate: true })

const loading = computed(() => tasksLoading.value)

const backLog = computed(() => backlogData.value ?? [])

/** Mês atual + nome do trimestre que o contém (eyebrow do header). */
const currentMonthInfo = computed<{ month: RawMonth; quarterName: string | null } | null>(() => {
  const raw = quartersData.value as RawQuarter[] | { data?: RawQuarter[] } | undefined
  const quarters: RawQuarter[] = Array.isArray(raw) ? raw : (raw?.data ?? [])
  for (const quarter of quarters) {
    const month = quarter.months?.find((m) => m.id === monthId.value)
    if (month) return { month, quarterName: quarter.name ?? null }
  }
  return null
})

// ── Repetição: o mês do board em calendário de verdade ──────────────────────
//
// `/tasks/:month` navega por `monthId` (uuid) e o contrato atual não devolve o
// intervalo de datas do mês. `resolveBoardMonthKey` é a costura do protótipo
// (ela some quando a §8 do contrato de backend existir).
const monthCalendarKey = computed(() =>
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
} = useRecurringTasks(monthCalendarKey, companyId)

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
 */
const boardTasks = computed<BoardColumns>(() => {
  const merged = { TODO: [], IN_PROGRESS: [], IN_TESTING: [], DONE: [] } as BoardColumns
  for (const status of STATUSES) merged[status] = [...(tasks.value[status] ?? [])]
  for (const occurrence of boardOccurrences.value) {
    merged[occurrence.status].push(occurrenceToBoardTask(occurrence))
  }
  return merged
})

const refreshTasks = () =>
  queryClient.refetchQueries({ queryKey: ['boards', monthId.value] })

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
const createRecurrence = () => {
  const form = formActivity.value
  // Responsáveis viram NOMES: o modelo é do protótipo e o card mostra nome, não
  // uuid. Some quando `responsibleUserIds` for para a API de verdade.
  const nameById = new Map(members.value.map((m) => [m.id, m.name]))
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
  if (editingRecurrenceId.value) {
    updateTemplate(editingRecurrenceId.value, template)
    showSuccess('Repetição atualizada')
  } else {
    createTemplate(template)
    showSuccess(`Repetição criada — ${describeRule(template.rule).toLowerCase()}`)
  }

  editingRecurrenceId.value = null
  formActivity.value = EMPTY_FORM()
  dialog.value = false
}

const createActivity = async () => {
  if (!formActivity.value.title) return

  // Recorrente não passa pela API: é o protótipo. Avulsa segue o caminho real.
  if (formActivity.value.rule.frequency !== 'once') {
    createRecurrence()
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
    showSuccess('Atividade criada com sucesso')
  } catch (error: unknown) {
    showError(apiErrorMessage(error, 'Erro ao criar atividade'))
  } finally {
    creating.value = false
  }
}

onMounted(async () => {
  isWorkerRole.value = (await getInfoAuth()) || false
  findMembers()
  if (route.query.new === '1') {
    dialog.value = true
    router.replace({ path: route.path })
  }
})

// ── Filters ──
const filterPriority = ref<number | null>(null)
const filterStatus = ref<string | null>(null)

/**
 * Filtro por tag, guardado na URL (`?tags=cms,infra`).
 *
 * Só este filtro persiste na URL, e de propósito: "me manda o board só do CMS"
 * é o recorte que as pessoas compartilham por link. Responsável e prioridade
 * continuam efêmeros como sempre foram; espalhar tudo pela query string
 * transformaria a URL num despejo de estado de UI.
 *
 * Guardamos o SLUG, não o id: o link continua legível e sobrevive a rename.
 */
const filterTags = ref<string[]>(parseTagsParam(route.query.tags))

function parseTagsParam(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  return value.split(',').map((s) => s.trim()).filter(Boolean)
}

watch(filterTags, (next) => {
  const query = { ...route.query }
  if (next.length) query.tags = next.join(',')
  else delete query.tags
  void router.replace({ query })
})

// Voltar/avançar no navegador tem que refletir no filtro, senão a URL e a tela
// discordam depois de um botão de voltar.
watch(
  () => route.query.tags,
  (value) => {
    const next = parseTagsParam(value)
    if (next.join(',') !== filterTags.value.join(',')) filterTags.value = next
  },
)

/** Todas as tags presentes no board carregado, para os chips do filtro. */
const boardTags = computed(() => {
  const seen = new Map<string, { id: string; name: string; slug: string; color: string | null }>()
  for (const status of STATUSES) {
    for (const task of boardTasks.value[status] ?? []) {
      for (const link of task.tags ?? []) {
        if (!seen.has(link.tag.slug)) seen.set(link.tag.slug, link.tag)
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
})

function toggleTagFilter(slug: string): void {
  filterTags.value = filterTags.value.includes(slug)
    ? filterTags.value.filter((s) => s !== slug)
    : [...filterTags.value, slug]
}

const priorityOptions = [
  { value: null, label: 'Todas' },
  { value: 0, label: 'P0' },
  { value: 1, label: 'P1' },
  { value: 2, label: 'P2' },
  { value: 3, label: 'P3' },
  { value: 4, label: 'P4' },
  { value: 5, label: 'P5' },
]

const filteredTasks = computed<BoardColumns>(() => {
  const result = { TODO: [], IN_PROGRESS: [], IN_TESTING: [], DONE: [] } as BoardColumns
  // Itera SÓ os status: a resposta do board carrega `monthId` junto das
  // colunas, e um Object.entries cru vazaria essa chave para o board.
  for (const status of STATUSES) {
    let arr: BoardTask[] = boardTasks.value[status] || []
    if (selectedUser.value) {
      arr = arr.filter((t) => t.responsibles?.some((r) => r.user.name === selectedUser.value))
    }
    if (filterPriority.value !== null) {
      arr = arr.filter((t) => t.priorityNumber === filterPriority.value)
    }
    if (filterTags.value.length) {
      // E, não OU: marcar "cms" e "urgente" mostra o que é as duas coisas. Com
      // OU, cada tag adicionada AUMENTARIA a lista, que é o oposto de filtrar.
      arr = arr.filter((t) => {
        const slugs = new Set((t.tags ?? []).map((link) => link.tag.slug))
        return filterTags.value.every((slug) => slugs.has(slug))
      })
    }
    if (filterStatus.value !== null && status !== filterStatus.value) {
      arr = []
    }
    result[status] = arr
  }
  return result
})

const activeFiltersCount = computed(() => {
  let c = 0
  if (selectedUser.value) c++
  if (filterPriority.value !== null) c++
  if (filterStatus.value !== null) c++
  c += filterTags.value.length
  return c
})

const clearFilters = () => {
  selectedUser.value = ''
  filterPriority.value = null
  filterStatus.value = null
  // Limpa a URL junto: filtro invisível continuar na query string é o caminho
  // certo para alguém compartilhar um link que mostra menos do que ele viu.
  filterTags.value = []
}

/**
 * "Lembrar filtro": guarda o recorte por empresa e restaura na próxima visita.
 *
 * Desligar limpa a tela junto, e não só o registro. Se desmarcar apenas parasse
 * de gravar, a pessoa continuaria olhando um board filtrado depois de dizer que
 * não quer mais filtro guardado — e a ação pareceria não ter feito nada.
 */
const { remember: rememberFilters, setRemember } = useTaskFilterMemory(
  companyId,
  {
    user: selectedUser,
    priority: filterPriority,
    status: filterStatus,
    tags: filterTags,
  },
  { urlHasTags: () => parseTagsParam(route.query.tags).length > 0 },
)

const toggleRememberFilters = () => {
  const next = !rememberFilters.value
  setRemember(next)
  if (!next) clearFilters()
}

const allUsers = computed<string[]>(() => {
  const users = new Set<string>()
  for (const status of STATUSES) {
    for (const task of boardTasks.value[status] ?? []) {
      task.responsibles?.forEach((r) => users.add(r.user.name))
    }
  }
  return Array.from(users).sort()
})

const userItems = computed<{ label: string; value: string }[]>(() => [
  { label: 'Todos', value: '' },
  ...allUsers.value.map((u) => ({ label: u, value: u })),
])


// Soma SÓ as colunas de status: a resposta do board também carrega `monthId`,
// e um Object.values cru contava essa chave como "1 atividade" a mais.
const totalTasks = computed(() =>
  STATUSES.reduce((acc, s) => acc + (boardTasks.value[s]?.length ?? 0), 0),
)

/**
 * Pulso do mês: distribuição das atividades por status, direto nos tokens de
 * cor de status. Alimenta a barra segmentada + legenda do header.
 */
const statusPulse = computed(() => {
  const defs: { key: BoardStatus; label: string; token: string }[] = [
    { key: 'TODO', label: 'A fazer', token: 'var(--status-todo)' },
    { key: 'IN_PROGRESS', label: 'Em andamento', token: 'var(--status-prog)' },
    { key: 'IN_TESTING', label: 'Em teste', token: 'var(--status-test)' },
    { key: 'DONE', label: 'Concluído', token: 'var(--status-done)' },
  ]
  return defs.map((d) => ({ ...d, count: boardTasks.value[d.key]?.length ?? 0 }))
})

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
const handleMove = async (payload: { taskId: string; status: string; position: number }) => {
  const { taskId, status, position } = payload

  // Card gerado por repetição: a mudança é do DIA, não do modelo. Mover a
  // segunda-feira para "Concluído" não pode dar a semana inteira como feita.
  // Nada de API aqui — a ocorrência ainda não existe no servidor.
  if (isOccurrenceId(taskId)) {
    setOccurrenceStatus(taskId, status as BoardStatus)
    return
  }

  const movedTask = removeFromColumns(taskId)
  const target = tasks.value[status as BoardStatus]
  if (movedTask && target) {
    const idx = Math.max(0, Math.min(position, target.length))
    target.splice(idx, 0, movedTask)
  }

  try {
    await activityService.moveActivity(taskId, { status, position })
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
const handleRenameTask = async (taskId: string, newTitle: string) => {
  // Renomear um card gerado muda o MODELO: o título é dele, não de uma data.
  // Vale para todas as repetições, e a pessoa precisa saber disso.
  const occurrence = parseOccurrenceId(taskId)
  if (occurrence) {
    updateTemplate(occurrence.templateId, { title: newTitle })
    showSuccess('Título alterado na repetição — vale para todas as datas')
    return
  }

  try {
    await activityService.patchActivity(taskId, { title: newTitle })
  } catch {
    showError('Erro ao renomear atividade')
    await refreshTasks() // revert
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
    skipOccurrence(task.id)
    showSuccess('Dispensada só nesta data. A repetição continua valendo.')
    return
  }
  taskToDelete.value = task
  confirmDelete.value = true
}

const deleteTask = async () => {
  if (!taskToDelete.value) return
  deleting.value = taskToDelete.value.id
  try {
    await activityService.deleteActivity(taskToDelete.value.id)
    await refreshTasks()
    confirmDelete.value = false
    showSuccess('Atividade excluída')
  } catch (error: unknown) {
    showError(apiErrorMessage(error, 'Erro ao deletar'))
  } finally {
    deleting.value = null
    taskToDelete.value = null
  }
}

const openDetails = (activity: { id: string }) => {
  // Card gerado não tem página de detalhe: ele não existe no servidor. O que a
  // pessoa quer ver ao clicar é a REGRA que o criou.
  if (isOccurrenceId(activity.id)) {
    recurrenceManager.value = true
    return
  }
  router.push(`/tasks/${route.params.month}/${activity.id}`)
}

const monthName = computed(() => currentMonthInfo.value?.month.name || 'Carregando...')
const quarterName = computed(() => currentMonthInfo.value?.quarterName)

const statusLabels: Record<string, string> = {
  TODO: 'A Fazer', IN_PROGRESS: 'Em Progresso', IN_TESTING: 'Em Teste', DONE: 'Concluído',
}
// Cores de status vêm dos tokens do design system (theme-aware), não de hex.
const statusColors: Record<string, string> = {
  TODO: 'var(--status-todo)',
  IN_PROGRESS: 'var(--status-prog)',
  IN_TESTING: 'var(--status-test)',
  DONE: 'var(--status-done)',
}

const sortedHistory = computed(() =>
  [...backLog.value].sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()),
)

const formatDate = (date: string) =>
  new Date(date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

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

const removeRecurrence = (template: RecurringTemplate) => {
  removeTemplate(template.id)
  showSuccess('Repetição excluída')
}

const toggleRecurrence = (template: RecurringTemplate) => {
  toggleActive(template.id)
  showSuccess(template.active ? 'Repetição pausada' : 'Repetição retomada')
}

/**
 * Muda o prazo da repetição para o mês seguinte.
 *
 * É a resposta direta ao ritual de recopiar o quadro na virada: em vez de
 * recriar tudo em novembro, muda-se a data e o mês vem junto.
 */
const moveRecurrenceToNextMonth = (template: RecurringTemplate) => {
  const landed = moveToMonth(template.id, shiftMonthKey(monthCalendarKey.value, 1))
  if (landed) showSuccess(`Prazo movido — a tarefa foi para ${monthLabel(landed)}`)
}

const showFilters = ref(false)

// Filtro restaurado da memória abre o painel sozinho, uma vez, e só quando ele
// de fato esconde alguma coisa. Recorte guardado agindo em silêncio é a receita
// do "o board está vazio, o time parou de trabalhar": a pessoa não lembra que
// ligou aquilo semanas atrás e a causa fica fora da tela.
if (rememberFilters.value && activeFiltersCount.value > 0) showFilters.value = true

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
    <!-- Header -->
    <div class="tasks-header">
      <div class="tasks-heading">
        <p v-if="quarterName" class="tasks-eyebrow">{{ quarterName }}</p>
        <h1 class="tasks-title">{{ monthName }}</h1>
        <div class="tasks-meta">
          <span class="tasks-sub">
            {{ totalTasks }} {{ totalTasks === 1 ? 'atividade' : 'atividades' }}
          </span>
          <template v-if="totalTasks > 0">
            <div class="pulse" role="img" :aria-label="statusPulse.map((s) => `${s.count} ${s.label}`).join(', ')">
              <span
                v-for="seg in statusPulse"
                :key="seg.key"
                v-show="seg.count > 0"
                class="pulse__seg"
                :style="{ flexGrow: seg.count, background: seg.token }"
                :title="`${seg.count} ${seg.label}`"
              />
            </div>
            <div class="pulse-legend" aria-hidden="true">
              <span v-for="seg in statusPulse" :key="seg.key" class="pulse-legend__item" :title="seg.label">
                <span class="pulse-legend__dot" :style="{ background: seg.token }" />
                {{ seg.count }}
              </span>
            </div>
          </template>
        </div>
      </div>

      <div class="header-actions">
        <!-- View toggle -->
        <div class="view-toggle">
          <button
            class="view-btn"
            :class="{ active: currentTab === 'board' }"
            @click="currentTab = 'board'"
          >
            <Columns3 :size="14" />
            Board
          </button>
          <!-- Agenda: o mesmo mês visto por dia. É onde as tarefas geradas por
               repetição aparecem no calendário, e onde uma data pode ser
               dispensada sem mexer na regra. -->
          <button
            class="view-btn"
            :class="{ active: currentTab === 'agenda' }"
            @click="currentTab = 'agenda'"
          >
            <CalendarDays :size="14" />
            Agenda
          </button>
          <button
            class="view-btn"
            :class="{ active: currentTab === 'backlog' }"
            @click="currentTab = 'backlog'"
          >
            <History :size="14" />
            Backlog
          </button>
        </div>

        <!-- Repetições do mês. Um diálogo, e não uma tela: recorrência é uma
             propriedade da tarefa, e uma entrada própria na navegação criaria
             dois lugares para procurar a mesma tarefa. -->
        <button
          class="filter-toggle-btn"
          :class="{ active: recurrenceManager }"
          title="Tarefas que se repetem sozinhas"
          @click="recurrenceManager = true"
        >
          <Repeat :size="14" />
          Recorrentes
          <span v-if="recurringCount > 0" class="filter-badge">{{ recurringCount }}</span>
        </button>

        <!-- Filter toggle -->
        <button
          class="filter-toggle-btn"
          :class="{ active: showFilters }"
          @click="showFilters = !showFilters"
        >
          <SlidersHorizontal :size="14" />
          Filtros
          <span v-if="activeFiltersCount > 0" class="filter-badge">{{ activeFiltersCount }}</span>
        </button>

        <!-- New activity -->
        <button
          v-if="isWorkerRole"
          class="new-activity-btn press"
          @click="dialog = true"
        >
          <Plus :size="15" />
          Nova Atividade
        </button>
      </div>
    </div>

    <!-- Filter bar -->
    <Transition name="slide">
      <div v-if="showFilters" class="filter-bar">
        <!-- User -->
        <div class="filter-group">
          <label class="filter-label">Responsável</label>
          <div class="filter-select-wrap">
            <AppSelect
              v-model="selectedUser"
              :items="userItems"
              placeholder="Todos"
              label="Filtrar por responsável"
              density="compact"
            />
          </div>
        </div>

        <!-- Priority -->
        <div class="filter-group">
          <label class="filter-label">Prioridade</label>
          <div class="filter-chips">
            <button
              v-for="p in priorityOptions"
              :key="String(p.value)"
              class="filter-chip"
              :class="{ active: filterPriority === p.value }"
              @click="filterPriority = p.value"
            >
              {{ p.label }}
            </button>
          </div>
        </div>

        <!-- Tags: só as que existem no board carregado. Combinam por E. -->
        <div v-if="boardTags.length" class="filter-group filter-group--wide">
          <label class="filter-label">Tags</label>
          <div class="filter-chips">
            <TagChip
              v-for="tag in boardTags"
              :key="tag.id"
              :tag="tag"
              size="md"
              interactive
              :active="filterTags.includes(tag.slug)"
              @select="toggleTagFilter(tag.slug)"
            />
          </div>
        </div>

        <!-- Ações do filtro: lembrar e limpar, ancoradas à direita -->
        <div class="filter-actions">
          <!-- Memória do recorte. Fica AQUI, junto dos campos, e não em
               Configurações: filtro que persiste sem a pessoa lembrar que ligou
               vira "o board está vazio, o time parou de trabalhar". O botão à
               vista é o que mantém a causa visível ao lado do efeito. -->
          <button
            type="button"
            class="remember-switch"
            role="switch"
            :aria-checked="rememberFilters"
            :title="
              rememberFilters
                ? 'Este recorte volta na próxima vez que você abrir. Desmarcar limpa o filtro.'
                : 'Guardar este recorte para não refazê-lo toda vez'
            "
            @click="toggleRememberFilters"
          >
            <span class="remember-track" aria-hidden="true">
              <span class="remember-thumb" />
            </span>
            <span class="remember-label">
              <Bookmark :size="11" />
              Lembrar filtro
            </span>
          </button>

          <button
            v-if="activeFiltersCount > 0"
            class="clear-filters-btn"
            @click="clearFilters"
          >
            <X :size="12" />
            Limpar filtros
          </button>
        </div>
      </div>
    </Transition>

    <!-- Corpo: skeleton → erro → board/backlog -->
    <div class="tasks-body">
      <!-- Loading: skeleton em forma de board (nada de spinner no meio da tela) -->
      <div v-if="loading" class="skel-board" aria-label="Carregando atividades" aria-busy="true">
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
          <button class="retry-btn press" @click="refetchBoards()">
            <RefreshCw :size="14" />
            Tentar de novo
          </button>
        </template>
      </EmptyState>

      <template v-else>
        <!-- Board view -->
        <div v-show="currentTab === 'board'" class="board-wrap">
          <EmptyState
            v-if="totalTasks === 0"
            :icon="Inbox"
            title="Mês sem atividades"
            description="Tudo limpo por aqui. Crie a primeira atividade para começar o planejamento do mês."
          >
            <template #action>
              <button v-if="isWorkerRole" class="new-activity-btn press" @click="dialog = true">
                <Plus :size="15" />
                Nova Atividade
              </button>
            </template>
          </EmptyState>
          <KanbanBoard
            v-else
            :tasks="filteredTasks"
            :readonly="!isWorkerRole"
            @move-task="handleMove"
            @open-details="openDetails"
            @delete-task="openDeleteConfirm"
            @rename-task="handleRenameTask"
            @show-occurrences="currentTab = 'agenda'"
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

        <!-- Backlog view -->
        <div v-show="currentTab === 'backlog'" class="backlog-panel">
          <div v-if="sortedHistory.length === 0" class="backlog-empty">
            <History :size="36" class="backlog-empty-icon" />
            <span>Nenhum histórico encontrado</span>
            <span class="backlog-empty-sub">Alterações de status aparecerão aqui</span>
          </div>

          <div v-else class="backlog-list">
            <div
              v-for="entry in sortedHistory"
              :key="entry.id"
              class="backlog-item"
            >
              <div
                class="backlog-dot"
                :style="{ backgroundColor: statusColors[entry.newStatus] || 'var(--text-4)' }"
              />
              <div class="backlog-info">
                <span class="backlog-title">{{ entry.activityTitle }}</span>
                <span class="backlog-meta">
                  {{ entry.changedBy?.name }} ·
                  <span
                    v-if="entry.previousStatus"
                    class="backlog-status-badge"
                    :style="{ color: statusColors[entry.previousStatus] }"
                  >{{ statusLabels[entry.previousStatus] }}</span>
                  <span v-else>Novo</span>
                  →
                  <span
                    class="backlog-status-badge"
                    :style="{ color: statusColors[entry.newStatus] }"
                  >{{ statusLabels[entry.newStatus] }}</span>
                </span>
              </div>
              <span class="backlog-time">{{ formatDate(entry.changedAt) }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Delete dialog (primitive do design system, não v-dialog) -->
    <ConfirmDialog
      v-model="confirmDelete"
      danger
      title="Excluir atividade"
      :message="`Tem certeza que deseja excluir “${taskToDelete?.title ?? ''}”? Essa ação não pode ser desfeita.`"
      confirm-label="Excluir"
      :loading="!!deleting"
      @confirm="deleteTask"
    />

    <!-- Create task dialog (casca AppDialog; o TaskForm põe header/corpo/footer) -->
    <AppDialog
      v-model="dialog"
      :label="editingRecurrenceId ? 'Editar repetição' : 'Nova atividade'"
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
  padding: 20px 28px 0;
  max-width: 1600px;
  margin: 0 auto;
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

/* ─── Header ─── */
.tasks-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 14px;
  flex-wrap: wrap;
  gap: 12px;
  flex-shrink: 0;
}

.tasks-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-4);
  margin: 0 0 2px;
}

.tasks-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.025em;
  line-height: 1.15;
  margin: 0;
}

.tasks-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 7px;
  min-height: 16px;
}

.tasks-sub {
  font-size: 12.5px;
  color: var(--text-3);
  white-space: nowrap;
}

/* Pulso do mês: distribuição por status em barra segmentada */
.pulse {
  display: flex;
  gap: 2px;
  width: 180px;
  height: 5px;
  border-radius: 999px;
  overflow: hidden;
}

.pulse__seg {
  flex-basis: 0;
  min-width: 3px;
  border-radius: 999px;
  transition: flex-grow 420ms var(--motion-ease);
}

.pulse-legend {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pulse-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
}

.pulse-legend__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* ─── View toggle ─── */
.view-toggle {
  display: flex;
  align-items: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 3px;
  gap: 2px;
}

.view-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-3);
  padding: 0 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
  white-space: nowrap;
}

.view-btn:hover {
  color: var(--text-2);
}

.view-btn.active {
  color: var(--text);
  background: var(--surface);
  font-weight: 600;
  box-shadow: var(--shadow-sm), inset 0 0 0 1px var(--border);
}

/* ─── Filter toggle button ─── */
.filter-toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-3);
  background: var(--surface-2);
  padding: 0 11px;
  border-radius: 9px;
  border: 1px solid var(--border);
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.filter-toggle-btn:hover, .filter-toggle-btn.active {
  color: var(--text);
  border-color: var(--border-strong);
}

.filter-badge {
  font-size: 10px;
  font-weight: 700;
  background: var(--accent);
  color: var(--accent-fg);
  padding: 0 5px;
  border-radius: 999px;
  min-width: 16px;
  text-align: center;
  line-height: 16px;
}

/* ─── New activity btn ─── */
.new-activity-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  font-size: 12.5px;
  font-weight: 650;
  background: var(--accent);
  color: var(--accent-fg);
  padding: 0 14px;
  border-radius: 9px;
  border: 1px solid color-mix(in srgb, var(--accent) 78%, black);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: filter var(--motion-fast);
  white-space: nowrap;
}

.new-activity-btn:hover {
  filter: brightness(1.06);
}

/* ─── Retry (estado de erro) ─── */
.retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  padding: 0 14px;
  cursor: pointer;
  transition: border-color var(--motion-fast), background var(--motion-fast);
}

.retry-btn:hover {
  background: var(--surface-3);
}

/* ─── Filter bar ─── */
.filter-bar {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding: 12px 14px;
  margin-bottom: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  flex-wrap: wrap;
  flex-shrink: 0;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

/* A lista de tags cresce com o uso: ocupa a largura que sobrar e quebra em
   linha, em vez de espremer os outros filtros. */
.filter-group--wide {
  flex: 1 1 260px;
  min-width: 0;
}

.filter-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.filter-select-wrap {
  min-width: 160px;
}

.filter-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.filter-chip {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid transparent;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.1s ease;
}

.filter-chip:hover {
  color: var(--text-2);
  background: var(--border);
}

.filter-chip.active {
  color: var(--text);
  background: var(--surface);
  border-color: var(--border-strong);
  font-weight: 600;
}

/* As duas ações do filtro num bloco só: com `flex-wrap` na barra, dois
   `margin-left: auto` soltos se separariam em linhas diferentes quando a barra
   quebrasse. */
.filter-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  align-self: flex-end;
}

.remember-switch {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 9px 4px 6px;
  background: none;
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
  color: var(--text-3);
  font-size: 11.5px;
  font-weight: 550;
  white-space: nowrap;
  flex-shrink: 0;
  transition:
    color var(--motion-fast),
    border-color var(--motion-fast),
    background var(--motion-fast);
}

.remember-switch:hover {
  color: var(--text-2);
  background: var(--surface-3);
}

.remember-switch[aria-checked='true'] {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 34%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.remember-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.remember-track {
  position: relative;
  width: 26px;
  height: 15px;
  flex-shrink: 0;
  border-radius: 999px;
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
  transition:
    background var(--motion-fast),
    border-color var(--motion-fast);
}

.remember-switch[aria-checked='true'] .remember-track {
  background: var(--accent);
  border-color: var(--accent);
}

.remember-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition: transform var(--motion) var(--motion-ease);
}

.remember-switch[aria-checked='true'] .remember-thumb {
  transform: translateX(11px);
  background: var(--accent-fg);
}

@media (prefers-reduced-motion: reduce) {
  .remember-thumb {
    transition: none;
  }
}

.clear-filters-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: var(--text-3);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: color 0.12s;
}

.clear-filters-btn:hover {
  color: var(--text-2);
}

/* ─── Slide transition ─── */
.slide-enter-active, .slide-leave-active {
  transition: all 0.15s ease;
  overflow: hidden;
}
.slide-enter-from, .slide-leave-to {
  max-height: 0;
  opacity: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.slide-enter-to, .slide-leave-from {
  max-height: 200px;
  opacity: 1;
}

/* ─── Skeleton board ─── */
.skel-board {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  overflow: hidden;
}

.skel-lane {
  flex: 1 1 0;
  min-width: 252px;
  max-width: 384px;
  padding: 6px 8px 0;
}

.skel-lane__head {
  width: 55%;
  margin-bottom: 14px;
}

.skel-card {
  margin-bottom: 8px;
  border-radius: 12px;
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
    padding: 14px 14px 0;
  }

  .tasks-title {
    font-size: 20px;
  }

  .pulse {
    width: 120px;
  }
}
</style>
