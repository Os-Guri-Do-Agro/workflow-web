<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTasks } from '@/features/tasks/useTasks'
import activityService from '@/service/activities/activity-service'
import companiesServices from '@/service/companies/companies-services'
import { useWorkspaceStore } from '@/stores/workspaceStores'

const route = useRoute()
const router = useRouter()
const { companies } = useTasks()
const workspaceStore = useWorkspaceStore()

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
  attachment: null as File | null,
})

const suggest = ref<any>(null)
const loadingSuggest = ref(false)
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref('error')

const improveWithAI = async () => {
  loadingSuggest.value = true
  try {
    const response = await activityService.postSuggest(taskId.value)
    suggest.value = response
    snackbarMessage.value = 'Sugestões geradas com sucesso'
    snackbarColor.value = 'success'
    snackbar.value = true
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao aprimorar texto'
    snackbarColor.value = 'error'
    snackbar.value = true
  } finally {
    loadingSuggest.value = false
  }
}

const applySuggestion = () => {
  if (!suggest.value) return
  formActivity.value.description =
    suggest.value.improvedDescription || formActivity.value.description
  formActivity.value.priorityNumber =
    suggest.value.suggestedPriority ?? formActivity.value.priorityNumber
}

const dismissSuggestion = () => {
  suggest.value = null
}

const showQuickSubtaskModal = ref(false)
const quickSubtaskTitle = ref('')

const openQuickSubtask = (title: string) => {
  quickSubtaskTitle.value = title
  showQuickSubtaskModal.value = true
}

const createQuickSubtask = async () => {
  if (!quickSubtaskTitle.value) return
  saving.value = true
  try {
    await activityService.postActivity({
      title: quickSubtaskTitle.value,
      description: '',
      priorityNumber: 1,
      dueDate: new Date().toISOString(),
      monthId: month.value,
      parentId: taskId.value,
      responsibleUserIds: [],
    })
    await InfoActivity()
    showQuickSubtaskModal.value = false
    snackbarMessage.value = 'Subtarefa criada com sucesso'
    snackbarColor.value = 'success'
    snackbar.value = true
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao criar subtarefa'
    snackbarColor.value = 'error'
    snackbar.value = true
  } finally {
    quickSubtaskTitle.value = ''
    saving.value = false
  }
}

const isSubtaskCreated = (suggestedTitle: string) => {
  return subtasks.value.some(
    (st: any) => st.title.toLowerCase().trim() === suggestedTitle.toLowerCase().trim(),
  )
}

const activityInfo = ref<any>(null)
const loading = ref(true)

const InfoActivity = async () => {
  try {
    activityInfo.value = await activityService.getActivityById(taskId.value)
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao buscar atividade'
    snackbarColor.value = 'error'
    snackbar.value = true
  }
}

const findMembers = async () => {
  const id = localStorage.getItem('activeCompany')
  if (!id) return
  try {
    const response = await companiesServices.getCompanyMembers(id)
    members.value = response.data || response
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao buscar membros'
    snackbarColor.value = 'error'
    snackbar.value = true
  }
}

const createSubtask = async () => {
  if (!formSubtask.value.title) return
  saving.value = true
  try {
    const created = await activityService.postActivity({
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
    if (formSubtask.value.attachment) {
      const fd = new FormData()
      fd.append('file', formSubtask.value.attachment)
      await activityService.postActivityAttachment(created.id, fd)
    }
    await InfoActivity()
    formSubtask.value = {
      title: '',
      description: '',
      priorityNumber: 1,
      dueDate: '',
      responsibleUserIds: [],
      attachment: null,
    }
    showCreateSubtaskModal.value = false
    snackbarMessage.value = 'Subtarefa criada com sucesso'
    snackbarColor.value = 'success'
    snackbar.value = true
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao criar subtarefa'
    snackbarColor.value = 'error'
    snackbar.value = true
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  // Se a URL traz ?company=, garante que o contexto está correto antes de buscar
  const companyFromQuery = route.query.company as string | undefined
  if (companyFromQuery && companyFromQuery !== workspaceStore.activeCompanyId) {
    workspaceStore.setActiveCompany(companyFromQuery)
  }

  await Promise.all([InfoActivity(), findMembers()])
  loading.value = false
})

const editingSubtask = ref(false)
const saving = ref(false)
const deleting = ref<string | null>(null)

const showEditActivityModal = ref(false)
const formActivity = ref({
  title: '',
  description: '',
  priorityNumber: 1,
  dueDate: '',
  responsibleUserIds: [] as string[],
  attachment: null as File | null,
})

const openEditActivityModal = () => {
  formActivity.value = {
    title: activityInfo.value.title,
    description: activityInfo.value.description || '',
    priorityNumber: activityInfo.value.priorityNumber ?? 1,
    dueDate: activityInfo.value.dueDate ? activityInfo.value.dueDate.split('T')[0] : '',
    responsibleUserIds: activityInfo.value.responsibles?.map((r: any) => r.userId) ?? [],
    attachment: null,
  }
  suggest.value = null
  showEditActivityModal.value = true
}

const updateActivity = async () => {
  if (!formActivity.value.title) return
  saving.value = true
  try {
    await activityService.patchActivity(taskId.value, {
      title: formActivity.value.title,
      description: formActivity.value.description || '',
      priorityNumber: Number(formActivity.value.priorityNumber) || 1,
      dueDate: formActivity.value.dueDate
        ? new Date(formActivity.value.dueDate).toISOString()
        : undefined,
      monthId: month.value,
      responsibleUserIds: formActivity.value.responsibleUserIds,
    })
    if (formActivity.value.attachment) {
      const fd = new FormData()
      fd.append('file', formActivity.value.attachment)
      await activityService.postActivityAttachment(taskId.value, fd)
    }
    await InfoActivity()
    showEditActivityModal.value = false
    snackbarMessage.value = 'Atividade atualizada com sucesso'
    snackbarColor.value = 'success'
    snackbar.value = true
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao atualizar atividade'
    snackbarColor.value = 'error'
    snackbar.value = true
  } finally {
    saving.value = false
  }
}

const deleteSubtask = async (task: any) => {
  deleting.value = task.id
  try {
    await activityService.deleteActivity(task.id)
    await InfoActivity()
    showSubtaskModal.value = false
    snackbarMessage.value = 'Subtarefa deletada com sucesso'
    snackbarColor.value = 'success'
    snackbar.value = true
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao deletar subtarefa'
    snackbarColor.value = 'error'
    snackbar.value = true
  } finally {
    deleting.value = null
  }
}

const openSubtaskModal = (task: any) => {
  selectedSubtask.value = task
  editingSubtask.value = false
  formSubtask.value = {
    title: task.title,
    description: task.description || '',
    priorityNumber: task.priorityNumber ?? 1,
    dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
    responsibleUserIds: task.responsibles?.map((r: any) => r.userId) ?? [],
    attachment: null,
  }
  showSubtaskModal.value = true
}

const updateSubtask = async () => {
  if (!selectedSubtask.value || !formSubtask.value.title) return
  saving.value = true
  try {
    await activityService.patchActivity(selectedSubtask.value.id, {
      title: formSubtask.value.title,
      description: formSubtask.value.description || '',
      priorityNumber: Number(formSubtask.value.priorityNumber) || 1,
      dueDate: formSubtask.value.dueDate
        ? new Date(formSubtask.value.dueDate).toISOString()
        : undefined,
      monthId: month.value,
      parentId: taskId.value,
      responsibleUserIds: formSubtask.value.responsibleUserIds,
    })
    if (formSubtask.value.attachment) {
      const fd = new FormData()
      fd.append('file', formSubtask.value.attachment)
      await activityService.postActivityAttachment(selectedSubtask.value.id, fd)
    }
    await InfoActivity()
    showSubtaskModal.value = false
    snackbarMessage.value = 'Subtarefa atualizada com sucesso'
    snackbarColor.value = 'success'
    snackbar.value = true
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao atualizar subtarefa'
    snackbarColor.value = 'error'
    snackbar.value = true
  } finally {
    saving.value = false
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
    '#6D4C9F',
    '#7B1FA2',
    '#F57C00',
    '#0097A7',
    '#546E7A',
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
  task.status = newStatus
  try {
    await activityService.patchActivityStatus(task.id, newStatus)
    snackbarMessage.value = 'Status atualizado com sucesso'
    snackbarColor.value = 'success'
    snackbar.value = true
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao atualizar status'
    snackbarColor.value = 'error'
    snackbar.value = true
  }
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

const formatDate = (date: string | null) => {
  if (!date) return null
  return new Date(date).toLocaleDateString('pt-BR')
}

const isImage = (filename: string) => /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(filename)

const onActivityFileChange = (f: File | File[]) => {
  const file = Array.isArray(f) ? f[0] : f
  if (file && file.size > 10 * 1024 * 1024) return
  formActivity.value.attachment = file ?? null
}

const onSubtaskFileChange = (f: File | File[]) => {
  const file = Array.isArray(f) ? f[0] : f
  if (file && file.size > 10 * 1024 * 1024) return
  formSubtask.value.attachment = file ?? null
}

const deletingAttachment = ref<string | null>(null)

const deleteAttachment = async (attachmentId: string) => {
  deletingAttachment.value = attachmentId
  try {
    await activityService.deleteAttachment(attachmentId)
    await InfoActivity()
    if (selectedSubtask.value) {
      const updatedSubtask = activityInfo.value?.subtasks?.find(
        (s: any) => s.id === selectedSubtask.value.id,
      )
      if (updatedSubtask) {
        selectedSubtask.value = updatedSubtask
      }
    }
    snackbarMessage.value = 'Anexo deletado com sucesso'
    snackbarColor.value = 'success'
    snackbar.value = true
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao deletar anexo'
    snackbarColor.value = 'error'
    snackbar.value = true
  } finally {
    deletingAttachment.value = null
  }
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
              <h1 style="font-size: 20px" class="font-weight-bold text-secondary flex-grow-1">
                {{ activityInfo.title }}
              </h1>
              <v-btn
                icon="mdi-pencil-outline"
                variant="text"
                size="x-small"
                color="Secundary"
                @click="openEditActivityModal"
              />
            </div>

            <v-divider class="mb-3" />

            <div
              v-if="activityInfo.description"
              style="font-size: 15px"
              class="text-secondary"
              v-html="activityInfo.description"
            ></div>
            <div v-else style="font-size: 15px" class="text-primary-lighten font-italic">
              Sem descrição
            </div>
          </v-card-text>
        </v-card>

        <v-card v-if="subtasks.length" elevation="2" rounded="lg">
          <div
            class="d-flex justify-space-between align-center pa-3 bg-surface"
            style="border-radius: 8px 8px 0 0"
          >
            <div class="d-flex align-center ga-2">
              <v-icon color="Secundary" size="18">mdi-format-list-checks</v-icon>
              <span style="font-size: 16px" class="font-weight-bold text-secondary">
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
                  <div class="d-flex align-center justify-space-between ga-2">
                    <div
                      style="font-size: 14px; line-height: 1.4"
                      class="font-weight-medium text-secondary"
                      :class="{
                        'text-decoration-line-through text-primary-lighten': task.completed,
                      }"
                    >
                      {{ task.title }}
                    </div>
                    <v-chip
                      size="x-small"
                      class="px-2 flex-shrink-0"
                      style="height: 20px; font-size: 11px"
                      :style="{
                        backgroundColor: getPriorityColor(task.priorityNumber) + '20',
                        color: getPriorityColor(task.priorityNumber),
                      }"
                    >
                      P{{ task.priorityNumber }}
                    </v-chip>
                  </div>
                  <div
                    v-if="task.description"
                    style="font-size: 13px; line-height: 1.3"
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
                      style="height: 20px; font-size: 11px"
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
                      style="height: 20px; font-size: 11px"
                    >
                      <v-icon size="9" start>mdi-calendar-outline</v-icon>
                      {{ formatDate(task.dueDate) }}
                    </v-chip>
                  </div>
                  <div v-if="task.responsibles?.length" class="d-flex ga-1 mt-1">
                    <v-tooltip v-for="r in task.responsibles" :key="r.userId" location="top">
                      <template #activator="{ props }">
                        <v-avatar
                          v-bind="props"
                          :color="getUserColor(r.user.name)"
                          size="20"
                          style="cursor: pointer"
                        >
                          <span style="font-size: 10px; font-weight: 600; color: white">{{
                            getUserInitials(r.user.name)
                          }}</span>
                        </v-avatar>
                      </template>
                      <span style="font-size: 13px">{{ r.user.name }}</span>
                    </v-tooltip>
                  </div>
                </div>
                <v-btn
                  icon="mdi-delete-outline"
                  variant="text"
                  size="x-small"
                  color="error"
                  class="flex-shrink-0"
                  :loading="deleting === task.id"
                  @click.stop="deleteSubtask(task)"
                />
              </div>
            </div>
          </v-card-text>
        </v-card>

        <v-card v-else elevation="2" rounded="lg" class="pa-6 text-center">
          <v-icon size="40" color="primary-lighten" class="mb-2"
            >mdi-clipboard-text-off-outline</v-icon
          >
          <div style="font-size: 15px" class="text-primary-lighten mb-3">
            Nenhuma subtarefa cadastrada
          </div>
          <v-btn
            color="Secundary"
            variant="tonal"
            prepend-icon="mdi-plus"
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
              <span style="font-size: 15px" class="font-weight-bold text-secondary"
                >Informações</span
              >
            </div>

            <div class="mb-3">
              <div style="font-size: 13px" class="text-primary-lighten mb-1">Status</div>
              <v-chip size="small" variant="tonal" :color="statusConfig.color">
                <v-icon size="12" start>{{ statusConfig.icon }}</v-icon>
                {{ statusConfig.label }}
              </v-chip>
            </div>

            <div class="mb-3">
              <div style="font-size: 13px" class="text-primary-lighten mb-1">Prioridade</div>
              <v-chip size="small" variant="tonal" color="secondary">
                <v-icon size="12" start>mdi-flag-outline</v-icon>
                {{ activityInfo.priorityNumber }}
              </v-chip>
            </div>

            <div class="mb-3">
              <div style="font-size: 13px" class="text-primary-lighten mb-1">Criado em</div>
              <v-chip size="small" variant="tonal" color="secondary">
                <v-icon size="12" start>mdi-clock-outline</v-icon>
                {{ formatDate(activityInfo.createdAt) }}
              </v-chip>
            </div>

            <div v-if="activityInfo.dueDate" class="mb-3">
              <div style="font-size: 13px" class="text-primary-lighten mb-1">Data de Entrega</div>
              <v-chip size="small" variant="tonal" color="secondary" class="text-primary">
                <v-icon size="12" start>mdi-calendar-clock</v-icon>
                {{ formatDate(activityInfo.dueDate) }}
              </v-chip>
            </div>

            <div v-if="responsibles.length">
              <div style="font-size: 13px" class="text-primary-lighten mb-2">Responsáveis</div>
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
                  <span style="font-size: 13px">{{ r.user.name }}</span>
                </v-chip>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <v-card v-if="activityInfo.attachments?.length" elevation="2" rounded="lg">
          <v-card-text class="pa-3">
            <div class="d-flex align-center ga-2 mb-2">
              <v-icon color="Secundary" size="16">mdi-paperclip</v-icon>
              <span style="font-size: 15px" class="font-weight-bold text-secondary">Anexos</span>
            </div>
            <div class="d-flex flex-wrap ga-2">
              <a
                v-for="att in activityInfo.attachments"
                :key="att.id"
                :href="att.url"
                target="_blank"
                style="text-decoration: none"
              >
                <v-img
                  v-if="isImage(att.filename)"
                  :src="att.url"
                  width="80"
                  height="80"
                  cover
                  rounded="lg"
                  style="cursor: pointer"
                />
                <div
                  v-else
                  class="d-flex flex-column align-center justify-center rounded-lg"
                  style="
                    width: 80px;
                    height: 80px;
                    background: rgba(var(--v-theme-secondary), 0.08);
                    cursor: pointer;
                  "
                >
                  <v-icon size="28" color="secondary">mdi-file-outline</v-icon>
                  <span
                    style="
                      font-size: 9px;
                      color: var(--v-theme-secondary);
                      text-align: center;
                      padding: 0 4px;
                      overflow: hidden;
                      text-overflow: ellipsis;
                      white-space: nowrap;
                      max-width: 76px;
                    "
                    >{{ att.filename }}</span
                  >
                </div>
              </a>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>

  <v-container
    v-else-if="loading"
    fluid
    class="pa-4 bg-background d-flex align-center justify-center"
    style="min-height: 60vh"
  >
    <v-progress-circular indeterminate color="secondary" size="48" />
  </v-container>

  <v-container v-else fluid class="pa-4 bg-background">
    <v-card elevation="2" rounded="lg" class="pa-8 text-center">
      <v-icon size="48" color="primary-lighten" class="mb-2">mdi-alert-circle-outline</v-icon>
      <div style="font-size: 16px" class="text-primary-lighten">Tarefa não encontrada</div>
      <v-btn variant="tonal" color="primary" size="small" class="mt-4 text-none" @click="goBack">
        Voltar
      </v-btn>
    </v-card>
  </v-container>

  <v-dialog v-model="showEditActivityModal" max-width="900px">
    <v-card rounded="lg">
      <v-card-title class="d-flex justify-space-between align-center pa-4 bg-surface">
        <div class="d-flex align-center ga-2">
          <v-icon color="Secundary" size="20">mdi-pencil-outline</v-icon>
          <span class="text-subtitle-1 font-weight-bold text-secondary">Editar Atividade</span>
        </div>
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          @click="showEditActivityModal = false"
        />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4">
        <div class="d-flex ga-2 align-center">
          <v-text-field
            v-model="formActivity.title"
            label="Título *"
            density="compact"
            variant="outlined"
            color="secondary"
            hide-details
          />
          <v-btn
            color="secondary"
            prepend-icon="mdi-lightbulb-variant-outline"
            class="text-none"
            :loading="loadingSuggest"
            @click="improveWithAI"
          >
            Aprimorar com IA
          </v-btn>
        </div>

        <v-card
          v-if="suggest"
          elevation="0"
          class="mt-3 mb-3 pa-3"
          style="
            border: 2px solid rgba(var(--v-theme-secondary), 0.3);
            background: rgba(var(--v-theme-secondary), 0.05);
          "
        >
          <div class="d-flex align-center ga-2 mb-2">
            <v-icon color="secondary" size="18">mdi-sparkles</v-icon>
            <span style="font-size: 12px" class="font-weight-bold text-secondary"
              >Sugestões de IA</span
            >
          </div>

          <div v-if="suggest.improvedDescription" class="mb-2">
            <div style="font-size: 10px" class="text-primary-lighten mb-1">
              Descrição Aprimorada:
            </div>
            <div style="font-size: 11px" class="text-secondary">
              {{ suggest.improvedDescription }}
            </div>
          </div>

          <div v-if="suggest.suggestedSubtasks?.length" class="mb-2">
            <div style="font-size: 10px" class="text-primary-lighten mb-1">
              Subtarefas Sugeridas:
            </div>
            <div class="d-flex flex-column ga-1">
              <div
                v-for="(task, i) in suggest.suggestedSubtasks"
                :key="i"
                class="d-flex align-center justify-space-between pa-2 rounded"
                :style="{
                  background: isSubtaskCreated(task)
                    ? 'rgba(var(--v-theme-success), 0.1)'
                    : 'rgba(var(--v-theme-surface), 0.5)',
                  border: isSubtaskCreated(task)
                    ? '1px solid rgba(var(--v-theme-success), 0.3)'
                    : '1px solid rgba(var(--v-theme-secondary), 0.2)',
                  opacity: isSubtaskCreated(task) ? 0.7 : 1,
                }"
              >
                <div class="d-flex align-center ga-2 flex-grow-1">
                  <v-icon v-if="isSubtaskCreated(task)" size="16" color="success">
                    mdi-check-circle
                  </v-icon>
                  <span
                    style="font-size: 11px"
                    class="text-secondary"
                    :class="{ 'text-decoration-line-through': isSubtaskCreated(task) }"
                  >
                    {{ task }}
                  </span>
                </div>
                <v-btn
                  size="x-small"
                  color="secondary"
                  variant="tonal"
                  icon="mdi-plus"
                  :disabled="isSubtaskCreated(task)"
                  @click="openQuickSubtask(task)"
                />
              </div>
            </div>
          </div>

          <div v-if="suggest.suggestedPriority" class="mb-3">
            <div style="font-size: 10px" class="text-primary-lighten mb-1">
              Prioridade Sugerida:
            </div>
            <v-chip
              size="x-small"
              :color="getPriorityColor(suggest.suggestedPriority)"
              variant="tonal"
            >
              P{{ suggest.suggestedPriority }}
            </v-chip>
          </div>

          <div class="d-flex ga-2">
            <v-btn
              v-if="suggest.improvedDescription || suggest.suggestedPriority"
              size="small"
              color="success"
              prepend-icon="mdi-check"
              class="text-none"
              @click="applySuggestion"
            >
              Aplicar Sugestão
            </v-btn>
            <v-btn
              size="small"
              variant="tonal"
              color="error"
              class="text-none"
              @click="dismissSuggestion"
            >
              Descartar Tudo
            </v-btn>
          </div>
        </v-card>

        <v-textarea
          v-model="formActivity.description"
          label="Descrição"
          density="compact"
          variant="outlined"
          color="secondary"
          rows="4"
          class="mb-3 mt-3"
          hide-details
        />
        <v-row>
          <v-col cols="6">
            <v-text-field
              v-model="formActivity.priorityNumber"
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
              v-model="formActivity.dueDate"
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
          v-model="formActivity.responsibleUserIds"
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
        <div v-if="activityInfo.attachments?.length" class="mt-3 mb-1">
          <div style="font-size: 10px" class="text-primary-lighten mb-2">Anexos atuais</div>
          <div class="d-flex flex-wrap ga-2">
            <div v-for="att in activityInfo.attachments" :key="att.id" class="position-relative">
              <a :href="att.url" target="_blank" style="text-decoration: none">
                <v-img
                  v-if="isImage(att.filename)"
                  :src="att.url"
                  width="100"
                  height="100"
                  cover
                  rounded="lg"
                  style="cursor: pointer"
                />
                <div
                  v-else
                  class="d-flex flex-column align-center justify-center rounded-lg"
                  style="
                    width: 100px;
                    height: 100px;
                    background: rgba(var(--v-theme-secondary), 0.08);
                    cursor: pointer;
                  "
                >
                  <v-icon size="32" color="secondary">mdi-file-outline</v-icon>
                  <span
                    style="
                      font-size: 9px;
                      color: var(--v-theme-secondary);
                      text-align: center;
                      padding: 0 4px;
                      overflow: hidden;
                      text-overflow: ellipsis;
                      white-space: nowrap;
                      max-width: 96px;
                    "
                    >{{ att.filename }}</span
                  >
                </div>
              </a>
              <v-btn
                icon="mdi-close"
                size="x-small"
                color="error"
                variant="flat"
                style="position: absolute; top: -8px; right: -8px"
                :loading="deletingAttachment === att.id"
                @click.stop="deleteAttachment(att.id)"
              />
            </div>
          </div>
        </div>
        <v-file-input
          label="Adicionar anexo"
          density="compact"
          variant="outlined"
          color="secondary"
          prepend-icon=""
          prepend-inner-icon="mdi-paperclip"
          accept="*/*"
          hide-details
          class="mt-3"
          @update:model-value="onActivityFileChange"
        />
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn
          variant="text"
          color="secondary"
          class="text-none"
          @click="showEditActivityModal = false"
          >Cancelar</v-btn
        >
        <v-btn
          variant="tonal"
          color="Secundary"
          class="text-none"
          :disabled="!formActivity.title"
          :loading="saving"
          @click="updateActivity"
          >Salvar</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>

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
        <v-file-input
          label="Anexo"
          density="compact"
          variant="outlined"
          color="secondary"
          prepend-icon=""
          prepend-inner-icon="mdi-paperclip"
          accept="*/*"
          hide-details
          class="mt-3"
          @update:model-value="onSubtaskFileChange"
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
          color="Secundary"
          class="text-none"
          :disabled="!formSubtask.title"
          @click="createSubtask"
          :loading="saving"
          >Criar</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showSubtaskModal" max-width="900px">
    <v-card v-if="selectedSubtask" rounded="lg">
      <v-card-title class="d-flex justify-space-between align-center pa-4 bg-surface">
        <div class="d-flex align-center ga-2">
          <v-icon color="Secundary" size="20">mdi-checkbox-marked-circle-outline</v-icon>
          <span class="text-subtitle-1 font-weight-bold text-secondary">Detalhes da Subtarefa</span>
        </div>
        <div class="d-flex align-center ga-1 flex-shrink-0">
          <v-btn
            :icon="editingSubtask ? 'mdi-close' : 'mdi-pencil-outline'"
            variant="text"
            size="small"
            @click="editingSubtask = !editingSubtask"
          />
          <v-btn
            icon="mdi-delete-outline"
            variant="text"
            size="small"
            color="error"
            :loading="deleting === selectedSubtask?.id"
            @click="deleteSubtask(selectedSubtask)"
          />
          <v-btn icon="mdi-close" variant="text" size="small" @click="showSubtaskModal = false" />
        </div>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4">
        <template v-if="!editingSubtask">
          <div class="mb-3">
            <div style="font-size: 10px" class="text-primary-lighten mb-1">Título</div>
            <div style="font-size: 14px" class="font-weight-bold text-secondary">
              {{ selectedSubtask.title }}
            </div>
          </div>

          <div class="d-flex ga-2 mb-3">
            <v-chip
              size="small"
              :color="getStatusConfig(selectedSubtask.status).color"
              variant="tonal"
            >
              <v-icon size="14" start>{{ getStatusConfig(selectedSubtask.status).icon }}</v-icon>
              {{ getStatusConfig(selectedSubtask.status).label }}
            </v-chip>
            <v-chip size="small" variant="tonal" color="secondary">
              <v-icon size="12" start>mdi-flag-outline</v-icon>
              {{ selectedSubtask.priorityNumber }}
            </v-chip>
          </div>

          <div v-if="selectedSubtask.description" class="mb-4">
            <div style="font-size: 10px" class="text-primary-lighten mb-1">Descrição</div>
            <div
              style="font-size: 12px"
              class="text-secondary"
              v-html="selectedSubtask.description"
            />
          </div>

          <div v-if="selectedSubtask.attachments?.length" class="mb-4">
            <div style="font-size: 10px" class="text-primary-lighten mb-2">Anexos</div>
            <div class="d-flex flex-wrap ga-2">
              <div
                v-for="att in selectedSubtask.attachments"
                :key="att.id"
                class="position-relative"
              >
                <a :href="att.url" target="_blank" style="text-decoration: none">
                  <v-img
                    v-if="isImage(att.filename)"
                    :src="att.url"
                    width="100"
                    height="100"
                    cover
                    rounded="lg"
                    style="cursor: pointer"
                  />
                  <div
                    v-else
                    class="d-flex flex-column align-center justify-center rounded-lg"
                    style="
                      width: 100px;
                      height: 100px;
                      background: rgba(var(--v-theme-secondary), 0.08);
                      cursor: pointer;
                    "
                  >
                    <v-icon size="32" color="secondary">mdi-file-outline</v-icon>
                    <span
                      style="
                        font-size: 9px;
                        color: var(--v-theme-secondary);
                        text-align: center;
                        padding: 0 4px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        max-width: 96px;
                      "
                      >{{ att.filename }}</span
                    >
                  </div>
                </a>
                <v-btn
                  icon="mdi-close"
                  size="x-small"
                  color="error"
                  variant="flat"
                  style="position: absolute; top: -8px; right: -8px"
                  :loading="deletingAttachment === att.id"
                  @click.stop="deleteAttachment(att.id)"
                />
              </div>
            </div>
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
          <div v-if="selectedSubtask.attachments?.length" class="mt-3 mb-1">
            <div style="font-size: 10px" class="text-primary-lighten mb-2">Anexos atuais</div>
            <div class="d-flex flex-wrap ga-2">
              <div
                v-for="att in selectedSubtask.attachments"
                :key="att.id"
                class="position-relative"
              >
                <a :href="att.url" target="_blank" style="text-decoration: none">
                  <v-img
                    v-if="isImage(att.filename)"
                    :src="att.url"
                    width="100"
                    height="100"
                    cover
                    rounded="lg"
                    style="cursor: pointer"
                  />
                  <div
                    v-else
                    class="d-flex flex-column align-center justify-center rounded-lg"
                    style="
                      width: 100px;
                      height: 100px;
                      background: rgba(var(--v-theme-secondary), 0.08);
                      cursor: pointer;
                    "
                  >
                    <v-icon size="32" color="secondary">mdi-file-outline</v-icon>
                    <span
                      style="
                        font-size: 9px;
                        color: var(--v-theme-secondary);
                        text-align: center;
                        padding: 0 4px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        max-width: 96px;
                      "
                      >{{ att.filename }}</span
                    >
                  </div>
                </a>
                <v-btn
                  icon="mdi-close"
                  size="x-small"
                  color="error"
                  variant="flat"
                  style="position: absolute; top: -8px; right: -8px"
                  :loading="deletingAttachment === att.id"
                  @click.stop="deleteAttachment(att.id)"
                />
              </div>
            </div>
          </div>
          <v-file-input
            label="Adicionar anexo"
            density="compact"
            variant="outlined"
            color="secondary"
            prepend-icon=""
            prepend-inner-icon="mdi-paperclip"
            accept="*/*"
            hide-details
            class="mt-3"
            @update:model-value="onSubtaskFileChange"
          />
        </template>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />
        <template v-if="editingSubtask">
          <v-btn variant="text" color="secondary" class="text-none" @click="editingSubtask = false"
            >Cancelar</v-btn
          >
          <v-btn
            variant="tonal"
            color="Secundary"
            class="text-none"
            :disabled="!formSubtask.title"
            :loading="saving"
            @click="updateSubtask"
            >Salvar</v-btn
          >
        </template>
        <v-btn
          v-else
          variant="tonal"
          color="secondary"
          class="text-none"
          @click="showSubtaskModal = false"
          >Fechar</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showQuickSubtaskModal" max-width="400px">
    <v-card rounded="lg">
      <v-card-title class="d-flex justify-space-between align-center pa-4 bg-surface">
        <div class="d-flex align-center ga-2">
          <v-icon color="secondary" size="18">mdi-sparkles</v-icon>
          <span style="font-size: 13px" class="font-weight-bold text-secondary"
            >Criar Subtarefa</span
          >
        </div>
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          @click="showQuickSubtaskModal = false"
        />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4">
        <v-text-field
          v-model="quickSubtaskTitle"
          label="Título da Subtarefa"
          density="compact"
          variant="outlined"
          color="secondary"
          hide-details
          autofocus
        />
        <div style="font-size: 10px" class="text-primary-lighten mt-2">
          Você poderá editar mais detalhes após criar
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn
          variant="text"
          color="secondary"
          class="text-none"
          @click="showQuickSubtaskModal = false"
        >
          Cancelar
        </v-btn>
        <v-btn
          variant="tonal"
          color="secondary"
          class="text-none"
          prepend-icon="mdi-plus"
          :disabled="!quickSubtaskTitle"
          :loading="saving"
          @click="createQuickSubtask"
        >
          Criar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="3000" location="top">
    {{ snackbarMessage }}
    <template #actions>
      <v-btn color="white" variant="text" @click="snackbar = false"> Fechar </v-btn>
    </template>
  </v-snackbar>
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
