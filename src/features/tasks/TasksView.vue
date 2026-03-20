<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTasks } from '@/features/tasks/useTasks'
import TaskForm from '@/components/tasks/TaskForm.vue'
import KanbanBoard from '@/components/tasks/KanbanBoard.vue'
import type { Activity } from '@/core/types'
import quartersService from '@/service/quarters/quarters-service'
import activityService from '@/service/activities/activity-service'
import companiesServices from '@/service/companies/companies-services'
import backlogService from '@/service/backlog/backlog-service'
import { getInfoAuth } from '@/utils/authContent'

const route = useRoute()
const router = useRouter()
const { updateActivityStatus } = useTasks()
const loading = ref(true)
const dialog = ref(false)
const creating = ref(false)
const selectedUser = ref<string>('')
const currentTab = ref<'board' | 'backlog'>('board')
const members = ref<any[]>([])
const backLog = ref<any[]>([])
const isWorkerRole = ref(false)
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref('error')
const formActivity = ref<any>({
  title: '',
  description: '',
  priorityNumber: 0,
  dueDate: '',
  assignees: [],
  attachment: null,
})
const tasks = ref<any>({
  TODO: [],
  IN_PROGRESS: [],
  IN_TESTING: [],
  DONE: [],
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

const statusFilterOptions = [
  { value: null, label: 'Todos' },
  { value: 'TODO', label: 'A Fazer' },
  { value: 'IN_PROGRESS', label: 'Em Andamento' },
  { value: 'IN_TESTING', label: 'Em Teste' },
  { value: 'DONE', label: 'Concluído' },
]

const filteredTasks = computed(() => {
  if (!tasks.value) return tasks.value
  const result: any = {}
  for (const [status, list] of Object.entries(tasks.value)) {
    let arr = (list as any[]) || []
    // user filter
    if (selectedUser.value) {
      arr = arr.filter((t: any) => t.responsibles?.some((r: any) => r.user.name === selectedUser.value))
    }
    // priority filter
    if (filterPriority.value !== null) {
      arr = arr.filter((t: any) => t.priorityNumber === filterPriority.value)
    }
    // status filter (for list view — hide entire columns)
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

// ── Data loading ──
const findBackLog = async () => {
  const companyId = localStorage.getItem('activeCompany')
  if (!companyId) return
  try {
    const response = await backlogService.getBacklogByCompany(companyId)
    backLog.value = response
  } catch (error: any) {
    showSnackbar(error.response?.data?.message || 'Erro ao buscar backlog', 'error')
  }
}

const findMembers = async () => {
  const id = localStorage.getItem('activeCompany')
  if (!id) return
  try {
    const response = await companiesServices.getCompanyMembers(id)
    members.value = response.data || response
  } catch (error: any) {
    showSnackbar(error.response?.data?.message || 'Erro ao buscar membros', 'error')
  }
}

const createActivity = async () => {
  const monthId = route.params.month as string
  if (!formActivity.value.title) return

  creating.value = true
  try {
    const payload = {
      title: formActivity.value.title,
      description: formActivity.value.description || '',
      priorityNumber: Number(formActivity.value.priorityNumber) || 0,
      dueDate: formActivity.value.dueDate
        ? new Date(formActivity.value.dueDate).toISOString()
        : new Date().toISOString(),
      monthId,
      responsibleUserIds: formActivity.value.assignees || [],
    }

    const created = await activityService.postActivity(payload)

    if (formActivity.value.attachment) {
      const fd = new FormData()
      fd.append('file', formActivity.value.attachment)
      await activityService.postActivityAttachment(created.id, fd)
    }

    await findTasks()
    formActivity.value = { title: '', description: '', priorityNumber: 0, dueDate: '', assignees: [], attachment: null }
    dialog.value = false
    showSnackbar('Atividade criada com sucesso', 'success')
  } catch (error: any) {
    showSnackbar(error.response?.data?.message || 'Erro ao criar atividade', 'error')
  } finally {
    creating.value = false
  }
}

const findTasks = async () => {
  const monthId = route.params.month as string
  if (!monthId) return
  try {
    tasks.value = await quartersService.getCompanyBoards(monthId)
  } catch (error: any) {
    showSnackbar(error.response?.data?.message || 'Erro ao buscar tarefas', 'error')
  }
}

const findMonthData = async () => {
  const companyId = localStorage.getItem('activeCompany')
  if (!companyId) return
  try {
    const response = await quartersService.getCompanyQuarters(companyId)
    const quarters = response.data || response
    for (const quarter of quarters) {
      const month = quarter.months?.find((m: any) => m.id === route.params.month)
      if (month) {
        currentMonthData.value = month
        break
      }
    }
  } catch (error: any) {
    showSnackbar(error.response?.data?.message || 'Erro ao buscar dados do mês', 'error')
  }
}

onMounted(async () => {
  isWorkerRole.value = (await getInfoAuth()) || false
  await Promise.all([findMonthData(), findTasks(), findMembers(), findBackLog()])
  loading.value = false
})

watch(() => route.params.month, async () => {
  await findMonthData()
  await findTasks()
})

const currentMonthData = ref<any>(null)

const allUsers = computed(() => {
  const users = new Set<string>()
  if (!tasks.value) return []
  Object.values(tasks.value).flat().forEach((task: any) => {
    task.responsibles?.forEach((r: any) => users.add(r.user.name))
  })
  return Array.from(users).sort()
})

const getUserInitials = (name: string) =>
  name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

const getUserColor = (name: string) => {
  const colors = ['#1976D2', '#388E3C', '#D32F2F', '#7B1FA2', '#F57C00', '#0097A7', '#C2185B', '#5D4037']
  return colors[name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length]
}

const totalTasks = computed(() => {
  if (!tasks.value) return 0
  return Object.values(tasks.value).flat().length
})

// ── Optimistic status update ──
const handleUpdateStatus = async (taskId: string, apiStatus: string) => {
  // Optimistic: move task in local data so watch doesn't snap it back
  const statuses = ['TODO', 'IN_PROGRESS', 'IN_TESTING', 'DONE']
  let movedTask: any = null
  for (const status of statuses) {
    const list = tasks.value[status] as any[]
    if (!list) continue
    const idx = list.findIndex((t: any) => t.id === taskId)
    if (idx !== -1) {
      movedTask = list.splice(idx, 1)[0]
      break
    }
  }
  if (movedTask && tasks.value[apiStatus]) {
    tasks.value[apiStatus].push(movedTask)
  }

  try {
    await quartersService.patchActivityStatus(taskId, apiStatus)
  } catch (error: any) {
    showSnackbar(error.response?.data?.message || 'Erro ao atualizar status', 'error')
    await findTasks() // revert on failure
  }
}

// ── Rename task (inline editing) ──
const handleRenameTask = async (taskId: string, newTitle: string) => {
  try {
    await activityService.patchActivity(taskId, { title: newTitle })
  } catch {
    await findTasks() // revert
  }
}

// ── Delete ──
const confirmDelete = ref(false)
const taskToDelete = ref<any>(null)
const deleting = ref<string | null>(null)

const openDeleteConfirm = (task: any) => {
  taskToDelete.value = task
  confirmDelete.value = true
}

const deleteTask = async () => {
  if (!taskToDelete.value) return
  deleting.value = taskToDelete.value.id
  try {
    await activityService.deleteActivity(taskToDelete.value.id)
    await findTasks()
    confirmDelete.value = false
    showSnackbar('Atividade excluída', 'success')
  } catch (error: any) {
    showSnackbar(error.response?.data?.message || 'Erro ao deletar', 'error')
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

const showSnackbar = (msg: string, color: string) => {
  snackbarMessage.value = msg
  snackbarColor.value = color
  snackbar.value = true
}

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
          <select v-model="selectedUser" class="filter-select">
            <option value="">Todos</option>
            <option v-for="u in allUsers" :key="u" :value="u">{{ u }}</option>
          </select>
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
          <p style="font-size: 14px; color: rgba(var(--v-theme-secondary), 0.6)">
            Tem certeza que deseja excluir <strong style="color: rgb(var(--v-theme-secondary))">{{ taskToDelete?.title }}</strong>?
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

    <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="3000" location="top right" rounded="lg">
      {{ snackbarMessage }}
    </v-snackbar>
  </div>
</template>

<style scoped>
/* ─── Layout ─── */
.tasks-page {
  padding: 24px;
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
  color: rgb(var(--v-theme-secondary));
  letter-spacing: -0.02em;
  margin: 0 0 2px;
}

.tasks-sub {
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.4);
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
  background: rgba(var(--v-theme-secondary), 0.06);
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
  color: rgba(var(--v-theme-secondary), 0.5);
  padding: 5px 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
}

.view-btn:hover {
  color: rgba(var(--v-theme-secondary), 0.8);
}

.view-btn.active {
  color: rgb(var(--v-theme-secondary));
  background: rgba(var(--v-theme-secondary), 0.1);
  font-weight: 600;
}

/* ─── Filter toggle button ─── */
.filter-toggle-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 500;
  color: rgba(var(--v-theme-secondary), 0.5);
  background: rgba(var(--v-theme-secondary), 0.06);
  padding: 5px 11px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.12s ease;
}

.filter-toggle-btn:hover, .filter-toggle-btn.active {
  color: rgb(var(--v-theme-secondary));
  border-color: rgba(var(--v-theme-secondary), 0.15);
}

.filter-badge {
  font-size: 10px;
  font-weight: 700;
  background: rgb(var(--v-theme-secondary));
  color: rgb(var(--v-theme-primary));
  padding: 0 5px;
  border-radius: 999px;
  min-width: 16px;
  text-align: center;
  line-height: 16px;
}

/* ─── New activity btn ─── */
.new-activity-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 600;
  background: rgb(var(--v-theme-secondary));
  color: rgb(var(--v-theme-primary));
  padding: 6px 14px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: opacity 0.12s ease;
  white-space: nowrap;
}

.new-activity-btn:hover {
  opacity: 0.85;
}

/* ─── Filter bar ─── */
.filter-bar {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding: 14px 16px;
  margin-bottom: 14px;
  background: rgba(var(--v-theme-secondary), 0.03);
  border: 1px solid rgba(var(--v-theme-secondary), 0.07);
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
  color: rgba(var(--v-theme-secondary), 0.4);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.filter-select {
  font-size: 12.5px;
  color: rgb(var(--v-theme-secondary));
  background: rgba(var(--v-theme-secondary), 0.06);
  border: 1px solid rgba(var(--v-theme-secondary), 0.1);
  border-radius: 6px;
  padding: 5px 8px;
  outline: none;
  font-family: inherit;
  min-width: 140px;
  cursor: pointer;
}

.filter-select:focus {
  border-color: rgba(var(--v-theme-secondary), 0.25);
}

.filter-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.filter-chip {
  font-size: 11.5px;
  font-weight: 500;
  color: rgba(var(--v-theme-secondary), 0.5);
  background: rgba(var(--v-theme-secondary), 0.06);
  border: 1px solid transparent;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.1s ease;
}

.filter-chip:hover {
  color: rgba(var(--v-theme-secondary), 0.8);
  background: rgba(var(--v-theme-secondary), 0.1);
}

.filter-chip.active {
  color: rgb(var(--v-theme-secondary));
  background: rgba(var(--v-theme-secondary), 0.12);
  border-color: rgba(var(--v-theme-secondary), 0.2);
  font-weight: 600;
}

.clear-filters-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: rgba(var(--v-theme-secondary), 0.4);
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
  color: rgba(var(--v-theme-secondary), 0.8);
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
  background: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-secondary), 0.07);
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
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.05);
  transition: background 0.1s ease;
}

.backlog-item:last-child { border-bottom: none; }
.backlog-item:hover { background: rgba(var(--v-theme-secondary), 0.03); }

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
  color: rgb(var(--v-theme-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.backlog-meta {
  font-size: 12px;
  color: rgba(var(--v-theme-secondary), 0.4);
}

.backlog-status-badge {
  font-weight: 600;
}

.backlog-time {
  font-size: 11.5px;
  color: rgba(var(--v-theme-secondary), 0.3);
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
  color: rgba(var(--v-theme-secondary), 0.4);
}

.backlog-empty-sub {
  font-size: 12.5px;
  color: rgba(var(--v-theme-secondary), 0.25);
}

/* ─── Dialogs ─── */
.dialog-card {
  background: rgb(var(--v-theme-primary)) !important;
  border: 1px solid rgba(var(--v-theme-secondary), 0.1) !important;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 18px 14px;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.07);
}

.dialog-title-text {
  font-size: 15px;
  font-weight: 700;
  color: rgb(var(--v-theme-secondary));
}

.dialog-body { padding: 18px; }

.dialog-actions {
  display: flex;
  align-items: center;
  padding: 12px 18px 18px;
  border-top: 1px solid rgba(var(--v-theme-secondary), 0.07);
  gap: 8px;
}
</style>
