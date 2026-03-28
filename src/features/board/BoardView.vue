<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { useSortable } from '@vueuse/integrations/useSortable'

const router = useRouter()
const workspace = useWorkspaceStore()

const loading = ref(true)
const searchQuery = ref('')
const filterCompany = ref<string | null>(null)
const filterPriority = ref<number | null>(null)
const draggedTask = ref<any>(null)

// Status columns
const columns = [
  { id: 'TODO', title: 'A Fazer', color: '#3B82F6' },
  { id: 'IN_PROGRESS', title: 'Em Andamento', color: '#F59E0B' },
  { id: 'IN_TESTING', title: 'Em Teste', color: '#8B5CF6' },
  { id: 'DONE', title: 'Concluído', color: '#10B981' },
]

const allActivities = computed(() => {
  let activities = workspace.workspaceData?.activities || []
  
  // Search filter
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    activities = activities.filter(a => 
      a.title.toLowerCase().includes(q) ||
      a.companyName.toLowerCase().includes(q)
    )
  }
  
  // Company filter
  if (filterCompany.value) {
    activities = activities.filter(a => a.companyId === filterCompany.value)
  }
  
  // Priority filter
  if (filterPriority.value !== null) {
    activities = activities.filter(a => a.priority === filterPriority.value)
  }
  
  return activities
})

const getColumnTasks = (status: string) => {
  return allActivities.value
    .filter(a => a.status === status)
    .sort((a, b) => {
      // Sort by priority first, then by date
      if (a.priority !== b.priority) return a.priority - b.priority
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      return 0
    })
}

const companies = computed(() => {
  return workspace.workspaceData?.companies?.map(c => ({
    id: c.company.id,
    name: c.company.name,
    color: c.company.color || '#3B82F6'
  })) || []
})

onMounted(async () => {
  if (!workspace.workspaceData) {
    await workspace.fetchWorkspace()
  }
  loading.value = false
})

function openTask(activity: any) {
  router.push(`/tasks/${activity.month}/${activity.id}`)
}

function getPriorityLabel(p: number) {
  return `P${p}`
}

function formatDate(date: string | null) {
  if (!date) return 'Sem prazo'
  const d = new Date(date)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  
  if (days < 0) return `Atrasada ${Math.abs(days)}d`
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Amanhã'
  return `${days}d`
}

function isOverdue(activity: any) {
  if (!activity.dueDate || activity.status === 'DONE') return false
  return new Date(activity.dueDate) < new Date()
}

async function updateTaskStatus(taskId: string, newStatus: string) {
  // TODO: Call API to update status
  console.log('Update task', taskId, 'to', newStatus)
}

function handleDragStart(task: any) {
  draggedTask.value = task
}

function handleDrop(columnId: string) {
  if (draggedTask.value && draggedTask.value.status !== columnId) {
    updateTaskStatus(draggedTask.value.id, columnId)
  }
  draggedTask.value = null
}
</script>

<template>
  <div class="board-page">
    <!-- Header Premium -->
    <div class="board-header">
      <div class="header-left">
        <div class="header-icon">
          <v-icon size="24" color="white">mdi-view-column</v-icon>
        </div>
        <div>
          <h1 class="board-title">Board Geral</h1>
          <p class="board-subtitle">
            {{ allActivities.length }} atividades em {{ workspace.workspaceData?.companies?.length || 0 }} empresas
          </p>
        </div>
      </div>
      
      <div class="header-filters">
        <div class="search-box">
          <v-icon size="16" class="search-icon">mdi-magnify</v-icon>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Buscar atividades..."
            class="search-input"
          />
        </div>
        
        <select v-model="filterCompany" class="filter-select">
          <option :value="null">Todas empresas</option>
          <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        
        <select v-model="filterPriority" class="filter-select">
          <option :value="null">Todas prioridades</option>
          <option :value="0">P0 - Crítica</option>
          <option :value="1">P1 - Alta</option>
          <option :value="2">P2 - Média</option>
          <option :value="3">P3 - Baixa</option>
        </select>
      </div>
    </div>

    <!-- Kanban Board -->
    <div class="kanban-board">
      <div
        v-for="column in columns"
        :key="column.id"
        class="kanban-column"
        :class="{ 'kanban-column--drag-over': draggedTask?.status !== column.id }"
        @dragover.prevent
        @drop.prevent="handleDrop(column.id)"
      >
        <!-- Column Header -->
        <div class="column-header" :style="{ borderColor: column.color }">
          <div class="column-title-wrapper">
            <div class="column-dot" :style="{ backgroundColor: column.color }" />
            <span class="column-title">{{ column.title }}</span>
            <span class="column-count">{{ getColumnTasks(column.id).length }}</span>
          </div>
          <div class="column-progress" :style="{ backgroundColor: column.color + '20' }">
            {{ Math.round((getColumnTasks(column.id).length / (allActivities.length || 1)) * 100) }}%
          </div>
        </div>

        <!-- Tasks -->
        <div class="column-tasks">
          <div v-if="loading" class="column-skeleton">
            <div v-for="i in 3" :key="i" class="task-skeleton" />
          </div>
          
          <template v-else>
            <div
              v-for="task in getColumnTasks(column.id)"
              :key="task.id"
              class="kanban-card"
              :class="{ 
                'kanban-card--overdue': isOverdue(task),
                'kanban-card--mine': task.isMine,
                'kanban-card--dragging': draggedTask?.id === task.id
              }"
              draggable="true"
              @dragstart="handleDragStart(task)"
              @click="openTask(task)"
            >
              <!-- Card Header -->
              <div class="card-header">
                <span 
                  class="company-tag"
                  :style="{ 
                    backgroundColor: roleConfig[task.myRole]?.color + '15',
                    color: roleConfig[task.myRole]?.color 
                  }"
                >
                  {{ task.companyName }}
                </span>
                <span 
                  class="priority-badge"
                  :class="`priority-${task.priority}`"
                >
                  {{ getPriorityLabel(task.priority) }}
                </span>
              </div>

              <!-- Card Body -->
              <h4 class="card-title">{{ task.title }}</h4>
              
              <!-- Card Meta -->
              <div class="card-meta">
                <div class="meta-item" :class="{ 'meta-item--overdue': isOverdue(task) }">
                  <v-icon size="12">mdi-calendar</v-icon>
                  <span>{{ formatDate(task.dueDate) }}</span>
                </div>
                <div class="meta-item" v-if="task.responsibles?.length">
                  <v-icon size="12">mdi-account</v-icon>
                  <span>{{ task.responsibles.filter((r: any) => r.isMe).length ? 'Eu' : task.responsibles[0].name }}</span>
                  <span v-if="task.responsibles.length > 1" class="more-resp">
                    +{{ task.responsibles.length - 1 }}
                  </span>
                </div>
              </div>

              <!-- Quarter Badge -->
              <div class="quarter-badge">
                {{ task.quarter }} • {{ task.month }}
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board-page {
  padding: 24px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, rgba(var(--v-theme-secondary), 0.02) 0%, rgba(var(--v-theme-secondary), 0.05) 100%);
}

/* Header Premium */
.board-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  padding: 20px 24px;
  background: rgb(var(--v-theme-primary));
  border-radius: 16px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.08);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.board-title {
  font-size: 24px;
  font-weight: 700;
  color: rgb(var(--v-theme-secondary));
  margin: 0;
  letter-spacing: -0.02em;
}

.board-subtitle {
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.5);
  margin: 2px 0 0;
}

.header-filters {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: rgba(var(--v-theme-secondary), 0.4);
}

.search-input {
  width: 240px;
  padding: 10px 12px 10px 36px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.1);
  border-radius: 10px;
  background: rgba(var(--v-theme-secondary), 0.03);
  font-size: 13px;
  color: rgb(var(--v-theme-secondary));
  outline: none;
  transition: all 0.2s ease;
}

.search-input:focus {
  border-color: #3B82F6;
  background: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.search-input::placeholder {
  color: rgba(var(--v-theme-secondary), 0.4);
}

.filter-select {
  padding: 10px 14px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.1);
  border-radius: 10px;
  background: rgba(var(--v-theme-secondary), 0.03);
  font-size: 13px;
  color: rgb(var(--v-theme-secondary));
  cursor: pointer;
  outline: none;
  transition: all 0.2s ease;
}

.filter-select:focus {
  border-color: #3B82F6;
}

/* Kanban Board */
.kanban-board {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow-x: auto;
}

.kanban-column {
  background: rgba(var(--v-theme-secondary), 0.02);
  border-radius: 16px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.06);
  display: flex;
  flex-direction: column;
  min-width: 280px;
  transition: all 0.2s ease;
}

.kanban-column--drag-over {
  background: rgba(59, 130, 246, 0.05);
  border-color: rgba(59, 130, 246, 0.2);
}

.column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 2px solid;
  border-color: inherit;
}

.column-title-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.column-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.column-title {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--v-theme-secondary));
}

.column-count {
  font-size: 12px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.5);
  background: rgba(var(--v-theme-secondary), 0.08);
  padding: 2px 8px;
  border-radius: 999px;
}

.column-progress {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
}

.column-tasks {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.column-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-skeleton {
  height: 100px;
  border-radius: 12px;
  background: rgba(var(--v-theme-secondary), 0.05);
  animation: shimmer 1.4s ease infinite;
}

/* Kanban Cards Premium */
.kanban-card {
  background: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-secondary), 0.08);
  border-radius: 12px;
  padding: 14px;
  cursor: grab;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

.kanban-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  border-color: rgba(var(--v-theme-secondary), 0.15);
}

.kanban-card--overdue {
  border-left: 3px solid #EF4444;
  background: linear-gradient(135deg, rgb(var(--v-theme-primary)) 0%, rgba(239, 68, 68, 0.03) 100%);
}

.kanban-card--mine {
  border-left: 3px solid #3B82F6;
}

.kanban-card--dragging {
  opacity: 0.5;
  transform: rotate(3deg);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.company-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.priority-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}

.priority-0 { background: rgba(239, 68, 68, 0.15); color: #EF4444; }
.priority-1 { background: rgba(245, 158, 11, 0.15); color: #F59E0B; }
.priority-2 { background: rgba(59, 130, 246, 0.15); color: #3B82F6; }
.priority-3 { background: rgba(107, 114, 128, 0.15); color: #6B7280; }

.card-title {
  font-size: 13px;
  font-weight: 500;
  color: rgb(var(--v-theme-secondary));
  margin: 0 0 12px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: rgba(var(--v-theme-secondary), 0.5);
}

.meta-item--overdue {
  color: #EF4444;
  font-weight: 600;
}

.more-resp {
  font-size: 10px;
  color: rgba(var(--v-theme-secondary), 0.4);
}

.quarter-badge {
  font-size: 10px;
  color: rgba(var(--v-theme-secondary), 0.4);
  padding-top: 8px;
  border-top: 1px solid rgba(var(--v-theme-secondary), 0.06);
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* Responsive */
@media (max-width: 1200px) {
  .kanban-board {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .board-header {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }
  
  .header-filters {
    flex-wrap: wrap;
  }
  
  .search-input {
    width: 100%;
  }
  
  .kanban-board {
    grid-template-columns: 1fr;
  }
}
</style>
