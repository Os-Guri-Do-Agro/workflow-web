<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { KeyRound, Search, Plus, Trash2 } from 'lucide-vue-next'
import companyVariableService from '@/service/companies/variables/variables-services'
import { useToast } from '@/composables/useToast'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import VariablesToolbar from './components/VariablesToolbar.vue'
import VariablesList from './components/VariablesList.vue'
import VariablesGrid from './components/VariablesGrid.vue'
import VariableDrawer from './components/VariableDrawer.vue'
import VariableCreateDialog from './components/VariableCreateDialog.vue'
import { useEnvExport } from './components/useEnvExport'

type VarType = 'TEXT' | 'URL' | 'SECRET'
interface VariableField {
  key: string
  value: string
  type: VarType
}
interface Variable {
  id?: string
  name: string
  description?: string
  imageUrl?: string
  fields: VariableField[]
  updatedAt?: string
  updatedBy?: { id?: string; name?: string }
}

const variables = ref<Variable[]>([])
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const uploadingImage = ref(false)

const search = ref('')
const typeFilter = ref<VarType | 'ALL'>('ALL')
const sort = ref<'name' | 'updated' | 'fields'>('name')
const view = ref<'list' | 'grid'>((localStorage.getItem('variables.view') as 'list' | 'grid') || 'list')

const drawerOpen = ref(false)
const drawerVariable = ref<Variable | null>(null)
const createOpen = ref(false)

const confirmDelete = ref(false)
const deleteId = ref<string | null>(null)

const { success: showSuccess, error: showError } = useToast()
const { copyEnv, downloadEnv } = useEnvExport()

const filtered = computed(() => {
  let list = [...variables.value]
  if (typeFilter.value !== 'ALL') {
    list = list.filter((v) => v.fields?.some((f) => f.type === typeFilter.value))
  }
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.description?.toLowerCase().includes(q) ||
        v.fields?.some((f) => f.key.toLowerCase().includes(q)),
    )
  }
  const sorted = list.sort((a, b) => {
    if (sort.value === 'name') return a.name.localeCompare(b.name, 'pt-BR')
    if (sort.value === 'fields') return (b.fields?.length || 0) - (a.fields?.length || 0)
    const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    return bt - at
  })
  return sorted
})

watchViewPersistence()

function watchViewPersistence() {
  // Persist view mode changes (inline via emitted updates below).
}

const onViewChange = (v: 'list' | 'grid') => {
  view.value = v
  localStorage.setItem('variables.view', v)
}

const load = async () => {
  loading.value = true
  try {
    const result = await companyVariableService.getCompanyVariables()
    variables.value = Array.isArray(result) ? result : []
  } catch (e: any) {
    showError(e?.response?.data?.message || 'Erro ao carregar variáveis')
  } finally {
    loading.value = false
  }
}

const openVariable = (v: Variable) => {
  drawerVariable.value = v
  drawerOpen.value = true
}

const openEdit = (v: Variable) => openVariable(v)

const openCreate = () => {
  createOpen.value = true
}

const handleCreate = async (payload: Variable) => {
  saving.value = true
  try {
    const created = await companyVariableService.postCompanyVariable(payload)
    showSuccess('Variável criada')
    createOpen.value = false
    await load()
    if (created?.id) {
      const newly = variables.value.find((v) => v.id === created.id)
      if (newly) openVariable(newly)
    }
  } catch (e: any) {
    showError(e?.response?.data?.message || 'Erro ao criar variável')
  } finally {
    saving.value = false
  }
}

const handleSave = async (payload: Variable) => {
  if (!payload.id) return
  saving.value = true
  try {
    await companyVariableService.patchCompanyVariable(payload.id, {
      name: payload.name,
      description: payload.description,
      fields: payload.fields,
    })
    showSuccess('Variável atualizada')
    await load()
    const updated = variables.value.find((v) => v.id === payload.id)
    if (updated) drawerVariable.value = updated
  } catch (e: any) {
    showError(e?.response?.data?.message || 'Erro ao salvar variável')
  } finally {
    saving.value = false
  }
}

const handleUploadImage = async (file: File) => {
  if (!drawerVariable.value?.id) {
    showError('Salve a variável antes de enviar imagem')
    return
  }
  uploadingImage.value = true
  try {
    await companyVariableService.uploadVariableImage(drawerVariable.value.id, file)
    showSuccess('Imagem atualizada')
    await load()
    const refreshed = variables.value.find((v) => v.id === drawerVariable.value?.id)
    if (refreshed) drawerVariable.value = refreshed
  } catch (e: any) {
    showError(e?.response?.data?.message || 'Erro ao enviar imagem')
  } finally {
    uploadingImage.value = false
  }
}

const askDelete = (id: string) => {
  deleteId.value = id
  confirmDelete.value = true
}

const performDelete = async () => {
  if (!deleteId.value) return
  deleting.value = true
  try {
    await companyVariableService.deleteCompanyVariable(deleteId.value)
    showSuccess('Variável excluída')
    confirmDelete.value = false
    drawerOpen.value = false
    drawerVariable.value = null
    deleteId.value = null
    await load()
  } catch (e: any) {
    showError(e?.response?.data?.message || 'Erro ao excluir variável')
  } finally {
    deleting.value = false
  }
}

const exportAll = () => {
  if (!filtered.value.length) return
  downloadEnv(filtered.value, 'empresa.env')
  showSuccess('Arquivo .env baixado')
}

const copyAll = async () => {
  if (!filtered.value.length) return
  const ok = await copyEnv(filtered.value)
  if (ok) showSuccess('Variáveis copiadas como .env')
  else showError('Não foi possível copiar')
}

const exportOne = (v: Variable) => {
  downloadEnv([v], `${v.name}.env`)
  showSuccess('Variável baixada')
}

const copyOne = async (v: Variable) => {
  const ok = await copyEnv([v])
  if (ok) showSuccess('Variável copiada')
  else showError('Não foi possível copiar')
}

const searchInputRef = ref<HTMLInputElement | null>(null)

const handleShortcut = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement
  const isTyping = target && ['INPUT', 'TEXTAREA'].includes(target.tagName)
  if (e.key === '/' && !isTyping) {
    e.preventDefault()
    const el = document.querySelector<HTMLInputElement>('.vars-toolbar .search-input')
    el?.focus()
  } else if (e.key.toLowerCase() === 'n' && !isTyping && !drawerOpen.value && !createOpen.value) {
    e.preventDefault()
    openCreate()
  } else if (e.key === 'Escape' && drawerOpen.value) {
    drawerOpen.value = false
  }
}

onMounted(() => {
  load()
  window.addEventListener('keydown', handleShortcut)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleShortcut)
})
</script>

<template>
  <div class="vars-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Variáveis</h1>
        <p class="page-sub">Credenciais, URLs e configurações da empresa ativa</p>
      </div>
    </header>

    <VariablesToolbar
      v-model:search="search"
      v-model:type-filter="typeFilter"
      v-model:sort="sort"
      :view="view"
      :total="filtered.length"
      @update:view="onViewChange"
      @create="openCreate"
      @export-all="exportAll"
      @copy-all="copyAll"
    />

    <div v-if="loading" class="loading-grid">
      <Skeleton v-for="i in 5" :key="i" type="card" />
    </div>

    <EmptyState
      v-else-if="variables.length === 0"
      :icon="KeyRound"
      title="Nenhuma variável cadastrada"
      description="Centralize credenciais, links de dashboards e configurações que sua equipe usa no dia a dia."
    >
      <template #action>
        <button class="cta-btn" @click="openCreate">
          <Plus :size="14" />
          <span>Criar primeira variável</span>
        </button>
      </template>
    </EmptyState>

    <EmptyState
      v-else-if="filtered.length === 0"
      :icon="Search"
      title="Nenhuma variável encontrada"
      description="Tente remover filtros ou usar outro termo de busca."
    />

    <VariablesList
      v-else-if="view === 'list'"
      :variables="filtered"
      :selected-id="drawerVariable?.id"
      @open="openVariable"
      @edit="openEdit"
      @delete="askDelete"
      @export="exportOne"
      @copy="copyOne"
    />

    <VariablesGrid
      v-else
      :variables="filtered"
      @open="openVariable"
      @edit="openEdit"
      @delete="askDelete"
      @export="exportOne"
      @copy="copyOne"
    />

    <VariableDrawer
      v-model="drawerOpen"
      :variable="drawerVariable"
      :saving="saving"
      :uploading-image="uploadingImage"
      @save="handleSave"
      @delete="askDelete"
      @upload-image="handleUploadImage"
      @copied="(msg) => showSuccess(msg)"
    />

    <VariableCreateDialog v-model="createOpen" :saving="saving" @create="handleCreate" />

    <v-dialog v-model="confirmDelete" max-width="400" :scrim-opacity="0.6">
      <v-card class="confirm-card" rounded="xl" elevation="0">
        <div class="confirm-body">
          <div class="confirm-icon">
            <Trash2 :size="18" />
          </div>
          <div class="confirm-info">
            <h3 class="confirm-title">Excluir variável?</h3>
            <p class="confirm-desc">Esta ação não pode ser desfeita. Os campos e secrets serão perdidos.</p>
          </div>
        </div>
        <div class="confirm-footer">
          <button class="ghost-btn" :disabled="deleting" @click="confirmDelete = false">
            Cancelar
          </button>
          <button class="danger-btn" :disabled="deleting" @click="performDelete">
            {{ deleting ? 'Excluindo…' : 'Excluir' }}
          </button>
        </div>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.vars-page {
  padding: 24px 28px 40px;
  max-width: 1280px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  margin: 0 0 3px;
}

.page-sub {
  font-size: 13px;
  color: var(--text-3);
  margin: 0;
}

.loading-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  margin-top: 8px;
}

.cta-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  height: 34px;
  border-radius: 8px;
  background: var(--text);
  color: var(--bg);
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.cta-btn:hover {
  opacity: 0.92;
}

.confirm-card {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
  color: var(--text);
}

.confirm-body {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px;
}

.confirm-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--err) 16%, transparent);
  color: var(--err);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.confirm-info {
  flex: 1;
}

.confirm-title {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 4px;
}

.confirm-desc {
  font-size: 12.5px;
  color: var(--text-3);
  margin: 0;
  line-height: 1.45;
}

.confirm-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 18px 18px;
}

.ghost-btn,
.danger-btn {
  display: inline-flex;
  align-items: center;
  padding: 0 14px;
  height: 30px;
  border-radius: 7px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    opacity var(--motion-fast) var(--motion-ease);
}

.ghost-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-2);
}

.ghost-btn:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
}

.danger-btn {
  background: var(--err);
  color: var(--accent-fg);
  border: none;
}

.danger-btn:hover:not(:disabled) {
  opacity: 0.92;
}

.ghost-btn:disabled,
.danger-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
