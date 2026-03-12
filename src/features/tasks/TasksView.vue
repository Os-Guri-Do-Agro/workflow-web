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
import { isWorker } from '@/utils/authContent'

const route = useRoute()
const router = useRouter()
const { activities, companies, statusHistory, updateActivityStatus } = useTasks()
const loading = ref(true)
const dialog = ref(false)
const creating = ref(false)
const selectedUser = ref<string>('')
const currentTab = ref('kanban')
const members = ref<any[]>([])
const backLog = ref<any[]>([])
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

const findBackLog = async () => {
  const companyId = localStorage.getItem('activeCompany')
  if (!companyId) return
  try {
    const response = await backlogService.getBacklogByCompany(companyId)
    backLog.value = response
  } catch (error) {
    console.error('Erro ao buscar backlog:', error)
  }
}

const findMembers = async () => {
  const id = localStorage.getItem('activeCompany')
  if (!id) return
  try {
    const response = await companiesServices.getCompanyMembers(id)
    members.value = response.data || response
  } catch (error) {
    console.error('Erro ao buscar membros:', error)
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

    await findTaskas()

    formActivity.value = {
      title: '',
      description: '',
      priorityNumber: 0,
      dueDate: '',
      assignees: [],
      attachment: null,
    }
    dialog.value = false
  } catch (error) {
    console.error('Erro ao criar atividade:', error)
  } finally {
    creating.value = false
  }
}

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
  await Promise.all([findMonthData(), findTaskas(), findMembers(), findBackLog()])
  loading.value = false
})

watch(
  () => route.params.month,
  async () => {
    await findMonthData()
    await findTaskas()
  },
)

const currentMonthId = computed(() => route.params.month as string)
const currentMonthData = ref<any>(null)

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

const totalTasks = computed(() => {
  if (!tasks.value) return 0
  return Object.values(tasks.value).flat().length - 1
})

const handleUpdateStatus = async (taskId: string, apiStatus: string) => {
  try {
    await quartersService.patchActivityStatus(taskId, apiStatus)
    await findTaskas()
  } catch (error) {
    console.error('Erro ao atualizar status:', error)
    await findTaskas()
  }
}

const deleting = ref<string | null>(null)
const confirmDelete = ref(false)
const taskToDelete = ref<any>(null)

const openDeleteConfirm = (task: any) => {
  taskToDelete.value = task
  confirmDelete.value = true
}

const deleteTask = async () => {
  if (!taskToDelete.value) return
  deleting.value = taskToDelete.value.id
  try {
    await activityService.deleteActivity(taskToDelete.value.id)
    await findTaskas()
    confirmDelete.value = false
  } catch (error) {
    console.error('Erro ao deletar atividade:', error)
  } finally {
    deleting.value = null
    taskToDelete.value = null
  }
}

const openDetails = (activity: Activity) => {
  router.push(`/tasks/${currentMonthId.value}/${activity.id}`)
}

const monthName = computed(() => currentMonthData.value?.name || 'Carregando...')

const statusLabels: Record<string, string> = {
  TODO: 'A Fazer',
  IN_PROGRESS: 'Em Progresso',
  IN_TESTING: 'Em Teste',
  DONE: 'Concluído',
}

const statusColors: Record<string, string> = {
  TODO: '#3B82F6',
  IN_PROGRESS: '#F59E0B',
  IN_TESTING: '#8B5CF6',
  DONE: '#10B981',
}

const sortedHistory = computed(() => {
  return [...backLog.value].sort(
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
  <v-container v-if="loading" fluid class="pa-4 bg-background d-flex align-center justify-center" style="min-height: 60vh">
    <v-progress-circular indeterminate color="secondary" size="48" />
  </v-container>

  <v-container v-else fluid class="pa-4 bg-background">
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
            v-if="isWorker()"
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
        :items="members.map((m) => m.user.name)"
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
        :disabled="!isWorker()"
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

    <KanbanBoard
      v-show="currentTab === 'kanban'"
      :tasks="tasks"
      :selected-user="selectedUser"
      :readonly="!isWorker()"
      @update-status="handleUpdateStatus"
      @open-details="openDetails"
      @delete-task="openDeleteConfirm"
    />

    <v-dialog v-model="confirmDelete" max-width="360">
      <v-card color="primary" rounded="lg">
        <v-card-title class="pa-4 text-secondary" style="font-size: 14px">Excluir atividade</v-card-title>
        <v-card-text class="text-secondary" style="font-size: 13px">
          Tem certeza que deseja excluir <strong>{{ taskToDelete?.title }}</strong>?
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn size="small" variant="text" @click="confirmDelete = false">Cancelar</v-btn>
          <v-btn size="small" color="error" variant="tonal" :loading="!!deleting" @click="deleteTask">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-card
      v-show="currentTab === 'backlog'"
      color="primary"
      elevation="1"
      rounded="lg"
      class="pa-4"
    >
      <div v-if="sortedHistory.length === 0" class="d-flex flex-column align-center justify-center py-12">
        <v-icon size="64" color="primary-lighten" class="mb-4">mdi-history</v-icon>
        <div style="font-size: 14px" class="font-weight-medium text-secondary mb-1">
          Nenhum histórico encontrado
        </div>
        <div style="font-size: 12px" class="text-primary-lighten">
          As alterações de status das atividades aparecerão aqui
        </div>
      </div>
      <v-timeline v-else side="end" density="compact">
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
              <span class="font-weight-medium">{{ entry.changedBy?.name }}</span>
              alterou de
              <v-chip
                v-if="entry.previousStatus"
                size="x-small"
                class="mx-1"
                :style="{ backgroundColor: statusColors[entry.previousStatus] + '20', color: statusColors[entry.previousStatus] }"
              >{{ statusLabels[entry.previousStatus] }}</v-chip>
              <span v-else class="mx-1">Novo</span>
              para
              <v-chip
                size="x-small"
                class="mx-1"
                :style="{ backgroundColor: statusColors[entry.newStatus] + '20', color: statusColors[entry.newStatus] }"
              >{{ statusLabels[entry.newStatus] }}</v-chip>
            </div>
          </v-card>
        </v-timeline-item>
      </v-timeline>
    </v-card>

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
  </v-container>
</template>
