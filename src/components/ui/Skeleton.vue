<script setup lang="ts">
withDefaults(
  defineProps<{
    type?: 'row' | 'card' | 'text' | 'block'
    lines?: number
    height?: string
  }>(),
  { type: 'row', lines: 1, height: '16px' },
)
</script>

<template>
  <div v-if="type === 'row'" class="skeleton-row">
    <div class="shimmer" :style="{ height, width: '60%' }" />
    <div class="shimmer" :style="{ height, width: '40%' }" />
  </div>
  <div v-else-if="type === 'card'" class="skeleton-card">
    <div class="shimmer" style="height: 40px; width: 40px; border-radius: 8px" />
    <div class="skeleton-lines">
      <div class="shimmer" style="height: 14px; width: 60%" />
      <div class="shimmer" style="height: 12px; width: 40%" />
    </div>
  </div>
  <div v-else-if="type === 'text'" class="skeleton-text">
    <div v-for="i in lines" :key="i" class="shimmer" :style="{ height, width: i === lines ? '60%' : '100%' }" />
  </div>
  <div v-else class="shimmer" :style="{ height }" />
</template>

<style scoped>
.shimmer {
  background: linear-gradient(
    90deg,
    var(--surface-2) 0%,
    var(--surface-3) 50%,
    var(--surface-2) 100%
  );
  background-size: 200% 100%;
  border-radius: 6px;
  animation: shimmer 1.4s ease infinite;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
}

.skeleton-card {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.skeleton-lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.skeleton-text {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@media (prefers-reduced-motion: reduce) {
  .shimmer {
    animation: none;
    background: var(--surface-2);
  }
}
</style>
