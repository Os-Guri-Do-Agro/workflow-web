<script setup lang="ts">
/**
 * Anel de progresso genérico (spec overhaul-visual-premium, F0).
 *
 * Mesma linguagem do `SubtaskProgress` do board — que é a direção que o dono
 * aprovou para progresso: começa às 12h, cresce no sentido do relógio, mola de
 * verdade (motion-v), completo = `--status-done`, senão `--accent`. Este aqui
 * é maior e aceita conteúdo no centro (número, label) via slot.
 */
import { computed } from 'vue'
import { Motion } from 'motion-v'
import { useMediaQuery } from '@vueuse/core'

const props = withDefaults(
  defineProps<{
    /** 0–100. */
    value: number
    size?: number
    stroke?: number
    ariaLabel?: string
    /** Brilho no traço — para anéis grandes de destaque (hero). */
    glow?: boolean
  }>(),
  { size: 112, stroke: 8, glow: false },
)

const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')

const clamped = computed(() => Math.max(0, Math.min(100, props.value)))
const radius = computed(() => (props.size - props.stroke) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const offset = computed(() => circumference.value * (1 - clamped.value / 100))
const complete = computed(() => clamped.value >= 100)

const ringColor = computed(() =>
  complete.value ? 'var(--status-done)' : 'var(--accent)',
)

// Mesma mola do SubtaskProgress (a sensação aprovada no board).
const transition = computed(() =>
  reduced.value
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 190, damping: 20, mass: 0.8 },
)
</script>

<template>
  <div
    class="pring"
    :style="{ width: `${size}px`, height: `${size}px` }"
    role="img"
    :aria-label="ariaLabel ?? `${Math.round(clamped)}% concluído`"
  >
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true">
      <circle
        class="pring__track"
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        :stroke-width="stroke"
      />
      <Motion
        as="circle"
        class="pring__fill"
        :class="{ 'pring__fill--glow': glow }"
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :style="{ stroke: ringColor }"
        :initial="{ strokeDashoffset: circumference }"
        :animate="{ strokeDashoffset: offset }"
        :transition="transition"
      />
    </svg>
    <div class="pring__center">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.pring {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

/* Começa às 12h e cresce no sentido do relógio (como se lê progresso). */
.pring svg {
  transform: rotate(-90deg);
}

.pring__track {
  stroke: var(--border);
}

.pring__fill--glow {
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 45%, transparent));
}

.pring__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
</style>
