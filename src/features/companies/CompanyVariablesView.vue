<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import companyVariableService from '../../service/companies/variables/variables-services'
import { useToast } from '@/composables/useToast'

interface VariableField {
  key: string
  value: string
  type: 'TEXT' | 'SECRET' | 'URL'
}

interface Variable {
  id?: string
  name: string
  description: string
  imageUrl: string
  fields: VariableField[]
}

const variables = ref<Variable[]>([])
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const uploadingImage = ref(false)
const showModal = ref(false)
const showDeleteDialog = ref(false)
const variableToDelete = ref<string | null>(null)
const editingVariable = ref<Variable | null>(null)
const editingId = ref<string | null>(null)
const expandedVariables = ref<Set<string>>(new Set())
const { success: showSuccess, error: showError } = useToast()
const search = ref('')
const revealedSecrets = ref<Set<string>>(new Set())
const selectedFile = ref<File | null>(null)
const imagePreview = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const formData = ref<Variable>({
  name: '',
  description: '',
  imageUrl: '',
  fields: [{ key: '', value: '', type: 'TEXT' }],
})

const typeConfig: Record<string, { label: string; icon: string; color: string }> = {
  TEXT: { label: 'Texto', icon: 'mdi-text-box-outline', color: '#3B82F6' },
  URL: { label: 'URL', icon: 'mdi-link-variant', color: '#10B981' },
  SECRET: { label: 'Secreto', icon: 'mdi-shield-key-outline', color: '#8B5CF6' },
}

const filteredVariables = computed(() => {
  if (!search.value.trim()) return variables.value
  const q = search.value.toLowerCase()
  return variables.value.filter(
    (v) =>
      v.name.toLowerCase().includes(q) ||
      v.description.toLowerCase().includes(q) ||
      v.fields.some(f => f.key.toLowerCase().includes(q)),
  )
})

const isRevealed = (fieldId: string) => revealedSecrets.value.has(fieldId)

const toggleReveal = (fieldId: string) => {
  if (revealedSecrets.value.has(fieldId)) {
    revealedSecrets.value.delete(fieldId)
  } else {
    revealedSecrets.value.add(fieldId)
  }
  revealedSecrets.value = new Set(revealedSecrets.value)
}

const isExpanded = (id: string) => expandedVariables.value.has(id)

const toggleExpand = (id: string) => {
  if (expandedVariables.value.has(id)) {
    expandedVariables.value.delete(id)
  } else {
    expandedVariables.value.add(id)
  }
  expandedVariables.value = new Set(expandedVariables.value)
}

const maskedValue = (field: VariableField, fieldIdx: number, varId?: string) => {
  if (field.type !== 'SECRET') return field.value
  const key = `${varId}-${fieldIdx}`
  return isRevealed(key) ? field.value : '•'.repeat(Math.min(field.value.length, 20))
}

const loadVariables = async () => {
  loading.value = true
  try {
    variables.value = await companyVariableService.getCompanyVariables()
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao carregar variáveis')
  } finally {
    loading.value = false
  }
}

const openModal = (variable?: Variable) => {
  selectedFile.value = null
  imagePreview.value = null
  if (variable) {
    editingVariable.value = variable
    editingId.value = variable.id || null
    formData.value = {
      name: variable.name,
      description: variable.description,
      imageUrl: variable.imageUrl || '',
      fields: variable.fields.length > 0 
        ? [...variable.fields] 
        : [{ key: '', value: '', type: 'TEXT' }],
    }
    if (variable.imageUrl) {
      imagePreview.value = variable.imageUrl
    }
  } else {
    editingVariable.value = null
    editingId.value = null
    formData.value = {
      name: '',
      description: '',
      imageUrl: '',
      fields: [{ key: '', value: '', type: 'TEXT' }],
    }
  }
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
  editingVariable.value = null
  editingId.value = null
  selectedFile.value = null
  imagePreview.value = null
  formData.value = { name: '', description: '', imageUrl: '', fields: [{ key: '', value: '', type: 'TEXT' }] }
}

const addField = () => {
  formData.value.fields.push({ key: '', value: '', type: 'TEXT' })
}

const removeField = (index: number) => {
  formData.value.fields.splice(index, 1)
  if (formData.value.fields.length === 0) {
    formData.value.fields.push({ key: '', value: '', type: 'TEXT' })
  }
}

const saveVariable = async () => {
  saving.value = true
  try {
    // Filter out empty fields
    const validFields = formData.value.fields.filter(f => f.key.trim() && f.value.trim())
    if (validFields.length === 0) {
      showError('Adicione pelo menos um campo com chave e valor')
      return
    }

    const payload = {
      name: formData.value.name,
      description: formData.value.description,
      fields: validFields,
    }

    let savedId = editingId.value

    if (editingId.value) {
      await companyVariableService.patchCompanyVariable(editingId.value, payload)
      showSuccess('Variável atualizada')
    } else {
      const created = await companyVariableService.postCompanyVariable(payload)
      savedId = created.id
      showSuccess('Variável criada')
    }

    // Upload image if selected
    if (selectedFile.value && savedId) {
      uploadingImage.value = true
      await companyVariableService.uploadVariableImage(savedId, selectedFile.value)
      showSuccess('Imagem enviada')
    }

    await loadVariables()
    closeModal()
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao salvar variável')
  } finally {
    saving.value = false
    uploadingImage.value = false
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
    showSuccess('Variável excluída')
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao deletar variável')
  } finally {
    deleting.value = false
  }
}

const openUrl = (url: string) => window.open(url, '_blank')

const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    selectedFile.value = file
    const reader = new FileReader()
    reader.onload = (e) => {
      imagePreview.value = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }
}

const removeImage = () => {
  selectedFile.value = null
  imagePreview.value = null
  formData.value.imageUrl = ''
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const getInitials = (name: string) => {
  return name.slice(0, 2).toUpperCase()
}

const getRandomColor = (name: string) => {
  const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#8B5A2B']
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

onMounted(loadVariables)
</script>

<template>
  <div class="vars-page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Variáveis</h1>
        <p class="page-subtitle">Credenciais, URLs e configurações da empresa</p>
      </div>
      <v-btn
        variant="flat"
        size="default"
        prepend-icon="mdi-plus"
        class="new-btn"
        @click="openModal()"
      >
        Nova Variável
      </v-btn>
    </div>

    <!-- Search -->
    <div class="search-bar">
      <v-icon size="16" class="search-icon">mdi-magnify</v-icon>
      <input
        v-model="search"
        type="text"
        placeholder="Buscar variáveis..."
        class="search-input"
      />
      <button v-if="search" class="search-clear" @click="search = ''">
        <v-icon size="14">mdi-close</v-icon>
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="var-grid">
      <div v-for="i in 6" :key="i" class="var-skeleton" />
    </div>

    <!-- Empty state -->
    <div v-else-if="filteredVariables.length === 0" class="empty-state">
      <v-icon size="48" color="grey-darken-1">mdi-shield-key-outline</v-icon>
      <p class="empty-title">
        {{ search ? 'Nenhum resultado encontrado' : 'Nenhuma variável cadastrada' }}
      </p>
      <p class="empty-sub">
        {{ search ? 'Tente outro termo de busca' : 'Adicione credenciais e URLs da sua empresa' }}
      </p>
    </div>

    <!-- Grid -->
    <div v-else class="var-grid">
      <div
        v-for="variable in filteredVariables"
        :key="variable.id"
        class="var-card"
      >
        <!-- Card Header with Image -->
        <div class="var-header" :style="{ backgroundColor: getRandomColor(variable.name) + '15' }">
          <div class="var-image-section">
            <img v-if="variable.imageUrl" :src="variable.imageUrl" class="var-image" />
            <div v-else class="var-avatar" :style="{ backgroundColor: getRandomColor(variable.name) }">
              {{ getInitials(variable.name) }}
            </div>
          </div>
          <div class="var-header-info">
            <h3 class="var-name">{{ variable.name }}</h3>
            <p v-if="variable.description" class="var-desc">{{ variable.description }}</p>
          </div>
          <div class="var-actions" @click.stop>
            <button class="icon-btn" @click.stop="openModal(variable)">
              <v-icon size="14">mdi-pencil-outline</v-icon>
            </button>
            <button class="icon-btn icon-btn--danger" @click.stop="confirmDelete(variable.id!)">
              <v-icon size="14">mdi-delete-outline</v-icon>
            </button>
          </div>
        </div>

        <!-- Fields Preview -->
        <div class="var-fields">
          <div
            v-for="(field, idx) in isExpanded(variable.id!) ? variable.fields : variable.fields.slice(0, 2)"
            :key="idx"
            class="field-row"
          >
            <div class="field-info">
              <span class="field-key">{{ field.key }}</span>
              <div class="field-value-row">
                <code class="field-value" :class="{ 'field-value--url': field.type === 'URL' }">
                  {{ maskedValue(field, idx, variable.id) }}
                </code>
                <div class="field-actions">
                  <button
                    v-if="field.type === 'SECRET'"
                    class="icon-btn"
                    @click.stop="toggleReveal(`${variable.id}-${idx}`)"
                  >
                    <v-icon size="13">
                      {{ isRevealed(`${variable.id}-${idx}`) ? 'mdi-eye-off-outline' : 'mdi-eye-outline' }}
                    </v-icon>
                  </button>
                  <button
                    v-if="field.type === 'URL'"
                    class="icon-btn"
                    @click.stop="openUrl(field.value)"
                  >
                    <v-icon size="13">mdi-open-in-new</v-icon>
                  </button>
                  <v-icon
                    size="14"
                    :color="typeConfig[field?.type || 'TEXT']?.color"
                    :title="typeConfig[field?.type || 'TEXT']?.label"
                  >
                    {{ typeConfig[field?.type || 'TEXT']?.icon }}
                  </v-icon>
                </div>
              </div>
            </div>
          </div>

          <!-- Expand button if more fields -->
          <button
            v-if="variable.fields.length > 2"
            class="expand-btn"
            @click="toggleExpand(variable.id!)"
          >
            <v-icon size="14">
              {{ isExpanded(variable.id!) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
            </v-icon>
            {{ isExpanded(variable.id!) ? 'Ver menos' : `Ver mais ${variable.fields.length - 2} campos` }}
          </button>
        </div>
      </div>
    </div>

    <!-- ─── Create / Edit dialog ─── -->
    <v-dialog v-model="showModal" max-width="600" :scrim-opacity="0.6">
      <v-card class="dialog-card" rounded="xl">
        <div class="dialog-header">
          <span class="dialog-title-text">{{ editingVariable ? 'Editar Variável' : 'Nova Variável' }}</span>
          <v-btn icon size="small" variant="text" @click="closeModal" :disabled="saving">
            <v-icon size="18">mdi-close</v-icon>
          </v-btn>
        </div>
        <div class="dialog-body">
          <!-- Basic Info -->
          <v-text-field
            v-model="formData.name"
            label="Nome da Variável"
            variant="outlined"
            density="comfortable"
            rounded="lg"
            prepend-inner-icon="mdi-tag-outline"
            class="mb-3"
            placeholder="ex: aws_credentials"
          />
          <!-- Image Upload Section -->
          <div class="image-upload-section mb-3">
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              style="display: none"
              @change="handleFileChange"
            />
            <div v-if="imagePreview" class="image-preview-container">
              <img :src="imagePreview" class="image-preview" />
              <button class="image-remove-btn" @click="removeImage">
                <v-icon size="14">mdi-close</v-icon>
              </button>
            </div>
            <v-btn
              v-else
              variant="outlined"
              size="small"
              prepend-icon="mdi-camera"
              @click="triggerFileInput"
              class="upload-btn"
            >
              Adicionar imagem
            </v-btn>
          </div>
          <v-textarea
            v-model="formData.description"
            label="Descrição (opcional)"
            variant="outlined"
            density="comfortable"
            rounded="lg"
            rows="2"
            class="mb-4"
          />

          <!-- Fields Section -->
          <div class="fields-section">
            <div class="fields-header">
              <span class="fields-title">Campos</span>
              <v-btn
                size="small"
                variant="text"
                prepend-icon="mdi-plus"
                @click="addField"
              >
                Adicionar campo
              </v-btn>
            </div>

            <div
              v-for="(field, idx) in formData.fields"
              :key="idx"
              class="field-input-row"
            >
              <v-text-field
                v-model="field.key"
                label="Chave"
                variant="outlined"
                density="compact"
                rounded="lg"
                hide-details
                class="field-input-key"
                placeholder="ex: email"
              />
              <v-text-field
                v-model="field.value"
                label="Valor"
                variant="outlined"
                density="compact"
                rounded="lg"
                hide-details
                class="field-input-value"
                :type="field.type === 'SECRET' ? 'password' : 'text'"
              />
              <v-select
                v-model="field.type"
                :items="[
                  { title: 'Texto', value: 'TEXT' },
                  { title: 'URL', value: 'URL' },
                  { title: 'Secreto', value: 'SECRET' },
                ]"
                variant="outlined"
                density="compact"
                rounded="lg"
                hide-details
                class="field-input-type"
              />
              <v-btn
                icon
                size="small"
                variant="text"
                color="error"
                @click="removeField(idx)"
              >
                <v-icon size="18">mdi-delete-outline</v-icon>
              </v-btn>
            </div>
          </div>
        </div>
        <div class="dialog-actions">
          <v-btn variant="text" size="small" @click="closeModal" :disabled="saving">Cancelar</v-btn>
          <v-spacer />
          <v-btn variant="flat" size="small" class="save-btn" :loading="saving" @click="saveVariable">
            Salvar
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- ─── Delete dialog ─── -->
    <v-dialog v-model="showDeleteDialog" max-width="400" :scrim-opacity="0.6">
      <v-card class="dialog-card" rounded="xl">
        <div class="dialog-header">
          <span class="dialog-title-text">Confirmar exclusão</span>
          <v-btn icon size="small" variant="text" @click="showDeleteDialog = false">
            <v-icon size="18">mdi-close</v-icon>
          </v-btn>
        </div>
        <div class="dialog-body">
          <p style="font-size: 14px; color: rgba(var(--v-theme-secondary), 0.6); line-height: 1.6">
            Tem certeza que deseja excluir esta variável? Esta ação não pode ser desfeita.
          </p>
        </div>
        <div class="dialog-actions">
          <v-btn variant="text" size="small" @click="showDeleteDialog = false" :disabled="deleting">Cancelar</v-btn>
          <v-spacer />
          <v-btn variant="flat" size="small" color="error" :loading="deleting" @click="deleteVariable">
            Excluir
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

  </div>
</template>

<style scoped>
/* ─── Page layout ─── */
.vars-page {
  padding: 24px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: rgb(var(--v-theme-secondary));
  margin: 0 0 3px;
  letter-spacing: -0.02em;
}

.page-subtitle {
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.4);
  margin: 0;
}

.new-btn {
  background: rgb(var(--v-theme-secondary)) !important;
  color: rgb(var(--v-theme-primary)) !important;
  font-weight: 600;
  font-size: 13px;
  border-radius: 10px !important;
}

/* ─── Search ─── */
.search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(var(--v-theme-secondary), 0.05);
  border: 1px solid rgba(var(--v-theme-secondary), 0.09);
  border-radius: 10px;
  padding: 8px 14px;
  margin-bottom: 20px;
  transition: border-color 0.15s ease;
}

.search-bar:focus-within {
  border-color: rgba(var(--v-theme-secondary), 0.2);
}

.search-icon {
  color: rgba(var(--v-theme-secondary), 0.35);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13.5px;
  color: rgb(var(--v-theme-secondary));
  caret-color: rgb(var(--v-theme-secondary));
}

.search-input::placeholder {
  color: rgba(var(--v-theme-secondary), 0.3);
}

.search-clear {
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(var(--v-theme-secondary), 0.35);
  padding: 0;
  display: flex;
  align-items: center;
  transition: color 0.15s ease;
}

.search-clear:hover {
  color: rgba(var(--v-theme-secondary), 0.7);
}

/* ─── Grid ─── */
.var-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 12px;
}

/* ─── Variable card ─── */
.var-card {
  background: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-secondary), 0.07);
  border-radius: 14px;
  overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.var-card:hover {
  border-color: rgba(var(--v-theme-secondary), 0.13);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

/* ─── Card Header ─── */
.var-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.06);
}

.var-image-section {
  flex-shrink: 0;
}

.var-image {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
  background: rgba(var(--v-theme-secondary), 0.05);
}

.var-avatar {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  color: white;
}

.var-header-info {
  flex: 1;
  min-width: 0;
}

.var-name {
  font-size: 15px;
  font-weight: 600;
  color: rgb(var(--v-theme-secondary));
  margin: 0 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.var-desc {
  font-size: 12px;
  color: rgba(var(--v-theme-secondary), 0.5);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.var-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.var-card:hover .var-actions {
  opacity: 1;
}

/* ─── Fields Section ─── */
.var-fields {
  padding: 12px 16px;
}

.field-row {
  padding: 8px 0;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.04);
}

.field-row:last-child {
  border-bottom: none;
}

.field-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-key {
  font-size: 11px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.5);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.field-value-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.field-value {
  font-size: 13px;
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
  color: rgb(var(--v-theme-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  background: rgba(var(--v-theme-secondary), 0.04);
  padding: 4px 8px;
  border-radius: 6px;
}

.field-value--url {
  color: #10B981;
  cursor: pointer;
}

.field-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  padding: 8px;
  margin-top: 8px;
  font-size: 12px;
  font-weight: 500;
  color: rgba(var(--v-theme-secondary), 0.5);
  background: rgba(var(--v-theme-secondary), 0.04);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.expand-btn:hover {
  background: rgba(var(--v-theme-secondary), 0.08);
  color: rgba(var(--v-theme-secondary), 0.8);
}

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-secondary), 0.4);
  transition: background 0.15s ease, color 0.15s ease;
}

.icon-btn:hover {
  background: rgba(var(--v-theme-secondary), 0.08);
  color: rgba(var(--v-theme-secondary), 0.8);
}

.icon-btn--danger:hover {
  background: rgba(239, 68, 68, 0.12);
  color: #EF4444;
}

/* ─── Skeleton ─── */
.var-skeleton {
  height: 180px;
  border-radius: 14px;
  background: linear-gradient(
    90deg,
    rgba(var(--v-theme-secondary), 0.04) 0%,
    rgba(var(--v-theme-secondary), 0.08) 50%,
    rgba(var(--v-theme-secondary), 0.04) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* ─── Empty state ─── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  gap: 8px;
}

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.45);
  margin: 0;
}

.empty-sub {
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.28);
  margin: 0;
  text-align: center;
}

/* ─── Dialogs ─── */
.dialog-card {
  background: rgb(var(--v-theme-primary)) !important;
  border: 1px solid rgba(var(--v-theme-secondary), 0.1) !important;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 18px 14px;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.07);
  gap: 12px;
}

.dialog-title-text {
  font-size: 15px;
  font-weight: 700;
  color: rgb(var(--v-theme-secondary));
}

.dialog-body {
  padding: 18px;
}

.dialog-actions {
  display: flex;
  align-items: center;
  padding: 12px 18px 18px;
  border-top: 1px solid rgba(var(--v-theme-secondary), 0.07);
  gap: 8px;
}

/* ─── Fields Section in Dialog ─── */
.fields-section {
  border-top: 1px solid rgba(var(--v-theme-secondary), 0.08);
  padding-top: 16px;
}

.fields-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.fields-title {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--v-theme-secondary));
}

.field-input-row {
  display: grid;
  grid-template-columns: 1fr 1.5fr 100px auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.field-input-key {
  font-size: 12px;
}

.field-input-value {
  font-size: 12px;
}

.field-input-type {
  font-size: 12px;
}

.save-btn {
  background: rgb(var(--v-theme-secondary)) !important;
  color: rgb(var(--v-theme-primary)) !important;
  font-weight: 600;
  font-size: 12.5px;
  border-radius: 8px !important;
}

/* ─── Image Upload Section ─── */
.image-upload-section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.image-preview-container {
  position: relative;
  width: 100px;
  height: 100px;
  border-radius: 10px;
  overflow: hidden;
  border: 2px dashed rgba(var(--v-theme-secondary), 0.2);
}

.image-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.9);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  transition: transform 0.15s ease;
}

.image-remove-btn:hover {
  transform: scale(1.1);
}

.upload-btn {
  border-color: rgba(var(--v-theme-secondary), 0.2) !important;
  color: rgba(var(--v-theme-secondary), 0.6) !important;
  font-size: 12px;
}

.upload-btn:hover {
  border-color: rgba(var(--v-theme-secondary), 0.4) !important;
  background: rgba(var(--v-theme-secondary), 0.05) !important;
}
</style>
