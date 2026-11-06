<script setup lang="ts">
import { X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'

/** Casca dos diálogos das Configurações: título, fechar, corpo e rodapé. */
defineProps<{ modelValue: boolean; title: string; loading?: boolean; size?: 'sm' | 'md' | 'lg' }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    :label="title"
    :size="size ?? 'md'"
    :loading="loading"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="sd">
      <header class="sd__head">
        <h2>{{ title }}</h2>
        <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="loading" @click="emit('update:modelValue', false)">
          <X :size="16" />
        </button>
      </header>
      <div class="sd__body"><slot /></div>
      <footer v-if="$slots.footer" class="sd__foot"><slot name="footer" /></footer>
    </div>
  </AppDialog>
</template>

<style scoped>
.sd {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sd__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px 8px;
}

.sd__head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.sd__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 16px 14px;
}

.sd__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}
</style>
