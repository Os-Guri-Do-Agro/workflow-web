<script setup lang="ts">
import { Loader2, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'

/**
 * Casca dos formulários em janela de Ativações, Parceiros e Orçamentos:
 * cabeçalho com título e X, corpo que rola, rodapé Cancelar + ação. O Enter
 * dentro de um campo envia (é um <form>).
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    submitLabel?: string
    loading?: boolean
    disabled?: boolean
    size?: 'sm' | 'md' | 'lg'
    /** Sem botão de envio (só fechar): janelas de leitura. */
    readonly?: boolean
  }>(),
  { submitLabel: 'Salvar', loading: false, disabled: false, size: 'md', readonly: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: []
}>()

function close() {
  if (!props.loading) emit('update:modelValue', false)
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    :label="title"
    :size="size"
    :loading="loading"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <form class="fd" novalidate @submit.prevent="emit('submit')">
      <header class="fd__head">
        <h2 class="fd__title">{{ title }}</h2>
        <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="loading" @click="close">
          <X :size="16" />
        </button>
      </header>
      <div class="fd__body">
        <slot />
      </div>
      <footer class="fd__foot">
        <button type="button" class="mk-btn mk-btn--ghost" :disabled="loading" @click="close">
          {{ readonly ? 'Fechar' : 'Cancelar' }}
        </button>
        <button v-if="!readonly" type="submit" class="mk-btn mk-btn--primary" :disabled="disabled || loading">
          <Loader2 v-if="loading" :size="14" class="fd__spin" />
          {{ submitLabel }}
        </button>
      </footer>
    </form>
  </AppDialog>
</template>

<style scoped>
.fd {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: calc(100vh - 40px);
}

.fd__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border);
}

.fd__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.fd__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  overflow-y: auto;
  min-height: 0;
}

.fd__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.fd__spin {
  animation: fd-spin 0.8s linear infinite;
}

@keyframes fd-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fd__spin {
    animation-duration: 2s;
  }
}
</style>
