<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTasks } from '@/features/tasks/useTasks'

const route = useRoute()
const router = useRouter()
const { activities, companies, toggleSubTaskCompleted } = useTasks()

const taskId = computed(() => route.params.taskId as string)
const month = computed(() => route.params.month as string)

const activity = computed(() => activities.value.find((a) => a.id === taskId.value))

const showSubtaskModal = ref(false)
const selectedSubtask = ref<any>(null)

const openSubtaskModal = (task: any) => {
  selectedSubtask.value = task
  showSubtaskModal.value = true
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

const goBack = () => {
  router.push(`/tasks/${month.value}`)
}

const completedCount = computed(() => {
  if (!activity.value) return 0
  return activity.value.tasks.filter((t) => t.completed).length
})

const progressPercentage = computed(() => {
  if (!activity.value || activity.value.tasks.length === 0) return 0
  return Math.round((completedCount.value / activity.value.tasks.length) * 100)
})

const statusConfig = computed(() => {
  const status = activity.value?.status
  const configs = {
    todo: { color: '#3B82F6', label: 'A Fazer', icon: 'mdi-clipboard-text-outline' },
    'in-progress': { color: '#F59E0B', label: 'Em Andamento', icon: 'mdi-progress-clock' },
    testing: { color: '#8B5CF6', label: 'Em Teste', icon: 'mdi-flask-outline' },
    done: { color: '#10B981', label: 'Concluído', icon: 'mdi-check-circle-outline' },
  }
  return configs[status as keyof typeof configs] || configs.todo
})
</script>

<template>
  <v-container v-if="activity" fluid class="pa-4 bg-background">
    <div class="d-flex align-center justify-space-between mb-4">
      <v-btn
        variant="text"
        prepend-icon="mdi-arrow-left"
        color="Secundary"
        size="small"
        class="text-none"
        @click="goBack"
      >
        Voltar
      </v-btn>
    </div>

    <v-row>
      <v-col cols="12" md="8">
        <v-card elevation="2" rounded="lg" class="mb-3">
          <v-card-text class="pa-4">
            <div class="d-flex align-center ga-2 mb-3">
              <v-icon color="Secundary" size="20">mdi-text-box-outline</v-icon>
              <h1 style="font-size: 16px" class="font-weight-bold text-secondary">
                {{ activity.title }}
              </h1>
            </div>

            <v-divider class="mb-3" />

            <div style="font-size: 12px" class="text-secondary">{{ activity.description }}</div>
          </v-card-text>
        </v-card>

        <v-card v-if="activity.tasks.length" elevation="2" rounded="lg">
          <v-card-title class="d-flex justify-space-between align-center pa-3 bg-surface">
            <div class="d-flex align-center ga-2">
              <v-icon color="Secundary" size="18">mdi-format-list-checks</v-icon>
              <span style="font-size: 13px" class="font-weight-bold text-secondary">
                Subtarefas
              </span>
              <v-chip size="x-small" color="primary" variant="tonal">
                {{ completedCount }}/{{ activity.tasks.length }}
              </v-chip>
            </div>
            <v-chip
              size="x-small"
              :color="progressPercentage === 100 ? 'success' : 'primary'"
              variant="flat"
            >
              {{ progressPercentage }}%
            </v-chip>
          </v-card-title>

          <v-progress-linear
            :model-value="progressPercentage"
            :color="progressPercentage === 100 ? 'success' : 'primary'"
            height="3"
          />

          <v-card-text class="pa-2">
            <div
              v-for="task in activity.tasks"
              :key="task.id"
              class="subtask-item pa-2 mb-1"
              :class="{ completed: task.completed }"
            >
              <div class="d-flex align-center ga-2">
                <v-checkbox
                  :model-value="task.completed"
                  color="secondary"
                  hide-details
                  density="compact"
                  class="flex-shrink-0"
                  @update:model-value="toggleSubTaskCompleted(activity.id, task.id)"
                  @click.stop
                />
                <div class="flex-grow-1 clickable" @click="openSubtaskModal(task)">
                  <div
                    style="font-size: 11px; line-height: 1.4"
                    class="font-weight-medium text-secondary"
                    :class="{ 'text-decoration-line-through text-primary-lighten': task.completed }"
                  >
                    {{ task.title }}
                  </div>
                  <div
                    v-if="task.description"
                    style="font-size: 10px; line-height: 1.3"
                    class="text-primary-lighten mt-1"
                    :class="{ 'text-decoration-line-through': task.completed }"
                  >
                    {{ task.description }}
                  </div>

                  <div
                    v-if="task.assignees.length || task.dueDate || task.attachments.length"
                    class="d-flex ga-2 flex-wrap mt-1"
                  >
                    <v-chip
                      v-if="task.assignees.length"
                      size="x-small"
                      variant="tonal"
                      color="Secundary"
                      class="px-2"
                      style="height: 18px; font-size: 9px"
                    >
                      <v-icon size="9" start>mdi-account-outline</v-icon>
                      {{ task.assignees.join(', ') }}
                    </v-chip>

                    <v-chip
                      v-if="task.dueDate"
                      size="x-small"
                      variant="tonal"
                      color="Secundary"
                      class="px-2"
                      style="height: 18px; font-size: 9px"
                    >
                      <v-icon size="9" start>mdi-calendar-outline</v-icon>
                      {{ task.dueDate }}
                    </v-chip>

                    <v-chip
                      v-if="task.attachments.length"
                      size="x-small"
                      variant="tonal"
                      color="primary"
                      class="px-2"
                      style="height: 18px; font-size: 9px"
                    >
                      <v-icon size="9" start>mdi-paperclip</v-icon>
                      {{ task.attachments.length }}
                    </v-chip>
                  </div>
                </div>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <v-card v-else elevation="2" rounded="lg" class="pa-6 text-center">
          <v-icon size="40" color="primary-lighten" class="mb-2"
            >mdi-clipboard-text-off-outline</v-icon
          >
          <div style="font-size: 12px" class="text-primary-lighten">
            Nenhuma subtarefa cadastrada
          </div>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card elevation="2" rounded="lg" class="mb-3">
          <v-card-text class="pa-3">
            <div class="d-flex align-center ga-2 mb-3">
              <v-icon color="Secundary" size="16">mdi-information-outline</v-icon>
              <span style="font-size: 12px" class="font-weight-bold text-secondary"
                >Informações</span
              >
            </div>

            <div class="mb-3">
              <div style="font-size: 10px" class="text-primary-lighten mb-1">Empresa</div>
              <v-chip size="small" variant="tonal" color="secondary" class="text-primary">
                <v-icon size="12" start>mdi-domain</v-icon>
                {{ getCompanyName(activity.companyId) }}
              </v-chip>
            </div>

            <div v-if="activity.dueDate" class="mb-3">
              <div style="font-size: 10px" class="text-primary-lighten mb-1">Data de Entrega</div>
              <v-chip size="small" variant="tonal" color="secondary" class="text-primary">
                <v-icon size="12" start>mdi-calendar-clock</v-icon>
                {{ activity.dueDate }}
              </v-chip>
            </div>

            <div v-if="activity.assignees.length">
              <div style="font-size: 10px" class="text-primary-lighten mb-2">Responsáveis</div>
              <div class="d-flex flex-column ga-1">
                <v-chip
                  v-for="assignee in activity.assignees"
                  :key="assignee"
                  size="small"
                  variant="flat"
                  :color="getUserColor(assignee)"
                  class="justify-start"
                >
                  <v-avatar start size="20">
                    <span style="font-size: 9px">{{ getUserInitials(assignee) }}</span>
                  </v-avatar>
                  <span style="font-size: 11px">{{ assignee }}</span>
                </v-chip>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <v-card v-if="activity.attachments.length" elevation="2" rounded="lg">
          <v-card-text class="pa-3">
            <div class="d-flex align-center ga-2 mb-2">
              <v-icon color="Secundary" size="16">mdi-paperclip</v-icon>
              <span style="font-size: 12px" class="font-weight-bold text-secondary">Anexos</span>
            </div>
            <div class="d-flex flex-column ga-1">
              <v-chip
                v-for="attachment in activity.attachments"
                :key="attachment"
                size="small"
                variant="tonal"
                prepend-icon="mdi-file-outline"
                class="justify-start"
              >
                {{ attachment }}
              </v-chip>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>

  <v-container v-else fluid class="pa-4 bg-background">
    <v-card elevation="2" rounded="lg" class="pa-8 text-center">
      <v-icon size="48" color="primary-lighten" class="mb-2">mdi-alert-circle-outline</v-icon>
      <div style="font-size: 13px" class="text-primary-lighten">Tarefa não encontrada</div>
      <v-btn variant="tonal" color="primary" size="small" class="mt-4 text-none" @click="goBack">
        Voltar
      </v-btn>
    </v-card>
  </v-container>

  <v-dialog v-model="showSubtaskModal" max-width="900px">
    <v-card v-if="selectedSubtask && activity" rounded="lg">
      <v-card-title class="d-flex justify-space-between align-center pa-4 bg-surface">
        <div class="d-flex align-center ga-3">
          <v-icon color="Secundary" size="24">mdi-checkbox-marked-circle-outline</v-icon>
          <span class="text-h6 text-secondary">Detalhes da Subtarefa</span>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="showSubtaskModal = false" />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-6">
        <div class="mb-5">
          <div class="d-flex align-center ga-2 mb-3">
            <v-checkbox
              :model-value="selectedSubtask.completed"
              color="secondary"
              hide-details
              @update:model-value="toggleSubTaskCompleted(activity.id, selectedSubtask.id)"
            />
            <h2
              class="text-h5 text-secondary"
              :class="{ 'text-decoration-line-through text-primary-lighten': selectedSubtask.completed }"
            >
              {{ selectedSubtask.title }}
            </h2>
          </div>

          <v-chip
            size="small"
            :color="selectedSubtask.completed ? 'success' : 'warning'"
            variant="tonal"
            class="mb-4"
          >
            <v-icon size="16" start>{{ selectedSubtask.completed ? 'mdi-check-circle' : 'mdi-clock-outline' }}</v-icon>
            {{ selectedSubtask.completed ? 'Concluída' : 'Pendente' }}
          </v-chip>
        </div>

        <v-divider class="mb-5" />

        <div v-if="selectedSubtask.description" class="mb-5">
          <div class="d-flex align-center ga-2 mb-3">
            <v-icon color="Secundary" size="20">mdi-text-box-outline</v-icon>
            <span class="text-subtitle-1 font-weight-bold text-secondary">Descrição</span>
          </div>
          <p class="text-body-1 text-secondary" style="line-height: 1.6">
            {{ selectedSubtask.description }}
          </p>
        </div>

        <v-row>
          <v-col v-if="selectedSubtask.assignees.length" cols="12" md="6">
            <div class="d-flex align-center ga-2 mb-3">
              <v-icon color="Secundary" size="20">mdi-account-multiple-outline</v-icon>
              <span class="text-subtitle-1 font-weight-bold text-secondary">Responsáveis</span>
            </div>
            <div class="d-flex flex-column ga-2">
              <v-chip
                v-for="assignee in selectedSubtask.assignees"
                :key="assignee"
                size="default"
                variant="flat"
                :color="getUserColor(assignee)"
                class="justify-start"
              >
                <v-avatar start size="28">
                  <span style="font-size: 12px">{{ getUserInitials(assignee) }}</span>
                </v-avatar>
                <span class="text-body-1">{{ assignee }}</span>
              </v-chip>
            </div>
          </v-col>

          <v-col v-if="selectedSubtask.dueDate" cols="12" md="6">
            <div class="d-flex align-center ga-2 mb-3">
              <v-icon color="Secundary" size="20">mdi-calendar-clock</v-icon>
              <span class="text-subtitle-1 font-weight-bold text-secondary">Data de Entrega</span>
            </div>
            <v-chip size="default" variant="tonal" color="secondary" class="text-primary">
              <v-icon size="18" start>mdi-calendar-outline</v-icon>
              {{ selectedSubtask.dueDate }}
            </v-chip>
          </v-col>
        </v-row>

        <div v-if="selectedSubtask.attachments.length" class="mt-5">
          <div class="d-flex align-center ga-2 mb-3">
            <v-icon color="Secundary" size="20">mdi-paperclip</v-icon>
            <span class="text-subtitle-1 font-weight-bold text-secondary">Anexos</span>
            <v-chip size="x-small" color="primary" variant="tonal">
              {{ selectedSubtask.attachments.length }}
            </v-chip>
          </div>
          <div class="d-flex flex-column ga-2">
            <v-chip
              v-for="attachment in selectedSubtask.attachments"
              :key="attachment"
              size="default"
              variant="tonal"
              color="secondary"
              prepend-icon="mdi-file-outline"
              class="justify-start"
            >
              {{ attachment }}
            </v-chip>
          </div>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn
          variant="tonal"
          color="secondary"
          class="text-none"
          @click="showSubtaskModal = false"
        >
          Fechar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.v-checkbox :deep(.v-selection-control) {
  min-height: 20px;
}

.subtask-item {
  border-radius: 8px;
  transition: all 0.2s ease;
  background: transparent;
  border: 1px solid rgba(var(--v-theme-secondary), 0.2);
}

.subtask-item:hover {
  background: rgba(var(--v-theme-secondary), 0.05);
  border-color: rgba(var(--v-theme-secondary), 0.3);
}

.clickable {
  cursor: pointer;
}

.subtask-item.completed {
  opacity: 0.7;
}
</style>
