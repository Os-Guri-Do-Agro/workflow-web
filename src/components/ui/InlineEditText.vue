<script setup lang="ts">
/**
 * Campo de texto editável no lugar, com autosave debounced.
 *
 * Regras que fazem a edição direta ser confiável:
 * - Digitar agenda a gravação (padrão 800ms); sair do campo (blur) grava na hora.
 * - Atualização vinda de fora (refetch, outro usuário) NÃO sobrescreve o campo
 *   enquanto ele está focado ou com rascunho não gravado. Perder o que a pessoa
 *   está digitando é o pior defeito possível num autosave.
 * - `Esc` desfaz o rascunho e devolve o valor do servidor; `Enter` grava
 *   (em campo de uma linha) e `Ctrl/Cmd + Enter` grava no multilinha.
 * - Affordance visível: fundo no hover e ícone de lápis, porque campo editável
 *   sem pista de que é editável parece quebrado.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Pencil } from 'lucide-vue-next'
import type { SaveState } from './save-state'

const props = withDefaults(
  defineProps<{
    modelValue: string
    /** Rótulo acessível do campo (vira `aria-label` no input). */
    fieldLabel: string
    multiline?: boolean
    placeholder?: string
    debounceMs?: number
    state?: SaveState
    disabled?: boolean
    /** `title` usa tipografia de h1; `body` é texto corrido. */
    variant?: 'title' | 'body'
    minRows?: number
  }>(),
  {
    multiline: false,
    placeholder: '',
    debounceMs: 800,
    state: 'idle',
    disabled: false,
    variant: 'body',
    minRows: 3,
  },
)

const emit = defineEmits<{ save: [value: string] }>()

const draft = ref(props.modelValue)
const dirty = ref(false)
const focused = ref(false)
const fieldRef = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)
let timer: number | null = null

function clearTimer() {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
}

/** Grava o rascunho pendente agora. Sem rascunho sujo, é no-op. */
function flush() {
  clearTimer()
  if (!dirty.value || props.disabled) return
  const value = draft.value
  dirty.value = false
  if (value === props.modelValue) return
  emit('save', value)
}

function autosize() {
  if (!props.multiline) return
  const el = fieldRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function onInput() {
  dirty.value = true
  clearTimer()
  timer = window.setTimeout(flush, props.debounceMs)
  void nextTick(autosize)
}

function onFocus() {
  focused.value = true
}

function onBlur() {
  focused.value = false
  flush()
}

/** Descarta o rascunho e volta ao valor do servidor. */
function reset() {
  clearTimer()
  dirty.value = false
  draft.value = props.modelValue
  void nextTick(autosize)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    // Não deixa o Esc subir e fechar o painel: aqui ele significa "desfazer".
    event.stopPropagation()
    reset()
    return
  }
  if (event.key === 'Enter') {
    if (props.multiline && !(event.metaKey || event.ctrlKey)) return
    event.preventDefault()
    flush()
    fieldRef.value?.blur()
  }
}

watch(
  () => props.modelValue,
  (value) => {
    if (dirty.value || focused.value) return
    draft.value = value
    void nextTick(autosize)
  },
)

watch(() => props.multiline, () => void nextTick(autosize), { immediate: true })

// Rede de segurança: fechar o painel com rascunho pendente ainda grava.
onBeforeUnmount(() => {
  flush()
  clearTimer()
})

const isEmpty = computed(() => !draft.value.trim())

defineExpose({ flush, reset, dirty })
</script>

<template>
  <div
    class="inline-edit"
    :class="[
      `inline-edit--${variant}`,
      {
        'inline-edit--empty': isEmpty,
        'inline-edit--error': state === 'error',
        'inline-edit--disabled': disabled,
      },
    ]"
  >
    <textarea
      v-if="multiline"
      ref="fieldRef"
      v-model="draft"
      class="inline-edit__field"
      :rows="minRows"
      :aria-label="fieldLabel"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <input
      v-else
      ref="fieldRef"
      v-model="draft"
      type="text"
      class="inline-edit__field"
      :aria-label="fieldLabel"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <Pencil v-if="!disabled" :size="13" class="inline-edit__hint" aria-hidden="true" />
  </div>
</template>

<style scoped>
.inline-edit {
  position: relative;
  display: flex;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.inline-edit:hover:not(.inline-edit--disabled) {
  background: var(--surface-2);
  border-color: var(--border);
}

.inline-edit:focus-within {
  background: var(--surface-2);
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

.inline-edit--error {
  border-color: color-mix(in srgb, var(--err) 55%, transparent);
}

.inline-edit__field {
  flex: 1;
  width: 100%;
  padding: 7px 28px 7px 9px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  font-family: inherit;
  resize: none;
}

.inline-edit__field::placeholder {
  color: var(--text-4);
}

.inline-edit__field:disabled {
  cursor: default;
  color: var(--text-2);
}

.inline-edit--title .inline-edit__field {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.02em;
}

.inline-edit--body .inline-edit__field {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-2);
  white-space: pre-wrap;
}

/* Pista de que o campo é editável: sem ela, edição direta parece quebrado. */
.inline-edit__hint {
  position: absolute;
  top: 9px;
  right: 8px;
  color: var(--text-4);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.inline-edit:hover .inline-edit__hint,
.inline-edit:focus-within .inline-edit__hint {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .inline-edit,
  .inline-edit__hint {
    transition-duration: 1ms;
  }
}
</style>
