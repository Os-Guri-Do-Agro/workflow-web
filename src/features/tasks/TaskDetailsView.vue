<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { useTasks } from '@/features/tasks/useTasks'
import activityService from '@/service/activities/activity-service'
import companiesServices from '@/service/companies/companies-services'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { useToast } from '@/composables/useToast'
import { useCompanyQuarters } from '@/composables/useCompanyQuarters'
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  File,
  FileText,
  Flag,
  FlaskConical,
  Info,
  Lightbulb,
  ListChecks,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-vue-next'
import {
  dateOnlyToUtcNoonIso,
  formatDateOnly,
  isoToDateOnly,
  todayDateOnly,
} from '@/utils/date'
import Pill from '@/components/ui/Pill.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import CommentsPanel from '@/components/collaboration/CommentsPanel.vue'

function getActivityMonthId(activity: any): string | undefined {
  if (!activity) return undefined
  return activity.monthId ?? activity.month?.id ?? undefined
}

function getResponsibleUserIds(activity: any): string[] {
  return (
    activity?.responsibles?.map((r: any) => r.userId ?? r.user?.id).filter(Boolean) ?? []
  )
}

function buildActivityPayload(activity: any, overrides: Record<string, unknown> = {}) {
  return {
    title: activity.title,
    description: activity.description || '',
    priorityNumber: Number(activity.priorityNumber) || 1,
    dueDate: activity.dueDate || undefined,
    monthId: getActivityMonthId(activity),
    responsibleUserIds: getResponsibleUserIds(activity),
    ...overrides,
  }
}

function buildActivityMovePayload(
  activity: any,
  monthId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    title: activity.title,
    description: activity.description || '',
    priorityNumber: Number(activity.priorityNumber) || 1,
    monthId,
    responsibleUserIds: getResponsibleUserIds(activity),
    ...overrides,
  }
}

type PlanningMonth = { number: number }

function findMonthInQuarters(monthId: string, quarters: any[]): PlanningMonth | null {
  for (const quarter of quarters) {
    const found = quarter.months?.find((m: any) => m.id === monthId)
    if (found) return found
  }
  return null
}

/** Ajusta só o mês da data de entrega para o mês de planejamento (mantém dia e ano). */
function dueDateForPlanningMonth(
  currentDueDate: string,
  targetMonth: PlanningMonth,
): string {
  const current = new Date(currentDueDate)
  const year = current.getUTCFullYear()
  const day = current.getUTCDate()
  const monthIndex = targetMonth.number - 1
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const safeDay = Math.min(day, lastDay)
  const pad = (n: number) => String(n).padStart(2, '0')
  return dateOnlyToUtcNoonIso(`${year}-${pad(monthIndex + 1)}-${pad(safeDay)}`)
}

function moveExtrasForMonth(
  activity: any,
  newMonthId: string,
  quarters: any[],
  overrides: Record<string, unknown> = {},
) {
  const targetMonth = findMonthInQuarters(newMonthId, quarters)
  const extras = { ...overrides }
  if (activity.dueDate && targetMonth) {
    extras.dueDate = dueDateForPlanningMonth(activity.dueDate, targetMonth)
  }
  return extras
}

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const { companies } = useTasks()
const workspaceStore = useWorkspaceStore()

const taskId = computed(() => route.params.taskId as string)
const month = computed(() => route.params.month as string)

const companyId = computed(
  () => workspaceStore.activeCompanyId ?? localStorage.getItem('activeCompany') ?? '',
)
const { data: quartersData } = useCompanyQuarters(companyId)

const showSubtaskModal = ref(false)
const selectedSubtask = ref<any>(null)
const showCreateSubtaskModal = ref(false)
const members = ref<any[]>([])
const formSubtask = ref({
  title: '',
  description: '',
  priorityNumber: 1,
  dueDate: '',
  responsibleUserIds: [] as string[],
  attachment: null as File | null,
})

const suggest = ref<any>(null)
const loadingSuggest = ref(false)
const { success: showSuccess, error: showError } = useToast()

const improveWithAI = async () => {
  loadingSuggest.value = true
  try {
    const response = await activityService.postSuggest(taskId.value)
    suggest.value = response
    showSuccess('Sugestões geradas com sucesso')
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao aprimorar texto')
  } finally {
    loadingSuggest.value = false
  }
}

const applySuggestion = () => {
  if (!suggest.value) return
  formActivity.value.description =
    suggest.value.improvedDescription || formActivity.value.description
  formActivity.value.priorityNumber =
    suggest.value.suggestedPriority ?? formActivity.value.priorityNumber
}

const dismissSuggestion = () => {
  suggest.value = null
}

const showQuickSubtaskModal = ref(false)
const quickSubtaskTitle = ref('')

const openQuickSubtask = (title: string) => {
  quickSubtaskTitle.value = title
  showQuickSubtaskModal.value = true
}

const createQuickSubtask = async () => {
  if (!quickSubtaskTitle.value) return
  saving.value = true
  try {
    await activityService.postActivity({
      title: quickSubtaskTitle.value,
      description: '',
      priorityNumber: 1,
      dueDate: dateOnlyToUtcNoonIso(todayDateOnly()),
      monthId: activeMonthId.value,
      parentId: taskId.value,
      responsibleUserIds: [],
    })
    await InfoActivity()
    showQuickSubtaskModal.value = false
    showSuccess('Subtarefa criada com sucesso')
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao criar subtarefa')
  } finally {
    quickSubtaskTitle.value = ''
    saving.value = false
  }
}

const isSubtaskCreated = (suggestedTitle: string) => {
  return subtasks.value.some(
    (st: any) => st.title.toLowerCase().trim() === suggestedTitle.toLowerCase().trim(),
  )
}

const activityInfo = ref<any>(null)
const loading = ref(true)

const activeMonthId = computed(() => getActivityMonthId(activityInfo.value) ?? month.value)

const quartersList = computed(() => {
  const raw = quartersData.value as any
  return raw?.data ?? (Array.isArray(raw) ? raw : [])
})

const quarterOptions = computed(() =>
  quartersList.value.map((q: any) => ({
    id: q.id,
    label: q.label,
    months: q.months ?? [],
  })),
)

const placementSelection = ref({ quarterId: '', monthId: '' })

const selectedQuarterMonths = computed(() => {
  const quarter = quartersList.value.find((q: any) => q.id === placementSelection.value.quarterId)
  return quarter?.months ?? []
})

const quarterSelectItems = computed<{ label: string; value: string }[]>(() =>
  quarterOptions.value.map((q: any) => ({ label: q.label, value: q.id })),
)

const monthSelectItems = computed<{ label: string; value: string }[]>(() =>
  selectedQuarterMonths.value.map((m: any) => ({ label: m.name, value: m.id })),
)

const currentMonthData = computed(() => {
  const monthId = activeMonthId.value
  for (const quarter of quartersList.value) {
    const found = quarter.months?.find((m: any) => m.id === monthId)
    if (found) return found
  }
  return null
})

const syncPlacementSelection = () => {
  const monthId = activeMonthId.value
  const quarter =
    quartersList.value.find((q: any) => q.months?.some((m: any) => m.id === monthId)) ?? null
  placementSelection.value = {
    quarterId: quarter?.id ?? placementSelection.value.quarterId,
    monthId,
  }
}

watch([activityInfo, quartersList], syncPlacementSelection, { immediate: true })

const InfoActivity = async () => {
  try {
    activityInfo.value = await activityService.getActivityById(taskId.value)
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao buscar atividade')
  }
}

const findMembers = async () => {
  const id = localStorage.getItem('activeCompany')
  if (!id) return
  try {
    const response = await companiesServices.getCompanyMembers(id)
    members.value = response.data || response
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao buscar membros')
  }
}

const createSubtask = async () => {
  if (!formSubtask.value.title) return
  saving.value = true
  try {
    const created = await activityService.postActivity({
      title: formSubtask.value.title,
      description: formSubtask.value.description || '',
      priorityNumber: Number(formSubtask.value.priorityNumber) || 1,
      dueDate: formSubtask.value.dueDate
        ? dateOnlyToUtcNoonIso(formSubtask.value.dueDate)
        : dateOnlyToUtcNoonIso(todayDateOnly()),
      monthId: activeMonthId.value,
      parentId: taskId.value,
      responsibleUserIds: formSubtask.value.responsibleUserIds,
    })
    if (formSubtask.value.attachment) {
      const fd = new FormData()
      fd.append('file', formSubtask.value.attachment)
      await activityService.postActivityAttachment(created.id, fd)
    }
    await InfoActivity()
    formSubtask.value = {
      title: '',
      description: '',
      priorityNumber: 1,
      dueDate: '',
      responsibleUserIds: [],
      attachment: null,
    }
    showCreateSubtaskModal.value = false
    showSuccess('Subtarefa criada com sucesso')
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao criar subtarefa')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  // Se a URL traz ?company=, garante que o contexto está correto antes de buscar
  const companyFromQuery = route.query.company as string | undefined
  if (companyFromQuery && companyFromQuery !== workspaceStore.activeCompanyId) {
    workspaceStore.setActiveCompany(companyFromQuery)
  }

  await Promise.all([InfoActivity(), findMembers()])
  loading.value = false
})

const editingSubtask = ref(false)
const saving = ref(false)
const deleting = ref<string | null>(null)

const showEditActivityModal = ref(false)
const formActivity = ref({
  title: '',
  description: '',
  priorityNumber: 1,
  dueDate: '',
  quarterId: '',
  monthId: '',
  responsibleUserIds: [] as string[],
  attachment: null as File | null,
})

const formQuarterMonths = computed(() => {
  const quarter = quartersList.value.find((q: any) => q.id === formActivity.value.quarterId)
  return quarter?.months ?? []
})

const changingMonth = ref(false)

const invalidateBoards = (monthIds: string[]) => {
  for (const id of monthIds) {
    if (id) queryClient.invalidateQueries({ queryKey: ['boards', id] })
  }
  queryClient.invalidateQueries({ queryKey: ['dashboard', 'workspace'] })
}

const applyActivityResponse = (updated: any, monthId: string) => {
  activityInfo.value = {
    ...activityInfo.value,
    ...updated,
    monthId: getActivityMonthId(updated) ?? monthId,
    month: updated?.month ?? { id: monthId, name: currentMonthData.value?.name },
  }
}

const navigateToMonth = async (newMonthId: string) => {
  if (newMonthId === month.value) return
  await router.replace({
    name: 'task-details',
    params: { month: newMonthId, taskId: taskId.value },
    query: route.query,
  })
}

const changeActivityMonth = async (newMonthId: string) => {
  if (!newMonthId || newMonthId === activeMonthId.value || !activityInfo.value) return
  const previousMonthId = activeMonthId.value
  changingMonth.value = true
  try {
    const updated = await activityService.patchActivity(
      taskId.value,
      buildActivityMovePayload(
        activityInfo.value,
        newMonthId,
        moveExtrasForMonth(activityInfo.value, newMonthId, quartersList.value),
      ),
    )
    applyActivityResponse(updated, newMonthId)
    await navigateToMonth(newMonthId)
    syncPlacementSelection()
    invalidateBoards([previousMonthId, newMonthId])
    showSuccess('Mês atualizado com sucesso')
  } catch (error: any) {
    syncPlacementSelection()
    showError(error.response?.data?.message || 'Erro ao alterar mês')
  } finally {
    changingMonth.value = false
  }
}

const onPlacementQuarterChange = (quarterId: string) => {
  const months = quartersList.value.find((q: any) => q.id === quarterId)?.months ?? []
  const keepMonth = months.some((m: any) => m.id === placementSelection.value.monthId)
  const newMonthId = keepMonth ? placementSelection.value.monthId : (months[0]?.id ?? '')
  placementSelection.value = { quarterId, monthId: newMonthId }
  if (newMonthId && newMonthId !== activeMonthId.value) {
    changeActivityMonth(newMonthId)
  }
}

const onFormMonthChange = (newMonthId: string) => {
  formActivity.value.monthId = newMonthId
  const targetMonth = findMonthInQuarters(newMonthId, quartersList.value)
  if (!targetMonth) return

  const sourceDueDate = formActivity.value.dueDate
    ? dateOnlyToUtcNoonIso(formActivity.value.dueDate)
    : activityInfo.value?.dueDate

  if (!sourceDueDate) return

  formActivity.value.dueDate = isoToDateOnly(
    dueDateForPlanningMonth(sourceDueDate, targetMonth),
  )
}

const onFormQuarterChange = (quarterId: string) => {
  const months = quartersList.value.find((q: any) => q.id === quarterId)?.months ?? []
  const keepMonth = months.some((m: any) => m.id === formActivity.value.monthId)
  formActivity.value.quarterId = quarterId
  if (!keepMonth) {
    const newMonthId = months[0]?.id ?? ''
    formActivity.value.monthId = newMonthId
    if (newMonthId) onFormMonthChange(newMonthId)
  }
}

const openEditActivityModal = () => {
  const monthId = getActivityMonthId(activityInfo.value) ?? month.value
  const quarter =
    quartersList.value.find((q: any) => q.months?.some((m: any) => m.id === monthId)) ?? null
  formActivity.value = {
    title: activityInfo.value.title,
    description: activityInfo.value.description || '',
    priorityNumber: activityInfo.value.priorityNumber ?? 1,
    dueDate: activityInfo.value.dueDate ? isoToDateOnly(activityInfo.value.dueDate) : '',
    quarterId: quarter?.id ?? '',
    monthId,
    responsibleUserIds: getResponsibleUserIds(activityInfo.value),
    attachment: null,
  }
  suggest.value = null
  showEditActivityModal.value = true
}

const updateActivity = async () => {
  if (!formActivity.value.title || !activityInfo.value) return
  saving.value = true
  const previousMonthId = activeMonthId.value
  const newMonthId = formActivity.value.monthId || previousMonthId
  const monthChanged = newMonthId !== previousMonthId
  try {
    const sourceDueDate = formActivity.value.dueDate
      ? dateOnlyToUtcNoonIso(formActivity.value.dueDate)
      : activityInfo.value.dueDate
    const activityForMove = sourceDueDate
      ? { ...activityInfo.value, dueDate: sourceDueDate }
      : activityInfo.value

    const updated = await activityService.patchActivity(
      taskId.value,
      monthChanged
        ? buildActivityMovePayload(
            activityForMove,
            newMonthId,
            moveExtrasForMonth(activityForMove, newMonthId, quartersList.value, {
              title: formActivity.value.title,
              description: formActivity.value.description || '',
              priorityNumber: Number(formActivity.value.priorityNumber) || 1,
              responsibleUserIds: formActivity.value.responsibleUserIds,
            }),
          )
        : buildActivityPayload(activityInfo.value, {
            title: formActivity.value.title,
            description: formActivity.value.description || '',
            priorityNumber: Number(formActivity.value.priorityNumber) || 1,
            dueDate: formActivity.value.dueDate
              ? dateOnlyToUtcNoonIso(formActivity.value.dueDate)
              : undefined,
            responsibleUserIds: formActivity.value.responsibleUserIds,
          }),
    )
    if (formActivity.value.attachment) {
      const fd = new FormData()
      fd.append('file', formActivity.value.attachment)
      await activityService.postActivityAttachment(taskId.value, fd)
    }
    applyActivityResponse(updated, newMonthId)
    if (monthChanged) {
      await navigateToMonth(newMonthId)
      invalidateBoards([previousMonthId, newMonthId])
    }
    syncPlacementSelection()
    if (formActivity.value.attachment) {
      await InfoActivity()
    }
    showEditActivityModal.value = false
    showSuccess('Atividade atualizada com sucesso')
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao atualizar atividade')
  } finally {
    saving.value = false
  }
}

const deleteSubtask = async (task: any) => {
  deleting.value = task.id
  try {
    await activityService.deleteActivity(task.id)
    await InfoActivity()
    showSubtaskModal.value = false
    showSuccess('Subtarefa deletada com sucesso')
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao deletar subtarefa')
  } finally {
    deleting.value = null
  }
}

const openSubtaskModal = (task: any) => {
  selectedSubtask.value = task
  editingSubtask.value = false
  formSubtask.value = {
    title: task.title,
    description: task.description || '',
    priorityNumber: task.priorityNumber ?? 1,
    dueDate: task.dueDate ? isoToDateOnly(task.dueDate) : '',
    responsibleUserIds: task.responsibles?.map((r: any) => r.userId) ?? [],
    attachment: null,
  }
  showSubtaskModal.value = true
}

const updateSubtask = async () => {
  if (!selectedSubtask.value || !formSubtask.value.title) return
  saving.value = true
  try {
    await activityService.patchActivity(selectedSubtask.value.id, {
      title: formSubtask.value.title,
      description: formSubtask.value.description || '',
      priorityNumber: Number(formSubtask.value.priorityNumber) || 1,
      dueDate: formSubtask.value.dueDate
        ? dateOnlyToUtcNoonIso(formSubtask.value.dueDate)
        : undefined,
      monthId: activeMonthId.value,
      parentId: taskId.value,
      responsibleUserIds: formSubtask.value.responsibleUserIds,
    })
    if (formSubtask.value.attachment) {
      const fd = new FormData()
      fd.append('file', formSubtask.value.attachment)
      await activityService.postActivityAttachment(selectedSubtask.value.id, fd)
    }
    await InfoActivity()
    showSubtaskModal.value = false
    showSuccess('Subtarefa atualizada com sucesso')
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao atualizar subtarefa')
  } finally {
    saving.value = false
  }
}

const getCompanyName = (id: string) => companies.value.find((c) => c.id === id)?.name || '-'

const getUserInitials = (name: string) => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const goBack = () => {
  router.push(`/tasks/${activeMonthId.value}`)
}

const subtasks = computed(() => activityInfo.value?.subtasks ?? [])
const responsibles = computed(() => activityInfo.value?.responsibles ?? [])

const pageMonthLabel = computed(() => currentMonthData.value?.name ?? 'Mês')

type StatusSpec = { token: string; label: string; icon: LucideIcon }
const STATUS_MAP: Record<string, StatusSpec> = {
  TODO: { token: 'var(--status-todo)', label: 'A fazer', icon: Circle },
  IN_PROGRESS: { token: 'var(--status-prog)', label: 'Em andamento', icon: Clock },
  IN_TESTING: { token: 'var(--status-test)', label: 'Em teste', icon: FlaskConical },
  TESTING: { token: 'var(--status-test)', label: 'Em teste', icon: FlaskConical },
  DONE: { token: 'var(--status-done)', label: 'Concluído', icon: CheckCircle2 },
}
const STATUS_FALLBACK: StatusSpec = STATUS_MAP.TODO!

const getStatusConfig = (status: string): StatusSpec => STATUS_MAP[status] ?? STATUS_FALLBACK

const statusConfig = computed(() => getStatusConfig(activityInfo.value?.status ?? 'TODO'))

const PRIORITY_META: Record<number, { label: string; token: string }> = {
  0: { label: 'P0', token: 'var(--err)' },
  1: { label: 'P1', token: 'var(--warn)' },
  2: { label: 'P2', token: 'var(--info)' },
  3: { label: 'P3', token: 'var(--text-3)' },
  4: { label: 'P4', token: 'var(--text-3)' },
  5: { label: 'P5', token: 'var(--text-3)' },
}
const PRIORITY_FALLBACK = { label: 'P?', token: 'var(--text-3)' }

const getPriorityMeta = (priority: number) => PRIORITY_META[priority] ?? PRIORITY_FALLBACK

const USER_TONES = [
  'var(--info)',
  'var(--success)',
  'var(--status-test)',
  'var(--warn)',
  'var(--accent)',
] as const

const getUserTone = (name: string) => {
  const index =
    name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % USER_TONES.length
  return USER_TONES[index]!
}

const toggleSubtaskStatus = async (task: any) => {
  const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE'
  task.status = newStatus
  try {
    await activityService.patchActivityStatus(task.id, newStatus)
    showSuccess('Status atualizado com sucesso')
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao atualizar status')
  }
}

const formatDate = (date: string | null) => {
  if (!date) return null
  return formatDateOnly(date)
}

const isImage = (filename: string) => /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(filename)

const onActivityFileChange = (f: File | File[]) => {
  const file = Array.isArray(f) ? f[0] : f
  if (file && file.size > 10 * 1024 * 1024) {
    showError('O arquivo excede o limite de 10MB')
    formActivity.value.attachment = null
    return
  }
  formActivity.value.attachment = file ?? null
}

const onSubtaskFileChange = (f: File | File[]) => {
  const file = Array.isArray(f) ? f[0] : f
  if (file && file.size > 10 * 1024 * 1024) {
    showError('O arquivo excede o limite de 10MB')
    formSubtask.value.attachment = null
    return
  }
  formSubtask.value.attachment = file ?? null
}

const deletingAttachment = ref<string | null>(null)

const deleteAttachment = async (attachmentId: string) => {
  deletingAttachment.value = attachmentId
  try {
    await activityService.deleteAttachment(attachmentId)
    await InfoActivity()
    if (selectedSubtask.value) {
      const updatedSubtask = activityInfo.value?.subtasks?.find(
        (s: any) => s.id === selectedSubtask.value.id,
      )
      if (updatedSubtask) {
        selectedSubtask.value = updatedSubtask
      }
    }
    showSuccess('Anexo deletado com sucesso')
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao deletar anexo')
  } finally {
    deletingAttachment.value = null
  }
}
</script>

<template>
  <div v-if="activityInfo" class="detail-page">
    <header class="page-top">
      <button type="button" class="back-btn press" @click="goBack">
        <ArrowLeft :size="15" />
        Voltar
      </button>
      <nav class="breadcrumb" aria-label="Navegação">
        <span>Tarefas</span>
        <ChevronRight :size="12" class="breadcrumb-sep" />
        <span>{{ pageMonthLabel }}</span>
      </nav>
    </header>

    <div class="detail-grid">
      <div class="main-col">
        <section class="panel">
          <div class="title-row">
            <div class="title-main">
              <span class="eyebrow">
                <FileText :size="11" />
                Atividade
              </span>
              <h1 class="task-title">{{ activityInfo.title }}</h1>
            </div>
            <button
              type="button"
              class="icon-btn press"
              aria-label="Editar atividade"
              @click="openEditActivityModal"
            >
              <Pencil :size="15" />
            </button>
          </div>
          <div
            v-if="activityInfo.description"
            class="desc-body"
            v-html="activityInfo.description"
          />
          <p v-else class="desc-empty">Sem descrição</p>
        </section>

        <section class="panel">
          <header class="panel-head">
            <div class="panel-head-left">
              <ListChecks :size="16" />
              <h2 class="panel-title">Subtarefas</h2>
              <span class="count-badge">{{ subtasks.length }}</span>
            </div>
            <button type="button" class="btn-secondary press" @click="showCreateSubtaskModal = true">
              <Plus :size="14" />
              Nova subtarefa
            </button>
          </header>

          <div v-if="subtasks.length" class="subtask-list">
            <div
              v-for="task in subtasks"
              :key="task.id"
              class="subtask-item"
              :class="{ done: task.status === 'DONE' }"
            >
              <button
                type="button"
                class="check-btn press"
                :aria-label="task.status === 'DONE' ? 'Marcar como pendente' : 'Marcar como concluída'"
                @click.stop="toggleSubtaskStatus(task)"
              >
                <CheckCircle2 v-if="task.status === 'DONE'" :size="18" class="check-on" />
                <Circle v-else :size="18" class="check-off" />
              </button>

              <div class="subtask-body clickable" @click="openSubtaskModal(task)">
                <div class="subtask-top">
                  <span class="subtask-title">{{ task.title }}</span>
                  <Pill :color="getPriorityMeta(task.priorityNumber).token" size="sm">
                    {{ getPriorityMeta(task.priorityNumber).label }}
                  </Pill>
                </div>
                <p v-if="task.description" class="subtask-desc">{{ task.description }}</p>
                <div class="subtask-meta">
                  <Pill :icon="getStatusConfig(task.status).icon" :color="getStatusConfig(task.status).token">
                    {{ getStatusConfig(task.status).label }}
                  </Pill>
                  <Pill v-if="task.dueDate" :icon="Calendar" color="var(--text-3)">
                    {{ formatDate(task.dueDate) }}
                  </Pill>
                </div>
                <div v-if="task.responsibles?.length" class="avatar-row">
                  <span
                    v-for="r in task.responsibles"
                    :key="r.userId"
                    class="avatar"
                    :title="r.user.name"
                    :style="{
                      background: `color-mix(in srgb, ${getUserTone(r.user.name)} 18%, var(--surface-2))`,
                      color: getUserTone(r.user.name),
                    }"
                  >
                    {{ getUserInitials(r.user.name) }}
                  </span>
                </div>
              </div>

              <button
                type="button"
                class="icon-btn icon-btn--danger press"
                aria-label="Excluir subtarefa"
                :disabled="deleting === task.id"
                @click.stop="deleteSubtask(task)"
              >
                <Loader2 v-if="deleting === task.id" :size="15" class="spin" />
                <Trash2 v-else :size="15" />
              </button>
            </div>
          </div>

          <EmptyState
            v-else
            :icon="ListChecks"
            title="Nenhuma subtarefa"
            description="Quebre o trabalho em passos menores para acompanhar o progresso."
          >
            <template #action>
              <button type="button" class="btn-primary press" @click="showCreateSubtaskModal = true">
                <Plus :size="14" />
                Nova subtarefa
              </button>
            </template>
          </EmptyState>
        </section>
      </div>

      <aside class="side-col">
        <section class="panel meta-panel">
          <header class="panel-head panel-head--compact">
            <Info :size="15" />
            <h2 class="panel-title">Informações</h2>
          </header>

          <dl class="meta-list">
            <div class="meta-row">
              <dt>Status</dt>
              <dd>
                <Pill :icon="statusConfig.icon" :color="statusConfig.token">
                  {{ statusConfig.label }}
                </Pill>
              </dd>
            </div>

            <div v-if="quarterOptions.length" class="meta-row">
              <dt>Trimestre</dt>
              <dd>
                <AppSelect
                  :model-value="placementSelection.quarterId"
                  :items="quarterSelectItems"
                  label="Trimestre"
                  density="compact"
                  :disabled="changingMonth"
                  @update:model-value="onPlacementQuarterChange(String($event))"
                />
              </dd>
            </div>

            <div v-if="selectedQuarterMonths.length" class="meta-row">
              <dt>Mês</dt>
              <dd class="meta-month">
                <AppSelect
                  :model-value="placementSelection.monthId"
                  :items="monthSelectItems"
                  label="Mês"
                  density="compact"
                  :disabled="changingMonth || selectedQuarterMonths.length <= 1"
                  @update:model-value="changeActivityMonth(String($event))"
                />
                <Loader2 v-if="changingMonth" :size="14" class="spin meta-loading" />
              </dd>
            </div>

            <div class="meta-row">
              <dt>Prioridade</dt>
              <dd>
                <Pill :icon="Flag" :color="getPriorityMeta(activityInfo.priorityNumber).token">
                  {{ getPriorityMeta(activityInfo.priorityNumber).label }}
                </Pill>
              </dd>
            </div>

            <div class="meta-row">
              <dt>Criado em</dt>
              <dd class="meta-value">
                <Clock :size="13" />
                {{ formatDate(activityInfo.createdAt) }}
              </dd>
            </div>

            <div v-if="activityInfo.dueDate" class="meta-row">
              <dt>Entrega</dt>
              <dd class="meta-value">
                <CalendarClock :size="13" />
                {{ formatDate(activityInfo.dueDate) }}
              </dd>
            </div>

            <div v-if="responsibles.length" class="meta-row meta-row--stack">
              <dt>Responsáveis</dt>
              <dd class="responsible-list">
                <span
                  v-for="r in responsibles"
                  :key="r.userId"
                  class="responsible-chip"
                  :style="{
                    background: `color-mix(in srgb, ${getUserTone(r.user.name)} 14%, var(--surface-2))`,
                    color: getUserTone(r.user.name),
                    borderColor: `color-mix(in srgb, ${getUserTone(r.user.name)} 28%, var(--border))`,
                  }"
                >
                  <span class="avatar avatar--sm">{{ getUserInitials(r.user.name) }}</span>
                  {{ r.user.name }}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        <section v-if="activityInfo.attachments?.length" class="panel">
          <header class="panel-head panel-head--compact">
            <Paperclip :size="15" />
            <h2 class="panel-title">Anexos</h2>
          </header>
          <div class="attachment-grid">
            <a
              v-for="att in activityInfo.attachments"
              :key="att.id"
              :href="att.url"
              target="_blank"
              rel="noopener noreferrer"
              class="attachment-item hover-lift"
            >
              <img
                v-if="isImage(att.filename)"
                :src="att.url"
                :alt="att.filename"
                class="attachment-img"
              />
              <div v-else class="attachment-file">
                <File :size="22" />
                <span>{{ att.filename }}</span>
              </div>
            </a>
          </div>
        </section>

      </aside>

      <CommentsPanel
        class="comments-wide"
        entity-type="ACTIVITY"
        :entity-id="taskId"
        title="Comentários da atividade"
      />
    </div>
  </div>

  <div v-else-if="loading" class="detail-page detail-page--center">
    <div class="loading-wrap">
      <Skeleton type="text" />
      <Skeleton type="block" />
      <Skeleton type="card" />
    </div>
  </div>

  <div v-else class="detail-page detail-page--center">
    <EmptyState :icon="AlertCircle" title="Tarefa não encontrada" description="Ela pode ter sido removida ou o link está incorreto.">
      <template #action>
        <button type="button" class="btn-secondary press" @click="goBack">
          <ArrowLeft :size="14" />
          Voltar
        </button>
      </template>
    </EmptyState>
  </div>

  <v-dialog v-model="showEditActivityModal" max-width="900px">
    <v-card class="dialog-card" rounded="xl">
      <div class="dialog-header">
        <div class="dialog-head-main">
          <span class="dialog-head-icon"><Pencil :size="16" /></span>
          <span class="dialog-title-text">Editar atividade</span>
        </div>
        <button type="button" class="icon-btn press" aria-label="Fechar" @click="showEditActivityModal = false">
          <X :size="16" />
        </button>
      </div>

      <div class="dialog-body">
        <div class="d-flex ga-2 align-center">
          <v-text-field
            v-model="formActivity.title"
            label="Título *"
            density="compact"
            variant="outlined"
            color="secondary"
            hide-details
          />
          <v-btn
            variant="tonal"
            color="secondary"
            class="text-none ai-btn"
            :loading="loadingSuggest"
            @click="improveWithAI"
          >
            <template #prepend><Lightbulb :size="15" /></template>
            Aprimorar com IA
          </v-btn>
        </div>

        <div v-if="suggest" class="suggest-card">
          <div class="suggest-head">
            <Sparkles :size="16" />
            <span>Sugestões de IA</span>
          </div>

          <div v-if="suggest.improvedDescription" class="mb-2">
            <div style="font-size: 10px" class="text-primary-lighten mb-1">
              Descrição Aprimorada:
            </div>
            <div style="font-size: 11px" class="text-secondary">
              {{ suggest.improvedDescription }}
            </div>
          </div>

          <div v-if="suggest.suggestedSubtasks?.length" class="mb-2">
            <div style="font-size: 10px" class="text-primary-lighten mb-1">
              Subtarefas Sugeridas:
            </div>
            <div class="d-flex flex-column ga-1">
              <div
                v-for="(task, i) in suggest.suggestedSubtasks"
                :key="i"
                class="suggest-task"
                :class="{ 'suggest-task--done': isSubtaskCreated(task) }"
              >
                <div class="d-flex align-center ga-2 flex-grow-1">
                  <CheckCircle2 v-if="isSubtaskCreated(task)" :size="15" class="suggest-check" />
                  <span
                    style="font-size: 11px"
                    class="text-secondary"
                    :class="{ 'text-decoration-line-through': isSubtaskCreated(task) }"
                  >
                    {{ task }}
                  </span>
                </div>
                <button
                  type="button"
                  class="icon-btn press"
                  :disabled="isSubtaskCreated(task)"
                  @click="openQuickSubtask(task)"
                >
                  <Plus :size="14" />
                </button>
              </div>
            </div>
          </div>

          <div v-if="suggest.suggestedPriority" class="mb-3">
            <div style="font-size: 10px" class="text-primary-lighten mb-1">
              Prioridade Sugerida:
            </div>
            <Pill :color="getPriorityMeta(suggest.suggestedPriority).token">
              {{ getPriorityMeta(suggest.suggestedPriority).label }}
            </Pill>
          </div>

          <div class="d-flex ga-2">
            <button
              v-if="suggest.improvedDescription || suggest.suggestedPriority"
              type="button"
              class="btn-primary press"
              @click="applySuggestion"
            >
              <Check :size="14" />
              Aplicar sugestão
            </button>
            <button type="button" class="btn-ghost press" @click="dismissSuggestion">
              Descartar
            </button>
          </div>
        </div>

        <v-textarea
          v-model="formActivity.description"
          label="Descrição"
          density="compact"
          variant="outlined"
          color="secondary"
          rows="4"
          class="mb-3 mt-3"
          hide-details
        />
        <v-row>
          <v-col cols="6">
            <v-text-field
              v-model="formActivity.priorityNumber"
              label="Prioridade"
              type="number"
              density="compact"
              variant="outlined"
              color="secondary"
              hide-details
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="formActivity.dueDate"
              label="Data de Entrega"
              type="date"
              density="compact"
              variant="outlined"
              color="secondary"
              hide-details
            />
          </v-col>
        </v-row>
        <v-row v-if="quarterOptions.length" class="mt-3">
          <v-col cols="6">
            <v-select
              :model-value="formActivity.quarterId"
              :items="quarterOptions"
              item-title="label"
              item-value="id"
              label="Trimestre"
              density="compact"
              variant="outlined"
              color="secondary"
              hide-details
              @update:model-value="onFormQuarterChange"
            />
          </v-col>
          <v-col cols="6">
            <v-select
              :model-value="formActivity.monthId"
              :items="formQuarterMonths"
              item-title="name"
              item-value="id"
              label="Mês"
              density="compact"
              variant="outlined"
              color="secondary"
              hide-details
              @update:model-value="onFormMonthChange"
            />
          </v-col>
        </v-row>
        <v-select
          v-model="formActivity.responsibleUserIds"
          :items="members"
          :item-title="(m) => m.user?.name ?? m.name"
          :item-value="(m) => m.user?.id ?? m.id"
          label="Responsáveis"
          density="compact"
          variant="outlined"
          color="secondary"
          multiple
          chips
          closable-chips
          class="mt-3"
          hide-details
        />
        <div v-if="activityInfo.attachments?.length" class="view-field">
          <span class="view-label">Anexos atuais</span>
          <div class="attachment-grid" style="padding: 0">
            <div v-for="att in activityInfo.attachments" :key="att.id" class="attachment-wrap">
              <a :href="att.url" target="_blank" rel="noopener noreferrer" class="attachment-item hover-lift">
                <img v-if="isImage(att.filename)" :src="att.url" :alt="att.filename" class="attachment-img" style="width: 100px; height: 100px" />
                <div v-else class="attachment-file" style="width: 100px; height: 100px">
                  <File :size="26" />
                  <span>{{ att.filename }}</span>
                </div>
              </a>
              <button
                type="button"
                class="attachment-remove press"
                :disabled="deletingAttachment === att.id"
                @click.stop="deleteAttachment(att.id)"
              >
                <Loader2 v-if="deletingAttachment === att.id" :size="12" class="spin" />
                <X v-else :size="12" />
              </button>
            </div>
          </div>
        </div>
        <v-file-input
          label="Adicionar anexo"
          density="compact"
          variant="outlined"
          color="secondary"
          prepend-icon=""
          accept="*/*"
          hide-details
          class="mt-3"
          :model-value="formActivity.attachment"
          @update:model-value="onActivityFileChange"
        >
          <template #prepend-inner><Paperclip :size="16" /></template>
        </v-file-input>
      </div>

      <div class="dialog-actions">
        <button type="button" class="btn-ghost press" @click="showEditActivityModal = false">
          Cancelar
        </button>
        <button
          type="button"
          class="btn-primary press"
          :disabled="!formActivity.title"
          @click="updateActivity"
        >
          <Loader2 v-if="saving" :size="14" class="spin" />
          Salvar
        </button>
      </div>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showCreateSubtaskModal" max-width="500px">
    <v-card class="dialog-card" rounded="xl">
      <div class="dialog-header">
        <div class="dialog-head-main">
          <span class="dialog-head-icon"><Plus :size="16" /></span>
          <span class="dialog-title-text">Nova subtarefa</span>
        </div>
        <button type="button" class="icon-btn press" aria-label="Fechar" @click="showCreateSubtaskModal = false">
          <X :size="16" />
        </button>
      </div>

      <div class="dialog-body">
        <v-text-field
          v-model="formSubtask.title"
          label="Título *"
          density="compact"
          variant="outlined"
          color="secondary"
          class="mb-3"
          hide-details
        />
        <v-textarea
          v-model="formSubtask.description"
          label="Descrição"
          density="compact"
          variant="outlined"
          color="secondary"
          rows="3"
          class="mb-3"
          hide-details
        />
        <v-row>
          <v-col cols="6">
            <v-text-field
              v-model="formSubtask.priorityNumber"
              label="Prioridade"
              type="number"
              density="compact"
              variant="outlined"
              color="secondary"
              hide-details
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="formSubtask.dueDate"
              label="Data de Entrega"
              type="date"
              density="compact"
              variant="outlined"
              color="secondary"
              hide-details
            />
          </v-col>
        </v-row>
        <v-select
          v-model="formSubtask.responsibleUserIds"
          :items="members"
          :item-title="(m) => m.user?.name ?? m.name"
          :item-value="(m) => m.user?.id ?? m.id"
          label="Responsáveis"
          density="compact"
          variant="outlined"
          color="secondary"
          multiple
          chips
          closable-chips
          class="mt-3"
          hide-details
        />
        <v-file-input
          label="Anexo"
          density="compact"
          variant="outlined"
          color="secondary"
          prepend-icon=""
          accept="*/*"
          hide-details
          class="mt-3"
          :model-value="formSubtask.attachment"
          @update:model-value="onSubtaskFileChange"
        >
          <template #prepend-inner><Paperclip :size="16" /></template>
        </v-file-input>
      </div>

      <div class="dialog-actions">
        <button type="button" class="btn-ghost press" @click="showCreateSubtaskModal = false">
          Cancelar
        </button>
        <button
          type="button"
          class="btn-primary press"
          :disabled="!formSubtask.title"
          @click="createSubtask"
        >
          <Loader2 v-if="saving" :size="14" class="spin" />
          Criar
        </button>
      </div>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showSubtaskModal" max-width="900px">
    <v-card v-if="selectedSubtask" class="dialog-card" rounded="xl">
      <div class="dialog-header">
        <div class="dialog-head-main">
          <span class="dialog-head-icon"><CheckCircle2 :size="16" /></span>
          <span class="dialog-title-text">Detalhes da subtarefa</span>
        </div>
        <div class="dialog-head-actions">
          <button
            type="button"
            class="icon-btn press"
            :aria-label="editingSubtask ? 'Cancelar edição' : 'Editar'"
            @click="editingSubtask = !editingSubtask"
          >
            <X v-if="editingSubtask" :size="16" />
            <Pencil v-else :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn icon-btn--danger press"
            aria-label="Excluir subtarefa"
            :disabled="deleting === selectedSubtask?.id"
            @click="deleteSubtask(selectedSubtask)"
          >
            <Loader2 v-if="deleting === selectedSubtask?.id" :size="15" class="spin" />
            <Trash2 v-else :size="15" />
          </button>
          <button type="button" class="icon-btn press" aria-label="Fechar" @click="showSubtaskModal = false">
            <X :size="16" />
          </button>
        </div>
      </div>

      <div class="dialog-body">
        <template v-if="!editingSubtask">
          <div class="view-field">
            <span class="view-label">Título</span>
            <p class="view-value view-value--title">{{ selectedSubtask.title }}</p>
          </div>

          <div class="view-pills">
            <Pill :icon="getStatusConfig(selectedSubtask.status).icon" :color="getStatusConfig(selectedSubtask.status).token">
              {{ getStatusConfig(selectedSubtask.status).label }}
            </Pill>
            <Pill :icon="Flag" :color="getPriorityMeta(selectedSubtask.priorityNumber).token">
              {{ getPriorityMeta(selectedSubtask.priorityNumber).label }}
            </Pill>
          </div>

          <div v-if="selectedSubtask.description" class="view-field">
            <span class="view-label">Descrição</span>
            <div class="view-value desc-body" v-html="selectedSubtask.description" />
          </div>

          <div v-if="selectedSubtask.attachments?.length" class="view-field">
            <span class="view-label">Anexos</span>
            <div class="attachment-grid">
              <div v-for="att in selectedSubtask.attachments" :key="att.id" class="attachment-wrap">
                <a :href="att.url" target="_blank" rel="noopener noreferrer" class="attachment-item hover-lift">
                  <img v-if="isImage(att.filename)" :src="att.url" :alt="att.filename" class="attachment-img" />
                  <div v-else class="attachment-file">
                    <File :size="22" />
                    <span>{{ att.filename }}</span>
                  </div>
                </a>
                <button
                  type="button"
                  class="attachment-remove press"
                  :disabled="deletingAttachment === att.id"
                  @click.stop="deleteAttachment(att.id)"
                >
                  <Loader2 v-if="deletingAttachment === att.id" :size="12" class="spin" />
                  <X v-else :size="12" />
                </button>
              </div>
            </div>
          </div>

          <div class="view-grid">
            <div v-if="selectedSubtask.responsibles?.length" class="view-field">
              <span class="view-label">Responsáveis</span>
              <div class="responsible-list">
                <span
                  v-for="r in selectedSubtask.responsibles"
                  :key="r.userId"
                  class="responsible-chip"
                  :style="{
                    background: `color-mix(in srgb, ${getUserTone(r.user.name)} 14%, var(--surface-2))`,
                    color: getUserTone(r.user.name),
                    borderColor: `color-mix(in srgb, ${getUserTone(r.user.name)} 28%, var(--border))`,
                  }"
                >
                  <span class="avatar avatar--sm">{{ getUserInitials(r.user.name) }}</span>
                  {{ r.user.name }}
                </span>
              </div>
            </div>
            <div v-if="selectedSubtask.dueDate" class="view-field">
              <span class="view-label">Entrega</span>
              <span class="meta-value">
                <Calendar :size="13" />
                {{ formatDate(selectedSubtask.dueDate) }}
              </span>
            </div>
          </div>
        </template>

        <template v-else>
          <v-text-field
            v-model="formSubtask.title"
            label="Título *"
            density="compact"
            variant="outlined"
            color="secondary"
            class="mb-3"
            hide-details
          />
          <v-textarea
            v-model="formSubtask.description"
            label="Descrição"
            density="compact"
            variant="outlined"
            color="secondary"
            rows="3"
            class="mb-3"
            hide-details
          />
          <v-row>
            <v-col cols="6">
              <v-text-field
                v-model="formSubtask.priorityNumber"
                label="Prioridade"
                type="number"
                density="compact"
                variant="outlined"
                color="secondary"
                hide-details
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model="formSubtask.dueDate"
                label="Data de Entrega"
                type="date"
                density="compact"
                variant="outlined"
                color="secondary"
                hide-details
              />
            </v-col>
          </v-row>
          <v-select
            v-model="formSubtask.responsibleUserIds"
            :items="members"
            :item-title="(m) => m.user?.name ?? m.name"
            :item-value="(m) => m.user?.id ?? m.id"
            label="Responsáveis"
            density="compact"
            variant="outlined"
            color="secondary"
            multiple
            chips
            closable-chips
            class="mt-3"
            hide-details
          />
          <div v-if="selectedSubtask.attachments?.length" class="view-field">
            <span class="view-label">Anexos atuais</span>
            <div class="attachment-grid" style="padding: 0">
              <div
                v-for="att in selectedSubtask.attachments"
                :key="att.id"
                class="attachment-wrap"
              >
                <a :href="att.url" target="_blank" rel="noopener noreferrer" class="attachment-item hover-lift">
                  <img
                    v-if="isImage(att.filename)"
                    :src="att.url"
                    :alt="att.filename"
                    class="attachment-img"
                    style="width: 100px; height: 100px"
                  />
                  <div v-else class="attachment-file" style="width: 100px; height: 100px">
                    <File :size="26" />
                    <span>{{ att.filename }}</span>
                  </div>
                </a>
                <button
                  type="button"
                  class="attachment-remove press"
                  :disabled="deletingAttachment === att.id"
                  @click.stop="deleteAttachment(att.id)"
                >
                  <Loader2 v-if="deletingAttachment === att.id" :size="12" class="spin" />
                  <X v-else :size="12" />
                </button>
              </div>
            </div>
          </div>
          <v-file-input
            label="Adicionar anexo"
            density="compact"
            variant="outlined"
            color="secondary"
            prepend-icon=""
            accept="*/*"
            hide-details
            class="mt-3"
            :model-value="formSubtask.attachment"
            @update:model-value="onSubtaskFileChange"
          >
            <template #prepend-inner><Paperclip :size="16" /></template>
          </v-file-input>
        </template>
      </div>

      <div class="dialog-actions">
        <template v-if="editingSubtask">
          <button type="button" class="btn-ghost press" @click="editingSubtask = false">Cancelar</button>
          <button
            type="button"
            class="btn-primary press"
            :disabled="!formSubtask.title"
            @click="updateSubtask"
          >
            <Loader2 v-if="saving" :size="14" class="spin" />
            Salvar
          </button>
        </template>
        <button v-else type="button" class="btn-secondary press" @click="showSubtaskModal = false">
          Fechar
        </button>
      </div>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showQuickSubtaskModal" max-width="400px">
    <v-card class="dialog-card" rounded="xl">
      <div class="dialog-header">
        <div class="dialog-head-main">
          <span class="dialog-head-icon"><Sparkles :size="16" /></span>
          <span class="dialog-title-text">Criar subtarefa</span>
        </div>
        <button type="button" class="icon-btn press" aria-label="Fechar" @click="showQuickSubtaskModal = false">
          <X :size="16" />
        </button>
      </div>

      <div class="dialog-body">
        <v-text-field
          v-model="quickSubtaskTitle"
          label="Título da subtarefa"
          density="compact"
          variant="outlined"
          color="secondary"
          hide-details
          autofocus
        />
        <p class="field-hint">Você poderá editar mais detalhes após criar.</p>
      </div>

      <div class="dialog-actions">
        <button type="button" class="btn-ghost press" @click="showQuickSubtaskModal = false">
          Cancelar
        </button>
        <button
          type="button"
          class="btn-primary press"
          :disabled="!quickSubtaskTitle"
          @click="createQuickSubtask"
        >
          <Loader2 v-if="saving" :size="14" class="spin" />
          <Plus v-else :size="14" />
          Criar
        </button>
      </div>
    </v-card>
  </v-dialog>

</template>

<style scoped>
.detail-page {
  padding: 24px 28px;
  max-width: 1200px;
  margin: 0 auto;
}

.detail-page--center {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.page-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: color var(--motion-fast) var(--motion-ease);
}

.back-btn:hover {
  color: var(--text);
}

.breadcrumb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
}

.breadcrumb-sep {
  opacity: 0.5;
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
  align-items: start;
}

.main-col,
.side-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.comments-wide {
  grid-column: 1 / -1;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  color: var(--text);
}

.panel-head--compact {
  padding: 12px 14px;
  gap: 8px;
}

.panel-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
}

.count-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-2);
  border-radius: 999px;
  padding: 2px 7px;
}

.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 0;
}

.title-main {
  min-width: 0;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: 6px;
}

.task-title {
  margin: 0 0 14px;
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.desc-body {
  padding: 0 16px 16px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-2);
}

.desc-body :deep(p) {
  margin: 0 0 0.75em;
}

.desc-empty {
  margin: 0;
  padding: 0 16px 16px;
  font-size: 14px;
  color: var(--text-3);
  font-style: italic;
}

.subtask-list {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.subtask-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.subtask-item:hover {
  background: var(--surface-2);
  border-color: var(--border-strong);
}

.subtask-item.done .subtask-title,
.subtask-item.done .subtask-desc {
  text-decoration: line-through;
  color: var(--text-3);
}

.check-btn {
  flex-shrink: 0;
  margin-top: 1px;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  display: inline-flex;
}

.check-off {
  color: var(--text-4);
}

.check-on {
  color: var(--status-done);
}

.subtask-body {
  flex: 1;
  min-width: 0;
}

.subtask-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.subtask-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.35;
}

.subtask-desc {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--text-3);
  line-height: 1.4;
}

.subtask-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.avatar-row {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}

.avatar {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
}

.avatar--sm {
  width: 18px;
  height: 18px;
  font-size: 8px;
}

.meta-panel {
  padding-bottom: 4px;
}

.meta-list {
  margin: 0;
  padding: 8px 14px 12px;
}

.meta-row {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.meta-row:last-child {
  border-bottom: none;
}

.meta-row--stack {
  align-items: start;
}

.meta-row dt {
  margin: 0;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-3);
}

.meta-row dd {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.meta-value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-2);
}

.meta-month {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meta-month > :first-child {
  flex: 1;
  min-width: 0;
}

.meta-loading {
  color: var(--text-3);
}

.responsible-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.responsible-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 4px 4px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 12px;
  font-weight: 500;
}

.attachment-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 14px 14px;
}

.attachment-wrap {
  position: relative;
}

.attachment-item {
  display: block;
  text-decoration: none;
  color: inherit;
}

.attachment-img {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}

.attachment-file {
  width: 80px;
  height: 80px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface-2);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px;
  color: var(--text-3);
}

.attachment-file span {
  font-size: 9px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 72px;
  color: var(--text-2);
}

.attachment-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: none;
  background: var(--err);
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.icon-btn:hover {
  background: var(--surface-3);
  color: var(--text);
}

.icon-btn--danger:hover {
  color: var(--err);
  border-color: color-mix(in srgb, var(--err) 35%, var(--border));
}

.btn-primary,
.btn-secondary,
.btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  padding: 7px 12px;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.btn-primary {
  background: var(--accent);
  color: var(--accent-fg);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--surface-2);
  color: var(--text);
  border-color: var(--border);
}

.btn-ghost {
  background: transparent;
  color: var(--text-2);
}

.clickable {
  cursor: pointer;
}

.loading-wrap {
  width: min(560px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Dialogs */
.dialog-card {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border);
  gap: 10px;
}

.dialog-head-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.dialog-head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dialog-head-icon {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dialog-title-text {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}

.dialog-body {
  padding: 16px 18px;
}

.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--border);
}

.suggest-card {
  margin: 12px 0;
  padding: 12px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface-2);
}

.suggest-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
}

.suggest-task {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
}

.suggest-task--done {
  opacity: 0.7;
  background: color-mix(in srgb, var(--success) 10%, var(--surface-2));
  border-color: color-mix(in srgb, var(--success) 28%, var(--border));
}

.suggest-check {
  color: var(--success);
  flex-shrink: 0;
}

.ai-btn {
  flex-shrink: 0;
}

.field-hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--text-4);
}

.view-field {
  margin-bottom: 14px;
}

.view-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  margin-bottom: 4px;
}

.view-value {
  font-size: 13px;
  color: var(--text-2);
}

.view-value--title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}

.view-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}

.view-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 960px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .view-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .detail-page {
    padding: 16px;
  }

  .meta-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
</style>
