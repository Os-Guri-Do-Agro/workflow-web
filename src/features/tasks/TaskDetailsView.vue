<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTasks } from '@/features/tasks/useTasks'
import activityService from '@/service/activities/activity-service'
import companiesServices from '@/service/companies/companies-services'

const route = useRoute()
const router = useRouter()
const { companies } = useTasks()

const taskId = computed(() => route.params.taskId as string)
const month = computed(() => route.params.month as string)

const showSubtaskModal = ref(false)
const selectedSubtask = ref<any>(null)
const showCreateSubtaskModal = ref(false)
const members = ref<any[]>([])
const formSubtask = ref({
  title: '',
  description: '',
  priorityNumber: 1,
  dueDate: '',
  responsibleUserIds: [] as string[],
})

const activityInfo = ref<any>(null)

const InfoActivity = async () => {
  try {
    activityInfo.value = await activityService.getActivityById(taskId.value)
  } catch (error) {
    console.error('Erro ao buscar atividade:', error)
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

const createSubtask = async () => {
  if (!formSubtask.value.title) return
  try {
    await activityService.postActivity({
      title: formSubtask.value.title,
      description: formSubtask.value.description || '',
      priorityNumber: Number(formSubtask.value.priorityNumber) || 1,
      dueDate: formSubtask.value.dueDate
        ? new Date(formSubtask.value.dueDate).toISOString()
        : new Date().toISOString(),
      monthId: month.value,
      parentId: taskId.value,
      responsibleUserIds: formSubtask.value.responsibleUserIds,
    })
    await InfoActivity()
    formSubtask.value = {
      title: '',
      description: '',
      priorityNumber: 1,
      dueDate: '',
      responsibleUserIds: [],
    }
    showCreateSubtaskModal.value = false
  } catch (error) {
    console.error('Erro ao criar subtarefa:', error)
  }
}

onMounted(() => {
  InfoActivity()
  findMembers()
})

const editingSubtask = ref(false)

const openSubtaskModal = (task: any) => {
  selectedSubtask.value = task
  editingSubtask.value = false
  formSubtask.value = {
    title: task.title,
    description: task.description || '',
    priorityNumber: task.priorityNumber ?? 1,
    dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
    responsibleUserIds: task.responsibles?.map((r: any) => r.userId) ?? [],
  }
  showSubtaskModal.value = true
}

const updateSubtask = async () => {
  if (!selectedSubtask.value || !formSubtask.value.title) return
  try {
    await activityService.patchActivity(selectedSubtask.value.id, {
      title: formSubtask.value.title,
      description: formSubtask.value.description || '',
      priorityNumber: Number(formSubtask.value.priorityNumber) || 1,
      dueDate: formSubtask.value.dueDate ? new Date(formSubtask.value.dueDate).toISOString() : undefined,
      monthId: month.value,
      parentId: taskId.value,
      responsibleUserIds: formSubtask.value.responsibleUserIds,
    })
    await InfoActivity()
    showSubtaskModal.value = false
  } catch (error) {
    console.error('Erro ao atualizar subtarefa:', error)
  }
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

const subtasks = computed(() => activityInfo.value?.subtasks ?? [])
const responsibles = computed(() => activityInfo.value?.responsibles ?? [])

const statusMap: Record<string, { color: string; label: string; icon: string }> = {
  TODO: { color: '#3B82F6', label: 'A Fazer', icon: 'mdi-clipboard-text-outline' },
  IN_PROGRESS: { color: '#F59E0B', label: 'Em Andamento', icon: 'mdi-progress-clock' },
  TESTING: { color: '#8B5CF6', label: 'Em Teste', icon: 'mdi-flask-outline' },
  DONE: { color: '#10B981', label: 'Concluído', icon: 'mdi-check-circle-outline' },
}

const getStatusConfig = (status: string): { color: string; label: string; icon: string } =>
  statusMap[status] ?? statusMap['TODO']!

const statusConfig = computed(() => getStatusConfig(activityInfo.value?.status ?? 'TODO'))

const toggleSubtaskStatus = async (task: any) => {
  const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE'
  try {
    await activityService.patchActivityStatus(task.id, newStatus)
    task.status = newStatus
  } catch (error) {
    console.error('Erro ao atualizar status:', error)
  }
}

const formatDate = (date: string | null) => {
  if (!date) return null
  return new Date(date).toLocaleDateString('pt-BR')
}
</script>

<template>
  <v-container v-if="activityInfo" fluid class="pa-4 bg-background">
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
                {{ activityInfo.title }}
              </h1>
            </div>

            <v-divider class="mb-3" />

            <div style="font-size: 12px" class="text-secondary" v-html="activityInfo.description" />
          </v-card-text>
        </v-card>

        <v-card v-if="subtasks.length" elevation="2" rounded="lg">
          <div
            class="d-flex justify-space-between align-center pa-3 bg-surface"
            style="border-radius: 8px 8px 0 0"
          >
            <div class="d-flex align-center ga-2">
              <v-icon color="Secundary" size="18">mdi-format-list-checks</v-icon>
              <span style="font-size: 13px" class="font-weight-bold text-secondary">
                Subtarefas
              </span>
              <v-chip size="x-small" color="primary" variant="tonal">
                {{ subtasks.length }}
              </v-chip>
            </div>
            <v-btn
              size="x-small"
              color="Secundary"
              variant="tonal"
              prepend-icon="mdi-plus"
              class="text-none px-5 py-3"
              @click="showCreateSubtaskModal = true"
            >
              Nova Tarefa
            </v-btn>
          </div>

          <v-card-text class="pa-2">
            <div v-for="task in subtasks" :key="task.id" class="subtask-item pa-2 mb-1">
              <div class="d-flex align-center ga-2">
                <v-checkbox
                  :model-value="task.status === 'DONE'"
                  color="secondary"
                  hide-details
                  density="compact"
                  class="flex-shrink-0"
                  @update:model-value="toggleSubtaskStatus(task)"
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

                  <div class="d-flex ga-2 flex-wrap mt-1">
                    <v-chip
                      size="x-small"
                      variant="tonal"
                      :color="getStatusConfig(task.status).color"
                      class="px-2"
                      style="height: 18px; font-size: 9px"
                    >
                      <v-icon size="9" start>{{ getStatusConfig(task.status).icon }}</v-icon>
                      {{ getStatusConfig(task.status).label }}
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
                      {{ formatDate(task.dueDate) }}
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
          <div style="font-size: 12px" class="text-primary-lighten mb-3">
            Nenhuma subtarefa cadastrada
          </div>
          <v-btn
            size="x-small"
            color="primary"
            variant="tonal"
            prepend-icon="mdi-plus"
            class="text-none"
            @click="showCreateSubtaskModal = true"
          >
            Nova Subtarefa
          </v-btn>
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
              <div style="font-size: 10px" class="text-primary-lighten mb-1">Status</div>
              <v-chip size="small" variant="tonal" :color="statusConfig.color">
                <v-icon size="12" start>{{ statusConfig.icon }}</v-icon>
                {{ statusConfig.label }}
              </v-chip>
            </div>

            <div v-if="activityInfo.dueDate" class="mb-3">
              <div style="font-size: 10px" class="text-primary-lighten mb-1">Data de Entrega</div>
              <v-chip size="small" variant="tonal" color="secondary" class="text-primary">
                <v-icon size="12" start>mdi-calendar-clock</v-icon>
                {{ formatDate(activityInfo.dueDate) }}
              </v-chip>
            </div>

            <div v-if="responsibles.length">
              <div style="font-size: 10px" class="text-primary-lighten mb-2">Responsáveis</div>
              <div class="d-flex flex-column ga-1">
                <v-chip
                  v-for="r in responsibles"
                  :key="r.userId"
                  size="small"
                  variant="flat"
                  :color="getUserColor(r.user.name)"
                  class="justify-start"
                >
                  <v-avatar start size="20">
                    <span style="font-size: 9px">{{ getUserInitials(r.user.name) }}</span>
                  </v-avatar>
                  <span style="font-size: 11px">{{ r.user.name }}</span>
                </v-chip>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <v-card v-if="activityInfo.attachments?.length" elevation="2" rounded="lg">
          <v-card-text class="pa-3">
            <div class="d-flex align-center ga-2 mb-2">
              <v-icon color="Secundary" size="16">mdi-paperclip</v-icon>
              <span style="font-size: 12px" class="font-weight-bold text-secondary">Anexos</span>
            </div>
            <div class="d-flex flex-column ga-1">
              <v-chip
                v-for="attachment in activityInfo.attachments"
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

  <v-dialog v-model="showCreateSubtaskModal" max-width="500px">
    <v-card rounded="lg">
      <v-card-title class="d-flex justify-space-between align-center pa-4 bg-surface">
        <div class="d-flex align-center ga-2">
          <v-icon color="Secundary" size="20">mdi-plus-circle-outline</v-icon>
          <span class="text-subtitle-1 font-weight-bold text-secondary">Nova Subtarefa</span>
        </div>
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          @click="showCreateSubtaskModal = false"
        />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4">
        <v-text-field
          v-model="formSubtask.title"
          label="Título *"
          density="compact"
          variant="outlined"
          color="secondary"
          class="mb-3"
          hide-details
        />
        <v-textarea
          v-model="formSubtask.description"
          label="Descrição"
          density="compact"
          variant="outlined"
          color="secondary"
          rows="3"
          class="mb-3"
          hide-details
        />
        <v-row>
          <v-col cols="6">
            <v-text-field
              v-model="formSubtask.priorityNumber"
              label="Prioridade"
              type="number"
              density="compact"
              variant="outlined"
              color="secondary"
              hide-details
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="formSubtask.dueDate"
              label="Data de Entrega"
              type="date"
              density="compact"
              variant="outlined"
              color="secondary"
              hide-details
            />
          </v-col>
        </v-row>
        <v-select
          v-model="formSubtask.responsibleUserIds"
          :items="members"
          :item-title="(m) => m.user?.name ?? m.name"
          :item-value="(m) => m.user?.id ?? m.id"
          label="Responsáveis"
          density="compact"
          variant="outlined"
          color="secondary"
          multiple
          chips
          closable-chips
          class="mt-3"
          hide-details
        />
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn
          variant="text"
          color="secondary"
          class="text-none"
          @click="showCreateSubtaskModal = false"
          >Cancelar</v-btn
        >
        <v-btn
          variant="tonal"
          color="primary"
          class="text-none"
          :disabled="!formSubtask.title"
          @click="createSubtask"
          >Criar</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showSubtaskModal" max-width="900px">
    <v-card v-if="selectedSubtask" rounded="lg">
      <v-card-title class="d-flex justify-space-between align-center pa-4 bg-surface">
        <div class="d-flex align-center ga-3">
          <v-icon color="Secundary" size="20">mdi-checkbox-marked-circle-outline</v-icon>
          <span class="text-subtitle-1 font-weight-bold text-secondary">{{ selectedSubtask.title }}</span>
        </div>
        <div class="d-flex align-center ga-1">
          <v-btn
            :icon="editingSubtask ? 'mdi-close' : 'mdi-pencil-outline'"
            variant="text"
            size="small"
            @click="editingSubtask = !editingSubtask"
          />
          <v-btn icon="mdi-close" variant="text" size="small" @click="showSubtaskModal = false" />
        </div>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4">
        <template v-if="!editingSubtask">
          <div class="mb-3">
            <v-chip size="small" :color="getStatusConfig(selectedSubtask.status).color" variant="tonal">
              <v-icon size="14" start>{{ getStatusConfig(selectedSubtask.status).icon }}</v-icon>
              {{ getStatusConfig(selectedSubtask.status).label }}
            </v-chip>
          </div>

          <div v-if="selectedSubtask.description" class="mb-4">
            <div style="font-size: 10px" class="text-primary-lighten mb-1">Descrição</div>
            <div style="font-size: 12px" class="text-secondary" v-html="selectedSubtask.description" />
          </div>

          <v-row>
            <v-col v-if="selectedSubtask.responsibles?.length" cols="12" md="6">
              <div style="font-size: 10px" class="text-primary-lighten mb-2">Responsáveis</div>
              <div class="d-flex flex-column ga-1">
                <v-chip
                  v-for="r in selectedSubtask.responsibles"
                  :key="r.userId"
                  size="small"
                  variant="flat"
                  :color="getUserColor(r.user.name)"
                  class="justify-start"
                >
                  <v-avatar start size="20">
                    <span style="font-size: 9px">{{ getUserInitials(r.user.name) }}</span>
                  </v-avatar>
                  <span style="font-size: 11px">{{ r.user.name }}</span>
                </v-chip>
              </div>
            </v-col>
            <v-col v-if="selectedSubtask.dueDate" cols="12" md="6">
              <div style="font-size: 10px" class="text-primary-lighten mb-1">Data de Entrega</div>
              <v-chip size="small" variant="tonal" color="secondary">
                <v-icon size="12" start>mdi-calendar-outline</v-icon>
                {{ formatDate(selectedSubtask.dueDate) }}
              </v-chip>
            </v-col>
          </v-row>
        </template>

        <template v-else>
          <v-text-field
            v-model="formSubtask.title"
            label="Título *"
            density="compact"
            variant="outlined"
            color="secondary"
            class="mb-3"
            hide-details
          />
          <v-textarea
            v-model="formSubtask.description"
            label="Descrição"
            density="compact"
            variant="outlined"
            color="secondary"
            rows="3"
            class="mb-3"
            hide-details
          />
          <v-row>
            <v-col cols="6">
              <v-text-field
                v-model="formSubtask.priorityNumber"
                label="Prioridade"
                type="number"
                density="compact"
                variant="outlined"
                color="secondary"
                hide-details
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model="formSubtask.dueDate"
                label="Data de Entrega"
                type="date"
                density="compact"
                variant="outlined"
                color="secondary"
                hide-details
              />
            </v-col>
          </v-row>
          <v-select
            v-model="formSubtask.responsibleUserIds"
            :items="members"
            :item-title="(m) => m.user?.name ?? m.name"
            :item-value="(m) => m.user?.id ?? m.id"
            label="Responsáveis"
            density="compact"
            variant="outlined"
            color="secondary"
            multiple
            chips
            closable-chips
            class="mt-3"
            hide-details
          />
        </template>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />
        <template v-if="editingSubtask">
          <v-btn variant="text" color="secondary" class="text-none" @click="editingSubtask = false">Cancelar</v-btn>
          <v-btn variant="tonal" color="primary" class="text-none" :disabled="!formSubtask.title" @click="updateSubtask">Salvar</v-btn>
        </template>
        <v-btn v-else variant="tonal" color="secondary" class="text-none" @click="showSubtaskModal = false">Fechar</v-btn>
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
