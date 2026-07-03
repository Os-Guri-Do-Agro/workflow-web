<script setup lang="ts">
import { useUiPreferences } from '@/composables/useUiPreferences'

const { xp, toggleXp } = useUiPreferences()
</script>

<template>
  <button
    class="xp-btn"
    :class="{ 'xp-btn--active': xp }"
    type="button"
    :title="xp ? 'Sair do modo Windows XP' : 'Modo Windows XP'"
    :aria-label="xp ? 'Desativar modo Windows XP' : 'Ativar modo Windows XP'"
    :aria-pressed="xp"
    @click="toggleXp"
  >
    <!-- Bandeira ondulada 2x2 estilo XP, desenhada à mão -->
    <svg viewBox="0 0 48 48" width="17" height="17" aria-hidden="true">
      <path
        d="M4 11 C10 6.5 16 5.5 22 7.5 L22 21.5 C16 19.5 10 20.5 4 25 Z"
        fill="#F35325"
      />
      <path
        d="M26 8.5 C32 10 38 9.5 44 6.5 L44 20.5 C38 23.5 32 24 26 22.5 Z"
        fill="#81BC06"
      />
      <path
        d="M4 29 C10 24.5 16 23.5 22 25.5 L22 39.5 C16 37.5 10 38.5 4 43 Z"
        fill="#05A6F0"
      />
      <path
        d="M26 26.5 C32 28 38 27.5 44 24.5 L44 38.5 C38 41.5 32 42 26 40.5 Z"
        fill="#FFBA08"
      />
    </svg>
  </button>
</template>

<style scoped>
/* Mesmo hit-area 44x44 do ThemeToggle (acessibilidade 50+) */
.xp-btn {
  width: 44px;
  height: 44px;
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background var(--motion-fast) var(--motion-ease),
    filter var(--motion-fast) var(--motion-ease);
  font-family: inherit;
  filter: saturate(0) opacity(0.55);
}

.xp-btn:hover {
  background: var(--surface-2);
  filter: saturate(1) opacity(1);
}

.xp-btn--active {
  filter: saturate(1) opacity(1);
}

.xp-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  filter: saturate(1) opacity(1);
}
</style>
