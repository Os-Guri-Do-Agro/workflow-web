<script setup lang="ts">
import { ref, watch } from 'vue'
import { Loader2, Plus, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import VariableFieldInput from './VariableFieldInput.vue'

type VarType = 'TEXT' | 'URL' | 'SECRET'
interface VariableField {
  key: string
  value: string
  type: VarType
}
interface NewVariable {
  name: string
  description?: string
  fields: VariableField[]
}

const props = defineProps<{
  modelValue: boolean
  saving?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  create: [variable: NewVariable]
}>()

const form = ref<NewVariable>({
  name: '',
  description: '',
  fields: [{ key: '', value: '', type: 'TEXT' }],
})

const reset = () => {
  form.value = { name: '', description: '', fields: [{ key: '', value: '', type: 'TEXT' }] }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) reset()
  },
)

const addField = () => {
  form.value.fields.push({ key: '', value: '', type: 'TEXT' })
}

const removeField = (idx: number) => {
  form.value.fields.splice(idx, 1)
  if (form.value.fields.length === 0) addField()
}

const updateFieldKey = (idx: number, value: string) => {
  const f = form.value.fields[idx]
  if (f) f.key = value
}

const updateFieldValue = (idx: number, value: string) => {
  const f = form.value.fields[idx]
  if (f) f.value = value
}

const updateFieldType = (idx: number, type: VarType) => {
  const f = form.value.fields[idx]
  if (f) f.type = type
}

const submit = () => {
  if (!form.value.name.trim()) return
  const cleaned: NewVariable = {
    ...form.value,
    fields: form.value.fields.filter((f) => f.key.trim()),
  }
  if (cleaned.fields.length === 0) return
  emit('create', cleaned)
}

const close = () => {
  if (props.saving) return
  emit('update:modelValue', false)
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    label="Nova variável"
    size="md"
    :loading="saving"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <header class="header">
      <span class="title">Nova variável</span>
      <button class="close-btn" type="button" aria-label="Fechar" :disabled="saving" @click="close">
        <X :size="16" />
      </button>
    </header>

    <div class="body">
      <label class="label">
        <span class="label-text">Nome</span>
        <input v-model="form.name" class="input" placeholder="ex: aws_credentials" />
      </label>

      <label class="label">
        <span class="label-text">Descrição <span class="muted">(opcional)</span></span>
        <input v-model="form.description" class="input" placeholder="ex: Credenciais AWS para deploy" />
      </label>

      <div class="fields-section">
        <div class="fields-header">
          <span class="label-text">Campos</span>
          <button class="add-btn" type="button" @click="addField">
            <Plus :size="12" />
            <span>Adicionar</span>
          </button>
        </div>
        <div class="fields-list">
          <VariableFieldInput
            v-for="(field, idx) in form.fields"
            :key="idx"
            :field="field"
            :editable="true"
            :reveal="true"
            @update:key="updateFieldKey(idx, $event)"
            @update:value="updateFieldValue(idx, $event)"
            @update:type="updateFieldType(idx, $event)"
            @remove="removeField(idx)"
          />
        </div>
      </div>
    </div>

    <footer class="footer">
      <button class="ghost-btn" type="button" :disabled="saving" @click="close">Cancelar</button>
      <button
        class="primary-btn"
        type="button"
        :disabled="saving || !form.name.trim() || !form.fields.some((f) => f.key.trim())"
        @click="submit"
      >
        <Loader2 v-if="saving" :size="14" class="spin" />
        {{ saving ? 'Criando…' : 'Criar variável' }}
      </button>
    </footer>
  </AppDialog>
</template>

<style scoped>
/* Superfície/borda/raio/sombra/scrim vêm do AppDialog; aqui só layout interno. */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 14px;
  border-bottom: 1px solid var(--border);
}

.title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
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

.close-btn:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}

.close-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.body {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 60vh;
  overflow-y: auto;
}

.label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label-text {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.muted {
  color: var(--text-4);
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
}

.input {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 13px;
  color: var(--text);
  outline: none;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.input::placeholder {
  color: var(--text-4);
}

.input:focus {
  border-color: var(--border-strong);
}

.fields-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fields-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-2);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.add-btn:hover {
  background: var(--surface-3);
  color: var(--text);
}

.fields-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--border);
}

.ghost-btn,
.primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  height: 32px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 12.5px;
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

.primary-btn {
  background: var(--text);
  color: var(--bg);
  border: none;
}

.primary-btn:hover:not(:disabled) {
  opacity: 0.92;
}

.primary-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
