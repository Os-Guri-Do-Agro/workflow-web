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
  flex: 1 1 auto;
  flex-direction: column;
  /* Cabe na tela: o corpo rola e o cabeçalho e o rodapé ficam. `dvh` acompanha
     a barra do navegador no celular (o `.dlg` usa `vh`, que passa dela). */
  min-height: 0;
  min-width: 0;
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
}

.sd__head {
  flex: none;
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
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 16px 14px;
}

/* Quem rola é o corpo: os blocos de dentro não encolhem (a lista com rolagem
   própria não pode virar uma faixa de 0px). */
.sd__body > :deep(*) {
  flex-shrink: 0;
}

.sd__foot {
  display: flex;
  flex: none;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}
</style>
