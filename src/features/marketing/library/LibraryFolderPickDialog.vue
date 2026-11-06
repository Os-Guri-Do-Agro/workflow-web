<script setup lang="ts">
/**
 * Escolher uma pasta do Acervo (mover arquivos, destino do envio). Só os
 * lugares e pastas onde a pessoa escreve ficam clicáveis; o servidor confere
 * de novo.
 */
import { computed, ref, watch } from 'vue'
import { FolderInput, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import type { LibraryFolder, LibraryLocation } from '@/service/marketing/marketing-library'
import LibraryFolderTree from './LibraryFolderTree.vue'
import { placeLabel, type LibrarySelection } from './library-meta'
import './library.css'

const props = defineProps<{
  modelValue: boolean
  title: string
  confirmLabel: string
  locations: LibraryLocation[]
  folders: LibraryFolder[]
  /** Ponto de partida (o lugar aberto na tela) */
  initial?: { companyId: string | null; folderId: string | null } | null
  hint?: string
  loading?: boolean
  error?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [dest: { companyId: string | null; folderId: string | null }]
}>()

const pick = ref<LibrarySelection>({ companyId: undefined, folderId: null })

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    const start = props.initial
    const writable = (companyId: string | null) => props.locations.find((l) => l.companyId === companyId)?.canWrite
    if (start && writable(start.companyId)) pick.value = { ...start }
    else {
      const first = props.locations.find((l) => l.canWrite)
      pick.value = { companyId: first ? first.companyId : undefined, folderId: null }
    }
  },
  { immediate: true },
)

const chosen = computed(() => {
  if (pick.value.companyId === undefined) return null
  const loc = props.locations.find((l) => l.companyId === pick.value.companyId)
  if (!loc?.canWrite) return null
  const folder = pick.value.folderId ? props.folders.find((f) => f.id === pick.value.folderId) : undefined
  if (pick.value.folderId && (!folder || !folder.canWrite)) return null
  return { companyId: loc.companyId, folderId: folder?.id ?? null, label: placeLabel(loc, folder) }
})

function confirm() {
  if (chosen.value) emit('confirm', { companyId: chosen.value.companyId, folderId: chosen.value.folderId })
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    :label="title"
    size="md"
    :loading="loading"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <header class="lib-dlg__head">
      <div class="lib-dlg__title">
        <FolderInput :size="16" aria-hidden="true" />
        <h2>{{ title }}</h2>
      </div>
      <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="loading" @click="emit('update:modelValue', false)">
        <X :size="15" aria-hidden="true" />
      </button>
    </header>
    <div class="lib-dlg__body">
      <p v-if="hint" class="lib-note">{{ hint }}</p>
      <div class="lib-pick-box">
        <LibraryFolderTree
          :locations="locations"
          :folders="folders"
          :selection="pick"
          mode="pick"
          writable-only
          @select="pick = $event"
        />
      </div>
      <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
    </div>
    <footer class="lib-dlg__foot">
      <span class="lib-dlg__foot-note">{{ chosen ? `Para: ${chosen.label}` : 'Escolha uma pasta' }}</span>
      <button type="button" class="mk-btn mk-btn--ghost" :disabled="loading" @click="emit('update:modelValue', false)">
        Cancelar
      </button>
      <button type="button" class="mk-btn mk-btn--primary" data-action="confirm-pick" :disabled="loading || !chosen" @click="confirm">
        {{ loading ? 'Aguarde...' : confirmLabel }}
      </button>
    </footer>
  </AppDialog>
</template>
