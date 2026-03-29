<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import companyVariableService from '../../service/companies/variables/variables-services'
import { useToast } from '@/composables/useToast'

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
const { success: showSuccess, error: showError } = useToast()
const search = ref('')
const revealedSecrets = ref<Set<string>>(new Set())

const formData = ref<Variable>({
  key: '',
  value: '',
  description: '',
  type: 'TEXT',
})

const typeConfig: Record<string, { label: string; icon: string; color: string }> = {
  TEXT:   { label: 'Texto',   icon: 'mdi-text-box-outline',  color: '#3B82F6' },
  URL:    { label: 'URL',     icon: 'mdi-link-variant',       color: '#10B981' },
  SECRET: { label: 'Secreto', icon: 'mdi-shield-key-outline', color: '#8B5CF6' },
}

const typeOptions = Object.entries(typeConfig).map(([value, c]) => ({ title: c.label, value }))

const filteredVariables = computed(() => {
  if (!search.value.trim()) return variables.value
  const q = search.value.toLowerCase()
  return variables.value.filter(
    (v) =>
      v.key.toLowerCase().includes(q) ||
      v.description.toLowerCase().includes(q),
  )
})

const isRevealed = (id: string) => revealedSecrets.value.has(id)

const toggleReveal = (id: string) => {
  if (revealedSecrets.value.has(id)) {
    revealedSecrets.value.delete(id)
  } else {
    revealedSecrets.value.add(id)
  }
  revealedSecrets.value = new Set(revealedSecrets.value)
}

const maskedValue = (v: Variable) =>
  v.type === 'SECRET' && !isRevealed(v.id!) ? '•'.repeat(Math.min(v.value.length, 20)) : v.value

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
      showSuccess('Variável atualizada')
    } else {
      await companyVariableService.postCompanyVariable(formData.value)
      showSuccess('Variável criada')
    }
    await loadVariables()
    closeModal()
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao salvar variável')
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
    showSuccess('Variável excluída')
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao deletar variável')
  } finally {
    deleting.value = false
  }
}

const openUrl = (url: string) => window.open(url, '_blank')

onMounted(loadVariables)
</script>

<template>
  <div class="vars-page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Variáveis</h1>
        <p class="page-subtitle">Chaves, URLs e segredos da empresa</p>
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
        placeholder="Buscar por chave ou descrição..."
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
        {{ search ? `Tente outro termo de busca` : 'Adicione chaves, URLs e segredos da sua empresa' }}
      </p>
    </div>

    <!-- Grid -->
    <div v-else class="var-grid">
      <div
        v-for="variable in filteredVariables"
        :key="variable.id"
        class="var-card"
        :class="{ 'var-card--url': variable.type === 'URL' }"
        @click="variable.type === 'URL' ? openUrl(variable.value) : null"
      >
        <!-- type accent bar -->
        <div
          class="var-accent"
          :style="{ backgroundColor: typeConfig[variable.type]?.color }"
        />

        <div class="var-body">
          <!-- top: type badge + actions -->
          <div class="var-top">
            <div
              class="type-badge"
              :style="{
                color: typeConfig[variable.type]?.color,
                backgroundColor: (typeConfig[variable.type]?.color ?? '#6B7280') + '18',
              }"
            >
              <v-icon size="11">{{ typeConfig[variable.type]?.icon }}</v-icon>
              {{ typeConfig[variable.type]?.label }}
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

          <!-- key -->
          <p class="var-key">{{ variable.key }}</p>

          <!-- description -->
          <p v-if="variable.description" class="var-desc">{{ variable.description }}</p>

          <!-- value -->
          <div class="var-value-row">
            <code class="var-value">{{ maskedValue(variable) }}</code>
            <div class="var-value-actions" @click.stop>
              <!-- reveal for secrets -->
              <button
                v-if="variable.type === 'SECRET'"
                class="icon-btn"
                @click.stop="toggleReveal(variable.id!)"
              >
                <v-icon size="14">
                  {{ isRevealed(variable.id!) ? 'mdi-eye-off-outline' : 'mdi-eye-outline' }}
                </v-icon>
              </button>
              <!-- open link for URLs -->
              <button
                v-if="variable.type === 'URL'"
                class="icon-btn"
                @click.stop="openUrl(variable.value)"
              >
                <v-icon size="14">mdi-open-in-new</v-icon>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── Create / Edit dialog ─── -->
    <v-dialog v-model="showModal" max-width="520" :scrim-opacity="0.6">
      <v-card class="dialog-card" rounded="xl">
        <div class="dialog-header">
          <span class="dialog-title-text">{{ editingVariable ? 'Editar Variável' : 'Nova Variável' }}</span>
          <v-btn icon size="small" variant="text" @click="closeModal" :disabled="saving">
            <v-icon size="18">mdi-close</v-icon>
          </v-btn>
        </div>
        <div class="dialog-body">
          <v-text-field
            v-model="formData.key"
            label="Chave"
            variant="outlined"
            density="comfortable"
            rounded="lg"
            prepend-inner-icon="mdi-key-outline"
            class="mb-3"
          />
          <v-text-field
            v-model="formData.value"
            label="Valor"
            variant="outlined"
            density="comfortable"
            rounded="lg"
            :type="formData.type === 'SECRET' ? 'password' : 'text'"
            prepend-inner-icon="mdi-text-box-outline"
            class="mb-3"
          />
          <v-textarea
            v-model="formData.description"
            label="Descrição"
            variant="outlined"
            density="comfortable"
            rounded="lg"
            rows="3"
            class="mb-3"
          />
          <v-select
            v-model="formData.type"
            :items="typeOptions"
            label="Tipo"
            variant="outlined"
            density="comfortable"
            rounded="lg"
            prepend-inner-icon="mdi-format-list-bulleted-type"
          />
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
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

/* ─── Variable card ─── */
.var-card {
  background: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-secondary), 0.07);
  border-radius: 12px;
  overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.var-card:hover {
  border-color: rgba(var(--v-theme-secondary), 0.13);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18);
}

.var-card--url {
  cursor: pointer;
}

.var-accent {
  height: 2px;
  opacity: 0.5;
}

.var-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.var-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
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

.var-key {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--v-theme-secondary));
  margin: 0;
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
}

.var-desc {
  font-size: 12.5px;
  color: rgba(var(--v-theme-secondary), 0.42);
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* value row */
.var-value-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: rgba(var(--v-theme-secondary), 0.04);
  border: 1px solid rgba(var(--v-theme-secondary), 0.06);
  border-radius: 8px;
  padding: 7px 10px;
}

.var-value {
  font-size: 12.5px;
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
  color: rgba(var(--v-theme-secondary), 0.65);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: calc(100% - 32px);
  flex: 1;
  background: transparent;
}

.var-value-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* ─── Skeleton ─── */
.var-skeleton {
  height: 140px;
  border-radius: 12px;
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

.save-btn {
  background: rgb(var(--v-theme-secondary)) !important;
  color: rgb(var(--v-theme-primary)) !important;
  font-weight: 600;
  font-size: 12.5px;
  border-radius: 8px !important;
}
</style>
