<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTasks } from '@/features/tasks/useTasks'
import TaskForm from '@/components/tasks/TaskForm.vue'
import KanbanBoard from '@/components/tasks/KanbanBoard.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import type { Activity } from '@/core/types'
import quartersService from '@/service/quarters/quarters-service'
import activityService from '@/service/activities/activity-service'
import companiesServices from '@/service/companies/companies-services'
import { getInfoAuth } from '@/utils/authContent'
import { dateOnlyToUtcNoonIso, isoToDateOnly, todayDateOnly } from '@/utils/date'
import { useToast } from '@/composables/useToast'
import { useCompanyBoards } from '@/composables/useCompanyBoards'
import { useCompanyQuarters } from '@/composables/useCompanyQuarters'
import { useBacklog } from '@/composables/useBacklog'
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
useTasks()
const queryClient = useQueryClient()

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

// ── Reactive query keys ──
const companyId = computed(() => localStorage.getItem('activeCompany') ?? '')
const monthId = computed(() => route.params.month as string)

// ── Vue Query — data loads independently, no blocking ──
const { data: tasksData, isLoading: tasksLoading } = useCompanyBoards(monthId)
const { data: quartersData } = useCompanyQuarters(companyId)
const { data: backlogData } = useBacklog(companyId)

// Sync tasks query data → local ref (preserves optimistic mutation support)
watch(tasksData, (val) => { if (val) tasks.value = val }, { immediate: true })

const loading = computed(() => tasksLoading.value)

const backLog = computed(() => backlogData.value ?? [])

const currentMonthData = computed<RawMonth | null>(() => {
  const raw = quartersData.value as RawQuarter[] | { data?: RawQuarter[] } | undefined
  const quarters: RawQuarter[] = Array.isArray(raw) ? raw : (raw?.data ?? [])
  for (const quarter of quarters) {
    const month = quarter.months?.find((m) => m.id === monthId.value)
    if (month) return month
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
      priorityNumber: Number(formActivity.value.priorityNumber) || 0,
      // dueDate pode chegar como 'YYYY-MM-DD' ou ISO — normaliza para meio-dia UTC
      dueDate: dateOnlyToUtcNoonIso(
        formActivity.value.dueDate ? isoToDateOnly(formActivity.value.dueDate) : todayDateOnly(),
      ),
      monthId: monthId.value,
      responsibleUserIds: formActivity.value.assignees || [],
    }
    const created = await activityService.postActivity(payload)
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
  for (const [status, list] of Object.entries(tasks.value) as [BoardStatus, BoardTask[]][]) {
    let arr: BoardTask[] = list || []
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
  ;(Object.values(tasks.value).flat() as BoardTask[]).forEach((task) => {
    task.responsibles?.forEach((r) => users.add(r.user.name))
  })
  return Array.from(users).sort()
})

const userItems = computed<{ label: string; value: string }[]>(() => [
  { label: 'Todos', value: '' },
  ...allUsers.value.map((u) => ({ label: u, value: u })),
])


const totalTasks = computed(() => {
  if (!tasks.value) return 0
  return Object.values(tasks.value).flat().length
})

// ── Optimistic status update ──
const handleUpdateStatus = async (taskId: string, apiStatus: string) => {
  // Optimistic: move task in local data so watch doesn't snap it back
  const statuses: BoardStatus[] = ['TODO', 'IN_PROGRESS', 'IN_TESTING', 'DONE']
  let movedTask: BoardTask | null = null
  for (const status of statuses) {
    const list = tasks.value[status]
    if (!list) continue
    const idx = list.findIndex((t) => t.id === taskId)
    if (idx !== -1) {
      movedTask = list.splice(idx, 1)[0] ?? null
      break
    }
  }
  const target = tasks.value[apiStatus as BoardStatus]
  if (movedTask && target) {
    target.push(movedTask)
  }

  try {
    await quartersService.patchActivityStatus(taskId, apiStatus)
  } catch (error: unknown) {
    showError(apiErrorMessage(error, 'Erro ao atualizar status'))
    await refreshTasks() // revert on failure
  }
}

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

const openDetails = (activity: Activity) => {
  router.push(`/tasks/${route.params.month}/${activity.id}`)
}

const monthName = computed(() => currentMonthData.value?.name || 'Carregando...')

const statusLabels: Record<string, string> = {
  TODO: 'A Fazer', IN_PROGRESS: 'Em Progresso', IN_TESTING: 'Em Teste', DONE: 'Concluído',
}
const statusColors: Record<string, string> = {
  TODO: '#6B7280', IN_PROGRESS: '#F59E0B', IN_TESTING: '#8B5CF6', DONE: '#10B981',
}

const sortedHistory = computed(() =>
  [...backLog.value].sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()),
)

const formatDate = (date: string) =>
  new Date(date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const showFilters = ref(false)
</script>

<template>
  <!-- Loading -->
  <div v-if="loading" class="tasks-page d-flex align-center justify-center" style="min-height: 60vh">
    <v-progress-circular indeterminate color="secondary" size="40" />
  </div>

  <div v-else class="tasks-page">
    <!-- Header -->
    <div class="tasks-header">
      <div>
        <h1 class="tasks-title">{{ monthName }}</h1>
        <p class="tasks-sub">{{ totalTasks }} atividades</p>
      </div>

      <div class="header-actions">
        <!-- View toggle -->
        <div class="view-toggle">
          <button
            class="view-btn"
            :class="{ active: currentTab === 'board' }"
            @click="currentTab = 'board'"
          >
            <v-icon size="15">mdi-view-column-outline</v-icon>
            Board
          </button>
          <button
            class="view-btn"
            :class="{ active: currentTab === 'backlog' }"
            @click="currentTab = 'backlog'"
          >
            <v-icon size="15">mdi-history</v-icon>
            Backlog
          </button>
        </div>

        <!-- Filter toggle -->
        <button
          class="filter-toggle-btn"
          :class="{ active: showFilters }"
          @click="showFilters = !showFilters"
        >
          <v-icon size="15">mdi-filter-variant</v-icon>
          Filtros
          <span v-if="activeFiltersCount > 0" class="filter-badge">{{ activeFiltersCount }}</span>
        </button>

        <!-- New activity -->
        <button
          v-if="isWorkerRole"
          class="new-activity-btn"
          @click="dialog = true"
        >
          <v-icon size="15">mdi-plus</v-icon>
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
          <v-icon size="13">mdi-close</v-icon>
          Limpar filtros
        </button>
      </div>
    </Transition>

    <!-- Board view -->
    <KanbanBoard
      v-show="currentTab === 'board'"
      :tasks="filteredTasks"
      :readonly="!isWorkerRole"
      @update-status="handleUpdateStatus"
      @open-details="openDetails"
      @delete-task="openDeleteConfirm"
      @rename-task="handleRenameTask"
    />


    <!-- Backlog view -->
    <div v-show="currentTab === 'backlog'" class="backlog-panel">
      <div v-if="sortedHistory.length === 0" class="backlog-empty">
        <v-icon size="40" style="opacity: 0.25">mdi-history</v-icon>
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
            :style="{ backgroundColor: statusColors[entry.newStatus] || '#6B7280' }"
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

    <!-- Delete dialog -->
    <v-dialog v-model="confirmDelete" max-width="380" :scrim-opacity="0.6">
      <v-card class="dialog-card" rounded="xl">
        <div class="dialog-header">
          <span class="dialog-title-text">Excluir atividade</span>
          <v-btn icon size="small" variant="text" @click="confirmDelete = false">
            <v-icon size="18">mdi-close</v-icon>
          </v-btn>
        </div>
        <div class="dialog-body">
          <p style="font-size: 14px; color: var(--text-3)">
            Tem certeza que deseja excluir <strong style="color: var(--text)">{{ taskToDelete?.title }}</strong>?
          </p>
        </div>
        <div class="dialog-actions">
          <v-btn variant="text" size="small" @click="confirmDelete = false">Cancelar</v-btn>
          <v-spacer />
          <v-btn variant="flat" size="small" color="error" :loading="!!deleting" @click="deleteTask">
            Excluir
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Create task dialog -->
    <v-dialog v-model="dialog" max-width="600">
      <TaskForm
        v-if="dialog"
        v-model="formActivity"
        :members="members"
        :loading="creating"
        @close="dialog = false"
        @submit="createActivity"
      />
    </v-dialog>

  </div>
</template>

<style scoped>
/* ─── Layout ─── */
.tasks-page {
  padding: 24px 28px;
  max-width: 1400px;
  margin: 0 auto;
}

/* ─── Header ─── */
.tasks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.tasks-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
  margin: 0 0 2px;
}

.tasks-sub {
  font-size: 13px;
  color: var(--text-3);
  margin: 0;
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
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}

.view-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-3);
  padding: 5px 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
}

.view-btn:hover {
  color: var(--text-2);
}

.view-btn.active {
  color: var(--text);
  background: var(--border);
  font-weight: 600;
}

/* ─── Filter toggle button ─── */
.filter-toggle-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-3);
  background: var(--surface-2);
  padding: 5px 11px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.12s ease;
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
  font-size: 12.5px;
  font-weight: 600;
  background: var(--accent);
  color: var(--accent-fg);
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
  cursor: pointer;
  transition: filter var(--motion-fast);
  white-space: nowrap;
}

.new-activity-btn:hover {
  filter: brightness(1.07);
}

/* ─── Filter bar ─── */
.filter-bar {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding: 14px 16px;
  margin-bottom: 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  flex-wrap: wrap;
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
  background: var(--surface-2);
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

/* ─── Backlog ─── */
.backlog-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.backlog-list {
  max-height: 600px;
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
  gap: 6px;
  padding: 48px;
  font-size: 14px;
  color: var(--text-3);
}

.backlog-empty-sub {
  font-size: 12.5px;
  color: var(--accent);
}

/* ─── Dialogs ─── */
.dialog-card {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 18px 14px;
  border-bottom: 1px solid var(--border);
}

.dialog-title-text {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}

.dialog-body { padding: 18px; }

.dialog-actions {
  display: flex;
  align-items: center;
  padding: 12px 18px 18px;
  border-top: 1px solid var(--border);
  gap: 8px;
}
</style>
