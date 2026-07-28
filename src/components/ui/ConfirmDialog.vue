<script setup lang="ts">
/**
 * ConfirmDialog — confirmação padrão do design system. A casca (Teleport,
 * scrim, Esc, foco, transição) vem do AppDialog; aqui fica só o layout de
 * confirmação: ícone de alerta, título + mensagem, Cancelar/Confirmar.
 */
import { AlertTriangle, Loader2, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  danger?: boolean
}>(), {
  confirmLabel: 'Confirmar',
  cancelLabel: 'Cancelar',
  loading: false,
  danger: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
}>()

function close() {
  if (!props.loading) emit('update:modelValue', false)
}

function handleConfirm() {
  if (!props.loading) emit('confirm')
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    :label="title"
    size="sm"
    :loading="loading"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="confirm-pad">
      <header class="confirm-head">
        <span class="confirm-icon" :class="{ danger }">
          <AlertTriangle :size="18" />
        </span>
        <button class="confirm-close" type="button" aria-label="Fechar" :disabled="loading" @click="close">
          <X :size="16" />
        </button>
      </header>

      <div class="confirm-body">
        <h2>{{ title }}</h2>
        <p>{{ message }}</p>
      </div>

      <footer class="confirm-actions">
        <button class="confirm-cancel press" type="button" :disabled="loading" @click="close">
          {{ cancelLabel }}
        </button>
        <button class="confirm-submit press" :class="{ danger }" type="button" :disabled="loading" @click="handleConfirm">
          <Loader2 v-if="loading" :size="14" class="spin" />
          {{ confirmLabel }}
        </button>
      </footer>
    </div>
  </AppDialog>
</template>

<style scoped>
.confirm-pad {
  padding: 16px;
}

.confirm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.confirm-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warn) 16%, var(--surface-2));
  color: var(--warn);
}

.confirm-icon.danger {
  background: color-mix(in srgb, var(--err) 16%, var(--surface-2));
  color: var(--err);
}

.confirm-close {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
}

.confirm-close:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.confirm-close:disabled,
.confirm-cancel:disabled,
.confirm-submit:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.confirm-body h2 {
  margin: 0;
  color: var(--text);
  font-size: 18px;
  letter-spacing: -0.03em;
}

.confirm-body p {
  margin: 8px 0 0;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.confirm-cancel,
.confirm-submit {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--radius);
  padding: 8px 14px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.confirm-cancel {
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
}

.confirm-submit {
  border: 1px solid color-mix(in srgb, var(--accent) 60%, var(--border));
  background: var(--accent);
  color: var(--accent-fg);
}

.confirm-submit.danger {
  border-color: color-mix(in srgb, var(--err) 60%, var(--border));
  background: var(--err);
  color: white;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
