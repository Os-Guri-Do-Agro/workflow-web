<script setup lang="ts">
/**
 * ActivitySelect — seletor de tarefa COM BUSCA (reka-ui Combobox). O AppSelect
 * (reka Select) não tem filtro, e a lista de tarefas de uma empresa pode ter
 * dezenas de itens: rolar tudo pra achar uma era a dor. Aqui o trigger parece um
 * select normal (mostra o rótulo escolhido), mas ao abrir tem um campo de busca
 * no topo e "Sem tarefa" fica sempre acessível.
 *
 * Contrato igual ao uso antigo do AppSelect para tarefa:
 *   modelValue: string | null   (id da atividade; null = "Sem tarefa")
 *   items: { label; value: string | null }[]  (com "Sem tarefa" no índice 0)
 */
import { computed, ref, watch } from 'vue'
import {
  ComboboxRoot,
  ComboboxAnchor,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxContent,
  ComboboxInput,
  ComboboxViewport,
  ComboboxItem,
  ComboboxItemIndicator,
} from 'reka-ui'
import { ChevronDown, Check, Search, ListX } from 'lucide-vue-next'

interface ActivityOption {
  label: string
  value: string | null
}

const props = withDefaults(
  defineProps<{
    modelValue: string | null
    items: ReadonlyArray<ActivityOption>
    placeholder?: string
    label?: string
    density?: 'compact' | 'comfortable'
    disabled?: boolean
  }>(),
  {
    placeholder: 'Sem tarefa',
    density: 'comfortable',
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

// reka opera sobre strings; null ("Sem tarefa") vira um sentinel estável.
const NONE = '__none__'
const toKey = (v: string | null) => (v === null ? NONE : v)
const fromKey = (k: string | null | undefined) => (k == null || k === NONE ? null : k)

const open = ref(false)
const query = ref('')

const selectedKey = computed<string>(() => toKey(props.modelValue))

const selectedLabel = computed(() => {
  const found = props.items.find((o) => o.value === props.modelValue)
  return found?.label ?? props.placeholder
})

const isPlaceholder = computed(() => props.modelValue === null)

// "Sem tarefa" fica sempre no topo e sempre visível; o resto filtra pelo texto.
const noneOption = computed<ActivityOption>(
  () => props.items.find((o) => o.value === null) ?? { label: 'Sem tarefa', value: null },
)

const realOptions = computed(() => props.items.filter((o) => o.value !== null))

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return realOptions.value
  return realOptions.value.filter((o) => o.label.toLowerCase().includes(q))
})

function onSelect(value: string | null) {
  emit('update:modelValue', value)
  open.value = false
}

// Limpa a busca ao abrir/fechar para não guardar filtro de uma abertura pra outra.
watch(open, () => {
  query.value = ''
})
</script>

<template>
  <ComboboxRoot
    v-model:open="open"
    v-model:search-term="query"
    :disabled="disabled"
    :ignore-filter="true"
    class="acsel"
  >
    <ComboboxAnchor class="acsel__anchor">
      <ComboboxTrigger
        class="acsel__trigger"
        :class="[`acsel__trigger--${density}`, { 'acsel__trigger--ph': isPlaceholder }]"
        :aria-label="label"
      >
        <span class="acsel__value">{{ selectedLabel }}</span>
        <ChevronDown :size="15" class="acsel__chev" />
      </ComboboxTrigger>
    </ComboboxAnchor>

    <ComboboxPortal>
      <ComboboxContent class="acsel__content" position="popper" :side-offset="6">
        <div class="acsel__search">
          <Search :size="14" class="acsel__search-icon" />
          <ComboboxInput class="acsel__input" placeholder="Buscar tarefa..." />
        </div>

        <ComboboxViewport class="acsel__viewport">
          <!-- Sem tarefa: sempre presente -->
          <ComboboxItem :value="NONE" class="acsel__item" @select="onSelect(null)">
            <ComboboxItemIndicator class="acsel__indicator">
              <Check :size="14" />
            </ComboboxItemIndicator>
            <span class="acsel__item-label">{{ noneOption.label }}</span>
          </ComboboxItem>

          <div v-if="realOptions.length" class="acsel__sep" role="separator" />

          <ComboboxItem
            v-for="opt in filtered"
            :key="opt.value as string"
            :value="opt.value as string"
            class="acsel__item"
            @select="onSelect(opt.value)"
          >
            <ComboboxItemIndicator class="acsel__indicator">
              <Check :size="14" />
            </ComboboxItemIndicator>
            <span class="acsel__item-label">{{ opt.label }}</span>
          </ComboboxItem>

          <div v-if="query && filtered.length === 0" class="acsel__empty">
            <ListX :size="15" />
            <span>Nenhuma tarefa encontrada</span>
          </div>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>

<style scoped>
.acsel,
.acsel__anchor {
  width: 100%;
}

.acsel__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 44px;
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
    box-shadow var(--motion-fast) var(--motion-ease);
}

.acsel__trigger--compact {
  min-height: 36px;
  padding: 0 10px;
  font-size: 12px;
}

.acsel__trigger:hover:not([data-disabled]) {
  border-color: var(--border-strong);
}

.acsel__trigger:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent);
}

.acsel__trigger[data-state='open'] {
  border-color: var(--accent);
}

.acsel__trigger--ph .acsel__value {
  color: var(--text-3);
}

.acsel__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acsel__chev {
  color: var(--text-3);
  flex-shrink: 0;
}
</style>

<!--
  Dropdown em bloco GLOBAL (não scoped): o ComboboxPortal teleporta pro <body>,
  fora do #app, e o atributo data-v-* do scoped não viaja com o nó teleportado.
  Mesmo motivo do AppSelect. Prefixo .acsel__ evita colisão.
-->
<style>
.acsel__content {
  z-index: 10000;
  min-width: var(--reka-combobox-trigger-width);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-overlay);
  overflow: hidden;
  color: var(--text);
}

.acsel__search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}

.acsel__search-icon {
  color: var(--text-3);
  flex-shrink: 0;
}

.acsel__input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
}

.acsel__input::placeholder {
  color: var(--text-4);
}

.acsel__viewport {
  padding: 4px;
  max-height: 280px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.acsel__sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--border);
}

.acsel__item {
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

.acsel__item[data-highlighted] {
  background: var(--surface-2);
  color: var(--text);
}

.acsel__item[data-state='checked'] {
  color: var(--text);
  font-weight: 600;
}

.acsel__item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acsel__indicator {
  position: absolute;
  left: 8px;
  display: inline-flex;
  align-items: center;
  color: var(--accent);
}

.acsel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 20px 12px;
  color: var(--text-4);
  font-size: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .acsel__item {
    transition-duration: 1ms;
  }
}
</style>
