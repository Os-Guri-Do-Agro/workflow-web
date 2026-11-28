<script setup lang="ts">
/**
 * Seletor de fuso com busca (reka-ui Combobox, mesmo molde do ActivitySelect).
 * São ~400 fusos IANA: lista sem busca é inutilizável. A busca ignora acento
 * e casa cidade, região, nome longo e offset ("lisboa", "gmt+1", "brasilia").
 */
import { computed, ref, watch } from 'vue'
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
} from 'reka-ui'
import { Check, ChevronDown, Globe, Search } from 'lucide-vue-next'
import { gmtOffset, searchZones, zoneLongName } from '../booking-time'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label?: string
    /** `inline` = texto clicável (página pública); `field` = campo de formulário. */
    variant?: 'inline' | 'field'
  }>(),
  { label: 'Fuso horário', variant: 'field' },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const query = ref('')

const results = computed(() => searchZones(query.value).slice(0, 200))

const currentLabel = computed(
  () => `${zoneLongName(props.modelValue)} (${gmtOffset(props.modelValue)})`,
)

function pick(value: string) {
  emit('update:modelValue', value)
  open.value = false
}

watch(open, () => {
  query.value = ''
})
</script>

<template>
  <ComboboxRoot v-model:open="open" :ignore-filter="true" class="tzs">
    <ComboboxAnchor class="tzs__anchor">
      <ComboboxTrigger class="tzs__trigger" :class="`tzs__trigger--${variant}`" :aria-label="label">
        <Globe v-if="variant === 'field'" :size="14" class="tzs__globe" />
        <span class="tzs__value">{{ currentLabel }}</span>
        <ChevronDown :size="14" class="tzs__chev" />
      </ComboboxTrigger>
    </ComboboxAnchor>

    <ComboboxPortal>
      <ComboboxContent class="tzs__content" position="popper" :side-offset="6" align="start">
        <div class="tzs__search">
          <Search :size="14" />
          <ComboboxInput
            v-model="query"
            :display-value="() => ''"
            class="tzs__input"
            placeholder="Buscar cidade ou fuso..."
          />
        </div>
        <ComboboxViewport class="tzs__viewport">
          <ComboboxItem
            v-for="zone in results"
            :key="zone.value"
            :value="zone.value"
            class="tzs__item"
            :data-current="zone.value === modelValue ? '' : undefined"
            @select="pick(zone.value)"
          >
            <ComboboxItemIndicator class="tzs__indicator">
              <Check :size="13" />
            </ComboboxItemIndicator>
            <span class="tzs__city">{{ zone.city }}</span>
            <span class="tzs__region">{{ zone.region }}</span>
            <span class="tzs__offset">{{ zone.offset }}</span>
          </ComboboxItem>
          <p v-if="!results.length" class="tzs__empty">Nenhum fuso encontrado</p>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>

<style scoped>
.tzs,
.tzs__anchor {
  min-width: 0;
}

.tzs__trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  font-family: inherit;
  cursor: pointer;
  outline: none;
  color: var(--text-2);
  text-align: left;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.tzs__trigger--field {
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-size: 12.5px;
}

.tzs__trigger--field:hover,
.tzs__trigger--field[data-state='open'] {
  border-color: var(--border-strong);
}

/* Sem margem negativa aqui: ela encolhia o próprio contêiner e o
   `max-width: 100%` cortava o "(GMT-3)". Quem quer alinhar o texto pela
   borda puxa o contêiner (ver .sp__tz no SlotPicker). */
.tzs__trigger--inline {
  padding: 5px 8px;
  margin: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
}

.tzs__trigger--inline:hover,
.tzs__trigger--inline[data-state='open'] {
  color: var(--text);
  background: var(--surface-2);
}

.tzs__trigger:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
}

.tzs__value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tzs__trigger--field .tzs__value {
  flex: 1;
}

/* Na página pública o fuso é informação, não campo: cabe numa linha e, na
   tela bem estreita, quebra em vez de cortar justamente o "(GMT-3)", que é a
   parte que tira a dúvida. */
.tzs__trigger--inline .tzs__value {
  line-height: 1.35;
}

@media (max-width: 400px) {
  .tzs__trigger--inline .tzs__value {
    white-space: normal;
  }
}

.tzs__globe,
.tzs__chev {
  flex-shrink: 0;
  color: var(--text-3);
}
</style>

<!-- Global: o ComboboxPortal teleporta para o <body> (mesmo motivo do AppSelect). -->
<style>
.tzs__content {
  z-index: 10000;
  width: min(360px, calc(100vw - 32px));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-overlay);
  overflow: hidden;
  color: var(--text);
}

.tzs__search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text-3);
}

.tzs__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
}

.tzs__input::placeholder {
  color: var(--text-4);
}

.tzs__viewport {
  max-height: 300px;
  padding: 4px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.tzs__item {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 0 10px 0 30px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-size: 12.5px;
  cursor: pointer;
  user-select: none;
  outline: none;
}

.tzs__item[data-highlighted] {
  background: var(--surface-2);
  color: var(--text);
}

.tzs__item[data-current] {
  color: var(--text);
  font-weight: 600;
}

.tzs__indicator {
  position: absolute;
  left: 9px;
  display: inline-flex;
  color: var(--accent);
}

.tzs__city {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tzs__region {
  color: var(--text-4);
  font-size: 11px;
}

.tzs__offset {
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.tzs__empty {
  margin: 0;
  padding: 14px;
  color: var(--text-3);
  font-size: 12.5px;
  text-align: center;
}
</style>
