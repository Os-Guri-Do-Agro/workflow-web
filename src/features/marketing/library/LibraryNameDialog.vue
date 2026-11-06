<script setup lang="ts">
/** Criar ou renomear pasta do Acervo (o servidor confere nome repetido e os 5 níveis). */
import { ref, watch } from 'vue'
import { FolderPen, FolderPlus, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import './library.css'

const props = defineProps<{
  modelValue: boolean
  mode: 'create' | 'rename'
  /** Onde: "PetJourney / Fotos" */
  where: string
  initialName?: string
  loading?: boolean
  error?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [name: string]
}>()

const name = ref('')
watch(
  () => props.modelValue,
  (open) => {
    if (open) name.value = props.initialName ?? ''
  },
  { immediate: true },
)

function submit() {
  const n = name.value.trim()
  if (n) emit('submit', n)
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    :label="mode === 'create' ? 'Nova pasta' : 'Renomear pasta'"
    size="sm"
    :loading="loading"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <header class="lib-dlg__head">
      <div class="lib-dlg__title">
        <component :is="mode === 'create' ? FolderPlus : FolderPen" :size="16" aria-hidden="true" />
        <h2>{{ mode === 'create' ? 'Nova pasta' : 'Renomear pasta' }}</h2>
      </div>
      <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="loading" @click="emit('update:modelValue', false)">
        <X :size="15" aria-hidden="true" />
      </button>
    </header>
    <form @submit.prevent="submit">
      <div class="lib-dlg__body">
        <label class="mk-field">
          <span class="mk-label">Nome da pasta</span>
          <input
            v-model="name"
            class="mk-input"
            name="folderName"
            type="text"
            maxlength="80"
            autocomplete="off"
            autofocus
            :disabled="loading"
          />
        </label>
        <p class="mk-hint">Em {{ where }}</p>
        <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
      </div>
      <footer class="lib-dlg__foot">
        <button type="button" class="mk-btn mk-btn--ghost" :disabled="loading" @click="emit('update:modelValue', false)">
          Cancelar
        </button>
        <button type="submit" class="mk-btn mk-btn--primary" data-action="save-folder" :disabled="loading || !name.trim()">
          {{ loading ? 'Salvando...' : mode === 'create' ? 'Criar pasta' : 'Salvar' }}
        </button>
      </footer>
    </form>
  </AppDialog>
</template>
