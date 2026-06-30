<script setup lang="ts">
import { Toaster } from 'vue-sonner'
import { useUiPreferences } from '@/composables/useUiPreferences'

const { theme } = useUiPreferences()
</script>

<template>
  <Toaster
    :theme="theme"
    position="bottom-right"
    rich-colors
    close-button
    :duration="3200"
    :toast-options="{
      style: {
        background: 'var(--surface)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-overlay)',
        borderRadius: 'var(--radius)',
        fontFamily: 'var(--font-family)',
        fontSize: '12.5px',
      },
    }"
    :class-names="{
      toast: 'sonner-toast',
      title: 'sonner-title',
      description: 'sonner-desc',
      actionButton: 'sonner-action',
      cancelButton: 'sonner-cancel',
      closeButton: 'sonner-close',
    }"
  />
</template>

<style>
/* vue-sonner global style tweaks to align with tokens */
:where([data-sonner-toaster]) [data-sonner-toast] {
  font-family: var(--font-family) !important;
}

:where([data-sonner-toaster]) .sonner-title {
  font-weight: 600;
  color: var(--text);
}

:where([data-sonner-toaster]) .sonner-desc {
  color: var(--text-3);
  font-size: 11.5px;
}

:where([data-sonner-toaster]) [data-sonner-toast][data-type='success'] [data-icon] {
  color: var(--success) !important;
}

:where([data-sonner-toaster]) [data-sonner-toast][data-type='error'] [data-icon] {
  color: var(--err) !important;
}

:where([data-sonner-toaster]) [data-sonner-toast][data-type='warning'] [data-icon] {
  color: var(--warn) !important;
}

:where([data-sonner-toaster]) [data-sonner-toast][data-type='info'] [data-icon] {
  color: var(--info) !important;
}

/* Botão dismiss (X) com hit-area >= 44x44 (acessibilidade 50+).
   O ícone segue pequeno; só a área clicável cresce, e ganha foco visível. */
:where([data-sonner-toaster]) [data-close-button],
:where([data-sonner-toaster]) .sonner-close {
  width: 44px !important;
  height: 44px !important;
  /* re-centra o alvo maior sobre o canto onde o vue-sonner ancora o X */
  margin: -8px !important;
  color: var(--text-3) !important;
  background: var(--surface-2) !important;
  border: 1px solid var(--border) !important;
  transition:
    color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease) !important;
}

:where([data-sonner-toaster]) [data-close-button]:hover,
:where([data-sonner-toaster]) .sonner-close:hover {
  color: var(--text) !important;
  background: var(--surface-3) !important;
}

:where([data-sonner-toaster]) [data-close-button]:focus-visible,
:where([data-sonner-toaster]) .sonner-close:focus-visible {
  outline: 2px solid var(--accent) !important;
  outline-offset: 2px !important;
  color: var(--text) !important;
}
</style>
