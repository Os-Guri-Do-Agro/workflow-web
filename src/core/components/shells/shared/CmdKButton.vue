<script setup lang="ts">
import { Search } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    variant?: 'full' | 'compact' | 'icon'
    placeholder?: string
  }>(),
  { variant: 'full', placeholder: 'Buscar projetos, tarefas, pessoas…' },
)

defineEmits<{
  open: []
}>()

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
const shortcutLabel = isMac ? '⌘K' : 'Ctrl K'
</script>

<template>
  <button
    v-if="variant === 'icon'"
    class="cmdk-btn cmdk-btn--icon"
    title="Buscar"
    @click="$emit('open')"
  >
    <Search :size="14" />
  </button>

  <button v-else class="cmdk-btn" :class="`cmdk-btn--${variant}`" @click="$emit('open')">
    <Search :size="14" class="cmdk-icon" />
    <span class="cmdk-text">{{ placeholder }}</span>
    <span class="cmdk-kbd">{{ shortcutLabel }}</span>
  </button>
</template>

<style scoped>
.cmdk-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
  font-family: inherit;
  color: var(--text-3);
}

.cmdk-btn:hover {
  border-color: var(--border-strong);
  background: var(--surface-3);
  color: var(--text-2);
}

.cmdk-btn--full {
  min-width: 260px;
  height: 32px;
  padding: 0 10px;
}

.cmdk-btn--compact {
  height: 28px;
  padding: 0 8px;
}

.cmdk-btn--icon {
  width: 30px;
  height: 30px;
  padding: 0;
  justify-content: center;
}

.cmdk-icon {
  color: var(--text-3);
  flex-shrink: 0;
}

.cmdk-text {
  flex: 1;
  text-align: left;
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cmdk-kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-3);
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--border);
  line-height: 1.4;
  flex-shrink: 0;
}
</style>
