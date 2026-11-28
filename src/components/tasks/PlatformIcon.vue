<script setup lang="ts">
/**
 * Ícone de plataforma do teste (Web, iOS, Android) a partir do `d` do
 * `@mdi/js` (ver `features/tasks/test-platforms.ts`). Decorativo: quem usa dá
 * o nome acessível no botão ou no texto ao lado.
 */
withDefaults(defineProps<{ path: string; size?: number }>(), { size: 14 })
</script>

<template>
  <svg
    class="platform-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="path" fill="currentColor" />
  </svg>
</template>

<style scoped>
.platform-icon {
  flex: none;
  display: block;
}
</style>
