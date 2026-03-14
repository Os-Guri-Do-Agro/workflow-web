<script setup lang="ts">
import { ref, onMounted } from 'vue'
import companyVariableService from '../../service/companies/variables/variables-services'

interface Variable {
  id?: string
  key: string
  value: string
  description: string
  type: 'TEXT' | 'SECRET' | 'URL'
}

const variables = ref<Variable[]>([])
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const showModal = ref(false)
const showDeleteDialog = ref(false)
const variableToDelete = ref<string | null>(null)
const editingVariable = ref<Variable | null>(null)
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref('error')

const formData = ref<Variable>({
  key: '',
  value: '',
  description: '',
  type: 'TEXT',
})

const typeOptions = [
  { title: 'Texto', value: 'TEXT' },
  { title: 'URL', value: 'URL' },
  { title: 'Secreto', value: 'SECRET' },
]

const loadVariables = async () => {
  loading.value = true
  try {
    variables.value = await companyVariableService.getCompanyVariables()
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao carregar variáveis'
    snackbarColor.value = 'error'
    snackbar.value = true
  } finally {
    loading.value = false
  }
}

const openModal = (variable?: Variable) => {
  if (variable) {
    editingVariable.value = variable
    formData.value = { ...variable }
  } else {
    editingVariable.value = null
    formData.value = { key: '', value: '', description: '', type: 'TEXT' }
  }
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
  editingVariable.value = null
  formData.value = { key: '', value: '', description: '', type: 'TEXT' }
}

const saveVariable = async () => {
  saving.value = true
  try {
    if (editingVariable.value?.id) {
      await companyVariableService.patchCompanyVariable(editingVariable.value.id, formData.value)
      snackbarMessage.value = 'Variável atualizada com sucesso'
    } else {
      await companyVariableService.postCompanyVariable(formData.value)
      snackbarMessage.value = 'Variável criada com sucesso'
    }
    snackbarColor.value = 'success'
    snackbar.value = true
    await loadVariables()
    closeModal()
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao salvar variável'
    snackbarColor.value = 'error'
    snackbar.value = true
  } finally {
    saving.value = false
  }
}

const confirmDelete = (id: string) => {
  variableToDelete.value = id
  showDeleteDialog.value = true
}

const deleteVariable = async () => {
  if (!variableToDelete.value) return
  deleting.value = true
  try {
    await companyVariableService.deleteCompanyVariable(variableToDelete.value)
    await loadVariables()
    showDeleteDialog.value = false
    variableToDelete.value = null
    snackbarMessage.value = 'Variável excluída com sucesso'
    snackbarColor.value = 'success'
    snackbar.value = true
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao deletar variável'
    snackbarColor.value = 'error'
    snackbar.value = true
  } finally {
    deleting.value = false
  }
}

const openUrl = (url: string) => {
  window.open(url, '_blank')
}

onMounted(loadVariables)
</script>

<template>
  <v-container fluid class="pa-4 bg-background">
    <v-sheet color="transparent" class="mb-4">
      <div class="d-flex align-center justify-space-between">
        <div>
          <h1 style="font-size: 16px" class="font-weight-bold text-secondary mb-1">
            Variáveis da Empresa
          </h1>
          <div class="d-flex align-center" style="font-size: 11px; color: var(--v-primary-lighten)">
            <v-icon size="11" class="mr-1">mdi-note-text</v-icon>
            Gerencie as variáveis e anotações
          </div>
        </div>
        <v-btn color="secondary" size="small" prepend-icon="mdi-plus" @click="openModal()">
          Nova Variável
        </v-btn>
      </div>
    </v-sheet>

    <v-progress-linear v-if="loading" indeterminate color="secondary" class="mb-4" />

    <div
      v-if="!loading && variables.length === 0"
      class="d-flex flex-column align-center justify-center pa-8"
    >
      <v-icon size="64" color="primary-lighten" class="mb-3">mdi-note-text-outline</v-icon>
      <span style="font-size: 14px" class="text-primary-lighten font-weight-medium"
        >Nenhuma variável cadastrada</span
      >
    </div>

    <v-row v-else class="ma-0">
      <v-col v-for="variable in variables" :key="variable.id" cols="12" md="6" lg="4" class="pa-2">
        <v-card
          color="primary"
          elevation="1"
          rounded="lg"
          hover
          :style="{ cursor: variable.type === 'URL' ? 'pointer' : 'default' }"
          @click="variable.type === 'URL' ? openUrl(variable.value) : null"
        >
          <v-card-text class="pa-4">
            <div class="d-flex align-center justify-space-between mb-3">
              <v-chip size="small" variant="flat" color="secondary">
                {{ variable.type }}
              </v-chip>
              <div class="d-flex ga-1">
                <v-btn
                  icon="mdi-pencil"
                  size="x-small"
                  variant="text"
                  @click.stop="openModal(variable)"
                />
                <v-btn
                  icon="mdi-delete"
                  size="x-small"
                  variant="text"
                  color="error"
                  @click.stop="confirmDelete(variable.id!)"
                />
              </div>
            </div>
            <div style="font-size: 14px" class="font-weight-bold text-secondary mb-2">
              {{ variable.key }}
            </div>
            <div style="font-size: 11px" class="text-primary-lighten mb-3">
              {{ variable.description }}
            </div>
            <v-sheet color="surface" rounded="lg" class="pa-2">
              <div style="font-size: 12px; font-family: monospace" class="text-secondary">
                {{ variable.value }}
              </div>
            </v-sheet>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog v-model="showModal" max-width="600">
      <v-card rounded="lg">
        <v-card-title class="bg-primary text-secondary pa-4">
          <v-icon start>mdi-note-text</v-icon>
          {{ editingVariable ? 'Editar' : 'Nova' }} Variável
        </v-card-title>
        <v-card-text class="pa-6">
          <v-form @submit.prevent="saveVariable">
            <v-text-field
              v-model="formData.key"
              label="Chave"
              prepend-inner-icon="mdi-key"
              variant="outlined"
              required
              class="mb-4"
            />
            <v-text-field
              v-model="formData.value"
              label="Valor"
              prepend-inner-icon="mdi-text"
              variant="outlined"
              required
              class="mb-4"
            />
            <v-textarea
              v-model="formData.description"
              label="Descrição"
              prepend-inner-icon="mdi-information"
              variant="outlined"
              required
              rows="3"
              class="mb-4"
            />
            <v-select
              v-model="formData.type"
              :items="typeOptions"
              label="Tipo"
              prepend-inner-icon="mdi-format-list-bulleted-type"
              variant="outlined"
              required
            />
          </v-form>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="closeModal" :disabled="saving">Cancelar</v-btn>
          <v-btn color="secondary" @click="saveVariable" :loading="saving">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showDeleteDialog" max-width="400">
      <v-card rounded="lg">
        <v-card-title class="bg-error text-white pa-4">
          <v-icon start>mdi-alert</v-icon>
          Confirmar Exclusão
        </v-card-title>
        <v-card-text class="pa-6">
          <p>Deseja realmente excluir esta variável?</p>
          <p class="text-caption text-primary-lighten mt-2">Esta ação não pode ser desfeita.</p>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="showDeleteDialog = false" :disabled="deleting">Cancelar</v-btn>
          <v-btn color="error" @click="deleteVariable" :loading="deleting">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="3000" location="top">
      {{ snackbarMessage }}
      <template #actions>
        <v-btn color="white" variant="text" @click="snackbar = false">
          Fechar
        </v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>
