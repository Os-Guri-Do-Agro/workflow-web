<script setup lang="ts">
/** Etiquetar ou tirar etiqueta de vários arquivos de uma vez. */
import { ref, watch } from 'vue'
import { Tags, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import LibraryTagInput from './LibraryTagInput.vue'
import './library.css'

const props = defineProps<{
  modelValue: boolean
  count: number
  suggestions: Array<{ tag: string; count: number }>
  loading?: boolean
  error?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  apply: [tags: string[], mode: 'etiquetar' | 'desetiquetar']
}>()

const tags = ref<string[]>([])
watch(
  () => props.modelValue,
  (open) => {
    if (open) tags.value = []
  },
)
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    label="Etiquetas"
    size="sm"
    :loading="loading"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <header class="lib-dlg__head">
      <div class="lib-dlg__title">
        <Tags :size="16" aria-hidden="true" />
        <h2>Etiquetas de {{ count === 1 ? '1 arquivo' : `${count} arquivos` }}</h2>
      </div>
      <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="loading" @click="emit('update:modelValue', false)">
        <X :size="15" aria-hidden="true" />
      </button>
    </header>
    <div class="lib-dlg__body">
      <LibraryTagInput v-model="tags" :suggestions="suggestions" label="Etiquetas para os arquivos" />
      <p class="mk-hint">Enter ou vírgula separa as etiquetas.</p>
      <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
    </div>
    <footer class="lib-dlg__foot">
      <button type="button" class="mk-btn mk-btn--ghost" :disabled="loading || !tags.length" @click="emit('apply', tags, 'desetiquetar')">
        Tirar estas
      </button>
      <button type="button" class="mk-btn mk-btn--primary" data-action="apply-tags" :disabled="loading || !tags.length" @click="emit('apply', tags, 'etiquetar')">
        Adicionar
      </button>
    </footer>
  </AppDialog>
</template>
