<script setup lang="ts">
/**
 * Nome de pasta/arquivo (criar ou renomear) — casca `AppDialog`, um campo só.
 * O submit fica com quem abriu: o dialog não conhece service nenhum.
 */
import { ref, watch } from 'vue'
import { FolderPen, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    /** Rótulo do campo (aria) e placeholder. */
    fieldLabel: string
    initialName?: string
    submitLabel?: string
    loading?: boolean
  }>(),
  { initialName: '', submitLabel: 'Salvar', loading: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [name: string]
}>()

const name = ref(props.initialName)

watch(
  () => props.modelValue,
  (open) => {
    if (open) name.value = props.initialName
  },
)

function submit() {
  const value = name.value.trim()
  if (!value || props.loading) return
  emit('submit', value)
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
    <header class="dnd__head">
      <div class="dnd__title">
        <FolderPen :size="16" />
        <h2>{{ title }}</h2>
      </div>
      <button
        type="button"
        class="dnd__x press"
        aria-label="Fechar"
        :disabled="loading"
        @click="emit('update:modelValue', false)"
      >
        <X :size="15" />
      </button>
    </header>

    <form class="dnd__body" @submit.prevent="submit">
      <input
        v-model="name"
        class="dnd__input"
        type="text"
        :placeholder="fieldLabel"
        :aria-label="fieldLabel"
        maxlength="120"
        autofocus
        :disabled="loading"
      />

      <footer class="dnd__foot">
        <button
          type="button"
          class="dnd__btn dnd__btn--ghost press"
          :disabled="loading"
          @click="emit('update:modelValue', false)"
        >
          Cancelar
        </button>
        <button
          type="submit"
          class="dnd__btn dnd__btn--primary press"
          :disabled="loading || !name.trim()"
        >
          {{ loading ? 'Salvando…' : submitLabel }}
        </button>
      </footer>
    </form>
  </AppDialog>
</template>

<style scoped>
.dnd__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border);
}

.dnd__title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
}

.dnd__title h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.dnd__x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.dnd__x:hover {
  background: var(--surface-2);
  color: var(--text);
}

.dnd__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 16px 16px;
}

.dnd__input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
}

.dnd__input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.dnd__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dnd__btn {
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.dnd__btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.dnd__btn--ghost {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-2);
}

.dnd__btn--ghost:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}

.dnd__btn--primary {
  border: none;
  background: var(--accent);
  color: var(--accent-fg);
}
</style>
