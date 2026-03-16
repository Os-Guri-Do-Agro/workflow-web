<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { Activity } from '@/core/types'

interface Props {
  tasks: any
  selectedUser?: string
  readonly?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update-status': [taskId: string, status: string]
  'open-details': [task: Activity]
  'delete-task': [task: any]
}>()

const columns = [
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

const isDragging = ref(false)
const columnActivities = ref<any>({ todo: [], 'in-progress': [], testing: [], done: [] })

const filteredTasks = computed(() => {
  const result: any = { TODO: [], IN_PROGRESS: [], IN_TESTING: [], DONE: [] }
  if (!props.tasks) return result

  Object.entries(props.tasks).forEach(([key, taskList]: [string, any]) => {
    let filtered = taskList || []
    if (props.selectedUser) {
      filtered = filtered.filter((task: any) =>
        task.responsibles?.some((r: any) => r.user.name === props.selectedUser),
      )
    }
    result[key] = filtered
  })
  return result
})

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

const onAdd = (evt: any, apiStatus: string) => {
  const taskId = evt.item?.dataset?.id
  if (taskId) emit('update-status', taskId, apiStatus)
}

const getImageAttachment = (task: any) =>
  task.attachments?.find((a: any) => /\.(jpg|jpeg|png|gif|webp)$/i.test(a.filename))?.url ?? null

const onStart = () => {
  isDragging.value = true
}
const onEnd = () => {
  isDragging.value = false
}

const openDeleteConfirm = (task: any) => {
  emit('delete-task', task)
}
</script>

<template>
  <div class="kanban-board">
    <div v-for="column in columns" :key="column.status" class="kanban-col">
      <v-card color="primary" elevation="1" rounded="lg" class="kanban-column">
        <v-card-title class="d-flex justify-space-between align-center pa-3 bg-surface">
          <div class="d-flex align-center ga-2">
            <v-icon :color="column.color" size="20">{{ column.icon }}</v-icon>
            <span style="font-size: 16px" class="font-weight-bold text-secondary">{{
              column.title
            }}</span>
          </div>
          <v-chip
            size="small"
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
          :disabled="props.readonly"
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
            class="mb-2 activity-card"
            @click="emit('open-details', task)"
          >
            <v-img
              v-if="getImageAttachment(task)"
              :src="getImageAttachment(task)"
              height="120"
              cover
              rounded="t-lg"
            />
            <div class="pa-3">
            <div class="mb-3">
              <div class="d-flex justify-space-between align-center mb-1">
                <div
                  style="font-size: 15px; min-width: 0"
                  class="font-weight-semibold text-secondary activity-title flex-grow-1"
                >
                  {{ task.title }}
                </div>
                <div class="d-flex align-center ga-1">
                <v-btn
                  v-if="!props.readonly"
                  icon
                  size="small"
                  variant="text"
                  color="error"
                  @click.stop="openDeleteConfirm(task)"
                >
                  <v-icon size="18">mdi-delete-outline</v-icon>
                </v-btn>
                <v-chip
                  v-if="task.priorityNumber !== undefined"
                  size="small"
                  :style="{
                    backgroundColor: getPriorityColor(task.priorityNumber) + '20',
                    color: getPriorityColor(task.priorityNumber),
                  }"
                  class="font-weight-bold"
                  style="flex-shrink: 0"
                >
                  P{{ task.priorityNumber }}
                </v-chip>
                </div>
              </div>
            </div>

            <v-divider class="mb-2" />

            <div class="d-flex justify-space-between align-center">
              <div class="d-flex ga-2 align-center">
                <div
                  v-if="task.dueDate"
                  class="d-flex align-center ga-1 text-primary-lighten"
                  style="font-size: 13px"
                >
                  <v-icon size="14">mdi-calendar-clock</v-icon>
                  {{ new Date(task.dueDate).toLocaleDateString('pt-BR') }}
                </div>
                <div
                  v-if="task.subtasks?.length"
                  class="d-flex align-center ga-1 text-primary-lighten"
                  style="font-size: 13px"
                >
                  <v-icon size="14">mdi-format-list-checks</v-icon>
                  {{ task.subtasks.length }}
                </div>
              </div>

              <div v-if="task.responsibles?.length" class="d-flex" style="gap: -4px">
                <v-avatar
                  v-for="(responsible, i) in task.responsibles.slice(0, 3)"
                  :key="responsible.userId"
                  :color="getUserColor(responsible.user.name)"
                  size="28"
                  :style="{
                    marginLeft: (i as number) > 0 ? '-6px' : '0',
                    zIndex: 3 - (i as number),
                  }"
                >
                  <v-tooltip activator="parent" location="top">{{
                    responsible.user.name
                  }}</v-tooltip>
                  <span style="font-size: 12px; font-weight: 600; color: white">
                    {{ getUserInitials(responsible.user.name) }}
                  </span>
                </v-avatar>
                <v-avatar
                  v-if="task.responsibles.length > 3"
                  color="grey-lighten-1"
                  size="28"
                  style="margin-left: -6px"
                >
                  <span style="font-size: 11px; font-weight: 600"
                    >+{{ task.responsibles.length - 3 }}</span
                  >
                </v-avatar>
              </div>
            </div>
            </div>
          </v-card>
        </VueDraggable>
      </v-card>
    </div>
  </div>
</template>

<style scoped>
.kanban-board {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.kanban-col {
  min-width: 0;
}

.kanban-column {
  display: flex;
  flex-direction: column;
}

.column-content {
  min-height: 100px;
}

.activity-card {
  cursor: pointer;
  transition: all 0.2s;
}

.activity-card:not([draggable="false"]) {
  cursor: grab;
}

.activity-card:not([draggable="false"]):active {
  cursor: grabbing;
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

.text-limit {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
