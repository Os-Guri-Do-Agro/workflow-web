<script setup lang="ts">
import type { LucideIcon } from 'lucide-vue-next'

defineProps<{
  icon?: LucideIcon
  title: string
  description?: string
}>()

defineSlots<{
  action(): unknown
}>()
</script>

<template>
  <div class="empty-state">
    <div v-if="icon" class="empty-icon">
      <component :is="icon" :size="32" />
    </div>
    <p class="empty-title">{{ title }}</p>
    <p v-if="description" class="empty-desc">{{ description }}</p>
    <div v-if="$slots.action" class="empty-action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  gap: 6px;
  text-align: center;
}

.empty-icon {
  color: var(--text-4);
  margin-bottom: 4px;
}

.empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-2);
  margin: 0;
}

.empty-desc {
  font-size: 12.5px;
  color: var(--text-3);
  margin: 0;
  max-width: 380px;
}

.empty-action {
  margin-top: 12px;
}
</style>
