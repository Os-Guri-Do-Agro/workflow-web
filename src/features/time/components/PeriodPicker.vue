<script setup lang="ts">
/**
 * Seletor de período das telas de tempo: Hoje · Mês navegável · Tudo.
 *
 * Componente burro de propósito (props + emits, sem estado próprio): as duas
 * abas de `/time` têm instâncias independentes de `useTimePeriod`, e navegar o
 * mês no ranking não pode mexer na lista pessoal.
 *
 * O bloco do mês é um só controle com três alvos: seta, rótulo, seta. Clicar no
 * rótulo entra no modo mês; clicar numa seta também, para a navegação não exigir
 * dois cliques quando você está em "Hoje".
 */
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { PeriodKind } from '@/features/time/composables/useTimePeriod'

const props = defineProps<{
  kind: PeriodKind
  /** Rótulo do mês exibido, ex.: "Agosto 2026". */
  monthLabel: string
  canGoPrev: boolean
  canGoNext: boolean
}>()

const emit = defineEmits<{
  'update:kind': [value: PeriodKind]
  prev: []
  next: []
}>()

/**
 * Vindo de "Hoje" ou "Tudo", a seta primeiro ENTRA no modo mês (no mês exibido)
 * e só o clique seguinte navega. Saltar direto para o mês anterior faria o
 * primeiro clique pular um mês sem o usuário ter visto o atual.
 */
function stepPrev() {
  if (props.kind !== 'month') {
    emit('update:kind', 'month')
    return
  }
  emit('prev')
}

function stepNext() {
  if (props.kind !== 'month') {
    emit('update:kind', 'month')
    return
  }
  emit('next')
}
</script>

<template>
  <div class="pp" role="group" aria-label="Período">
    <button
      class="pp-chip press"
      :class="{ 'pp-chip--on': kind === 'today' }"
      type="button"
      :aria-pressed="kind === 'today'"
      @click="emit('update:kind', 'today')"
    >
      Hoje
    </button>

    <div class="pp-month" :class="{ 'pp-month--on': kind === 'month' }">
      <button
        class="pp-arrow"
        type="button"
        aria-label="Mês anterior"
        :disabled="kind === 'month' && !canGoPrev"
        @click="stepPrev"
      >
        <ChevronLeft :size="15" />
      </button>

      <button
        class="pp-month-label"
        type="button"
        :aria-pressed="kind === 'month'"
        @click="emit('update:kind', 'month')"
      >
        {{ monthLabel }}
      </button>

      <button
        class="pp-arrow"
        type="button"
        aria-label="Próximo mês"
        :disabled="kind === 'month' && !canGoNext"
        :aria-disabled="kind === 'month' && !canGoNext"
        @click="stepNext"
      >
        <ChevronRight :size="15" />
      </button>
    </div>

    <button
      class="pp-chip press"
      :class="{ 'pp-chip--on': kind === 'all' }"
      type="button"
      :aria-pressed="kind === 'all'"
      @click="emit('update:kind', 'all')"
    >
      Tudo
    </button>
  </div>
</template>

<style scoped>
.pp {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.pp-chip {
  height: 32px;
  padding: 0 13px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.pp-chip:hover:not(.pp-chip--on) {
  color: var(--text);
  border-color: var(--border-strong);
}

.pp-chip--on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}

/* Bloco do mês: um controle só, com as setas embutidas na mesma pílula. */
.pp-month {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 2px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.pp-month--on {
  background: var(--accent);
  border-color: var(--accent);
}

.pp-arrow {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease),
    opacity var(--motion-fast) var(--motion-ease);
}

.pp-arrow:hover:not(:disabled) {
  background: color-mix(in srgb, var(--text) 8%, transparent);
  color: var(--text);
}

.pp-arrow:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.pp-month--on .pp-arrow {
  color: color-mix(in srgb, var(--accent-fg) 78%, transparent);
}

.pp-month--on .pp-arrow:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-fg) 16%, transparent);
  color: var(--accent-fg);
}

.pp-month-label {
  min-width: 104px;
  height: 26px;
  padding: 0 6px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  white-space: nowrap;
  transition: color var(--motion-fast) var(--motion-ease);
}

.pp-month-label:hover {
  color: var(--text);
}

.pp-month--on .pp-month-label,
.pp-month--on .pp-month-label:hover {
  color: var(--accent-fg);
}

.pp-chip:focus-visible,
.pp-arrow:focus-visible,
.pp-month-label:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .pp-chip,
  .pp-month,
  .pp-arrow,
  .pp-month-label {
    transition-duration: 1ms;
  }
}
</style>
