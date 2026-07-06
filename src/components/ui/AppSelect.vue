<script setup lang="ts">
/**
 * AppSelect — primitivo de select padrão do app, construído sobre reka-ui Select.
 *
 * - Aceita `items` como array de strings OU de objetos { label, value }.
 * - Opções renderizam como TEXTO (nunca v-html), evitando markup/entities cruas.
 * - Tokenizado (var(--surface), var(--border), var(--text), var(--accent)…), sem hex.
 * - Acessível por teclado (abrir, setas, Enter, Esc) com foco visível.
 * - Alvo de toque do trigger >= 44px de altura (comfortable) / 36px (compact).
 *
 * Modo single (default): `modelValue` é `SelectValuePrimitive` (string | number | null).
 * Modo `multiple`: `modelValue` é `SelectValuePrimitive[]` (array de valores originais)
 * e o trigger renderiza CHIPS removíveis em vez do valor único.
 *
 * Internamente cada item recebe uma chave string estável; o reka-ui opera sobre
 * essas chaves e o componente emite de volta o VALOR ORIGINAL (ou array deles),
 * preservando valores falsy como 0 e null sem ambiguidade.
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
import { ChevronDown, Check, X } from 'lucide-vue-next'

type SelectValuePrimitive = string | number | null

interface SelectOption {
  label: string
  value: SelectValuePrimitive
}

type ItemsProp = ReadonlyArray<string> | ReadonlyArray<SelectOption>

const props = withDefaults(
  defineProps<{
    /**
     * Single: SelectValuePrimitive. Multiple: SelectValuePrimitive[] (array de valores).
     */
    modelValue: SelectValuePrimitive | SelectValuePrimitive[]
    items: ItemsProp
    placeholder?: string
    label?: string
    density?: 'compact' | 'comfortable'
    disabled?: boolean
    /** Habilita seleção múltipla com chips no trigger. */
    multiple?: boolean
  }>(),
  {
    placeholder: 'Selecione…',
    density: 'comfortable',
    disabled: false,
    multiple: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: SelectValuePrimitive | SelectValuePrimitive[]]
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
// Modo single: chave única selecionada.
const selectedKey = computed<string | undefined>(() => {
  if (props.multiple) return undefined
  const key = keyOf(props.modelValue as SelectValuePrimitive)
  return labelById.value.has(key) ? key : undefined
})

// Modo multiple: array de chaves selecionadas (só as que existem em items).
const selectedKeys = computed<string[]>(() => {
  if (!props.multiple) return []
  const arr = Array.isArray(props.modelValue) ? props.modelValue : []
  return arr.map((v) => keyOf(v)).filter((k) => labelById.value.has(k))
})

// Chips renderizados no trigger (modo multiple).
const selectedChips = computed(() =>
  selectedKeys.value.map((key) => ({
    key,
    label: labelById.value.get(key) as string,
  })),
)

// model-value passado ao reka-ui: string|undefined (single) ou string[] (multiple).
const rootModelValue = computed<string | string[] | undefined>(() =>
  props.multiple ? selectedKeys.value : selectedKey.value,
)

// Converte chaves → valores originais e emite (usado no modo multiple).
function emitKeys(keys: string[]) {
  const values = keys
    .filter((k) => valueById.value.has(k))
    .map((k) => valueById.value.get(k) as SelectValuePrimitive)
  emit('update:modelValue', values)
}

function onUpdate(payload: string | string[] | undefined) {
  if (props.multiple) {
    emitKeys(Array.isArray(payload) ? payload : [])
    return
  }
  if (payload == null) return
  const key = payload as string
  if (valueById.value.has(key)) {
    emit('update:modelValue', valueById.value.get(key) as SelectValuePrimitive)
  }
}

// Remove um valor específico do array (botão X do chip) e re-emite.
function removeKey(key: string) {
  emitKeys(selectedKeys.value.filter((k) => k !== key))
}
</script>

<template>
  <SelectRoot
    :model-value="rootModelValue"
    :multiple="multiple"
    :disabled="disabled"
    @update:model-value="onUpdate($event as string | string[] | undefined)"
  >
    <SelectTrigger
      class="app-select__trigger"
      :class="[`app-select__trigger--${density}`, { 'app-select__trigger--multiple': multiple }]"
      :aria-label="label"
    >
      <!-- Modo single: valor único via reka SelectValue -->
      <SelectValue v-if="!multiple" class="app-select__value" :placeholder="placeholder" />

      <!-- Modo multiple: chips removíveis (ou placeholder se vazio) -->
      <template v-else>
        <span v-if="selectedChips.length" class="app-select__chips">
          <span v-for="chip in selectedChips" :key="chip.key" class="app-select__chip">
            <span class="app-select__chip-label">{{ chip.label }}</span>
            <span
              class="app-select__chip-x"
              role="button"
              tabindex="-1"
              :aria-label="`Remover ${chip.label}`"
              @pointerdown.stop.prevent
              @click.stop="removeKey(chip.key)"
            >
              <X :size="12" />
            </span>
          </span>
        </span>
        <span v-else class="app-select__value app-select__value--placeholder">
          {{ placeholder }}
        </span>
      </template>

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

/* comfortable: mantém 44px (default confortável de toque) */
.app-select__trigger--comfortable {
  min-height: 44px;
}

/* compact: alvo mais denso (~36px) mantendo legibilidade e padding proporcional */
.app-select__trigger--compact {
  min-height: 36px;
  padding: 0 10px;
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

/* Multiple: chips podem quebrar linha; padding vertical p/ crescer verticalmente */
.app-select__trigger--multiple {
  height: auto;
  padding-top: 4px;
  padding-bottom: 4px;
}

.app-select__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select__value--placeholder {
  color: var(--text-3);
}

/* Container de chips: cresce e quebra linha; chevron fica sempre à direita */
.app-select__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.app-select__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 2px 4px 2px 8px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-size: 11.5px;
  line-height: 1.4;
}

.app-select__chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select__chip-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition:
    color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.app-select__chip-x:hover {
  color: var(--text);
  background: var(--surface-2);
}

.app-select__chev {
  display: inline-flex;
  align-items: center;
  color: var(--text-3);
  flex-shrink: 0;
}

@media (prefers-reduced-motion: reduce) {
  .app-select__trigger,
  .app-select__chip-x {
    transition-duration: 1ms;
  }
}
</style>

<!--
  Estilos do DROPDOWN (SelectContent) em bloco GLOBAL, não scoped.
  O <SelectPortal> da reka-ui teleporta o conteúdo para o <body>, FORA do #app.
  O atributo data-v-* do <style scoped> NÃO viaja com o nó teleportado, então
  regras scoped não alcançam o dropdown — era por isso que o fundo do menu
  ficava transparente ("select invisível"). Aqui as regras são globais, com
  prefixo próprio (.app-select__*) para não colidir com nada.
-->
<style>
.app-select__content {
  z-index: 10000;
  min-width: var(--reka-select-trigger-width);
  max-height: var(--reka-select-content-available-height);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-overlay);
  overflow: hidden;
  color: var(--text);
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
  .app-select__item {
    transition-duration: 1ms;
  }
}
</style>
