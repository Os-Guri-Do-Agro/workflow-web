<script setup lang="ts">
/**
 * Anel de progresso das subtarefas.
 *
 * O painel de detalhe listava subtarefas sem dizer quanto do trabalho estava
 * feito: para saber, a pessoa contava com o dedo. O anel responde de relance, e
 * o número exato fica ao lado para quem precisa da conta.
 *
 * O desenho do anel (12h, mola, done = `--status-done`) vive no primitive
 * `ProgressRing` do design system — este componente só traduz done/total para
 * percentual e põe o rótulo ao lado. Manter duas implementações do anel fazia
 * o hero do dashboard e o board divergirem a cada ajuste.
 */
import { computed } from 'vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'

const props = withDefaults(
  defineProps<{
    done: number
    total: number
    size?: number
  }>(),
  { size: 34 },
)

const ratio = computed(() => (props.total > 0 ? props.done / props.total : 0))
const percent = computed(() => Math.round(ratio.value * 100))
</script>

<template>
  <div class="subtask-progress">
    <ProgressRing
      :value="percent"
      :size="size"
      :stroke="3"
      :aria-label="`${done} de ${total} subtarefas concluídas, ${percent}%`"
    />

    <span class="subtask-progress__label">
      <strong>{{ done }}</strong>
      de {{ total }}
    </span>
  </div>
</template>

<style scoped>
.subtask-progress {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.subtask-progress__label {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.subtask-progress__label strong {
  color: var(--text);
  font-weight: 650;
}
</style>
