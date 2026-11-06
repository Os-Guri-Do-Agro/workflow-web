<script setup lang="ts">
/**
 * Confirmação de "Sair" quando ainda há envio da ala Marketing subindo (ver
 * `composables/useLogout.ts`). Uma só no app inteiro, montada no `App.vue`.
 */
import { computed } from 'vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { confirmLogout, dismissLogout, logoutPrompt } from '@/composables/useLogout'

const message = computed(() => {
  const n = logoutPrompt.pending
  const what = n === 1 ? 'Ainda há 1 arquivo subindo' : `Ainda há ${n} arquivos subindo`
  return `${what} na bandeja Envios. Sair cancela ${n === 1 ? 'o envio' : 'os envios'}, e o que não terminou não fica salvo.`
})
</script>

<template>
  <ConfirmDialog
    :model-value="logoutPrompt.open"
    title="Sair com envio em andamento?"
    :message="message"
    confirm-label="Sair e cancelar"
    cancel-label="Continuar aqui"
    danger
    :loading="logoutPrompt.busy"
    @update:model-value="(v: boolean) => !v && dismissLogout()"
    @confirm="confirmLogout"
  />
</template>
