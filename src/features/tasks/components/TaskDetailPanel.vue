<script setup lang="ts">
/**
 * Painel de detalhe da atividade: o "card grande" que abre SOBRE o board.
 *
 * Por que painel e não página: abrir a tarefa não pode custar o board. Aqui a
 * view de trás continua montada, com filtros, scroll e posição intactos; fechar
 * é só tirar `?task=` da URL. A rota de página cheia (`/tasks/:month/:taskId`)
 * continua existindo para links antigos e para quem quer a tela inteira.
 *
 * Toda edição salva sozinha: texto com debounce, o resto no próprio change.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  Flag,
  ListChecks,
  Tag as TagIcon,
  Users,
  X,
} from 'lucide-vue-next'
import activityService from '@/service/activities/activity-service'
import companiesServices from '@/service/companies/companies-services'
import { useCompanyQuarters } from '@/composables/useCompanyQuarters'
import { getUserToken } from '@/utils/authContent'
import { useToast } from '@/composables/useToast'
import { dueDatePatchValue, formatDateOnly, isoToDateOnly } from '@/utils/date'
import Pill from '@/components/ui/Pill.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import SaveStatus from '@/components/ui/SaveStatus.vue'
import InlineEditText from '@/components/ui/InlineEditText.vue'
import CommentsPanel from '@/components/collaboration/CommentsPanel.vue'
import { useActivityDetail } from '../useActivityDetail'
import { ACTIVITY_PRIORITIES, ACTIVITY_STATUSES, prioritySpec, statusSpec } from '../task-meta'
import { tagsOf, type ActivityDetail, type ActivityResponsible, type ActivityTag } from '../activity-types'
import TaskDescriptionEditor from './TaskDescriptionEditor.vue'
import SubtaskProgress from './SubtaskProgress.vue'
import TaskAttachments from './TaskAttachments.vue'
import TaskDocs from './TaskDocs.vue'
import InheritedDocs from './InheritedDocs.vue'
import TagInput from '@/components/ui/TagInput.vue'

const props = defineProps<{
  taskId: string
  /** Empresa do card: o /board é agregado e o x-company-id precisa ser o dela. */
  companyId?: string | null
  companyName?: string | null
}>()

const emit = defineEmits<{ close: [] }>()

const { error: showError } = useToast()
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
} = useActivityDetail(taskIdRef, companyIdRef)

// ── Papel na empresa DO CARD (o board mistura empresas) ──────────────────────
const canEdit = computed(() => {
  const token = getUserToken()
  if (!token) return false
  const target = props.companyId ?? localStorage.getItem('activeCompany')
  const role = token.companies?.find((c) => c.companyId === target)?.role
  return role === 'ADMIN' || role === 'WORKER'
})

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
  (membersQuery.data.value ?? []).map((m) => ({
    label: m.user?.name ?? m.name ?? 'Sem nome',
    value: (m.user?.id ?? m.id ?? '') as string,
  })),
)

// ── Meses de planejamento (trimestres da empresa do card) ────────────────────
interface PlanningMonth {
  id: string
  name: string
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

const monthItems = computed(() =>
  quartersList.value.flatMap((q) =>
    (q.months ?? []).map((m) => ({ label: `${q.label} · ${m.name}`, value: m.id })),
  ),
)

const currentMonthId = computed(() => activity.value?.monthId ?? '')

// ── Derivados de apresentação ────────────────────────────────────────────────
const statusValue = computed(() => statusSpec(activity.value?.status).value)
const priorityValue = computed(() => prioritySpec(activity.value?.priorityNumber).value)
const responsibleIds = computed<string[]>(
  () => activity.value?.responsibles?.map((r) => r.userId ?? r.user.id) ?? [],
)
const dueDateInput = computed(() =>
  activity.value?.dueDate ? isoToDateOnly(activity.value.dueDate) : '',
)
const subtasks = computed(() => activity.value?.subtasks ?? [])
const doneSubtasks = computed(() => subtasks.value.filter((s) => s.status === 'DONE').length)
const attachments = computed(() => activity.value?.attachments ?? [])
const docs = computed(() => activity.value?.docs ?? [])
const inheritedDocs = computed(() => activity.value?.inheritedDocs ?? [])

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

// ── Subtarefas: alternar direto no painel ────────────────────────────────────
//
// Antes eram somente-leitura aqui ("edição completa na página cheia"), o que
// obrigava a trocar de tela para marcar um passo como feito. Cada uma tem estado
// próprio de gravação: um `saving` global travaria a lista inteira.
const togglingSubtask = ref<string | null>(null)

/** Mexe na subtarefa DENTRO do cache da atividade pai, sem refetch. */
function patchSubtaskInCache(subtaskId: string, status: string) {
  queryClient.setQueryData<ActivityDetail>(['activity', props.taskId], (old) => {
    if (!old?.subtasks) return old
    return {
      ...old,
      subtasks: old.subtasks.map((s) => (s.id === subtaskId ? { ...s, status } : s)),
    }
  })
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
    // Rollback: o anel voltar sozinho é o que impede a tela de mentir sobre o
    // progresso depois de uma falha de rede.
    patchSubtaskInCache(subtask.id, previous)
    showError('Não foi possível atualizar a subtarefa')
  } finally {
    togglingSubtask.value = null
  }
}

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

// ── Gravações ────────────────────────────────────────────────────────────────
function saveTitle(value: string) {
  const title = value.trim()
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
  const from = activity.value?.status
  if (value === from) return
  void commitStatus(value)
}

function savePriority(value: number) {
  if (value === activity.value?.priorityNumber) return
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
    return { userId: id, user: { id, name: member?.user?.name ?? member?.name ?? '…' } }
  })
  void saveFields('responsibles', { responsibleUserIds: ids }, { responsibles: optimistic })
}

function saveMonth(monthId: string) {
  if (!monthId || monthId === currentMonthId.value) return
  const quarter = quartersList.value.find((q) => q.months?.some((m) => m.id === monthId))
  const month = quarter?.months?.find((m) => m.id === monthId)
  void saveFields(
    'month',
    { monthId },
    { monthId, month: month ? { id: month.id, name: month.name } : null },
  )
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
 * leitor de tela: o conteúdo de trás está visualmente coberto pelo scrim e
 * continua alcançável. Circula dentro do painel nos dois sentidos.
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
  if (event.key === 'Tab') {
    trapFocus(event)
    return
  }
  if (event.key !== 'Escape') return
  // O dropdown do AppSelect é teleportado para o body: quando ele está aberto,
  // Esc significa "fechar a lista", não "fechar o painel".
  if (document.querySelector('.app-select__content')) return
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
    <div class="task-panel-root">
      <div class="task-panel__scrim" @click="close" />

      <aside
        ref="panelRef"
        class="task-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Detalhe da atividade"
        tabindex="-1"
      >
        <header class="task-panel__head">
          <div class="task-panel__head-main">
            <span class="eyebrow">
              <FileText :size="11" />
              {{ companyName || 'Atividade' }}
            </span>
            <SaveStatus
              :state="overallState"
              :saved-at="savedAt"
              :message="fieldError[failedFields[0] ?? ''] ?? ''"
              @retry="retryAll()"
            />
          </div>

          <div class="task-panel__head-actions">
            <RouterLink
              v-if="fullPageLink"
              :to="fullPageLink"
              class="icon-btn"
              title="Abrir em página cheia"
              aria-label="Abrir em página cheia"
            >
              <ExternalLink :size="15" />
            </RouterLink>
            <button
              type="button"
              class="icon-btn"
              title="Fechar (Esc)"
              aria-label="Fechar painel"
              @click="close"
            >
              <X :size="16" />
            </button>
          </div>
        </header>

        <div v-if="isLoading" class="task-panel__body">
          <Skeleton type="text" :lines="2" />
          <Skeleton type="block" height="120px" />
          <Skeleton type="card" />
        </div>

        <div v-else-if="!activity" class="task-panel__body">
          <EmptyState
            :icon="AlertCircle"
            title="Não foi possível abrir a atividade"
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
          <!-- Título -->
          <InlineEditText
            ref="titleField"
            :model-value="activity.title"
            field-label="Título da atividade"
            variant="title"
            placeholder="Título da atividade"
            :state="fieldState.title ?? 'idle'"
            :disabled="!canEdit"
            @save="saveTitle"
          />

          <!-- Status -->
          <section class="block">
            <h3 class="block-label">Status</h3>
            <div class="segmented" role="group" aria-label="Status da atividade">
              <button
                v-for="option in ACTIVITY_STATUSES"
                :key="option.value"
                type="button"
                class="segmented__item"
                :class="{ 'segmented__item--on': statusValue === option.value }"
                :style="{ '--seg-c': option.token }"
                :aria-pressed="statusValue === option.value"
                :disabled="!canEdit || fieldState.status === 'saving'"
                @click="saveStatus(option.value)"
              >
                <component :is="option.icon" :size="13" />
                {{ option.label }}
              </button>
            </div>
          </section>

          <!-- Campos -->
          <section class="block">
            <div class="field">
              <h3 class="block-label">
                <Flag :size="12" />
                Prioridade
              </h3>
              <div class="chips" role="group" aria-label="Prioridade">
                <button
                  v-for="option in ACTIVITY_PRIORITIES"
                  :key="option.value"
                  type="button"
                  class="chip"
                  :class="{ 'chip--on': priorityValue === option.value }"
                  :style="{ '--chip-c': option.token }"
                  :aria-pressed="priorityValue === option.value"
                  :disabled="!canEdit"
                  @click="savePriority(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <div class="field">
              <h3 class="block-label">
                <CalendarClock :size="12" />
                Entrega
              </h3>
              <div class="date-row">
                <input
                  type="date"
                  class="date-input"
                  aria-label="Data de entrega"
                  :value="dueDateInput"
                  :disabled="!canEdit"
                  @change="saveDueDate(($event.target as HTMLInputElement).value)"
                />
                <button
                  v-if="dueDateInput && canEdit"
                  type="button"
                  class="btn-ghost"
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
              </div>
            </div>

            <div class="field">
              <h3 class="block-label">
                <Users :size="12" />
                Responsáveis
              </h3>
              <!-- chip-avatars: mesma identidade de pessoa (disco + tom) usada
                   no board, no detalhe da tarefa e no ranking da equipe. -->
              <AppSelect
                multiple
                chip-avatars
                :model-value="responsibleIds"
                :items="memberItems"
                label="Responsáveis"
                placeholder="Ninguém atribuído"
                density="compact"
                :disabled="!canEdit || fieldState.responsibles === 'saving'"
                @update:model-value="saveResponsibles(($event as string[]) ?? [])"
              />
            </div>

            <div v-if="monthItems.length" class="field">
              <h3 class="block-label">Mês de entrega</h3>
              <AppSelect
                :model-value="currentMonthId"
                :items="monthItems"
                label="Mês de planejamento"
                placeholder="Selecione o mês"
                density="compact"
                :disabled="!canEdit || fieldState.month === 'saving'"
                @update:model-value="saveMonth(String($event))"
              />
            </div>
          </section>

          <!-- Descrição: superfície única, formatação inline no próprio campo -->
          <section class="block">
            <div class="block-head">
              <h3 class="block-label">Descrição</h3>
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
              field-label="Descrição da atividade"
              :state="fieldState.description ?? 'idle'"
              :disabled="!canEdit"
              @save="saveDescription"
            />
          </section>

          <!-- Tags: cria digitando, reusa da empresa. Remover aqui desvincula,
               não exclui a tag do catálogo. -->
          <section class="block">
            <div class="block-head">
              <h3 class="block-label">
                <TagIcon :size="12" />
                Tags
              </h3>
              <SaveStatus
                compact
                :state="fieldState.tags ?? 'idle'"
                :saved-at="savedAt"
                :message="fieldError.tags ?? ''"
                @retry="retry('tags')"
              />
            </div>
            <TagInput
              :model-value="activityTags"
              :company-id="companyIdRef"
              :disabled="!canEdit"
              bare
              @update:model-value="onTagsChange"
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

          <!-- Subtarefas: alternáveis aqui, com progresso visível -->
          <section v-if="subtasks.length" class="block">
            <div class="block-head">
              <h3 class="block-label">
                <ListChecks :size="12" />
                Subtarefas
              </h3>
              <SubtaskProgress :done="doneSubtasks" :total="subtasks.length" />
            </div>
            <ul class="subtasks">
              <li v-for="sub in subtasks" :key="sub.id" class="subtask">
                <button
                  type="button"
                  class="subtask__check"
                  :aria-label="
                    sub.status === 'DONE'
                      ? `Marcar “${sub.title}” como pendente`
                      : `Marcar “${sub.title}” como concluída`
                  "
                  :aria-pressed="sub.status === 'DONE'"
                  :disabled="!canEdit || togglingSubtask === sub.id"
                  @click="toggleSubtask(sub)"
                >
                  <CheckCircle2 v-if="sub.status === 'DONE'" :size="17" class="subtask__on" />
                  <Circle v-else :size="17" class="subtask__off" />
                </button>
                <span
                  class="subtask__title"
                  :class="{ 'subtask__title--done': sub.status === 'DONE' }"
                >
                  {{ sub.title }}
                </span>
                <!-- Quantos documentos a frente tem. O conteúdo não vem aqui:
                     só o número, para o módulo enxergar onde a spec está. -->
                <span
                  v-if="sub._count?.docs"
                  class="subtask__docs"
                  :title="`${sub._count.docs} documento(s)`"
                >
                  <FileText :size="11" />
                  {{ sub._count.docs }}
                </span>
                <Pill
                  v-if="sub.status !== 'DONE' && sub.status !== 'TODO'"
                  :icon="statusSpec(sub.status).icon"
                  :color="statusSpec(sub.status).token"
                >
                  {{ statusSpec(sub.status).label }}
                </Pill>
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

          <p class="created-at">Criada em {{ formatDateOnly(activity.createdAt) }}</p>

          <CommentsPanel
            entity-type="ACTIVITY"
            :entity-id="taskId"
            title="Comentários"
            compact
          />
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

.task-panel__scrim {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--bg) 62%, transparent);
  backdrop-filter: blur(2px);
  animation: panel-fade var(--motion) var(--motion-ease);
}

.task-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(760px, 100vw);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-overlay);
  outline: none;
  animation: panel-in var(--motion) var(--motion-ease);
}

.task-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.task-panel__head-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.task-panel__head-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-3);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.icon-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.icon-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.task-panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  scrollbar-width: thin;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Rótulo à esquerda, estado ou métrica à direita, na mesma linha de base. */
.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 24px;
}

.block-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

.count {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--text-4);
  font-variant-numeric: tabular-nums;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field + .field {
  margin-top: 14px;
}

/* Status: o controle mais proeminente do painel, como num work item. */
.segmented {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.segmented__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 38px;
  padding: 0 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.segmented__item:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
}

.segmented__item--on {
  background: color-mix(in srgb, var(--seg-c) 16%, transparent);
  border-color: color-mix(in srgb, var(--seg-c) 45%, transparent);
  color: var(--seg-c);
}

.segmented__item:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.segmented__item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  min-height: 32px;
  padding: 0 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-2);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.chip:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
}

.chip--on {
  background: color-mix(in srgb, var(--chip-c) 16%, transparent);
  border-color: color-mix(in srgb, var(--chip-c) 45%, transparent);
  color: var(--chip-c);
}

.chip:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chip:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.date-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.date-input {
  min-height: 36px;
  padding: 0 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
  color-scheme: light dark;
}

.date-input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
}

.btn-ghost,
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
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease);
}

.btn-ghost:hover,
.btn-secondary:hover {
  background: var(--surface-2);
  color: var(--text);
}

.subtasks {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.subtask {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.subtask:hover {
  border-color: var(--border-strong);
}

.subtask__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: transform var(--motion-fast) var(--motion-ease);
}

.subtask__check:hover:not(:disabled) {
  transform: scale(1.12);
}

.subtask__check:active:not(:disabled) {
  transform: scale(0.94);
}

.subtask__check:disabled {
  cursor: default;
}

.subtask__check:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.subtask__on {
  color: var(--status-done);
}

.subtask__off {
  color: var(--text-4);
}

.subtask__check:hover:not(:disabled) .subtask__off {
  color: var(--text-2);
}

.subtask__title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subtask__title--done {
  color: var(--text-3);
  text-decoration: line-through;
}

/* O markup de anexo saiu daqui para o `TaskAttachments.vue`, que é o dono
   único: eram quatro cópias do mesmo bloco no app. */

.subtask__docs {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: none;
  color: var(--text-4);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.created-at {
  margin: 0;
  font-size: 11px;
  color: var(--text-4);
}

@keyframes panel-in {
  from {
    transform: translateX(24px);
    opacity: 0;
  }
}

@keyframes panel-fade {
  from {
    opacity: 0;
  }
}

@media (max-width: 760px) {
  .task-panel {
    width: 100vw;
  }
  .segmented {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .task-panel,
  .task-panel__scrim {
    animation-duration: 1ms;
  }
  .segmented__item,
  .chip,
  .icon-btn,
  .btn-ghost,
  .btn-secondary,
  .subtask,
  .subtask__check {
    transition-duration: 1ms;
  }
  .subtask__check:hover:not(:disabled),
  .subtask__check:active:not(:disabled) {
    transform: none;
  }
}
</style>
