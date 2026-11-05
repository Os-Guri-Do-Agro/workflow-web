<script setup lang="ts">
/**
 * Linha chave / valor / tipo de uma variável.
 *
 * SECRET chega da API mascarado (`value: null`). Enquanto ninguém revela nem
 * digita, o campo fica vazio com "••••••" (e a pista dos 2 últimos, quando a
 * API manda). "Revelar" e "Copiar" passam pela API (quem fez fica no
 * Histórico): esta linha só pede, quem chama é o drawer. Digitar num segredo
 * mascarado é trocar o valor; o que não foi digitado nunca é reenviado.
 */
import { computed, ref } from 'vue'
import { Eye, EyeOff, Copy, ExternalLink, Trash2, Check, ChevronDown, Loader2 } from 'lucide-vue-next'
import VariableTypeChip from './VariableTypeChip.vue'

type VarType = 'TEXT' | 'URL' | 'SECRET'

const props = defineProps<{
  field: { key: string; value: string | null; type: VarType; hint?: string | null }
  modelKey?: string
  /** O segredo está à vista agora (some sozinho em 30 s, quem controla é o pai). */
  reveal?: boolean
  /** Valor que a API revelou, enquanto `field.value` continua null (não editado). */
  revealedValue?: string | null
  /** Revelação em andamento. */
  revealing?: boolean
  editable?: boolean
}>()

const emit = defineEmits<{
  'update:key': [value: string]
  'update:value': [value: string]
  'update:type': [value: VarType]
  remove: []
  'toggle-reveal': []
  copy: [value: string]
  /** Copiar um segredo mascarado: o pai revela pela API e copia. */
  'copy-secret': []
}>()

const showTypeMenu = ref(false)
const copied = ref(false)

const typeOptions: VarType[] = ['TEXT', 'URL', 'SECRET']

const isSecret = computed(() => props.field.type === 'SECRET')
/** Segredo que a tela não conhece (mascarado e não digitado). */
const isMasked = computed(() => isSecret.value && props.field.value == null)

const shownValue = computed(() => {
  if (props.field.value != null) return props.field.value
  return props.reveal ? (props.revealedValue ?? '') : ''
})

// Curto de propósito: a coluna do valor é estreita no drawer. O "termina em"
// fica no title e no aria-label.
const maskedPlaceholder = computed(() =>
  props.field.hint ? `••••••${props.field.hint}` : '••••••',
)

const staticValue = computed(() => {
  if (isSecret.value && !props.reveal) {
    return props.field.hint ? `••••••${props.field.hint}` : '••••••'
  }
  return shownValue.value
})

function flashCopied() {
  copied.value = true
  setTimeout(() => (copied.value = false), 1200)
}

const handleCopy = async () => {
  if (isMasked.value && !(props.reveal && props.revealedValue != null)) {
    emit('copy-secret')
    return
  }
  try {
    await navigator.clipboard.writeText(shownValue.value)
    flashCopied()
    emit('copy', shownValue.value)
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
      aria-label="Chave do campo"
      @input="emit('update:key', ($event.target as HTMLInputElement).value)"
    />
    <div v-else class="field-key-static">{{ field.key || '-' }}</div>

    <div class="field-value-wrap">
      <input
        v-if="editable"
        class="field-value-input"
        :value="shownValue"
        :type="isSecret && !reveal ? 'password' : 'text'"
        :placeholder="isMasked && !reveal ? maskedPlaceholder : 'valor'"
        :aria-label="isMasked && !reveal ? `Valor secreto de ${field.key}, oculto${field.hint ? `, termina em ${field.hint}` : ''}. Digite para trocar` : `Valor de ${field.key || 'campo'}`"
        :title="isMasked && !reveal ? (field.hint ? `Oculto, termina em ${field.hint}. Digite para trocar` : 'Oculto. Digite para trocar') : undefined"
        autocomplete="off"
        spellcheck="false"
        @input="emit('update:value', ($event.target as HTMLInputElement).value)"
      />
      <code v-else class="field-value-static" :class="{ 'field-value-static--url': field.type === 'URL' }">
        {{ staticValue }}
      </code>
    </div>

    <div class="field-type">
      <!-- Acima do drawer (4500) e do AppDialog (5000): o padrão do Vuetify
           (2000) abria o menu atrás dos dois. -->
      <v-menu v-model="showTypeMenu" location="bottom end" :z-index="5100">
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
        v-if="isSecret"
        class="act-btn act-btn--text"
        type="button"
        :disabled="revealing"
        :aria-label="reveal ? `Ocultar ${field.key}` : `Revelar ${field.key}`"
        :title="reveal ? 'Ocultar' : 'Revelar (fica no histórico)'"
        @click="emit('toggle-reveal')"
      >
        <Loader2 v-if="revealing" :size="13" class="act-spin" />
        <component :is="reveal ? EyeOff : Eye" v-else :size="13" />
        <span>{{ reveal ? 'Ocultar' : 'Revelar' }}</span>
      </button>
      <button
        v-if="field.type === 'URL' && field.value"
        class="act-btn"
        type="button"
        title="Abrir URL"
        aria-label="Abrir URL"
        @click="openUrl"
      >
        <ExternalLink :size="13" />
      </button>
      <button
        class="act-btn"
        type="button"
        :disabled="revealing"
        :title="copied ? 'Copiado!' : isMasked ? 'Copiar (revela e fica no histórico)' : 'Copiar valor'"
        :aria-label="copied ? 'Copiado' : `Copiar ${field.key || 'valor'}`"
        @click="handleCopy"
      >
        <component :is="copied ? Check : Copy" :size="13" :class="{ 'act-success': copied }" />
      </button>
      <button
        v-if="editable"
        class="act-btn act-btn--danger"
        type="button"
        title="Remover campo"
        aria-label="Remover campo"
        @click="emit('remove')"
      >
        <Trash2 :size="13" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.field-input-row {
  display: grid;
  grid-template-columns: minmax(96px, 0.9fr) minmax(0, 1.6fr) auto auto;
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
  min-width: 0;
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

.field-value-input::placeholder {
  font-family: var(--font-family);
  letter-spacing: 0.02em;
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
  position: relative;
  min-width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 5px;
  color: var(--text-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-family: inherit;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

/* 28px de desenho, 44px de toque, sem empurrar a linha. */
.act-btn::after {
  content: '';
  position: absolute;
  inset: -8px -2px;
}

.act-btn--text {
  padding: 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.act-btn:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}

.act-btn:disabled {
  cursor: progress;
  opacity: 0.6;
}

.act-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.act-btn--danger:hover {
  background: color-mix(in srgb, var(--err) 16%, transparent);
  color: var(--err);
}

.act-success {
  color: var(--success);
}

.act-spin {
  animation: act-spin 0.85s linear infinite;
}

@keyframes act-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 520px) {
  .field-input-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'key type'
      'value value'
      'actions actions';
    row-gap: 6px;
  }
  .field-key-input,
  .field-key-static {
    grid-area: key;
  }
  .field-value-wrap {
    grid-area: value;
  }
  .field-type {
    grid-area: type;
  }
  .field-actions {
    grid-area: actions;
    justify-content: flex-end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .act-spin {
    animation-duration: 1.8s;
  }
}
</style>
