<script setup lang="ts">
/**
 * Painel de detalhe da tarefa: abre SOBRE o board (do mês e o `/board`).
 *
 * Por que painel e não página: abrir a tarefa não pode custar o board. A view
 * de trás continua montada, com filtros, scroll e posição intactos; fechar é só
 * tirar `?task=` da URL. A página cheia (`/tasks/:month/:taskId`) continua
 * existindo para links antigos e para quem quer a tela inteira ("Abrir em
 * página", no topo).
 *
 * Anatomia (spec board-tarefas-redesign, D6, D7 e D9, e o protótipo aprovado):
 * topo de 48px com a chave e o copiar; título 20/600; status como lozenge com
 * menu; grade de propriedades em duas colunas com linhas de 32px; descrição;
 * subtarefas em lista de 32px; documentos e arquivos; atividade (histórico de
 * status + comentários). Sem blur no scrim, sem eyebrow, sem caixa alta.
 *
 * Toda edição salva sozinha: texto com debounce, o resto no próprio change. Cada
 * patch também sai pela prop `applyPatch`, para o board do mês mexer no card na hora.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  MoreHorizontal,
  Repeat,
  Trash2,
  X,
} from 'lucide-vue-next'
import activityService from '@/service/activities/activity-service'
import companiesServices from '@/service/companies/companies-services'
import backlogService, { type BacklogEntry } from '@/service/backlog/backlog-service'
import { useCompanyQuarters } from '@/composables/useCompanyQuarters'
import { getUserToken } from '@/utils/authContent'
import { useToast } from '@/composables/useToast'
import { avatarTone, initials } from '@/utils/avatar'
import {
  dateOnlyInMonth,
  dueDatePatchValue,
  formatDateOnly,
  isoToDateOnly,
} from '@/utils/date'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SaveStatus from '@/components/ui/SaveStatus.vue'
import InlineEditText from '@/components/ui/InlineEditText.vue'
import CommentsPanel from '@/components/collaboration/CommentsPanel.vue'
import { useActivityDetail } from '../useActivityDetail'
import {
  ACTIVITY_PRIORITIES,
  ACTIVITY_STATUSES,
  dueSignal,
  priorityLevel,
  prioritySpec,
  statusSpec,
} from '../task-meta'
import { taskKey } from '../task-key'
import {
  tagsOf,
  type ActivityDetail,
  type ActivityResponsible,
  type ActivityTag,
} from '../activity-types'
import TaskDescriptionEditor from './TaskDescriptionEditor.vue'
import TaskAttachments from './TaskAttachments.vue'
import TaskDocs from './TaskDocs.vue'
import InheritedDocs from './InheritedDocs.vue'
import TagInput from '@/components/ui/TagInput.vue'

const props = withDefaults(
  defineProps<{
    taskId: string
    /** Empresa do card: o /board é agregado e o x-company-id precisa ser o dela. */
    companyId?: string | null
    /** Dá o prefixo da chave (`PJ-K7Q2XM`). */
    companyName?: string | null
    /** Quem só lê (fora do papel de edição): tudo vira leitura. */
    readonly?: boolean
    /** Regra da rotina que gerou a tarefa, quando quem abre sabe descrevê-la. */
    recurrenceLabel?: string | null
    /** Troca de tarefa por J/K: entra sem animação, senão pisca a cada tecla. */
    instant?: boolean
    /** Mostra "Excluir tarefa" no "…" (quem abre sabe confirmar e excluir). */
    deletable?: boolean
    /** Quem grava o status (padrão: `PATCH /status`). Ver `useActivityDetail`. */
    writeStatus?: ((id: string, status: string) => Promise<ActivityDetail>) | null
    /**
     * Cada patch aplicado (otimista, confirmado ou rollback), para o board de
     * trás mexer no card na hora. É função, e não evento, de propósito: o painel
     * tem `key` por tarefa, e o J/K o desmonta com a gravação ainda no ar. O
     * `emit` de uma instância desmontada é descartado pelo Vue, e o rollback de
     * uma gravação recusada nunca chegava ao card. A função, lida no setup,
     * continua valendo depois do desmonte.
     */
    applyPatch?: ((id: string, patch: Partial<ActivityDetail>) => void) | null
  }>(),
  {
    companyId: null,
    companyName: null,
    readonly: false,
    recurrenceLabel: null,
    instant: false,
    deletable: false,
    writeStatus: null,
    applyPatch: null,
  },
)

const emit = defineEmits<{
  close: []
  delete: [task: { id: string; title: string }]
}>()

// Lida UMA vez: é o que chega ao board mesmo depois do desmonte (ver a prop).
const applyPatch = props.applyPatch

const { error: showError, success: showSuccess } = useToast()
const queryClient = useQueryClient()
const router = useRouter()

const taskIdRef = toRef(props, 'taskId')
const companyIdRef = computed(() => props.companyId ?? null)

const {
  activity,
  isLoading,
  refetch,
  fieldState,
  fieldError,
  failedFields,
  overallState,
  savedAt,
  saveFields,
  saveStatus: commitStatus,
  retry,
  retryAll,
  waitForIdle,
} = useActivityDetail(taskIdRef, companyIdRef, {
  onPatch: (id, patch) => applyPatch?.(id, patch),
  writeStatus: props.writeStatus ?? undefined,
})

// ── Papel na empresa DO CARD (o board mistura empresas) ──────────────────────
const canEdit = computed(() => {
  if (props.readonly) return false
  const token = getUserToken()
  if (!token) return false
  const target = props.companyId ?? localStorage.getItem('activeCompany')
  const role = token.companies?.find((c) => c.companyId === target)?.role
  return role === 'ADMIN' || role === 'WORKER'
})

// ── Chave ────────────────────────────────────────────────────────────────────
const key = computed(() => taskKey({ id: props.taskId }, props.companyName))

/**
 * Copia pela Clipboard API e, quando ela não existe (HTTP, navegador antigo,
 * permissão negada), pelo `execCommand` num campo escondido. Se nada funcionar,
 * o texto vai no aviso para a pessoa copiar à mão.
 */
async function copyText(text: string, done: string): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('sem clipboard')
    await navigator.clipboard.writeText(text)
    showSuccess(done)
    return
  } catch {
    // cai no plano B
  }
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  field.remove()
  panelRef.value?.focus()
  if (ok) showSuccess(done)
  else showError(`Não consegui copiar. ${text}`)
}

function copyKey() {
  if (key.value) void copyText(key.value, `${key.value} copiada`)
}

function copyLink() {
  if (!fullPageLink.value) return
  const href = router.resolve(fullPageLink.value).href
  void copyText(new URL(href, window.location.origin).toString(), 'Link copiado')
}

// ── Membros da empresa (responsáveis) ────────────────────────────────────────
interface MemberLike {
  id?: string
  name?: string
  user?: { id: string; name: string }
}

const membersQuery = useQuery({
  queryKey: computed(() => ['company-members', companyIdRef.value]),
  queryFn: async (): Promise<MemberLike[]> => {
    // O endpoint responde ora com array, ora com `{ data: [...] }`.
    const raw: unknown = await companiesServices.getCompanyMembers(companyIdRef.value!)
    if (Array.isArray(raw)) return raw as MemberLike[]
    return ((raw as { data?: MemberLike[] } | null)?.data ?? []) as MemberLike[]
  },
  enabled: computed(() => !!companyIdRef.value),
  staleTime: 60_000,
})

const memberItems = computed(() =>
  (membersQuery.data.value ?? [])
    .map((m) => ({
      label: m.user?.name ?? m.name ?? 'Sem nome',
      value: (m.user?.id ?? m.id ?? '') as string,
    }))
    .filter((m) => m.value),
)

// ── Meses de planejamento (trimestres da empresa do card) ────────────────────
interface PlanningMonth {
  id: string
  name: string
  /** 1-12. É o que permite o prazo acompanhar a troca de mês (ver `saveMonth`). */
  number: number
}
interface PlanningQuarter {
  id: string
  label: string
  months?: PlanningMonth[]
}

const { data: quartersData } = useCompanyQuarters(companyIdRef)

const quartersList = computed<PlanningQuarter[]>(() => {
  const raw = quartersData.value as PlanningQuarter[] | { data: PlanningQuarter[] } | undefined
  if (!raw) return []
  return Array.isArray(raw) ? raw : (raw.data ?? [])
})

const currentMonthId = computed(() => activity.value?.monthId ?? '')

const currentMonthLabel = computed(() => {
  for (const q of quartersList.value) {
    const m = q.months?.find((mm) => mm.id === currentMonthId.value)
    if (m) return `${m.name} · ${q.label}`
  }
  return activity.value?.month?.name ?? ''
})

// ── Derivados de apresentação ────────────────────────────────────────────────
const status = computed(() => statusSpec(activity.value?.status))
const priority = computed(() => prioritySpec(activity.value?.priorityNumber))
const responsibles = computed(() => activity.value?.responsibles ?? [])
const responsibleIds = computed<string[]>(() => responsibles.value.map((r) => r.userId ?? r.user.id))
const dueDateInput = computed(() =>
  activity.value?.dueDate ? isoToDateOnly(activity.value.dueDate) : '',
)
const due = computed(() => dueSignal(activity.value?.dueDate, status.value.value === 'DONE'))
/** "Atrasada 3d" e "Hoje" dizem algo que a data não diz; "30 set" só repetiria. */
const dueNote = computed(() => (due.value && due.value.tone === 'late' ? due.value.label : null))
const subtasks = computed(() => activity.value?.subtasks ?? [])
const doneSubtasks = computed(() => subtasks.value.filter((s) => s.status === 'DONE').length)
const attachments = computed(() => activity.value?.attachments ?? [])
const docs = computed(() => activity.value?.docs ?? [])
const inheritedDocs = computed(() => activity.value?.inheritedDocs ?? [])

/** Prioridade do maior para o menor: é o que se procura primeiro no menu. */
const priorityOptions = [...ACTIVITY_PRIORITIES].reverse()

const recurrenceText = computed(() => {
  if (props.recurrenceLabel) return props.recurrenceLabel
  if (activity.value?.recurrenceId) return 'Criada por uma rotina'
  return null
})

const occurrenceText = computed(() => {
  const date = activity.value?.occurrenceDate
  return date ? `data de ${formatDateOnly(date)}` : null
})

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

// ── Tags ─────────────────────────────────────────────────────────────────────
//
// Gravam pelo mesmo motor dos outros campos (`saveFields`), então herdam update
// otimista, rollback e "tentar de novo" de graça. Desvincular NÃO exclui a tag:
// ela continua no catálogo da empresa.
const activityTags = computed<ActivityTag[]>(() =>
  activity.value ? tagsOf(activity.value) : [],
)

function onTagsChange(next: ActivityTag[]): void {
  void saveFields(
    'tags',
    { tagIds: next.map((t) => t.id) },
    { tags: next.map((tag) => ({ tag })) },
  )
}

/** Documento e anexo vivem na atividade: mudou lá, recarrega o detalhe. */
function reloadActivity(): void {
  void refetch()
  void queryClient.invalidateQueries({ queryKey: ['boards'] })
}

// ── Atividade: histórico de status (ActivityLog) ─────────────────────────────
//
// É o único histórico que a API registra (mudança de status). Cada gravação do
// painel invalida `['backlog']`, então a troca de status aparece aqui sozinha.
const historyQuery = useQuery({
  queryKey: computed(() => ['backlog', 'activity', props.taskId]),
  queryFn: async (): Promise<BacklogEntry[]> => {
    const raw: unknown = await backlogService.getBacklogByActivity(
      props.taskId,
      companyIdRef.value ?? undefined,
    )
    return Array.isArray(raw) ? (raw as BacklogEntry[]) : []
  },
  staleTime: 15_000,
})

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${hh}:${mm}`
}

const statusHistory = computed(() =>
  [...(historyQuery.data.value ?? [])].sort(
    (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
  ),
)

// ── Subtarefas: alternar direto no painel ────────────────────────────────────
//
// Cada uma tem estado próprio de gravação: um `saving` global travaria a lista.
const togglingSubtask = ref<string | null>(null)

/**
 * Mexe na subtarefa DENTRO do cache da atividade pai, sem refetch, e manda a
 * lista nova para o card (que mostra `3/6`). Lê do cache, que é síncrono: o
 * `activity` da query só atualiza no próximo tique.
 */
function patchSubtaskInCache(subtaskId: string, next: string) {
  queryClient.setQueryData<ActivityDetail>(['activity', props.taskId], (old) => {
    if (!old?.subtasks) return old
    return {
      ...old,
      subtasks: old.subtasks.map((s) => (s.id === subtaskId ? { ...s, status: next } : s)),
    }
  })
  const list = queryClient.getQueryData<ActivityDetail>(['activity', props.taskId])?.subtasks
  if (list) applyPatch?.(props.taskId, { subtasks: list })
}

async function toggleSubtask(subtask: { id: string; status: string }) {
  if (!canEdit.value || togglingSubtask.value) return
  const previous = subtask.status
  const next = previous === 'DONE' ? 'TODO' : 'DONE'

  togglingSubtask.value = subtask.id
  patchSubtaskInCache(subtask.id, next)

  try {
    await activityService.patchActivityStatus(
      subtask.id,
      next,
      companyIdRef.value ?? undefined,
    )
  } catch {
    // Rollback: o `3/6` voltar sozinho é o que impede a tela de mentir sobre o
    // progresso depois de uma falha de rede.
    patchSubtaskInCache(subtask.id, previous)
    showError('Não foi possível atualizar a subtarefa')
  } finally {
    togglingSubtask.value = null
  }
}

/** A linha de 32px de cada subtarefa, já com chave, pessoa e prazo resolvidos. */
const subtaskRows = computed(() =>
  subtasks.value.map((sub) => {
    const done = sub.status === 'DONE'
    return {
      sub,
      done,
      key: taskKey(sub, props.companyName),
      person: sub.responsibles?.[0]?.user.name ?? null,
      due: dueSignal(sub.dueDate, done),
      // Em andamento e em teste aparecem pelo ícone; A fazer e Concluído já
      // estão ditos pelo círculo da esquerda.
      state: sub.status !== 'DONE' && sub.status !== 'TODO' ? statusSpec(sub.status) : null,
    }
  }),
)

const fullPageLink = computed(() => {
  const monthId = activity.value?.monthId
  if (!monthId) return null
  return {
    path: `/tasks/${monthId}/${props.taskId}`,
    query: props.companyId ? { company: props.companyId } : undefined,
  }
})

/**
 * Abre a tarefa pai a partir da subtarefa (link "Abrir no módulo"). Editar o
 * documento herdado é sempre na origem, nunca daqui.
 */
function openParent(): void {
  const parentId = activity.value?.parentId
  const monthId = activity.value?.monthId
  if (!parentId || !monthId) return
  void router.push({
    path: `/tasks/${monthId}/${parentId}`,
    query: props.companyId ? { company: props.companyId } : undefined,
  })
}

/**
 * Abre a subtarefa como tarefa cheia. É o caminho para dar a ela descrição,
 * documento `.md` e anexo, coisas que só existem na tela de detalhe.
 */
function openSubtask(subtaskId: string): void {
  const monthId = activity.value?.monthId
  if (!monthId) return
  void router.push({
    path: `/tasks/${monthId}/${subtaskId}`,
    query: props.companyId ? { company: props.companyId } : undefined,
  })
}

// ── Gravações ────────────────────────────────────────────────────────────────
function saveTitle(value: string) {
  const title = value.replace(/\s+/g, ' ').trim()
  if (!title) {
    showError('O título não pode ficar vazio')
    // Sem isto o campo fica visualmente vazio para sempre: nada foi gravado, o
    // `modelValue` não mudou e o watcher do InlineEditText não redesenha nada.
    titleField.value?.reset()
    return
  }
  void saveFields('title', { title }, { title })
}

function saveDescription(value: string) {
  void saveFields('description', { description: value }, { description: value })
}

function saveStatus(value: string) {
  if (value === activity.value?.status) return
  void commitStatus(value)
}

function savePriority(value: number) {
  // Por nível: tarefa gravada com 5 já é "Urgente", escolher Urgente não regrava.
  if (value === priorityLevel(activity.value?.priorityNumber)) return
  void saveFields('priority', { priorityNumber: value }, { priorityNumber: value })
}

function saveDueDate(dateOnly: string) {
  // `dueDatePatchValue` é o único lugar que traduz o `<input type="date">` para
  // o corpo do PATCH (meio-dia UTC, ou `null` explícito para apagar a data).
  const dueDate = dueDatePatchValue(dateOnly)
  if (dueDate === (activity.value?.dueDate ?? null)) return
  void saveFields('dueDate', { dueDate }, { dueDate })
}

function saveResponsibles(ids: string[]) {
  const known = membersQuery.data.value ?? []
  const optimistic: ActivityResponsible[] = ids.map((id) => {
    const member = known.find((m) => (m.user?.id ?? m.id) === id)
    const current = responsibles.value.find((r) => (r.userId ?? r.user.id) === id)
    return {
      userId: id,
      user: { id, name: member?.user?.name ?? member?.name ?? current?.user.name ?? '…' },
    }
  })
  void saveFields('responsibles', { responsibleUserIds: ids }, { responsibles: optimistic })
}

function toggleResponsible(id: string) {
  const ids = responsibleIds.value
  saveResponsibles(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
}

function saveMonth(monthId: string) {
  if (!monthId || monthId === currentMonthId.value) return
  const quarter = quartersList.value.find((q) => q.months?.some((m) => m.id === monthId))
  const month = quarter?.months?.find((m) => m.id === monthId)

  // O prazo acompanha o mês. Quem realinha de verdade é o backend (regra única,
  // vale para qualquer cliente); aqui o `dueDate` entra no patch OTIMISTA por
  // dois motivos, e o segundo é o que conserta o defeito:
  //
  // 1. a data nova aparece no mesmo tique, sem esperar a resposta;
  // 2. declara a chave como TOCADA. O `runSave` aplica da resposta do servidor
  //    apenas as chaves tocadas: sem isto o prazo realinhado voltaria do
  //    servidor e seria descartado, e o painel seguiria exibindo a data do mês
  //    antigo até alguém dar F5.
  const atual = activity.value?.dueDate
  const realinhado =
    atual && month
      ? dueDatePatchValue(dateOnlyInMonth(isoToDateOnly(atual), month.number))
      : undefined

  void saveFields(
    'month',
    { monthId },
    {
      monthId,
      month: month ? { id: month.id, name: month.name } : null,
      ...(realinhado !== undefined && { dueDate: realinhado }),
    },
  )
}

/** O menu fica aberto entre um clique e outro: marcar duas pessoas é um gesto só. */
function keepOpen(event: Event) {
  event.preventDefault()
}

function requestDelete() {
  if (!activity.value) return
  emit('delete', { id: props.taskId, title: activity.value.title })
}

// ── Fechamento: nunca fecha em cima de gravação pendente ─────────────────────
const titleField = ref<InstanceType<typeof InlineEditText> | null>(null)
const descriptionField = ref<InstanceType<typeof TaskDescriptionEditor> | null>(null)
const docsField = ref<InstanceType<typeof TaskDocs> | null>(null)
const closing = ref(false)
const panelRef = ref<HTMLElement | null>(null)

async function close() {
  if (closing.value) return
  closing.value = true
  titleField.value?.flush()
  descriptionField.value?.flush()
  // O documento tem autosave próprio (não passa pelo `useActivityDetail`), então
  // o `waitForIdle` abaixo não o cobre: sem este flush, fechar o painel logo
  // depois de digitar perderia o último trecho escrito.
  await docsField.value?.flush()
  await nextTick()
  await waitForIdle()
  closing.value = false
  emit('close')
}

/**
 * Seletor do que recebe foco por Tab. `[hidden]` e `disabled` ficam de fora
 * porque um controle desabilitado (papel sem permissão de editar) não entra na
 * ordem de tabulação.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

function focusableItems(): HTMLElement[] {
  const root = panelRef.value
  if (!root) return []
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el.getAttribute('contenteditable') === 'true',
  )
}

/**
 * Armadilha de foco.
 *
 * O painel é `role="dialog" aria-modal="true"`, e um diálogo modal que deixa o
 * Tab escapar para o board atrás mente para quem navega por teclado ou usa
 * leitor de tela. Circula dentro do painel nos dois sentidos.
 */
function trapFocus(event: KeyboardEvent) {
  const items = focusableItems()
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) {
    event.preventDefault()
    panelRef.value?.focus()
    return
  }
  const active = document.activeElement as HTMLElement | null

  if (event.shiftKey && (active === first || active === panelRef.value)) {
    event.preventDefault()
    last.focus()
    return
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

function onKeydown(event: KeyboardEvent) {
  // Com menu aberto (status, prioridade, mês...), Tab e Esc são do menu.
  if (document.querySelector('[role="menu"], .app-select__content')) return
  if (event.key === 'Tab') {
    trapFocus(event)
    return
  }
  if (event.key !== 'Escape') return
  void close()
}

let previousOverflow = ''
/** Quem tinha o foco antes do painel abrir (normalmente o card do board). */
let opener: HTMLElement | null = null

onMounted(() => {
  opener = document.activeElement as HTMLElement | null
  window.addEventListener('keydown', onKeydown)
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  void nextTick(() => panelRef.value?.focus())
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = previousOverflow
  // Devolve o foco a quem abriu. Sem isso o foco volta para o topo do documento
  // e quem navega por teclado perde o lugar no board.
  if (opener?.isConnected) opener.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="task-panel-root" :class="{ 'task-panel-root--instant': instant }">
      <div class="task-panel__scrim" @click="close" />

      <aside
        ref="panelRef"
        class="task-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="key ? `Tarefa ${key}` : 'Detalhe da tarefa'"
        tabindex="-1"
      >
        <!-- Topo de 48px: chave e copiar à esquerda; página, "…" e fechar à direita -->
        <header class="task-panel__top">
          <span v-if="key" class="task-key" :title="companyName ? `${companyName} · ${key}` : key">
            {{ key }}
          </span>
          <button
            v-if="key"
            type="button"
            class="icon-btn"
            :aria-label="`Copiar a chave ${key}`"
            title="Copiar a chave"
            @click="copyKey"
          >
            <Copy :size="15" :stroke-width="1.8" />
          </button>
          <SaveStatus
            class="task-panel__save"
            :state="overallState"
            :saved-at="savedAt"
            :message="fieldError[failedFields[0] ?? ''] ?? ''"
            @retry="retryAll()"
          />

          <span class="task-panel__spacer" />

          <RouterLink
            v-if="fullPageLink"
            :to="fullPageLink"
            class="icon-btn"
            title="Abrir em página"
            aria-label="Abrir em página"
          >
            <ExternalLink :size="15" :stroke-width="1.8" />
          </RouterLink>

          <DropdownMenuRoot>
            <DropdownMenuTrigger as-child>
              <button type="button" class="icon-btn" aria-label="Mais ações da tarefa" title="Mais ações">
                <MoreHorizontal :size="16" :stroke-width="2" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent class="dd-menu task-panel-menu" :side-offset="4" align="end">
                <DropdownMenuItem class="dd-item" :disabled="!fullPageLink" @select="copyLink">
                  <Link2 :size="14" :stroke-width="1.8" />
                  <span>Copiar link</span>
                </DropdownMenuItem>
                <DropdownMenuItem v-if="key" class="dd-item" @select="copyKey">
                  <Copy :size="14" :stroke-width="1.8" />
                  <span>Copiar chave</span>
                </DropdownMenuItem>
                <template v-if="deletable && canEdit && activity">
                  <DropdownMenuSeparator class="dd-sep" />
                  <DropdownMenuItem class="dd-item dd-item--danger" @select="requestDelete">
                    <Trash2 :size="14" :stroke-width="1.8" />
                    <span>Excluir tarefa</span>
                  </DropdownMenuItem>
                </template>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>

          <button
            type="button"
            class="icon-btn"
            title="Fechar (Esc)"
            aria-label="Fechar painel"
            @click="close"
          >
            <X :size="16" :stroke-width="1.8" />
          </button>
        </header>

        <div v-if="isLoading" class="task-panel__body">
          <Skeleton type="text" :lines="2" />
          <Skeleton type="block" height="120px" />
          <Skeleton type="card" />
        </div>

        <div v-else-if="!activity" class="task-panel__body">
          <EmptyState
            :icon="AlertCircle"
            title="Não foi possível abrir a tarefa"
            description="Ela pode ter sido removida, ou você não tem acesso à empresa dela."
          >
            <template #action>
              <button type="button" class="btn-secondary" @click="refetch()">
                Tentar de novo
              </button>
            </template>
          </EmptyState>
        </div>

        <div v-else class="task-panel__body">
          <!-- Título + status -->
          <div class="task-head">
            <InlineEditText
              ref="titleField"
              class="task-title"
              :model-value="activity.title"
              field-label="Título da tarefa"
              variant="title"
              multiline
              submit-on-enter
              :min-rows="1"
              placeholder="Título da tarefa"
              :state="fieldState.title ?? 'idle'"
              :disabled="!canEdit"
              @save="saveTitle"
            />

            <DropdownMenuRoot>
              <DropdownMenuTrigger as-child>
                <button
                  type="button"
                  class="lozenge"
                  :disabled="!canEdit || fieldState.status === 'saving'"
                  :aria-label="`Status: ${status.label}. Trocar status`"
                >
                  <component :is="status.icon" :size="14" />
                  {{ status.label }}
                  <ChevronDown v-if="canEdit" :size="14" :stroke-width="1.8" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent class="dd-menu task-panel-menu" :side-offset="4" align="start">
                  <DropdownMenuRadioGroup
                    :model-value="status.value"
                    @update:model-value="saveStatus(String($event))"
                  >
                    <DropdownMenuRadioItem
                      v-for="option in ACTIVITY_STATUSES"
                      :key="option.value"
                      :value="option.value"
                      class="dd-item menu-row"
                    >
                      <component :is="option.icon" :size="14" />
                      <span class="menu-row__label">{{ option.label }}</span>
                      <DropdownMenuItemIndicator class="menu-row__check">
                        <Check :size="14" :stroke-width="2" />
                      </DropdownMenuItemIndicator>
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenuRoot>
          </div>

          <!-- Propriedades: rótulo à esquerda, valor editável à direita -->
          <dl class="props">
            <dt>Responsáveis</dt>
            <dd>
              <DropdownMenuRoot>
                <DropdownMenuTrigger as-child>
                  <button type="button" class="prop-btn" :disabled="!canEdit" aria-label="Responsáveis">
                    <template v-if="responsibles.length">
                      <span
                        v-for="r in responsibles"
                        :key="r.userId ?? r.user.id"
                        class="person"
                        :title="r.user.name"
                      >
                        <span class="avatar" :style="{ '--av': avatarTone(r.user.name) }" aria-hidden="true">
                          {{ initials(r.user.name) }}
                        </span>
                        {{ firstName(r.user.name) }}
                      </span>
                    </template>
                    <span v-else class="muted">Ninguém atribuído</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent class="dd-menu task-panel-menu task-panel-menu--list" :side-offset="4" align="start">
                    <DropdownMenuCheckboxItem
                      v-for="m in memberItems"
                      :key="m.value"
                      class="dd-item menu-row"
                      :model-value="responsibleIds.includes(m.value)"
                      @select="(e: Event) => { keepOpen(e); toggleResponsible(m.value) }"
                    >
                      <span class="avatar" :style="{ '--av': avatarTone(m.label) }" aria-hidden="true">
                        {{ initials(m.label) }}
                      </span>
                      <span class="menu-row__label">{{ m.label }}</span>
                      <DropdownMenuItemIndicator class="menu-row__check">
                        <Check :size="14" :stroke-width="2" />
                      </DropdownMenuItemIndicator>
                    </DropdownMenuCheckboxItem>
                    <p v-if="!memberItems.length" class="menu-empty">Carregando pessoas…</p>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
              <SaveStatus
                compact
                :state="fieldState.responsibles ?? 'idle'"
                :saved-at="savedAt"
                :message="fieldError.responsibles ?? ''"
                @retry="retry('responsibles')"
              />
            </dd>

            <dt>Prioridade</dt>
            <dd>
              <DropdownMenuRoot>
                <DropdownMenuTrigger as-child>
                  <button type="button" class="prop-btn" :disabled="!canEdit" aria-label="Prioridade">
                    <component :is="priority.icon" :size="14" />
                    <span :class="{ muted: priority.value === 0 }">{{ priority.label }}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent class="dd-menu task-panel-menu" :side-offset="4" align="start">
                    <DropdownMenuRadioGroup
                      :model-value="String(priority.value)"
                      @update:model-value="savePriority(Number($event))"
                    >
                      <DropdownMenuRadioItem
                        v-for="option in priorityOptions"
                        :key="option.value"
                        :value="String(option.value)"
                        class="dd-item menu-row"
                      >
                        <component :is="option.icon" :size="14" />
                        <span class="menu-row__label">{{ option.label }}</span>
                        <DropdownMenuItemIndicator class="menu-row__check">
                          <Check :size="14" :stroke-width="2" />
                        </DropdownMenuItemIndicator>
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
              <SaveStatus
                compact
                :state="fieldState.priority ?? 'idle'"
                :saved-at="savedAt"
                :message="fieldError.priority ?? ''"
                @retry="retry('priority')"
              />
            </dd>

            <dt>Prazo</dt>
            <dd>
              <input
                type="date"
                class="date-input"
                :class="due?.tone ? `date-input--${due.tone}` : null"
                aria-label="Prazo"
                :value="dueDateInput"
                :disabled="!canEdit"
                @change="saveDueDate(($event.target as HTMLInputElement).value)"
              />
              <span v-if="dueNote" class="due-note due-note--late">{{ dueNote }}</span>
              <button
                v-if="dueDateInput && canEdit"
                type="button"
                class="btn-link"
                @click="saveDueDate('')"
              >
                Limpar
              </button>
              <SaveStatus
                compact
                :state="fieldState.dueDate ?? 'idle'"
                :saved-at="savedAt"
                @retry="retry('dueDate')"
              />
            </dd>

            <template v-if="quartersList.length">
              <dt>Mês</dt>
              <dd>
                <DropdownMenuRoot>
                  <DropdownMenuTrigger as-child>
                    <button
                      type="button"
                      class="prop-btn"
                      :disabled="!canEdit || fieldState.month === 'saving'"
                      aria-label="Mês de planejamento"
                    >
                      {{ currentMonthLabel || 'Sem mês' }}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuContent class="dd-menu task-panel-menu task-panel-menu--list" :side-offset="4" align="start">
                      <DropdownMenuRadioGroup
                        :model-value="currentMonthId"
                        @update:model-value="saveMonth(String($event))"
                      >
                        <DropdownMenuGroup v-for="q in quartersList" :key="q.id">
                          <DropdownMenuLabel class="menu-label">{{ q.label }}</DropdownMenuLabel>
                          <DropdownMenuRadioItem
                            v-for="m in q.months ?? []"
                            :key="m.id"
                            :value="m.id"
                            class="dd-item menu-row"
                          >
                            <span class="menu-row__label">{{ m.name }}</span>
                            <DropdownMenuItemIndicator class="menu-row__check">
                              <Check :size="14" :stroke-width="2" />
                            </DropdownMenuItemIndicator>
                          </DropdownMenuRadioItem>
                        </DropdownMenuGroup>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenuPortal>
                </DropdownMenuRoot>
                <SaveStatus
                  compact
                  :state="fieldState.month ?? 'idle'"
                  :saved-at="savedAt"
                  :message="fieldError.month ?? ''"
                  @retry="retry('month')"
                />
              </dd>
            </template>

            <!-- Tags: cria digitando, reusa da empresa. Remover aqui desvincula,
                 não exclui a tag do catálogo. -->
            <dt>Tags</dt>
            <dd class="props__tags">
              <TagInput
                :model-value="activityTags"
                :company-id="companyIdRef"
                :disabled="!canEdit"
                bare
                @update:model-value="onTagsChange"
              />
              <SaveStatus
                compact
                :state="fieldState.tags ?? 'idle'"
                :saved-at="savedAt"
                :message="fieldError.tags ?? ''"
                @retry="retry('tags')"
              />
            </dd>

            <template v-if="recurrenceText">
              <dt>Rotina</dt>
              <dd class="props__text">
                <Repeat :size="14" :stroke-width="1.6" aria-hidden="true" />
                {{ recurrenceText }}
                <span v-if="occurrenceText" class="muted">({{ occurrenceText }})</span>
              </dd>
            </template>
          </dl>

          <!-- Descrição: superfície única, formatação inline no próprio campo -->
          <section class="block">
            <div class="block-head">
              <h3 class="block-title">Descrição</h3>
              <SaveStatus
                compact
                :state="fieldState.description ?? 'idle'"
                :saved-at="savedAt"
                :message="fieldError.description ?? ''"
                @retry="retry('description')"
              />
            </div>
            <TaskDescriptionEditor
              ref="descriptionField"
              :model-value="activity.description ?? ''"
              field-label="Descrição da tarefa"
              :state="fieldState.description ?? 'idle'"
              :disabled="!canEdit"
              @save="saveDescription"
            />
          </section>

          <!-- Documentos do módulo (só em subtarefa), somente leitura -->
          <InheritedDocs
            v-if="inheritedDocs.length"
            :docs="inheritedDocs"
            :parent-id="activity.parentId"
            :company-id="companyIdRef"
            @open-parent="openParent"
          />

          <!-- Subtarefas: linhas de 32px (check, chave, título, pessoa, prazo) -->
          <section v-if="subtasks.length" class="block">
            <div class="block-head">
              <h3 class="block-title">
                Subtarefas
                <span class="block-count">{{ doneSubtasks }}/{{ subtasks.length }}</span>
              </h3>
            </div>
            <ul class="subtasks">
              <li
                v-for="{ sub, done, key: subKey, person, due: subDue, state } in subtaskRows"
                :key="sub.id"
                class="subtask"
                :class="{ 'subtask--done': done }"
              >
                <button
                  type="button"
                  class="subtask__check"
                  :aria-label="
                    done
                      ? `Marcar “${sub.title}” como pendente`
                      : `Marcar “${sub.title}” como concluída`
                  "
                  :aria-pressed="done"
                  :disabled="!canEdit || togglingSubtask === sub.id"
                  @click="toggleSubtask(sub)"
                >
                  <span class="subtask__box" aria-hidden="true">
                    <Check v-if="done" :size="11" :stroke-width="3" />
                  </span>
                </button>
                <span class="subtask__key">{{ subKey }}</span>
                <!--
                  Clicável de propósito: abrindo, a subtarefa é uma tarefa como
                  qualquer outra (descrição, documento, anexo).
                -->
                <button
                  type="button"
                  class="subtask__title"
                  :title="`Abrir “${sub.title}” em página`"
                  @click="openSubtask(sub.id)"
                >
                  {{ sub.title }}
                </button>
                <span class="subtask__meta">
                  <span v-if="state" class="subtask__status" :title="state.label">
                    <component :is="state.icon" :size="13" />
                  </span>
                  <span v-if="sub._count?.docs" class="subtask__docs" :title="`${sub._count.docs} documento(s)`">
                    <FileText :size="12" :stroke-width="1.6" aria-hidden="true" />
                    {{ sub._count.docs }}
                  </span>
                  <span
                    v-if="person"
                    class="avatar"
                    :style="{ '--av': avatarTone(person) }"
                    :title="person"
                  >
                    {{ initials(person) }}
                  </span>
                  <span
                    v-if="subDue"
                    class="subtask__due"
                    :class="subDue.tone ? `due-note--${subDue.tone}` : null"
                    :title="`Prazo: ${subDue.full}`"
                  >
                    {{ subDue.label }}
                  </span>
                </span>
              </li>
            </ul>
          </section>

          <!-- Documentos markdown: é onde a spec da tarefa mora -->
          <section class="block">
            <TaskDocs
              ref="docsField"
              :activity-id="taskId"
              :docs="docs"
              :company-id="companyIdRef"
              :can-edit="canEdit"
              @changed="reloadActivity"
            />
          </section>

          <!-- Arquivos: markup vive só no TaskAttachments -->
          <section class="block">
            <TaskAttachments
              :activity-id="taskId"
              :attachments="attachments"
              :company-id="companyIdRef"
              :can-edit="canEdit"
              compact
              @changed="reloadActivity"
            />
          </section>

          <!-- Atividade: o histórico de status (ActivityLog) e os comentários -->
          <section class="block">
            <div class="block-head">
              <h3 class="block-title">Atividade</h3>
            </div>
            <ol class="feed">
              <li v-for="entry in statusHistory" :key="entry.id" class="feed__item">
                <component :is="statusSpec(entry.newStatus).icon" :size="14" />
                <span class="feed__text">
                  <b>{{ entry.changedBy?.name ? firstName(entry.changedBy.name) : 'Alguém' }}</b>
                  <template v-if="entry.previousStatus">
                    moveu de {{ statusSpec(entry.previousStatus).label }} para
                    {{ statusSpec(entry.newStatus).label }}
                  </template>
                  <template v-else>criou em {{ statusSpec(entry.newStatus).label }}</template>
                </span>
                <time class="feed__when" :datetime="entry.changedAt">{{ formatWhen(entry.changedAt) }}</time>
              </li>
              <li class="feed__item feed__item--muted">
                <span class="feed__dot" aria-hidden="true" />
                <span class="feed__text">Criada em {{ formatDateOnly(activity.createdAt) }}</span>
              </li>
            </ol>

            <CommentsPanel
              entity-type="ACTIVITY"
              :entity-id="taskId"
              title="Comentários"
              compact
            />
          </section>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.task-panel-root {
  position: fixed;
  inset: 0;
  z-index: 2400;
}

/* Sem blur (D7): escurecer já separa o painel do board. */
.task-panel__scrim {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--bg) 62%, transparent);
}

.task-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(640px, 100vw);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-overlay);
  outline: none;
}

/* Abertura: 16px de deslize + fade em 180ms. Só com movimento permitido, e
   nunca na troca por J/K (o painel já está na tela). */
@media (prefers-reduced-motion: no-preference) {
  .task-panel-root:not(.task-panel-root--instant) .task-panel {
    animation: panel-in var(--motion) cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .task-panel-root:not(.task-panel-root--instant) .task-panel__scrim {
    animation: panel-fade var(--motion) var(--motion-ease);
  }
}

@keyframes panel-in {
  from {
    transform: translateX(16px);
    opacity: 0;
  }
}

@keyframes panel-fade {
  from {
    opacity: 0;
  }
}

/* ── Topo ── */
.task-panel__top {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 48px;
  padding: 0 6px 0 16px;
  border-bottom: 1px solid var(--border);
  flex: none;
}

.task-key {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 16px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.task-panel__save {
  margin-left: 8px;
  min-width: 0;
}

/* O SaveStatus nasce em 11,5px; aqui dentro vale o mínimo de 12px da spec. */
.task-panel__save,
.block-head :deep(.save-status),
.props :deep(.save-status),
.task-panel__body :deep(.save-status__retry) {
  font-size: 12px;
}

.task-panel__spacer {
  flex: 1;
}

/* 44px de alvo; o fundo do hover desenha um quadrado de 32px no meio. */
.icon-btn {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  flex: none;
}

.icon-btn::before {
  content: '';
  position: absolute;
  inset: 6px;
  border-radius: var(--radius-sm);
  background: transparent;
}

.icon-btn > * {
  position: relative;
}

.icon-btn:hover {
  color: var(--text);
}

.icon-btn:hover::before {
  background: var(--surface-2);
}

.icon-btn:focus-visible {
  outline: none;
}

.icon-btn:focus-visible::before {
  outline: 2px solid var(--accent);
  outline-offset: 0;
}

/* ── Corpo ── */
.task-panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  scrollbar-width: thin;
}

.task-head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

/* O campo tem 8px de respiro por dentro; a margem negativa alinha o texto do
   título com o resto do painel. */
.task-title {
  margin-left: -9px;
  width: calc(100% + 9px);
}

.task-title :deep(.inline-edit__field) {
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
  padding: 2px 28px 2px 8px;
  overflow: hidden;
}

/* Status: lozenge de 32px com menu (44px de alvo pela área em volta). */
.lozenge {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

/* Caixa de padding de 30px (borda de 1px): 7px para cada lado dão 44px. */
.lozenge::after {
  content: '';
  position: absolute;
  inset: -7px 0;
}

.lozenge:hover:not(:disabled) {
  background: var(--surface-2);
}

.lozenge:disabled {
  cursor: default;
}

.lozenge:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ── Propriedades ── */
.props {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  align-items: start;
  margin: 0;
  font-size: 13px;
}

.props dt {
  display: flex;
  align-items: center;
  min-height: 32px;
  color: var(--text-3);
}

.props dd {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 32px;
  margin: 0;
  min-width: 0;
}

.props__text {
  color: var(--text-2);
}

.props__tags {
  align-items: flex-start;
}

.props__tags > :first-child {
  flex: 1;
  min-width: 0;
}

/* Tag no painel como no card (D4/D6): ponto na cor da tag + texto neutro, sem
   pill tintada. A borda neutra fica porque aqui o chip é editável (tem o X). */
.props__tags :deep(.tag) {
  height: 24px;
  background: transparent;
  border-color: var(--border);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 500;
}

/* Valor clicável: a linha inteira é o alvo, fundo só no hover. */
.prop-btn {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  min-height: 32px;
  max-width: 100%;
  padding: 4px 8px;
  margin-left: -8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.prop-btn:hover:not(:disabled) {
  background: var(--surface-2);
}

.prop-btn:disabled {
  cursor: default;
}

.prop-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.person {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.avatar {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--av);
  color: var(--surface);
  /* A exceção aceita do card: duas iniciais num disco de 20px. */
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  flex: none;
  user-select: none;
}

.muted {
  color: var(--text-3);
}

.date-input {
  height: 32px;
  margin-left: -8px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  outline: none;
  color-scheme: light dark;
}

.date-input:hover:not(:disabled) {
  background: var(--surface-2);
}

.date-input:focus-visible {
  border-color: var(--accent);
}

.date-input--late,
.due-note--late {
  color: var(--due-late);
}

.date-input--soon,
.due-note--soon {
  color: var(--due-soon);
}

.due-note {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.btn-link {
  position: relative;
  height: 28px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.btn-link::after {
  content: '';
  position: absolute;
  inset: -8px 0;
}

.btn-link:hover {
  color: var(--text);
  background: var(--surface-2);
}

/* ── Blocos ── */
.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 24px;
}

.block-title {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
  color: var(--text);
}

.block-count {
  font-weight: 400;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  padding: 0 12px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-secondary:hover {
  background: var(--surface-2);
  color: var(--text);
}

/* ── Subtarefas: lista de 32px ── */
.subtasks {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.subtask {
  display: grid;
  grid-template-columns: 28px 88px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 10px 0 4px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.subtask:last-child {
  border-bottom: 0;
}

.subtask:hover {
  background: var(--surface-2);
}

.subtask__check {
  display: grid;
  place-items: center;
  width: 28px;
  height: 32px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.subtask__check:disabled {
  cursor: default;
}

.subtask__box {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border: 1.5px solid var(--task-status-todo);
  border-radius: 999px;
  color: var(--surface);
}

.subtask--done .subtask__box {
  border-color: var(--task-status-done);
  background: var(--task-status-done);
}

.subtask__check:hover:not(:disabled) .subtask__box {
  border-color: var(--text-2);
}

.subtask--done .subtask__check:hover:not(:disabled) .subtask__box {
  border-color: var(--task-status-done);
}

.subtask__check:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  border-radius: var(--radius-sm);
}

.subtask__key {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.subtask__title {
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.subtask__title:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.subtask__title:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  border-radius: var(--radius-xs);
}

.subtask--done .subtask__title {
  color: var(--text-3);
  text-decoration: line-through;
}

.subtask__meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-3);
  font-size: 12px;
}

.subtask__status,
.subtask__docs {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-variant-numeric: tabular-nums;
}

.subtask__due {
  min-width: 44px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ── Atividade ── */
.feed {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
}

.feed__item {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  line-height: 20px;
  color: var(--text-2);
}

.feed__item b {
  font-weight: 500;
  color: var(--text);
}

.feed__item--muted {
  color: var(--text-3);
}

.feed__dot {
  width: 6px;
  height: 6px;
  margin: 0 auto;
  border-radius: 999px;
  background: var(--border-strong);
}

.feed__when {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Comentários no painel: a mesma lista, sem o eyebrow "Colaboração", sem a
   caixa em volta e sem a faixa colorida na menção (spec, D6). */
.task-panel__body :deep(.comments-panel) {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.task-panel__body :deep(.comments-eyebrow) {
  display: none;
}

.task-panel__body :deep(.comments-head) {
  align-items: center;
  margin-bottom: 8px;
}

.task-panel__body :deep(.comments-head h2) {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
}

.task-panel__body :deep(.comments-count) {
  min-width: 0;
  padding: 0;
  border: 0;
  font-variant-numeric: tabular-nums;
}

.task-panel__body :deep(.comment-meta),
.task-panel__body :deep(.comment-avatar),
.task-panel__body :deep(.mention-email) {
  font-size: 12px;
}

.task-panel__body :deep(.comment-card--mentioned .comment-body) {
  border-left-width: 1px;
  border-color: var(--accent);
}

@media (max-width: 760px) {
  .task-panel {
    width: 100vw;
  }
  .props {
    grid-template-columns: 96px minmax(0, 1fr);
  }
  .subtask {
    grid-template-columns: 28px minmax(0, 1fr) auto;
  }
  .subtask__key {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .task-panel,
  .task-panel__scrim {
    animation: none;
  }
}
</style>

<!-- Global: os menus são portalados para o <body>. O skin vem de
     styles/menus.css; aqui só a largura e a anatomia da linha. -->
<style>
.task-panel-menu {
  min-width: 200px;
}

.task-panel-menu--list {
  max-height: min(420px, 70vh);
  overflow-y: auto;
}

.task-panel-menu .menu-row {
  min-height: 32px;
  padding: 6px 10px;
  font-size: 13px;
}

.task-panel-menu .menu-row__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-panel-menu .menu-row__check {
  display: grid;
  place-items: center;
  color: var(--accent);
}

.task-panel-menu .menu-label {
  padding: 6px 10px 2px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-3);
}

.task-panel-menu .menu-empty {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-3);
}

.task-panel-menu .avatar {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--av);
  color: var(--surface);
  font-size: 10px;
  font-weight: 600;
  flex: none;
}
</style>
