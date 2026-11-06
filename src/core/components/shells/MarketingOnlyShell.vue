<script setup lang="ts">
import BrandMark from './shared/BrandMark.vue'
import InboxBell from './shared/InboxBell.vue'
import ThemeToggle from './shared/ThemeToggle.vue'
import UserMenu from './shared/UserMenu.vue'

/**
 * Moldura de quem SÓ tem a ala Marketing (freelancer, diretoria convidada):
 * conta sem empresa nenhuma, com papel num grupo. Não tem board, tarefas,
 * empresa nem cronômetro, porque nada disso existe para essa pessoa; tem a
 * marca, o sino (os avisos da ala), o tema e a conta.
 *
 * Quem decide montar esta moldura é o AppShell (zero empresas + algum grupo).
 * Rota fora de `/marketing` e `/settings` volta para `/marketing` lá.
 */
</script>

<template>
  <div class="mo-shell">
    <header class="mo-shell__top">
      <BrandMark :size="28" to="/marketing" />
      <span class="mo-shell__name">Nevo Marketing</span>
      <span class="mo-shell__spacer" />
      <InboxBell />
      <ThemeToggle />
      <UserMenu :show-name="false" />
    </header>
    <div class="mo-shell__content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.mo-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: var(--bg);
  color: var(--text);
}

.mo-shell__top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  min-height: 52px;
  padding: calc(6px + env(safe-area-inset-top)) 14px 6px;
  border-bottom: 1px solid var(--border);
  background: var(--accent-wash, var(--surface));
}

.mo-shell__name {
  font-size: 14px;
  font-weight: 700;
}

.mo-shell__spacer {
  flex: 1;
}

.mo-shell__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
