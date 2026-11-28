<script setup lang="ts">
/**
 * Onde o convidado está no fluxo (Horário → Seus dados → Confirmação). Diz,
 * antes do primeiro clique, que são só três passos e que nada é marcado até o
 * último. Passo feito ganha o check; o atual, o número em destaque.
 */
import { Check } from 'lucide-vue-next'

const props = defineProps<{ current: 1 | 2 | 3 }>()

const STEPS = ['Horário', 'Seus dados', 'Confirmação']

const state = (index: number) =>
  index + 1 < props.current ? 'done' : index + 1 === props.current ? 'current' : 'todo'
</script>

<template>
  <ol class="bst" aria-label="Etapas do agendamento">
    <li
      v-for="(label, i) in STEPS"
      :key="label"
      class="bst__step"
      :class="`is-${state(i)}`"
      :aria-current="state(i) === 'current' ? 'step' : undefined"
    >
      <span class="bst__num" aria-hidden="true">
        <Check v-if="state(i) === 'done'" :size="11" :stroke-width="3" />
        <template v-else>{{ i + 1 }}</template>
      </span>
      <span class="bst__label">{{ label }}</span>
      <span v-if="state(i) === 'done'" class="bk-sr">(concluída)</span>
    </li>
  </ol>
</template>

<style scoped>
.bst {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bst__step {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-4);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

/* Fio entre os passos. */
.bst__step + .bst__step::before {
  content: '';
  width: 18px;
  height: 1px;
  margin-right: 1px;
  background: var(--border-strong);
}

.bst__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.bst__step.is-current {
  color: var(--text);
}

.bst__step.is-current .bst__num {
  border-color: transparent;
  background: var(--accent);
  color: var(--accent-fg);
}

.bst__step.is-done {
  color: var(--text-3);
}

.bst__step.is-done .bst__num {
  border-color: transparent;
  background: var(--accent-soft);
  color: var(--accent-ink);
}

/* No celular só o passo atual leva o nome; os outros ficam no número. */
@media (max-width: 520px) {
  .bst__step:not(.is-current) .bst__label {
    display: none;
  }

  .bst__step + .bst__step::before {
    width: 12px;
  }
}
</style>
