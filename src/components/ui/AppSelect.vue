<script setup lang="ts">
/**
 * AppSelect — primitivo de select padrão do app, construído sobre reka-ui Select.
 *
 * - Aceita `items` como array de strings OU de objetos { label, value }.
 * - Opções renderizam como TEXTO (nunca v-html), evitando markup/entities cruas.
 * - Tokenizado (var(--surface), var(--border), var(--text), var(--accent)…), sem hex.
 * - Acessível por teclado (abrir, setas, Enter, Esc) com foco visível.
 * - Alvo de toque do trigger >= 44px de altura.
 *
 * Internamente cada item recebe uma chave string estável; o reka-ui opera sobre
 * essas chaves e o componente emite de volta o VALOR ORIGINAL (string | number |
 * null), preservando valores falsy como 0 e null sem ambiguidade.
 */
import { computed } from 'vue'
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectIcon,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
} from 'reka-ui'
import { ChevronDown, Check } from 'lucide-vue-next'

type SelectValuePrimitive = string | number | null

interface SelectOption {
  label: string
  value: SelectValuePrimitive
}

type ItemsProp = ReadonlyArray<string> | ReadonlyArray<SelectOption>

const props = withDefaults(
  defineProps<{
    modelValue: SelectValuePrimitive
    items: ItemsProp
    placeholder?: string
    label?: string
    density?: 'compact' | 'comfortable'
    disabled?: boolean
  }>(),
  {
    placeholder: 'Selecione…',
    density: 'comfortable',
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: SelectValuePrimitive]
}>()

// Normaliza items (string[] ou {label,value}[]) para uma forma única com chave estável.
const normalizedItems = computed<{ key: string; label: string; value: SelectValuePrimitive }[]>(
  () =>
    props.items.map((item) => {
      const opt: SelectOption =
        typeof item === 'string' ? { label: item, value: item } : item
      return {
        key: keyOf(opt.value),
        label: opt.label,
        value: opt.value,
      }
    }),
)

function keyOf(value: SelectValuePrimitive): string {
  if (value === null) return 'null'
  if (typeof value === 'number') return `num:${value}`
  return `str:${value}`
}

const labelById = computed(() => {
  const map = new Map<string, string>()
  for (const item of normalizedItems.value) map.set(item.key, item.label)
  return map
})

const valueById = computed(() => {
  const map = new Map<string, SelectValuePrimitive>()
  for (const item of normalizedItems.value) map.set(item.key, item.value)
  return map
})

// reka-ui opera sobre a chave string; convertemos de/para o valor original.
const selectedKey = computed<string | undefined>(() => {
  const key = keyOf(props.modelValue)
  return labelById.value.has(key) ? key : undefined
})

function onUpdate(key: string | undefined) {
  if (key == null) return
  if (valueById.value.has(key)) {
    emit('update:modelValue', valueById.value.get(key) as SelectValuePrimitive)
  }
}
</script>

<template>
  <SelectRoot
    :model-value="selectedKey"
    :disabled="disabled"
    @update:model-value="onUpdate($event as string | undefined)"
  >
    <SelectTrigger
      class="app-select__trigger"
      :class="`app-select__trigger--${density}`"
      :aria-label="label"
    >
      <SelectValue class="app-select__value" :placeholder="placeholder" />
      <SelectIcon class="app-select__chev">
        <ChevronDown :size="15" />
      </SelectIcon>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        class="app-select__content"
        position="popper"
        :side-offset="6"
      >
        <SelectViewport class="app-select__viewport">
          <SelectItem
            v-for="item in normalizedItems"
            :key="item.key"
            :value="item.key"
            class="app-select__item"
          >
            <SelectItemIndicator class="app-select__indicator">
              <Check :size="14" />
            </SelectItemIndicator>
            <SelectItemText>{{ item.label }}</SelectItemText>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<style scoped>
.app-select__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 44px; /* alvo de toque >= 44px (F7) */
  padding: 0 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.2;
  cursor: pointer;
  outline: none;
  text-align: left;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.app-select__trigger--compact {
  min-height: 44px;
  font-size: 12px;
}

.app-select__trigger:hover:not([data-disabled]) {
  border-color: var(--border-strong);
}

.app-select__trigger:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent);
}

.app-select__trigger[data-state='open'] {
  border-color: var(--accent);
}

.app-select__trigger[data-disabled] {
  opacity: 0.55;
  cursor: not-allowed;
}

.app-select__trigger[data-placeholder] .app-select__value {
  color: var(--text-3);
}

.app-select__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select__chev {
  display: inline-flex;
  align-items: center;
  color: var(--text-3);
  flex-shrink: 0;
}

.app-select__content {
  z-index: 10000;
  min-width: var(--reka-select-trigger-width);
  max-height: var(--reka-select-content-available-height);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-overlay);
  overflow: hidden;
}

.app-select__viewport {
  padding: 4px;
  max-height: inherit;
  overflow-y: auto;
  scrollbar-width: thin;
}

.app-select__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 10px 0 30px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.3;
  cursor: pointer;
  user-select: none;
  outline: none;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.app-select__item[data-highlighted] {
  background: var(--surface-2);
  color: var(--text);
}

.app-select__item[data-state='checked'] {
  color: var(--text);
  font-weight: 600;
}

.app-select__item[data-disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}

.app-select__indicator {
  position: absolute;
  left: 8px;
  display: inline-flex;
  align-items: center;
  color: var(--accent);
}

@media (prefers-reduced-motion: reduce) {
  .app-select__trigger,
  .app-select__item {
    transition-duration: 1ms;
  }
}
</style>
