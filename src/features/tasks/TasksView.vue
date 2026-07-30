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
} from 'lucide-vue-next'
import TaskForm from '@/components/tasks/TaskForm.vue'
import AppDialog from '@/components/ui/AppDialog.vue'
import KanbanBoard from '@/components/tasks/KanbanBoard.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import activityService from '@/service/activities/activity-service'
import companiesServices from '@/service/companies/companies-services'
import { getInfoAuth } from '@/utils/authContent'
import { dateOnlyToUtcNoonIso, isoToDateOnly, todayDateOnly } from '@/utils/date'
import { normalizePriority } from '@/utils/priority'
import { useToast } from '@/composables/useToast'
import { useCompanyBoards } from '@/composables/useCompanyBoards'
import { useCompanyQuarters } from '@/composables/useCompanyQuarters'
import { useBacklog } from '@/composables/useBacklog'
import { useActivityBoardRealtime } from '@/composables/useActivityBoardRealtime'
import { useAnalytics } from '@/composables/useAnalytics'
import type { ActivityMovedPayload } from '@/service/realtime/realtime-service'
import { useQueryClient } from '@tanstack/vue-query'

// ── Tipos locais (shape real da API de tarefas/quarters deste módulo) ──
type BoardStatus = 'TODO' | 'IN_PROGRESS' | 'IN_TESTING' | 'DONE'

interface TaskResponsible {
  user: { name: string }
}

interface BoardTask {
  id: string
  title?: string
  priorityNumber?: number
  responsibles?: TaskResponsible[]
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
  attachment: File | null
}

interface RawMonth {
  id: string
  name: string
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
const { track } = useAnalytics()

const dialog = ref(false)
const creating = ref(false)
const selectedUser = ref<string>('')
const currentTab = ref<'board' | 'backlog'>('board')
const members = ref<CompanyMember[]>([])
const isWorkerRole = ref(false)
const { success: showSuccess, error: showError } = useToast()
const formActivity = ref<ActivityFormModel>({
  title: '',
  description: '',
  priorityNumber: 0,
  dueDate: '',
  assignees: [],
  attachment: null,
})

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

const createActivity = async () => {
  if (!formActivity.value.title) return
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
    }
    const created = await activityService.postActivity(payload)
    track('task_created', {
      has_description: !!payload.description,
      has_assignees: payload.responsibleUserIds.length > 0,
      has_due_date: !!formActivity.value.dueDate,
      priority: payload.priorityNumber,
    })
    if (formActivity.value.attachment) {
      const fd = new FormData()
      fd.append('file', formActivity.value.attachment)
      await activityService.postActivityAttachment(created.id, fd)
    }
    await refreshTasks()
    formActivity.value = { title: '', description: '', priorityNumber: 0, dueDate: '', assignees: [], attachment: null }
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
  if (!tasks.value) return result
  // Itera SÓ os status: a resposta do board carrega `monthId` junto das
  // colunas, e um Object.entries cru vazaria essa chave para o board.
  for (const status of STATUSES) {
    let arr: BoardTask[] = tasks.value[status] || []
    if (selectedUser.value) {
      arr = arr.filter((t) => t.responsibles?.some((r) => r.user.name === selectedUser.value))
    }
    if (filterPriority.value !== null) {
      arr = arr.filter((t) => t.priorityNumber === filterPriority.value)
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
  return c
})

const clearFilters = () => {
  selectedUser.value = ''
  filterPriority.value = null
  filterStatus.value = null
}

const allUsers = computed<string[]>(() => {
  const users = new Set<string>()
  if (!tasks.value) return []
  for (const status of STATUSES) {
    for (const task of tasks.value[status] ?? []) {
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
const totalTasks = computed(() => {
  if (!tasks.value) return 0
  return STATUSES.reduce((acc, s) => acc + (tasks.value[s]?.length ?? 0), 0)
})

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
  return defs.map((d) => ({ ...d, count: tasks.value?.[d.key]?.length ?? 0 }))
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

const showFilters = ref(false)

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
          <button
            class="view-btn"
            :class="{ active: currentTab === 'backlog' }"
            @click="currentTab = 'backlog'"
          >
            <History :size="14" />
            Backlog
          </button>
        </div>

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


        <!-- Clear -->
        <button
          v-if="activeFiltersCount > 0"
          class="clear-filters-btn"
          @click="clearFilters"
        >
          <X :size="12" />
          Limpar filtros
        </button>
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
    <AppDialog v-model="dialog" label="Nova atividade" size="lg" :loading="creating">
      <TaskForm
        v-if="dialog"
        v-model="formActivity"
        :members="members"
        :loading="creating"
        @close="dialog = false"
        @submit="createActivity"
      />
    </AppDialog>

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
  margin-left: auto;
  align-self: flex-end;
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
