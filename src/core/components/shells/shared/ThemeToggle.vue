<script setup lang="ts">
import { Sun, Moon } from 'lucide-vue-next'
import { useUiPreferences } from '@/composables/useUiPreferences'

const { theme, toggleTheme } = useUiPreferences()
</script>

<template>
  <button class="theme-btn" :title="theme === 'dark' ? 'Modo claro' : 'Modo escuro'" @click="toggleTheme">
    <component :is="theme === 'dark' ? Sun : Moon" :size="15" />
  </button>
</template>

<style scoped>
.theme-btn {
  width: 30px;
  height: 30px;
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  transition: background var(--motion-fast) var(--motion-ease);
  font-family: inherit;
}

.theme-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}
</style>
