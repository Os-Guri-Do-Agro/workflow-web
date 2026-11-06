<script setup lang="ts">
/**
 * Abas das colunas do board no celular (spec v2-celular-roadmap-notas, D1): o
 * nome e a contagem de cada coluna, e a aba da coluna à vista com a cor do
 * acento. Tocar leva à coluna; deslizar o board troca a aba (quem liga as duas
 * coisas é o `useBoardPager`, ou o próprio agrupado por pessoa).
 *
 * Padrão de abas do WAI: setas, Home e End andam entre elas, e só a ativa entra
 * no Tab. A faixa rola de lado quando não cabe, e a ativa é trazida para a vista.
 */
import { nextTick, ref, watch, type Component } from 'vue'

export interface BoardColumnTab {
  value: string
  label: string
  icon: Component
  count: number
}

const props = defineProps<{
  columns: readonly BoardColumnTab[]
  active: number
  /** Prefixo do `id` das colunas (`aria-controls`); sem ele, as abas não apontam para painel. */
  panelPrefix?: string
  label?: string
}>()

const emit = defineEmits<{ select: [index: number] }>()

const strip = ref<HTMLElement | null>(null)

/** Pela ordem do DOM: a ordem do array de `ref` em `v-for` não é garantida. */
const tabAt = (index: number) =>
  strip.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index] ?? null

/** Traz a aba ativa para dentro da faixa, sem mexer na rolagem da página. */
function reveal(index: number, smooth: boolean) {
  const el = strip.value
  const tab = tabAt(index)
  if (!el || !tab) return
  const pad = 12
  const left = tab.offsetLeft - pad
  const right = tab.offsetLeft + tab.offsetWidth + pad - el.clientWidth
  const next = el.scrollLeft > left ? left : el.scrollLeft < right ? right : el.scrollLeft
  if (next !== el.scrollLeft) el.scrollTo({ left: Math.max(0, next), behavior: smooth ? 'smooth' : 'auto' })
}

watch(
  () => props.active,
  (i) => void nextTick(() => reveal(i, true)),
)

function onKey(e: KeyboardEvent, index: number) {
  const last = props.columns.length - 1
  const to =
    e.key === 'ArrowRight' ? Math.min(last, index + 1)
    : e.key === 'ArrowLeft' ? Math.max(0, index - 1)
    : e.key === 'Home' ? 0
    : e.key === 'End' ? last
    : null
  if (to === null) return
  e.preventDefault()
  emit('select', to)
  void nextTick(() => tabAt(to)?.focus())
}
</script>

<template>
  <div ref="strip" class="col-tabs" role="tablist" :aria-label="label ?? 'Colunas do board'">
    <button
      v-for="(column, i) in columns"
      :key="column.value"
      type="button"
      role="tab"
      class="col-tab"
      :class="{ 'col-tab--on': i === active }"
      :data-tab="column.value"
      :aria-selected="i === active"
      :aria-controls="panelPrefix ? `${panelPrefix}-${column.value}` : undefined"
      :tabindex="i === active ? 0 : -1"
      @click="emit('select', i)"
      @keydown="onKey($event, i)"
    >
      <component :is="column.icon" :size="14" />
      <span class="col-tab__label">{{ column.label }}</span>
      <span class="col-tab__count">{{ column.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.col-tabs {
  position: relative;
  display: flex;
  gap: 4px;
  flex: none;
  min-width: 0;
  padding: 2px 0 6px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.col-tabs::-webkit-scrollbar {
  display: none;
}

/* 40px de desenho; o ::after fecha 44px de alvo dentro do respiro da faixa. */
.col-tab {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.col-tab::after {
  content: '';
  position: absolute;
  inset: -2px 0;
}

.col-tab > svg {
  flex: none;
}

.col-tab__count {
  font-weight: 400;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

/* A coluna à vista: o acento, como a vista ativa e a aba da tab bar. */
.col-tab--on {
  background: var(--accent-soft);
  border-color: transparent;
  color: var(--accent-ink);
}

.col-tab--on .col-tab__count {
  color: var(--accent-ink);
  font-weight: 600;
}

.col-tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
</style>
