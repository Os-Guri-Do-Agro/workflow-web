<script setup lang="ts">
import { computed } from 'vue'
import { FileText, Link2, ShieldEllipsis } from 'lucide-vue-next'

type VarType = 'TEXT' | 'URL' | 'SECRET'

const props = withDefaults(
  defineProps<{
    type: VarType
    size?: 'sm' | 'md'
    count?: number
    showLabel?: boolean
  }>(),
  { size: 'sm', showLabel: true },
)

const config = computed(() => {
  if (props.type === 'URL') return { icon: Link2, label: 'URL', color: 'var(--success)' }
  if (props.type === 'SECRET') return { icon: ShieldEllipsis, label: 'Secreto', color: 'var(--status-test)' }
  return { icon: FileText, label: 'Texto', color: 'var(--info)' }
})
</script>

<template>
  <span class="type-chip" :class="`type-chip--${size}`" :style="{ '--chip-c': config.color }">
    <component :is="config.icon" :size="size === 'sm' ? 11 : 13" />
    <span v-if="showLabel" class="chip-label">{{ config.label }}</span>
    <span v-if="count !== undefined" class="chip-count">× {{ count }}</span>
  </span>
</template>

<style scoped>
.type-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  font-weight: 600;
  background: color-mix(in srgb, var(--chip-c) 14%, transparent);
  color: var(--chip-c);
}

.type-chip--sm {
  height: 20px;
  padding: 0 7px;
  font-size: 10.5px;
}

.type-chip--md {
  height: 24px;
  padding: 0 10px;
  font-size: 11.5px;
}

.chip-count {
  font-family: var(--font-mono);
  opacity: 0.75;
  font-size: 10px;
}
</style>
