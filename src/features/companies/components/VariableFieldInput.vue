<script setup lang="ts">
import { ref } from 'vue'
import { Eye, EyeOff, Copy, ExternalLink, Trash2, Check, ChevronDown } from 'lucide-vue-next'
import VariableTypeChip from './VariableTypeChip.vue'

type VarType = 'TEXT' | 'URL' | 'SECRET'

const props = defineProps<{
  field: { key: string; value: string; type: VarType }
  modelKey?: string
  reveal?: boolean
  editable?: boolean
}>()

const emit = defineEmits<{
  'update:key': [value: string]
  'update:value': [value: string]
  'update:type': [value: VarType]
  remove: []
  'toggle-reveal': []
  copy: [value: string]
}>()

const showTypeMenu = ref(false)
const copied = ref(false)

const typeOptions: VarType[] = ['TEXT', 'URL', 'SECRET']

const maskedValue = () => {
  if (props.field.type !== 'SECRET' || props.reveal) return props.field.value
  return '•'.repeat(Math.min(props.field.value?.length || 8, 20))
}

const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(props.field.value || '')
    copied.value = true
    emit('copy', props.field.value || '')
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* no-op */
  }
}

const openUrl = () => {
  if (props.field.type === 'URL' && props.field.value) {
    window.open(props.field.value, '_blank', 'noopener,noreferrer')
  }
}
</script>

<template>
  <div class="field-input-row">
    <input
      v-if="editable"
      class="field-key-input"
      :value="field.key"
      placeholder="chave"
      @input="emit('update:key', ($event.target as HTMLInputElement).value)"
    />
    <div v-else class="field-key-static">{{ field.key || '—' }}</div>

    <div class="field-value-wrap">
      <input
        v-if="editable"
        class="field-value-input"
        :value="field.value"
        :type="field.type === 'SECRET' && !reveal ? 'password' : 'text'"
        placeholder="valor"
        @input="emit('update:value', ($event.target as HTMLInputElement).value)"
      />
      <code v-else class="field-value-static" :class="{ 'field-value-static--url': field.type === 'URL' }">
        {{ maskedValue() }}
      </code>
    </div>

    <div class="field-type">
      <v-menu v-model="showTypeMenu" location="bottom end">
        <template #activator="{ props: menuProps }">
          <button v-bind="menuProps" class="type-btn" :disabled="!editable">
            <VariableTypeChip :type="field.type" :show-label="true" />
            <ChevronDown v-if="editable" :size="11" class="type-chevron" />
          </button>
        </template>
        <v-card class="type-menu" rounded="lg" elevation="0">
          <v-list density="compact" class="py-1">
            <v-list-item
              v-for="opt in typeOptions"
              :key="opt"
              density="compact"
              @click="emit('update:type', opt)"
            >
              <VariableTypeChip :type="opt" :show-label="true" />
            </v-list-item>
          </v-list>
        </v-card>
      </v-menu>
    </div>

    <div class="field-actions">
      <button
        v-if="field.type === 'SECRET'"
        class="act-btn"
        :title="reveal ? 'Ocultar' : 'Revelar'"
        @click="emit('toggle-reveal')"
      >
        <component :is="reveal ? EyeOff : Eye" :size="13" />
      </button>
      <button
        v-if="field.type === 'URL' && field.value"
        class="act-btn"
        title="Abrir URL"
        @click="openUrl"
      >
        <ExternalLink :size="13" />
      </button>
      <button class="act-btn" :title="copied ? 'Copiado!' : 'Copiar valor'" @click="handleCopy">
        <component :is="copied ? Check : Copy" :size="13" :class="{ 'act-success': copied }" />
      </button>
      <button v-if="editable" class="act-btn act-btn--danger" title="Remover campo" @click="emit('remove')">
        <Trash2 :size="13" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.field-input-row {
  display: grid;
  grid-template-columns: minmax(120px, 0.9fr) minmax(0, 1.6fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.field-input-row:hover {
  border-color: var(--border-strong);
}

.field-key-input,
.field-value-input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text);
  padding: 4px 0;
}

.field-key-input::placeholder,
.field-value-input::placeholder {
  color: var(--text-4);
}

.field-key-static {
  font-family: var(--font-mono);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-value-wrap {
  min-width: 0;
}

.field-value-static {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text);
  background: var(--surface-2);
  padding: 3px 8px;
  border-radius: 5px;
  display: inline-block;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-value-static--url {
  color: var(--success);
  cursor: pointer;
}

.field-type {
  display: inline-flex;
}

.type-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  color: var(--text-2);
  padding: 0;
}

.type-btn:disabled {
  cursor: default;
}

.type-chevron {
  color: var(--text-4);
}

.type-menu {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
  box-shadow: var(--shadow-overlay) !important;
}

.field-actions {
  display: inline-flex;
  gap: 2px;
}

.act-btn {
  width: 26px;
  height: 26px;
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 5px;
  color: var(--text-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.act-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.act-btn--danger:hover {
  background: color-mix(in srgb, var(--err) 16%, transparent);
  color: var(--err);
}

.act-success {
  color: var(--success);
}
</style>
