<script setup lang="ts">
/**
 * Etiquetas do Acervo: chips dentro da caixa, texto livre, Enter ou vírgula
 * cria, Backspace com a caixa vazia tira a última. As sugestões (etiquetas já
 * usadas no Acervo, as mais usadas primeiro) ficam em linha embaixo, não num
 * menu flutuante: o campo vive dentro de painel com rolagem, e lista flutuante
 * cortada pela borda parece campo quebrado.
 *
 * A etiqueta é normalizada como o servidor guarda (minúscula, sem acento),
 * então "Pet Shop" e "pet shop" nunca viram duas.
 */
import { computed, ref } from 'vue'
import { X } from 'lucide-vue-next'
import { normalizeTag } from './library-meta'

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    suggestions?: Array<{ tag: string; count: number }>
    disabled?: boolean
    placeholder?: string
    label?: string
    max?: number
  }>(),
  { suggestions: () => [], disabled: false, placeholder: 'Adicionar etiqueta', label: 'Etiquetas', max: 20 },
)

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const text = ref('')
const focused = ref(false)
const input = ref<HTMLInputElement | null>(null)

const shown = computed(() => {
  const q = normalizeTag(text.value)
  return props.suggestions
    .filter((s) => !props.modelValue.includes(s.tag) && (!q || s.tag.includes(q)))
    .slice(0, 8)
})

function add(raw: string) {
  const parts = raw.split(/[,;\n]/).map(normalizeTag).filter(Boolean)
  if (!parts.length) return
  const next = [...props.modelValue]
  for (const p of parts) if (!next.includes(p) && next.length < props.max) next.push(p)
  text.value = ''
  if (next.length !== props.modelValue.length) emit('update:modelValue', next)
}

function remove(tag: string) {
  emit(
    'update:modelValue',
    props.modelValue.filter((t) => t !== tag),
  )
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    add(text.value)
  } else if (event.key === 'Backspace' && !text.value && props.modelValue.length) {
    remove(props.modelValue[props.modelValue.length - 1]!)
  }
}

function onBlur() {
  focused.value = false
  if (text.value.trim()) add(text.value)
}
</script>

<template>
  <div class="lti" :class="{ 'is-disabled': disabled }">
    <div class="lti-box" :class="{ 'is-focused': focused }" @click="input?.focus()">
      <span v-for="tag in modelValue" :key="tag" class="lti-chip">
        {{ tag }}
        <button
          v-if="!disabled"
          type="button"
          class="lti-chip__x"
          :aria-label="`Tirar a etiqueta ${tag}`"
          @click.stop="remove(tag)"
        >
          <X :size="11" aria-hidden="true" />
        </button>
      </span>
      <input
        v-if="!disabled"
        ref="input"
        v-model="text"
        class="lti-input"
        type="text"
        :placeholder="modelValue.length ? '' : placeholder"
        :aria-label="label"
        :disabled="disabled || modelValue.length >= max"
        maxlength="60"
        @keydown="onKey"
        @focus="focused = true"
        @blur="onBlur"
      />
      <span v-else-if="!modelValue.length" class="lti-empty">Sem etiquetas</span>
    </div>
    <div v-if="!disabled && (focused || text) && shown.length" class="lti-sugs" aria-label="Sugestões">
      <button
        v-for="s in shown"
        :key="s.tag"
        type="button"
        class="lti-sug"
        @mousedown.prevent
        @click="add(s.tag)"
      >
        {{ s.tag }} <span class="lti-sug__n">{{ s.count }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.lti {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lti-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: 34px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: text;
}

.lti.is-disabled .lti-box {
  border-color: transparent;
  padding-left: 0;
  cursor: default;
}

.lti-box.is-focused {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.lti-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 4px 1px 8px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}

.lti.is-disabled .lti-chip {
  padding-right: 8px;
}

.lti-chip__x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.lti-chip__x:hover {
  background: var(--surface-3);
  color: var(--text);
}

.lti-input {
  flex: 1;
  min-width: 90px;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.lti-empty {
  color: var(--text-3);
  font-size: 12.5px;
}

.lti-sugs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.lti-sug {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px dashed var(--border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.lti-sug:hover {
  border-style: solid;
  border-color: var(--accent);
  color: var(--text);
}

.lti-sug__n {
  color: var(--text-3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 640px) {
  .lti-box {
    min-height: 44px;
  }

  .lti-chip__x {
    width: 24px;
    height: 24px;
  }

  .lti-sug {
    min-height: 36px;
  }
}
</style>
