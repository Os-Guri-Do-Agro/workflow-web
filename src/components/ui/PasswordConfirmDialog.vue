<script setup lang="ts">
import { ref, watch } from 'vue'
import { ShieldAlert, Loader2, X } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    loading?: boolean
  }>(),
  {
    confirmLabel: 'Excluir',
    cancelLabel: 'Voltar',
    loading: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  // Emite a senha digitada — o pai valida no backend.
  confirm: [password: string]
}>()

const password = ref('')

// Limpa a senha ao abrir/fechar (nunca deixa resíduo em memória do componente).
watch(
  () => props.modelValue,
  () => {
    password.value = ''
  },
)

function close() {
  if (!props.loading) emit('update:modelValue', false)
}

function handleConfirm() {
  if (!props.loading && password.value) emit('confirm', password.value)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div v-if="modelValue" class="confirm-overlay" @mousedown.self="close">
        <section
          class="confirm-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <header class="confirm-head">
            <span class="confirm-icon danger">
              <ShieldAlert :size="18" />
            </span>
            <button
              class="confirm-close"
              type="button"
              aria-label="Fechar"
              :disabled="loading"
              @click="close"
            >
              <X :size="16" />
            </button>
          </header>

          <div class="confirm-body">
            <h2>{{ title }}</h2>
            <p>{{ message }}</p>

            <label class="confirm-field">
              <span class="confirm-field-label">Digite sua senha para confirmar</span>
              <input
                v-model="password"
                type="password"
                class="confirm-input"
                autocomplete="current-password"
                placeholder="Sua senha"
                :disabled="loading"
                @keydown.enter.prevent="handleConfirm"
              />
            </label>
          </div>

          <footer class="confirm-actions">
            <button
              class="confirm-cancel press"
              type="button"
              :disabled="loading"
              @click="close"
            >
              {{ cancelLabel }}
            </button>
            <button
              class="confirm-submit danger press"
              type="button"
              :disabled="loading || !password"
              @click="handleConfirm"
            >
              <Loader2 v-if="loading" :size="14" class="spin" />
              {{ confirmLabel }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(10px);
}

.confirm-dialog {
  width: min(420px, 100%);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-overlay);
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

.confirm-field {
  display: block;
  margin-top: 14px;
}

.confirm-field-label {
  display: block;
  margin-bottom: 6px;
  color: var(--text-3);
  font-size: 11.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.confirm-input {
  width: 100%;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 14px;
}

.confirm-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
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

.confirm-submit.danger {
  border: 1px solid color-mix(in srgb, var(--err) 60%, var(--border));
  background: var(--err);
  color: white;
}

.spin {
  animation: spin 0.8s linear infinite;
}

.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
