<script setup lang="ts">
/**
 * Indicador honesto de autosave: "Salvando…", "Salvo às HH:MM" e "Erro ao
 * salvar" com botão de tentar de novo. Nunca diz "salvo" antes do servidor
 * confirmar: é o que separa autosave confiável de autosave que mente.
 */
import { computed } from 'vue'
import { AlertCircle, Check, Loader2, RotateCw } from 'lucide-vue-next'
import type { SaveState } from './save-state'

const props = withDefaults(
  defineProps<{
    state: SaveState
    /** Timestamp da última gravação confirmada. */
    savedAt?: number | null
    /** Mensagem do erro, usada como `title` do indicador. */
    message?: string
    compact?: boolean
  }>(),
  { savedAt: null, message: '', compact: false },
)

defineEmits<{ retry: [] }>()

const savedLabel = computed(() => {
  if (!props.savedAt) return 'Salvo'
  const time = new Date(props.savedAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `Salvo às ${time}`
})
</script>

<template>
  <div
    class="save-status"
    :class="[`save-status--${state}`, { 'save-status--compact': compact }]"
    role="status"
    aria-live="polite"
    :title="state === 'error' ? message : undefined"
  >
    <template v-if="state === 'saving'">
      <Loader2 :size="13" class="spin" />
      <span class="save-status__label">Salvando…</span>
    </template>

    <template v-else-if="state === 'saved'">
      <Check :size="13" />
      <span class="save-status__label">{{ savedLabel }}</span>
    </template>

    <template v-else-if="state === 'error'">
      <AlertCircle :size="13" />
      <span class="save-status__label">Erro ao salvar</span>
      <button type="button" class="save-status__retry" @click="$emit('retry')">
        <RotateCw :size="12" />
        Tentar de novo
      </button>
    </template>
  </div>
</template>

<style scoped>
.save-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-3);
}

.save-status--saved {
  color: var(--success);
}

.save-status--error {
  color: var(--err);
  font-weight: 600;
}

.save-status--compact .save-status__label {
  display: none;
}

.save-status__retry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: color-mix(in srgb, var(--err) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--err) 32%, transparent);
  border-radius: var(--radius-sm);
  color: var(--err);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease);
}

.save-status__retry:hover {
  background: color-mix(in srgb, var(--err) 20%, transparent);
}

.save-status__retry:focus-visible {
  outline: 2px solid var(--err);
  outline-offset: 2px;
}

.spin {
  animation: save-status-spin 1s linear infinite;
}

@keyframes save-status-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation-duration: 2.4s;
  }
  .save-status__retry {
    transition-duration: 1ms;
  }
}
</style>
