<script setup lang="ts">
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'
import { cardStatusLabel, type CardStatus } from '../marketing-labels'
import { PRINT_TRAIL } from './usePrint'

/** Trilha da peça: onde ela está entre produção e entrega. */
const props = defineProps<{ status: CardStatus }>()

const index = computed(() => PRINT_TRAIL.indexOf(props.status))
// Ideia e Ajustes pedidos ficam fora da trilha: nenhuma etapa acesa.
const off = computed(() => index.value < 0)
</script>

<template>
  <ol class="pt" aria-label="Trilha da peça">
    <li
      v-for="(s, i) in PRINT_TRAIL"
      :key="s"
      class="pt-step"
      :class="{ 'is-done': !off && i < index, 'is-current': !off && i === index }"
      :aria-current="!off && i === index ? 'step' : undefined"
    >
      <span class="pt-dot" aria-hidden="true"><Check v-if="!off && i < index" :size="10" /></span>
      <span class="pt-label">{{ cardStatusLabel(s, 'PRINT') }}</span>
    </li>
  </ol>
</template>

<style scoped>
.pt {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pt-step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  min-width: 0;
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.25;
}

/* Fio entre as etapas */
.pt-step::before {
  content: '';
  position: absolute;
  top: 7px;
  left: 16px;
  right: -4px;
  height: 2px;
  background: var(--border);
}

.pt-step:last-child::before {
  display: none;
}

.pt-step.is-done::before {
  background: var(--accent);
}

.pt-dot {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-strong);
  border-radius: 50%;
  background: var(--surface);
  color: var(--accent-fg);
}

.is-done .pt-dot {
  border-color: var(--accent);
  background: var(--accent);
}

.is-current .pt-dot {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.is-current {
  color: var(--accent-ink);
  font-weight: 700;
}

.is-done {
  color: var(--text-2);
}

.pt-label {
  padding-right: 4px;
}

@media (max-width: 640px) {
  .pt {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    row-gap: 10px;
  }

  .pt-step:nth-child(3)::before {
    display: none;
  }
}
</style>
