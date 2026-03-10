<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueDraggable } from 'vue-draggable-plus'
import { useTasks } from '@/features/tasks/useTasks'
import TaskForm from '@/components/tasks/TaskForm.vue'
import type { TaskStatus, Activity } from '@/core/types'
import quartersService from '@/service/quarters/quarters-service'

const route = useRoute()
const router = useRouter()
const { activities, companies, statusHistory, updateActivityStatus } = useTasks()
const dialog = ref(false)
const selectedUser = ref<string>('')
const currentTab = ref('kanban')
const tasks = ref<any>({
  TODO: [],
  IN_PROGRESS: [],
  IN_TESTING: [],
  DONE: [],
})

const findTaskas = async () => {
  const monthId = route.params.month as string
  if (!monthId) return
  
  try {
    const data = await quartersService.getCompanyBoards(monthId)
    tasks.value = data
  } catch (error) {
    console.error('Erro ao buscar tarefas:', error)
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
  } catch (error) {
    console.error('Erro ao buscar dados do mês:', error)
  }
}

onMounted(async () => {
  await findMonthData()
  await findTaskas()
})

watch(() => route.params.month, async () => {
  await findMonthData()
  await findTaskas()
})

const currentMonthId = computed(() => route.params.month as string)
const currentMonthData = ref<any>(null)

const columns: { status: string; apiStatus: string; title: string; color: string; icon: string }[] =
  [
    {
      status: 'todo',
      apiStatus: 'TODO',
      title: 'A Fazer',
      color: '#3B82F6',
      icon: 'mdi-clipboard-text-outline',
    },
    {
      status: 'in-progress',
      apiStatus: 'IN_PROGRESS',
      title: 'Em Andamento',
      color: '#F59E0B',
      icon: 'mdi-progress-clock',
    },
    {
      status: 'testing',
      apiStatus: 'IN_TESTING',
      title: 'Em Teste',
      color: '#8B5CF6',
      icon: 'mdi-flask-outline',
    },
    {
      status: 'done',
      apiStatus: 'DONE',
      title: 'Concluído',
      color: '#10B981',
      icon: 'mdi-check-circle-outline',
    },
  ]

const allUsers = computed(() => {
  const users = new Set<string>()
  if (!tasks.value) return []
  Object.values(tasks.value)
    .flat()
    .forEach((task: any) => {
      task.responsibles?.forEach((r: any) => users.add(r.user.name))
    })
  return Array.from(users).sort()
})

const getUserInitials = (name: string) => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const getUserColor = (name: string) => {
  const colors = [
    '#1976D2',
    '#388E3C',
    '#D32F2F',
    '#7B1FA2',
    '#F57C00',
    '#0097A7',
    '#C2185B',
    '#5D4037',
  ]
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
  return colors[index]
}

const filteredTasks = computed(() => {
  const result: any = { TODO: [], IN_PROGRESS: [], IN_TESTING: [], DONE: [] }

  if (!tasks.value) return result

  Object.entries(tasks.value).forEach(([key, taskList]: [string, any]) => {
    let filtered = taskList || []
    if (selectedUser.value) {
      filtered = filtered.filter((task: any) =>
        task.responsibles?.some((r: any) => r.user.name === selectedUser.value),
      )
    }
    result[key] = filtered
  })

  return result
})

const totalTasks = computed(() => Object.values(filteredTasks.value).flat().length)

const columnActivities = ref<any>({
  todo: [],
  'in-progress': [],
  testing: [],
  done: [],
})

const isDragging = ref(false)

watch(
  [filteredTasks],
  () => {
    if (!isDragging.value) {
      columns.forEach((col) => {
        columnActivities.value[col.status] = filteredTasks.value[col.apiStatus] || []
      })
    }
  },
  { immediate: true, deep: true },
)

const getCompanyName = (id: string) => companies.value.find((c) => c.id === id)?.name || '-'

const getTaskResponsibles = (task: any) => {
  return task.responsibles?.map((r: any) => r.user.name) || []
}

const getPriorityColor = (priority: number) => {
  const colors: Record<number, string> = {
    0: '#10B981',
    1: '#3B82F6',
    2: '#F59E0B',
    3: '#EF4444',
    4: '#DC2626',
    5: '#991B1B',
  }
  return colors[priority] || '#6B7280'
}

const getPriorityLabel = (priority: number) => {
  const labels: Record<number, string> = {
    0: 'Muito Baixa',
    1: 'Baixa',
    2: 'Média',
    3: 'Alta',
    4: 'Muito Alta',
    5: 'Crítica',
  }
  return labels[priority] || 'N/A'
}

const onAdd = async (evt: any, apiStatus: string) => {
  const taskId = evt.item?.dataset?.id
  if (taskId) {
    try {
      await quartersService.patchActivityStatus(taskId, apiStatus)
      await findTaskas()
    } catch (error) {
      console.error('Erro ao atualizar status:', error)
      await findTaskas()
    }
  }
}

const onStart = () => {
  isDragging.value = true
}

const onEnd = () => {
  isDragging.value = false
}

const openDetails = (activity: Activity) => {
  router.push(`/tasks/${currentMonthId.value}/${activity.id}`)
}

const monthName = computed(() => currentMonthData.value?.name || 'Carregando...')

const statusLabels: Record<string, string> = {
  todo: 'A Fazer',
  'in-progress': 'Em Progresso',
  testing: 'Em Teste',
  done: 'Concluído',
}

const sortedHistory = computed(() => {
  return [...statusHistory.value].sort(
    (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
  )
})

const formatDate = (date: string) => {
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <v-container fluid class="pa-4 bg-background">
    <v-sheet color="transparent" class="mb-4">
      <div class="d-flex justify-space-between align-center mb-4">
        <div>
          <h1 style="font-size: 16px" class="font-weight-bold text-secondary mb-1">
            Tarefas - {{ monthName }}
          </h1>
          <div class="d-flex align-center" style="font-size: 11px; color: var(--v-primary-lighten)">
            <v-icon size="11" class="mr-1">mdi-view-dashboard-outline</v-icon>
            {{ totalTasks }} atividades no total
          </div>
        </div>
        <div class="d-flex ga-2 align-center">
          <v-btn-toggle
            v-model="currentTab"
            color="primary"
            density="compact"
            mandatory
            rounded="lg"
            class="elevation-1"
          >
            <v-btn value="kanban" size="small" style="font-size: 12px">
              <v-icon start size="16">mdi-view-column</v-icon>
              Kanban
            </v-btn>
            <v-btn value="backlog" size="small" style="font-size: 12px">
              <v-icon start size="16">mdi-history</v-icon>
              Backlog
            </v-btn>
          </v-btn-toggle>
          <v-btn
            color="primary"
            prepend-icon="mdi-plus"
            elevation="2"
            size="small"
            class="text-none font-weight-medium"
            style="font-size: 12px"
            rounded="lg"
            @click="dialog = true"
          >
            Nova Atividade
          </v-btn>
        </div>
      </div>

      <v-select
        v-if="currentTab === 'kanban'"
        v-model="selectedUser"
        :items="allUsers"
        label="Filtrar por usuário"
        prepend-inner-icon="mdi-account-outline"
        clearable
        density="compact"
        variant="outlined"
        hide-details
        rounded="lg"
        color="primary"
        bg-color="primary"
        style="max-width: 280px"
      >
        <template #item="{ props, item }">
          <v-list-item v-bind="props" density="compact">
            <template #prepend>
              <v-avatar :color="getUserColor(item as any)" size="28" class="mr-2">
                <span style="font-size: 11px; font-weight: 600; color: white">{{
                  getUserInitials(item as any)
                }}</span>
              </v-avatar>
            </template>
          </v-list-item>
        </template>
      </v-select>
    </v-sheet>

    <div v-show="currentTab === 'kanban'" class="kanban-board">
      <div v-for="column in columns" :key="column.status" class="kanban-col">
        <v-card color="primary" elevation="1" rounded="lg" class="kanban-column">
          <v-card-title class="d-flex justify-space-between align-center pa-3 bg-surface">
            <div class="d-flex align-center ga-2">
              <v-icon :color="column.color" size="15">{{ column.icon }}</v-icon>
              <span style="font-size: 12px" class="font-weight-bold text-secondary">{{
                column.title
              }}</span>
            </div>
            <v-chip
              size="x-small"
              :style="{ backgroundColor: column.color + '20', color: column.color }"
              class="font-weight-bold"
            >
              {{ columnActivities[column.status].length }}
            </v-chip>
          </v-card-title>

          <VueDraggable
            v-model="columnActivities[column.status]"
            class="pa-2 bg-surface column-content"
            group="activities"
            :animation="200"
            @start="onStart"
            @end="onEnd"
            @add="(evt) => onAdd(evt, column.apiStatus)"
          >
            <v-card
              v-for="task in columnActivities[column.status]"
              :key="task.id"
              :data-id="task.id"
              color="primary"
              elevation="1"
              rounded="lg"
              class="mb-2 pa-3 activity-card"
              @click="openDetails(task)"
            >
              <div class="mb-3">
                <div class="d-flex justify-space-between align-center mb-1">
                  <div
                    style="font-size: 12px"
                    class="font-weight-semibold text-secondary activity-title flex-grow-1"
                  >
                    {{ task.title }}
                  </div>
                  <v-chip
                    v-if="task.priorityNumber !== undefined"
                    size="x-small"
                    :style="{
                      backgroundColor: getPriorityColor(task.priorityNumber) + '20',
                      color: getPriorityColor(task.priorityNumber),
                    }"
                    class="font-weight-bold ml-2"
                  >
                    P{{ task.priorityNumber }}
                  </v-chip>
                </div>
                <div
                  v-if="task.description"
                  style="font-size: 11px"
                  class="text-primary-lighten mb-2"
                >
                  {{ task.description }}
                </div>
              </div>

              <v-divider class="mb-2" />

              <div class="d-flex justify-space-between align-center">
                <div class="d-flex ga-2 align-center">
                  <div
                    v-if="task.dueDate"
                    class="d-flex align-center ga-1 text-primary-lighten"
                    style="font-size: 11px"
                  >
                    <v-icon size="11">mdi-calendar-clock</v-icon>
                    {{ new Date(task.dueDate).toLocaleDateString('pt-BR') }}
                  </div>
                  <div
                    v-if="task.subtasks?.length"
                    class="d-flex align-center ga-1 text-primary-lighten"
                    style="font-size: 11px"
                  >
                    <v-icon size="11">mdi-format-list-checks</v-icon>
                    {{ task.subtasks.length }}
                  </div>
                </div>

                <v-avatar-group v-if="task.responsibles?.length" size="24" max="3">
                  <v-avatar
                    v-for="responsible in task.responsibles"
                    :key="responsible.userId"
                    :color="getUserColor(responsible.user.name)"
                    size="24"
                  >
                    <v-tooltip activator="parent" location="top">
                      {{ responsible.user.name }}
                    </v-tooltip>
                    <span style="font-size: 10px; font-weight: 600; color: white">
                      {{ getUserInitials(responsible.user.name) }}
                    </span>
                  </v-avatar>
                </v-avatar-group>
              </div>
            </v-card>
          </VueDraggable>
        </v-card>
      </div>
    </div>

    <v-card
      v-show="currentTab === 'backlog'"
      color="primary"
      elevation="1"
      rounded="lg"
      class="pa-4"
    >
      <v-timeline side="end" density="compact">
        <v-timeline-item
          v-for="entry in sortedHistory"
          :key="entry.id"
          dot-color="primary"
          size="small"
        >
          <template #opposite>
            <div style="font-size: 11px" class="text-primary-lighten">
              {{ formatDate(entry.changedAt) }}
            </div>
          </template>
          <v-card color="surface" elevation="0" rounded="lg" class="pa-3">
            <div style="font-size: 12px" class="font-weight-medium text-secondary mb-1">
              {{ entry.activityTitle }}
            </div>
            <div style="font-size: 11px" class="text-primary-lighten">
              <span class="font-weight-medium">{{ entry.changedBy }}</span>
              alterou de
              <v-chip size="x-small" class="mx-1">{{
                entry.fromStatus ? statusLabels[entry.fromStatus] : 'Novo'
              }}</v-chip>
              para
              <v-chip size="x-small" class="mx-1">{{ statusLabels[entry.toStatus] }}</v-chip>
            </div>
          </v-card>
        </v-timeline-item>
      </v-timeline>
    </v-card>

    <v-dialog v-model="dialog" max-width="700">
      <TaskForm @close="dialog = false" @task-added="dialog = false" />
    </v-dialog>
  </v-container>
</template>

<style scoped>
.kanban-board {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  height: calc(100vh - 220px);
}

.kanban-col {
  min-width: 0;
}

.kanban-column {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.column-content {
  flex: 1;
  overflow-y: auto;
  min-height: 100px;
}

.activity-card {
  cursor: pointer;
  transition: all 0.2s;
}

.activity-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

.activity-title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
