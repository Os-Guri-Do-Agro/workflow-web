<script setup lang="ts">
import { HelpCircle } from 'lucide-vue-next'
import { useOnboarding } from '@/composables/useOnboarding'

const { open } = useOnboarding()

function handleClick() {
  open()
}
</script>

<template>
  <button
    class="help-trigger"
    type="button"
    title="Ajuda e primeiros passos (Cmd+K)"
    aria-label="Abrir ajuda e primeiros passos (atalho Cmd+K)"
    @click="handleClick"
  >
    <HelpCircle :size="15" />
  </button>
</template>

<style scoped>
.help-trigger {
  position: relative;
  width: 44px;
  height: 44px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.help-trigger:hover {
  background: var(--surface-3);
  border-color: var(--border-strong);
  color: var(--text);
}

.help-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  color: var(--text);
}
</style>
