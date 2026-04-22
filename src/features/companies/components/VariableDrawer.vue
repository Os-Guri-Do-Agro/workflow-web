<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { X, Plus, Download, Copy, Trash2, Camera, Save, KeyRound } from 'lucide-vue-next'
import VariableFieldInput from './VariableFieldInput.vue'
import { useEnvExport } from './useEnvExport'

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
}

const props = defineProps<{
  modelValue: boolean
  variable: Variable | null
  saving?: boolean
  uploadingImage?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [variable: Variable]
  delete: [id: string]
  'upload-image': [file: File]
  copied: [message: string]
}>()

const activeTab = ref<'fields' | 'history'>('fields')
const revealed = ref(new Set<number>())
const draft = ref<Variable>(empty())
const fileInput = ref<HTMLInputElement | null>(null)
const { copyEnv, downloadEnv } = useEnvExport()

function empty(): Variable {
  return { name: '', description: '', imageUrl: '', fields: [] }
}

watch(
  () => props.variable,
  (v) => {
    revealed.value.clear()
    if (v) {
      draft.value = {
        ...v,
        fields: v.fields?.length ? [...v.fields.map((f) => ({ ...f }))] : [],
      }
    } else {
      draft.value = empty()
    }
    activeTab.value = 'fields'
  },
  { immediate: true },
)

const hasChanges = computed(() => {
  if (!props.variable) return false
  const a = JSON.stringify(props.variable)
  const b = JSON.stringify(draft.value)
  return a !== b
})

const toggleReveal = (idx: number) => {
  if (revealed.value.has(idx)) revealed.value.delete(idx)
  else {
    revealed.value.add(idx)
    setTimeout(() => {
      revealed.value.delete(idx)
      revealed.value = new Set(revealed.value)
    }, 30_000)
  }
  revealed.value = new Set(revealed.value)
}

const addField = () => {
  draft.value.fields.push({ key: '', value: '', type: 'TEXT' })
}

const removeField = (idx: number) => {
  draft.value.fields.splice(idx, 1)
}

const updateFieldKey = (idx: number, value: string) => {
  const f = draft.value.fields[idx]
  if (f) f.key = value
}

const updateFieldValue = (idx: number, value: string) => {
  const f = draft.value.fields[idx]
  if (f) f.value = value
}

const updateFieldType = (idx: number, type: VarType) => {
  const f = draft.value.fields[idx]
  if (f) f.type = type
}

const save = () => {
  const cleaned: Variable = {
    ...draft.value,
    fields: draft.value.fields.filter((f) => f.key.trim()),
  }
  if (!cleaned.name.trim()) return
  emit('save', cleaned)
}

const close = () => emit('update:modelValue', false)

const triggerUpload = () => fileInput.value?.click()

const onFileChange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) emit('upload-image', file)
}

const copyAsEnv = async () => {
  if (!draft.value.name) return
  const ok = await copyEnv([draft.value])
  emit('copied', ok ? 'Variável copiada como .env' : 'Não foi possível copiar')
}

const downloadAsEnv = () => {
  if (!draft.value.name) return
  downloadEnv([draft.value], `${draft.value.name}.env`)
}
</script>

<template>
  <v-navigation-drawer
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    location="right"
    width="480"
    temporary
    scrim
    class="var-drawer"
  >
    <div class="drawer-body">
      <!-- Header -->
      <header class="drawer-header">
        <div class="header-icon">
          <img v-if="draft.imageUrl" :src="draft.imageUrl" class="header-img" alt="" />
          <div v-else class="header-avatar">
            <KeyRound :size="18" />
          </div>
          <button class="upload-btn" @click="triggerUpload" :disabled="uploadingImage">
            <Camera :size="12" />
          </button>
          <input ref="fileInput" type="file" accept="image/*" class="file-hidden" @change="onFileChange" />
        </div>
        <div class="header-info">
          <input v-model="draft.name" class="header-name" placeholder="Nome da variável" />
          <input v-model="draft.description" class="header-desc" placeholder="Descrição (opcional)" />
        </div>
        <button class="close-btn" @click="close"><X :size="16" /></button>
      </header>

      <!-- Tabs -->
      <div class="drawer-tabs">
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': activeTab === 'fields' }"
          @click="activeTab = 'fields'"
        >
          Campos
          <span class="tab-count">{{ draft.fields.length }}</span>
        </button>
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': activeTab === 'history' }"
          @click="activeTab = 'history'"
        >
          Histórico
        </button>
        <div class="tab-actions">
          <button class="tab-action-btn" title="Copiar como .env" @click="copyAsEnv">
            <Copy :size="13" />
          </button>
          <button class="tab-action-btn" title="Baixar .env" @click="downloadAsEnv">
            <Download :size="13" />
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="drawer-content">
        <div v-if="activeTab === 'fields'" class="fields-content">
          <VariableFieldInput
            v-for="(field, idx) in draft.fields"
            :key="idx"
            :field="field"
            :reveal="revealed.has(idx)"
            :editable="true"
            @update:key="updateFieldKey(idx, $event)"
            @update:value="updateFieldValue(idx, $event)"
            @update:type="updateFieldType(idx, $event)"
            @toggle-reveal="toggleReveal(idx)"
            @copy="emit('copied', 'Valor copiado')"
            @remove="removeField(idx)"
          />
          <button class="add-field-btn" @click="addField">
            <Plus :size="13" />
            <span>Adicionar campo</span>
          </button>
        </div>

        <div v-else class="history-content">
          <div class="history-empty">
            <div class="history-badge">Em breve</div>
            <p class="history-title">Linha do tempo de alterações</p>
            <p class="history-desc">
              Veremos aqui quem criou, editou e apagou valores — com timestamp e snapshot. Requer
              evolução no backend.
            </p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <footer class="drawer-footer">
        <button
          v-if="variable?.id"
          class="danger-btn"
          @click="variable && variable.id && emit('delete', variable.id)"
        >
          <Trash2 :size="13" />
          <span>Excluir</span>
        </button>
        <div class="footer-spacer" />
        <button class="ghost-btn" @click="close">Cancelar</button>
        <button class="save-btn" :disabled="!draft.name.trim() || saving" @click="save">
          <Save :size="13" />
          <span>{{ saving ? 'Salvando…' : hasChanges ? 'Salvar alterações' : 'Salvar' }}</span>
        </button>
      </footer>
    </div>
  </v-navigation-drawer>
</template>

<style scoped>
.var-drawer :deep(.v-navigation-drawer__content) {
  background: var(--surface);
}

.drawer-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
  color: var(--text);
}

.drawer-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 16px 16px;
  border-bottom: 1px solid var(--border);
}

.header-icon {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.header-img {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
  background: var(--surface-2);
}

.header-avatar {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
}

.upload-btn {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--text);
  color: var(--bg);
  border: 2px solid var(--surface);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition: transform var(--motion-fast) var(--motion-ease);
}

.upload-btn:hover {
  transform: scale(1.08);
}

.upload-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-hidden {
  display: none;
}

.header-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.header-name,
.header-desc {
  background: transparent;
  border: none;
  outline: none;
  font-family: inherit;
  color: var(--text);
  width: 100%;
  padding: 2px 0;
  border-bottom: 1px solid transparent;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.header-name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.header-name:focus,
.header-desc:focus {
  border-color: var(--border-strong);
}

.header-desc {
  font-size: 12px;
  color: var(--text-3);
}

.close-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-3);
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition: background var(--motion-fast) var(--motion-ease);
}

.close-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.drawer-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
}

.tab-btn {
  background: transparent;
  border: none;
  padding: 10px 4px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-3);
  cursor: pointer;
  position: relative;
  transition: color var(--motion-fast) var(--motion-ease);
}

.tab-btn:hover {
  color: var(--text-2);
}

.tab-btn--active {
  color: var(--text);
}

.tab-btn--active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--accent);
  border-radius: 2px;
}

.tab-count {
  display: inline-block;
  margin-left: 6px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-4);
  background: var(--surface-2);
  padding: 1px 6px;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}

.tab-actions {
  margin-left: auto;
  display: inline-flex;
  gap: 2px;
}

.tab-action-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-3);
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.tab-action-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
}

.fields-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.add-field-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 9px;
  background: var(--surface-2);
  border: 1px dashed var(--border-strong);
  color: var(--text-2);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  margin-top: 6px;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.add-field-btn:hover {
  background: var(--surface-3);
  border-color: var(--text-3);
  color: var(--text);
}

.history-content {
  display: flex;
  justify-content: center;
  padding-top: 40px;
}

.history-empty {
  max-width: 360px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.history-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  padding: 3px 8px;
  border-radius: 999px;
}

.history-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.history-desc {
  font-size: 12px;
  color: var(--text-3);
  margin: 0;
  line-height: 1.5;
}

.drawer-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.footer-spacer {
  flex: 1;
}

.danger-btn,
.ghost-btn,
.save-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
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

.danger-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--err);
}

.danger-btn:hover {
  background: color-mix(in srgb, var(--err) 14%, transparent);
}

.ghost-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-2);
}

.ghost-btn:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.save-btn {
  background: var(--text);
  color: var(--bg);
  border: none;
}

.save-btn:hover:not(:disabled) {
  opacity: 0.92;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
