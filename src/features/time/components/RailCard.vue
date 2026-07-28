<script setup lang="ts">
/**
 * Casca dos cards dos rails de insights (individual e equipe). Existe para os
 * dois rails compartilharem superfície, raio, sombra e o mesmo eyebrow de
 * título em vez de cada um redeclarar o mesmo bloco de CSS.
 */
defineProps<{ title: string }>()
</script>

<template>
  <section class="rc">
    <header class="rc__head">
      <h3 class="rc__title">{{ title }}</h3>
      <slot name="aside" />
    </header>
    <slot />
  </section>
</template>

<style scoped>
.rc {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.rc__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.rc__title {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-3);
}
</style>
