<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueDraggable } from 'vue-draggable-plus'
import { useTasks } from '@/features/tasks/useTasks'
import TaskForm from '@/features/tasks/components/TaskForm.vue'
import type { TaskStatus, Activity } from '@/core/types'

const route = useRoute()
const router = useRouter()
const { activities, companies, statusHistory, updateActivityStatus } = useTasks()
const dialog = ref(false)
const selectedUser = ref<string>('')
const currentTab = ref('kanban')

const currentMonth = computed(() => route.params.month as string)

const columns: { status: TaskStatus; title: string; color: string; icon: string }[] = [
  { status: 'todo', title: 'A Fazer', color: '#3B82F6', icon: 'mdi-clipboard-text-outline' },
  { status: 'in-progress', title: 'Em Andamento', color: '#F59E0B', icon: 'mdi-progress-clock' },
  { status: 'testing', title: 'Em Teste', color: '#8B5CF6', icon: 'mdi-flask-outline' },
  { status: 'done', title: 'Concluído', color: '#10B981', icon: 'mdi-check-circle-outline' },
]

const allUsers = computed(() => {
  const users = new Set<string>()
  activities.value.forEach((a) => a.assignees.forEach((u) => users.add(u)))
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

const filteredActivities = computed(() => {
  let filtered = activities.value.filter((a) => a.month === currentMonth.value)
  if (selectedUser.value) {
    filtered = filtered.filter((a) => a.assignees.includes(selectedUser.value))
  }
  return filtered
})

const totalTasks = computed(() => filteredActivities.value.length)

const columnActivities = ref<Record<TaskStatus, Activity[]>>({
  todo: [],
  'in-progress': [],
  testing: [],
  done: [],
})

watch(
  [activities, selectedUser, currentMonth],
  () => {
    columns.forEach((col) => {
      columnActivities.value[col.status] = filteredActivities.value.filter(
        (a) => a.status === col.status,
      )
    })
  },
  { immediate: true },
)

const getCompanyName = (id: string) => companies.value.find((c) => c.id === id)?.name || '-'

const onAdd = (status: TaskStatus) => {
  return (evt: any) => {
    const activityId = evt.item.dataset.id
    if (activityId) {
      updateActivityStatus(activityId, status)
    }
  }
}

const openDetails = (activity: Activity) => {
  router.push(`/tasks/${currentMonth.value}/${activity.id}`)
}

const monthName = computed(() => {
  const names: Record<string, string> = {
    janeiro: 'Janeiro',
    fevereiro: 'Fevereiro',
    marco: 'Março',
    abril: 'Abril',
    maio: 'Maio',
    junho: 'Junho',
    julho: 'Julho',
    agosto: 'Agosto',
    setembro: 'Setembro',
    outubro: 'Outubro',
    novembro: 'Novembro',
    dezembro: 'Dezembro',
  }
  return names[currentMonth.value] || currentMonth.value
})

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
            @add="onAdd(column.status)"
          >
            <v-card
              v-for="activity in columnActivities[column.status]"
              :key="activity.id"
              :data-id="activity.id"
              color="primary"
              elevation="1"
              rounded="lg"
              class="mb-2 pa-3 activity-card"
              @click="openDetails(activity)"
            >
              <div class="mb-3">
                <div
                  style="font-size: 12px"
                  class="font-weight-semibold text-secondary mb-1 activity-title"
                >
                  {{ activity.title }}
                </div>
                <v-chip size="x-small" variant="flat" color="surface" class="text-primary-lighten">
                  <v-icon size="9" start>mdi-domain</v-icon>
                  {{ getCompanyName(activity.companyId) }}
                </v-chip>
              </div>

              <v-divider class="mb-2" />

              <div class="d-flex justify-space-between align-center">
                <div class="d-flex ga-2 align-center">
                  <div
                    v-if="activity.dueDate"
                    class="d-flex align-center ga-1"
                    style="font-size: 11px"
                  >
                    <v-icon size="11" color="primary-lighten">mdi-calendar-outline</v-icon>
                    <span class="text-primary-lighten">{{ activity.dueDate }}</span>
                  </div>

                  <div
                    v-if="activity.tasks.length"
                    class="d-flex align-center ga-1"
                    style="font-size: 11px"
                  >
                    <v-icon size="11" color="primary-lighten">mdi-checkbox-marked-outline</v-icon>
                    <span class="text-primary-lighten">{{ activity.tasks.length }}</span>
                  </div>
                </div>

                <div class="d-flex align-center">
                  <v-avatar
                    v-for="(assignee, idx) in activity.assignees.slice(0, 3)"
                    :key="assignee"
                    :color="getUserColor(assignee)"
                    size="18"
                    :style="{ marginLeft: idx > 0 ? '-6px' : '0', zIndex: 3 - idx }"
                    class="assignee-avatar"
                  >
                    <span style="font-size: 8px; font-weight: bold">{{
                      getUserInitials(assignee)
                    }}</span>
                  </v-avatar>
                  <v-chip
                    v-if="activity.assignees.length > 3"
                    size="x-small"
                    color="surface"
                    class="text-primary-lighten"
                    style="margin-left: -6px; font-size: 8px"
                  >
                    +{{ activity.assignees.length - 3 }}
                  </v-chip>
                </div>
              </div>
            </v-card>

            <template #footer>
              <v-sheet
                v-if="!columnActivities[column.status].length"
                color="transparent"
                class="text-center pa-6"
              >
                <span style="font-size: 11px" class="text-medium-emphasis">Nenhuma atividade</span>
              </v-sheet>
            </template>
          </VueDraggable>
        </v-card>
      </div>
    </div>

    <v-card v-show="currentTab === 'backlog'" elevation="1" rounded="lg">
      <v-card-title class="pa-3 bg-surface">
        <div class="d-flex align-center ga-2">
          <v-icon color="secundary" size="18">mdi-history</v-icon>
          <span style="font-size: 14px" class="font-weight-bold">Histórico de Alterações</span>
          <v-chip size="x-small" color="primary" variant="flat">{{ sortedHistory.length }}</v-chip>
        </div>
      </v-card-title>
      <v-divider />
      <v-list density="compact" class="pa-0">
        <v-list-item v-for="item in sortedHistory" :key="item.id" class="history-item">
          <template #prepend>
            <v-icon :color="columns.find((c) => c.status === item.toStatus)?.color" size="20">
              {{ columns.find((c) => c.status === item.toStatus)?.icon }}
            </v-icon>
          </template>
          <v-list-item-title style="font-size: 12px" class="font-weight-medium">
            {{ item.activityTitle }}
          </v-list-item-title>
          <v-list-item-subtitle style="font-size: 11px" class="mt-1">
            <span class="text-medium-emphasis">{{
              item.fromStatus ? statusLabels[item.fromStatus] : 'Criado'
            }}</span>
            <v-icon size="10" class="mx-1">mdi-arrow-right</v-icon>
            <span
              :style="{ color: columns.find((c) => c.status === item.toStatus)?.color }"
              class="font-weight-medium"
            >
              {{ statusLabels[item.toStatus] }}
            </span>
            <span class="mx-2">•</span>
            <v-chip size="x-small" variant="flat" color="surface">
              <v-icon size="8" start>mdi-domain</v-icon>
              {{ getCompanyName(item.companyId) }}
            </v-chip>
          </v-list-item-subtitle>
          <template #append>
            <div class="text-right">
              <div style="font-size: 10px" class="text-medium-emphasis">
                {{ formatDate(item.changedAt) }}
              </div>
              <div style="font-size: 10px" class="text-secundary mt-1">{{ item.changedBy }}</div>
            </div>
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <v-dialog v-model="dialog" max-width="800">
      <TaskForm @close="dialog = false" @task-added="dialog = false" />
    </v-dialog>
  </v-container>
</template>

<style scoped>
.kanban-board {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  min-height: calc(100vh - 200px);
  padding-bottom: 8px;
}

.kanban-col {
  min-width: 300px;
  flex-shrink: 0;
}

.kanban-column {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.column-content {
  flex: 1;
  overflow-y: auto;
  min-height: 100px;
}

.activity-card {
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.activity-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
}

.activity-title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.assignee-avatar {
  border: 1px solid rgb(var(--v-theme-primary));
  transition: transform 0.2s ease;
}

.assignee-avatar:hover {
  transform: translateY(-2px);
  z-index: 10 !important;
}

.history-item {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
  padding: 12px 16px !important;
  transition: background-color 0.2s;
}

.history-item:hover {
  background-color: rgba(var(--v-theme-primary), 0.04);
}

.history-item:last-child {
  border-bottom: none;
}
</style>
