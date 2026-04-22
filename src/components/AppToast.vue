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
</style>
