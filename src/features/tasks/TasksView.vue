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

const route = useRoute()
const router = useRouter()
const { activities, companies, statusHistory, updateActivityStatus } = useTasks()
const dialog = ref(false)
const selectedUser = ref<string>('')
const currentTab = ref('kanban')
const members = ref<any[]>([])
const formActivity = ref<any>({
  title: '',
  description: '',
  priorityNumber: 0,
  dueDate: '',
  assignees: [],
})
const tasks = ref<any>({
  TODO: [],
  IN_PROGRESS: [],
  IN_TESTING: [],
  DONE: [],
})

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

  try {
    const payload = {
      title: formActivity.value.title,
      description: formActivity.value.description || '',
      priorityNumber: Number(formActivity.value.priorityNumber) || 0,
      dueDate: formActivity.value.dueDate ? new Date(formActivity.value.dueDate).toISOString() : new Date().toISOString(),
      monthId,
      responsibleUserIds: formActivity.value.assignees || []
    }

    await activityService.postActivity(payload)
    await findTaskas()

    formActivity.value = {
      title: '',
      description: '',
      priorityNumber: 0,
      dueDate: '',
      assignees: [],
    }
    dialog.value = false
  } catch (error) {
    console.error('Erro ao criar atividade:', error)
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
  await findMonthData()
  await findTaskas()
  await findMembers()
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
      @update-status="handleUpdateStatus"
      @open-details="openDetails"
    />

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

    <v-dialog v-model="dialog" max-width="600">
      <TaskForm
        v-if="dialog"
        v-model="formActivity"
        :members="members"
        @close="dialog = false"
        @submit="createActivity"
      />
    </v-dialog>
  </v-container>
</template>
