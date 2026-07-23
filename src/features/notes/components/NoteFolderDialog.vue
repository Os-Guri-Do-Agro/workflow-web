<script setup lang="ts">
/**
 * Criar ou renomear pasta, com escolha de cor. Segue o padrão de overlay do
 * projeto: Teleport + scrim próprio + tokens, sem `v-dialog`.
 */
import { nextTick, ref, watch } from 'vue'
import { Loader2, X } from 'lucide-vue-next'
import { NOTE_COLORS } from '../note-palette'
import type { NoteFolderNode } from '../types'

const props = defineProps<{
  modelValue: boolean
  /** Presente = renomear essa pasta. */
  folder?: NoteFolderNode | null
  /** Presente = criar subpasta dentro dessa pasta. */
  parent?: NoteFolderNode | null
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  submit: [{ name: string; color: string }]
}>()

const name = ref('')
const color = ref('')
const input = ref<HTMLInputElement | null>(null)

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    name.value = props.folder?.name ?? ''
    color.value = props.folder?.color ?? ''
    await nextTick()
    input.value?.focus()
    input.value?.select()
  },
)

function close() {
  if (!props.loading) emit('update:modelValue', false)
}

function submit() {
  const value = name.value.trim()
  if (!value || props.loading) return
  emit('submit', { name: value, color: color.value })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="folder-fade">
      <div v-if="modelValue" class="folder-scrim" @mousedown.self="close">
        <div
          class="folder-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="folder ? 'Editar pasta' : parent ? 'Nova subpasta' : 'Nova pasta'"
          @keydown.esc="close"
        >
          <header class="folder-dialog__head">
            <h2>{{ folder ? 'Editar pasta' : parent ? 'Nova subpasta' : 'Nova pasta' }}</h2>
            <button type="button" aria-label="Fechar" @click="close">
              <X :size="16" />
            </button>
          </header>

          <p v-if="parent" class="folder-dialog__parent">
            Dentro de <strong>{{ parent.name }}</strong>
          </p>

          <label class="folder-dialog__label" for="folder-name">Nome</label>
          <input
            id="folder-name"
            ref="input"
            v-model="name"
            type="text"
            class="folder-dialog__input"
            placeholder="Reuniões"
            maxlength="60"
            @keydown.enter.prevent="submit"
          />

          <span class="folder-dialog__label">Cor</span>
          <div class="folder-dialog__colors">
            <button
              type="button"
              class="folder-dialog__color folder-dialog__color--none"
              :class="{ 'folder-dialog__color--on': !color }"
              aria-label="Sem cor"
              @click="color = ''"
            />
            <button
              v-for="option in NOTE_COLORS"
              :key="option"
              type="button"
              class="folder-dialog__color"
              :class="{ 'folder-dialog__color--on': color === option }"
              :style="{ backgroundColor: option }"
              :aria-label="`Cor ${option}`"
              @click="color = option"
            />
          </div>

          <footer class="folder-dialog__foot">
            <button type="button" class="folder-dialog__btn" @click="close">Cancelar</button>
            <button
              type="button"
              class="folder-dialog__btn folder-dialog__btn--primary"
              :disabled="!name.trim() || loading"
              @click="submit"
            >
              <Loader2 v-if="loading" :size="14" class="spin" />
              {{ folder ? 'Salvar' : 'Criar pasta' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.folder-scrim {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  backdrop-filter: blur(3px);
}

.folder-dialog {
  width: 100%;
  max-width: 380px;
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
}

.folder-dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.folder-dialog__head h2 {
  margin: 0;
  color: var(--text);
  font-size: 15px;
  font-weight: 640;
}

.folder-dialog__head button {
  display: inline-flex;
  padding: 5px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-3);
  cursor: pointer;
}

.folder-dialog__head button:hover {
  background: var(--surface-2);
  color: var(--text);
}

.folder-dialog__parent {
  margin: -6px 0 14px;
  color: var(--text-3);
  font-size: 12.5px;
}

.folder-dialog__parent strong {
  color: var(--text-2);
}

.folder-dialog__label {
  display: block;
  margin-bottom: 6px;
  color: var(--text-3);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.folder-dialog__input {
  width: 100%;
  margin-bottom: 16px;
  padding: 9px 11px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: inherit;
  font-size: 13.5px;
}

.folder-dialog__input:focus {
  outline: none;
  border-color: var(--accent);
}

.folder-dialog__colors {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 20px;
}

.folder-dialog__color {
  width: 24px;
  height: 24px;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
}

.folder-dialog__color--none {
  background: var(--surface-3);
  border-color: var(--border-strong);
}

.folder-dialog__color--on {
  border-color: var(--text);
}

.folder-dialog__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.folder-dialog__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.folder-dialog__btn:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}

.folder-dialog__btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
  font-weight: 600;
}

.folder-dialog__btn--primary:hover:not(:disabled) {
  filter: brightness(1.08);
  color: var(--accent-fg);
}

.folder-dialog__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spin {
  animation: folder-spin 1s linear infinite;
}

@keyframes folder-spin {
  to {
    transform: rotate(360deg);
  }
}

.folder-fade-enter-active,
.folder-fade-leave-active {
  transition: opacity var(--motion) var(--motion-ease);
}

.folder-fade-enter-from,
.folder-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .folder-fade-enter-active,
  .folder-fade-leave-active {
    transition-duration: 1ms;
  }
  .spin {
    animation-duration: 2.4s;
  }
}
</style>
