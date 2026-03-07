<script setup lang="ts">
import { ref } from 'vue'
import { useTasks } from '@/features/tasks/useTasks'
import type { SubTask } from '@/core/types'

const emit = defineEmits<{ close: [], taskAdded: [] }>()
const { companies, addActivity } = useTasks()

const form = ref({
  title: '',
  description: '',
  companyId: '',
  status: 'todo' as const,
  assignees: [] as string[],
  dueDate: '',
  attachments: [] as string[],
  tasks: [] as SubTask[]
})

const newAssignee = ref('')
const newSubTask = ref({
  title: '',
  description: '',
  assignees: [] as string[],
  dueDate: '',
  attachments: [] as string[]
})
const newSubTaskAssignee = ref('')

const valid = ref(false)
const required = (v: string) => !!v || 'Obrigatório'

const addAssignee = () => {
  if (newAssignee.value.trim()) {
    form.value.assignees.push(newAssignee.value.trim())
    newAssignee.value = ''
  }
}

const removeAssignee = (index: number) => {
  form.value.assignees.splice(index, 1)
}

const addSubTaskAssignee = () => {
  if (newSubTaskAssignee.value.trim()) {
    newSubTask.value.assignees.push(newSubTaskAssignee.value.trim())
    newSubTaskAssignee.value = ''
  }
}

const removeSubTaskAssignee = (index: number) => {
  newSubTask.value.assignees.splice(index, 1)
}

const addSubTask = () => {
  if (newSubTask.value.title && newSubTask.value.description) {
    form.value.tasks.push({
      id: Date.now().toString(),
      ...newSubTask.value,
      completed: false
    })
    newSubTask.value = {
      title: '',
      description: '',
      assignees: [],
      dueDate: '',
      attachments: []
    }
  }
}

const removeSubTask = (index: number) => {
  form.value.tasks.splice(index, 1)
}

const submit = () => {
  if (form.value.title.trim()) {
    const currentDate = new Date()
    addActivity({
      ...form.value,
      month: currentDate.toISOString().slice(0, 7)
    })
    emit('taskAdded')
    emit('close')
  }
}
</script>

<template>
  <v-card elevation="8" rounded="xl" color="primary">
    <v-sheet color="secondary" class="pa-6">
      <div class="d-flex justify-space-between align-center">
        <h2 style="font-size: 17px" class="font-weight-bold text-primary">Nova Atividade</h2>
        <v-btn icon="mdi-close" variant="text" color="primary" @click="emit('close')" />
      </div>
    </v-sheet>

    <v-card-text class="pa-6" style="max-height: 60vh; overflow-y: auto">
      <v-form v-model="valid">
        <v-select
          v-model="form.companyId"
          :items="companies"
          item-title="name"
          item-value="id"
          label="Empresa"
          variant="outlined"
          rounded="lg"
          color="primary"
          bg-color="primary"
          density="comfortable"
          prepend-inner-icon="mdi-domain"
        />
        
        <v-text-field
          v-model="form.title"
          label="Título *"
          :rules="[required]"
          variant="outlined"
          rounded="lg"
          color="primary"
          bg-color="primary"
          density="comfortable"
          prepend-inner-icon="mdi-text"
          class="mt-4"
        />
        
        <v-textarea
          v-model="form.description"
          label="Descrição"
          rows="3"
          variant="outlined"
          rounded="lg"
          color="primary"
          bg-color="primary"
          density="comfortable"
          prepend-inner-icon="mdi-text-box-outline"
          class="mt-4"
        />

        <div class="mt-4">
          <label style="font-size: 12px" class="font-weight-medium text-secondary mb-2 d-block">Responsáveis</label>
          <div class="d-flex ga-2 mb-3">
            <v-text-field
              v-model="newAssignee"
              placeholder="Nome do responsável"
              variant="outlined"
              rounded="lg"
              color="primary"
              bg-color="primary"
              density="comfortable"
              hide-details
              prepend-inner-icon="mdi-account-outline"
              @keyup.enter="addAssignee"
            />
            <v-btn
              color="primary"
              rounded="lg"
              class="text-none"
              @click="addAssignee"
            >
              Adicionar
            </v-btn>
          </div>
          <div class="d-flex flex-wrap ga-2">
            <v-chip
              v-for="(assignee, i) in form.assignees"
              :key="i"
              closable
              color="surface"
              class="text-primary-lighten"
              @click:close="removeAssignee(i)"
            >
              <v-icon start size="16">mdi-account</v-icon>
              {{ assignee }}
            </v-chip>
          </div>
        </div>
        
        <v-text-field
          v-model="form.dueDate"
          label="Data de Entrega"
          type="date"
          variant="outlined"
          rounded="lg"
          color="primary"
          bg-color="primary"
          density="comfortable"
          prepend-inner-icon="mdi-calendar-outline"
          class="mt-4"
        />

        <v-divider class="my-6" />
        
        <h3 style="font-size: 13px" class="font-weight-bold text-secondary mb-4">
          <v-icon size="19" class="mr-1">mdi-checkbox-marked-outline</v-icon>
          Subtarefas
        </h3>
        
        <v-card color="surface" elevation="0" rounded="lg" class="pa-4 mb-4">
          <v-text-field
            v-model="newSubTask.title"
            label="Título da Subtarefa"
            variant="outlined"
            rounded="lg"
            color="primary"
            bg-color="primary"
            density="comfortable"
          />
          <v-textarea
            v-model="newSubTask.description"
            label="Descrição"
            rows="2"
            variant="outlined"
            rounded="lg"
            color="primary"
            bg-color="primary"
            density="comfortable"
            class="mt-3"
          />
          <div class="mt-3">
            <div class="d-flex ga-2 mb-2">
              <v-text-field
                v-model="newSubTaskAssignee"
                placeholder="Responsável"
                variant="outlined"
                rounded="lg"
                color="primary"
                bg-color="primary"
                density="comfortable"
                hide-details
                @keyup.enter="addSubTaskAssignee"
              />
              <v-btn
                icon="mdi-plus"
                color="primary"
                size="small"
                @click="addSubTaskAssignee"
              />
            </div>
            <div class="d-flex flex-wrap ga-2">
              <v-chip
                v-for="(assignee, i) in newSubTask.assignees"
                :key="i"
                closable
                size="small"
                color="surface"
                @click:close="removeSubTaskAssignee(i)"
              >
                {{ assignee }}
              </v-chip>
            </div>
          </div>
          <v-text-field
            v-model="newSubTask.dueDate"
            label="Data"
            type="date"
            variant="outlined"
            rounded="lg"
            color="primary"
            bg-color="primary"
            density="comfortable"
            class="mt-3"
          />
          <v-btn
            block
            color="primary"
            rounded="lg"
            class="text-none mt-3"
            prepend-icon="mdi-plus"
            @click="addSubTask"
          >
            Adicionar Subtarefa
          </v-btn>
        </v-card>

        <div v-if="form.tasks.length" class="mt-4">
          <v-card
            v-for="(task, i) in form.tasks"
            :key="task.id"
            color="surface"
            elevation="0"
            rounded="lg"
            class="pa-4 mb-3"
          >
            <div class="d-flex justify-space-between align-start">
              <div>
                <div style="font-size: 12px" class="font-weight-semibold text-secondary mb-1">
                  {{ task.title }}
                </div>
                <div style="font-size: 11px" class="text-primary-lighten">
                  {{ task.description }}
                </div>
                <div v-if="task.assignees.length" class="d-flex flex-wrap ga-1 mt-2">
                  <v-chip
                    v-for="assignee in task.assignees"
                    :key="assignee"
                    size="x-small"
                    color="surface"
                  >
                    {{ assignee }}
                  </v-chip>
                </div>
              </div>
              <v-btn
                icon="mdi-delete"
                size="small"
                variant="text"
                color="error"
                @click="removeSubTask(i)"
              />
            </div>
          </v-card>
        </div>
      </v-form>
    </v-card-text>

    <v-divider />

    <v-card-actions class="pa-6">
      <v-spacer />
      <v-btn
        variant="outlined"
        rounded="lg"
        class="text-none"
        @click="emit('close')"
      >
        Cancelar
      </v-btn>
      <v-btn
        color="secondary"
        rounded="lg"
        class="text-none text-primary"
        elevation="2"
        :disabled="!form.title.trim()"
        @click="submit"
      >
        Salvar Atividade
      </v-btn>
    </v-card-actions>
  </v-card>
</template>
