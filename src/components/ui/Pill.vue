<script setup lang="ts">
import type { LucideIcon } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    icon?: LucideIcon
    color?: string
    variant?: 'soft' | 'outline' | 'solid'
    size?: 'sm' | 'md'
  }>(),
  { variant: 'soft', size: 'sm' },
)
</script>

<template>
  <span
    class="pill"
    :class="[`pill--${variant}`, `pill--${size}`]"
    :style="
      color
        ? {
            '--pill-c': color,
          }
        : {}
    "
  >
    <component :is="icon" v-if="icon" :size="size === 'sm' ? 11 : 13" />
    <span class="pill-label"><slot /></span>
  </span>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  white-space: nowrap;
  font-weight: 600;
  --pill-c: var(--text-3);
}

.pill--sm {
  height: 20px;
  padding: 0 7px;
  font-size: 10.5px;
}

.pill--md {
  height: 24px;
  padding: 0 10px;
  font-size: 11.5px;
}

.pill--soft {
  background: color-mix(in srgb, var(--pill-c) 14%, transparent);
  color: var(--pill-c);
}

.pill--outline {
  background: transparent;
  color: var(--pill-c);
  border: 1px solid color-mix(in srgb, var(--pill-c) 30%, transparent);
}

.pill--solid {
  background: var(--pill-c);
  color: var(--accent-fg);
}

.pill-label {
  line-height: 1;
}
</style>
