<script setup lang="ts">
/**
 * Anel de progresso das subtarefas.
 *
 * O painel de detalhe listava subtarefas sem dizer quanto do trabalho estava
 * feito: para saber, a pessoa contava com o dedo. O anel responde de relance, e
 * o número exato fica ao lado para quem precisa da conta.
 *
 * O movimento é mola de verdade (`motion-v`), não transição linear: marcar uma
 * subtarefa é a única recompensa imediata que a tela dá, e a mola é o que faz
 * isso parecer resposta em vez de redesenho. Com `prefers-reduced-motion` a
 * animação é desligada e o anel salta direto para o valor final.
 */
import { computed } from 'vue'
import { Motion } from 'motion-v'
import { useMediaQuery } from '@vueuse/core'

const props = withDefaults(
  defineProps<{
    done: number
    total: number
    size?: number
  }>(),
  { size: 34 },
)

const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')

const stroke = 3
const radius = computed(() => (props.size - stroke) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)

const ratio = computed(() => (props.total > 0 ? props.done / props.total : 0))
const offset = computed(() => circumference.value * (1 - ratio.value))
const percent = computed(() => Math.round(ratio.value * 100))
const complete = computed(() => props.total > 0 && props.done === props.total)

/**
 * Concluído usa o token de status DONE; o resto usa o acento. É a mesma
 * associação de cor que o board e os chips de status já fazem, então o anel não
 * inventa um significado novo de cor.
 */
const trackColor = computed(() =>
  complete.value ? 'var(--status-done)' : 'var(--accent)',
)

const transition = computed(() =>
  reduced.value
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 190, damping: 20, mass: 0.8 },
)
</script>

<template>
  <div class="subtask-progress">
    <svg
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
      role="img"
      :aria-label="`${done} de ${total} subtarefas concluídas, ${percent}%`"
    >
      <circle
        class="subtask-progress__track"
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        :stroke-width="stroke"
      />
      <Motion
        as="circle"
        class="subtask-progress__fill"
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :style="{ stroke: trackColor }"
        :initial="{ strokeDashoffset: circumference }"
        :animate="{ strokeDashoffset: offset }"
        :transition="transition"
      />
    </svg>

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

/* O anel começa às 12 horas e cresce no sentido do relógio, que é como se lê
   progresso. Sem isso ele começaria às 3 horas. */
.subtask-progress svg {
  transform: rotate(-90deg);
}

.subtask-progress__track {
  stroke: var(--border);
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
