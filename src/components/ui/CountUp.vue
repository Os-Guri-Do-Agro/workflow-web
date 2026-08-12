<script setup lang="ts">
/**
 * Wrapper de template do `useCountUp` — existe porque composable não entra em
 * `v-for` (uma instância por item exige um componente). Renderiza só o texto,
 * herdando a tipografia de quem o envolve.
 */
import { useCountUp } from '@/composables/useCountUp'

const props = withDefaults(
  defineProps<{
    value: number
    duration?: number
    decimals?: number
  }>(),
  { duration: 0.7, decimals: 0 },
)

const { display } = useCountUp(
  () => props.value,
  { duration: props.duration, decimals: props.decimals },
)
</script>

<template>
  <span class="count-up">{{ display }}</span>
</template>

<style scoped>
.count-up {
  font-variant-numeric: tabular-nums;
}
</style>
