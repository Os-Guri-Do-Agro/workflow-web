<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Link2, Loader2, X } from 'lucide-vue-next'
import type { QrCode } from '@/service/qr/qr-service'

/**
 * Dialog de criar/editar QR. O valor central da feature é EDITAR O DESTINO de um
 * QR existente (muda pra onde aponta sem reimprimir) — por isso o campo destino
 * fica em destaque e a UI deixa claro que o mesmo QR passa a apontar pro novo link.
 */
const props = defineProps<{
  modelValue: boolean
  /** QR em edição; null = criação. */
  editing: QrCode | null
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [payload: { targetUrl: string; label: string; active: boolean }]
}>()

const form = reactive({
  targetUrl: '',
  label: '',
  active: true,
})
const touched = ref(false)

const isEdit = computed(() => !!props.editing)

// (Re)popula ao abrir.
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    touched.value = false
    form.targetUrl = props.editing?.targetUrl ?? ''
    form.label = props.editing?.label ?? ''
    form.active = props.editing?.active ?? true
  },
  { immediate: true },
)

const targetError = computed(() => {
  if (!touched.value) return ''
  return form.targetUrl.trim() ? '' : 'Informe o destino do QR'
})

function close() {
  if (!props.loading) emit('update:modelValue', false)
}

function submit() {
  touched.value = true
  if (!form.targetUrl.trim()) return
  emit('submit', {
    targetUrl: form.targetUrl.trim(),
    label: form.label.trim(),
    active: form.active,
  })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="qed-fade">
      <div v-if="modelValue" class="qed-overlay" @mousedown.self="close">
        <section class="qed" role="dialog" aria-modal="true" :aria-label="isEdit ? 'Editar QR' : 'Novo QR'">
          <header class="qed-head">
            <div>
              <p class="qed-eyebrow">{{ isEdit ? 'Editar' : 'Novo' }} QR</p>
              <h2 class="qed-title">{{ isEdit ? 'Trocar destino do QR' : 'Criar QR dinâmico' }}</h2>
            </div>
            <button class="qed-icon-btn" type="button" aria-label="Fechar" :disabled="loading" @click="close">
              <X :size="16" />
            </button>
          </header>

          <form class="qed-body" @submit.prevent="submit">
            <!-- Destino: o campo central -->
            <label class="qed-field">
              <span class="qed-label">Destino do link</span>
              <div class="qed-input-wrap" :class="{ 'qed-input-wrap--err': targetError }">
                <Link2 :size="15" class="qed-input-icon" />
                <input
                  v-model="form.targetUrl"
                  class="qed-input"
                  type="url"
                  inputmode="url"
                  placeholder="https://..."
                  autocomplete="off"
                  @blur="touched = true"
                />
              </div>
              <span v-if="targetError" class="qed-hint qed-hint--err">{{ targetError }}</span>
              <span v-else-if="isEdit" class="qed-hint">
                O mesmo QR impresso passa a apontar para este link — sem reimprimir.
              </span>
            </label>

            <label class="qed-field">
              <span class="qed-label">Nome (opcional)</span>
              <input
                v-model="form.label"
                class="qed-input qed-input--bare"
                type="text"
                placeholder="Ex.: Cartaz da campanha"
                maxlength="120"
              />
            </label>

            <label class="qed-toggle">
              <input v-model="form.active" type="checkbox" class="qed-checkbox" />
              <span class="qed-toggle-text">
                <span class="qed-toggle-title">QR ativo</span>
                <span class="qed-toggle-desc">Desligado, o link responde como inativo.</span>
              </span>
            </label>

            <footer class="qed-actions">
              <button class="qed-btn qed-btn--ghost" type="button" :disabled="loading" @click="close">
                Cancelar
              </button>
              <button class="qed-btn qed-btn--primary" type="submit" :disabled="loading">
                <Loader2 v-if="loading" :size="14" class="spin" />
                <span>{{ isEdit ? 'Salvar destino' : 'Criar QR' }}</span>
              </button>
            </footer>
          </form>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.qed-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(in srgb, var(--text) 55%, transparent);
  backdrop-filter: blur(10px);
}

.qed {
  width: min(460px, 100%);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-overlay);
}

.qed-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}

.qed-eyebrow {
  margin: 0 0 2px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.qed-title {
  margin: 0;
  font-size: 16px;
  font-weight: 750;
  color: var(--text);
}

.qed-icon-btn {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
  flex-shrink: 0;
}

.qed-icon-btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}

.qed-body {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.qed-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.qed-label {
  font-size: 11.5px;
  font-weight: 650;
  color: var(--text-3);
}

.qed-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 46px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  transition: border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.qed-input-wrap:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent);
}

.qed-input-wrap--err {
  border-color: var(--err);
}

.qed-input-icon {
  color: var(--text-3);
  flex-shrink: 0;
}

.qed-input {
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.qed-input--bare {
  height: 46px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.qed-input--bare:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent);
}

.qed-input::placeholder {
  color: var(--text-3);
}

.qed-hint {
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.4;
}

.qed-hint--err {
  color: var(--err);
}

.qed-toggle {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  cursor: pointer;
}

.qed-checkbox {
  width: 18px;
  height: 18px;
  margin-top: 1px;
  accent-color: var(--accent);
  cursor: pointer;
  flex-shrink: 0;
}

.qed-toggle-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.qed-toggle-title {
  font-size: 13px;
  font-weight: 650;
  color: var(--text);
}

.qed-toggle-desc {
  font-size: 11.5px;
  color: var(--text-3);
}

.qed-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 2px;
}

.qed-btn {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  border-radius: var(--radius);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: filter var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.qed-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.qed-btn--ghost {
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
}

.qed-btn--ghost:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.qed-btn--primary {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--accent-fg);
}

.qed-btn--primary:hover:not(:disabled) {
  filter: brightness(1.05);
}

.spin {
  animation: spin 0.8s linear infinite;
}

.qed-fade-enter-active,
.qed-fade-leave-active {
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.qed-fade-enter-from,
.qed-fade-leave-to {
  opacity: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
