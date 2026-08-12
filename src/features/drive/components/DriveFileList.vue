<script setup lang="ts">
/**
 * Lista densa de arquivos do Drive. Renomear é INLINE aqui (InlineEditText,
 * Esc desfaz), a grade usa dialog — mesma mutation por trás.
 */
import { nextTick } from 'vue'
import { Download, Eye, MoreVertical, Share2 } from 'lucide-vue-next'
import InlineEditText from '@/components/ui/InlineEditText.vue'
import FileActionsMenu from './FileActionsMenu.vue'
import FileCover from './FileCover.vue'
import { formatBytes, labelOf } from '@/utils/file-kind'
import { shortDate } from '@/features/drive/format'
import type { DriveFile } from '@/features/drive/types'

defineProps<{
  files: DriveFile[]
  canManage: (file: DriveFile) => boolean
}>()

const emit = defineEmits<{
  open: [index: number]
  download: [file: DriveFile]
  share: [file: DriveFile]
  details: [file: DriveFile]
  'rename-inline': [file: DriveFile, name: string]
  move: [file: DriveFile]
  remove: [file: DriveFile]
}>()

function fileLike(file: DriveFile) {
  return { filename: file.name, mimeType: file.mimeType }
}

/**
 * "Renomear" aqui não abre dialog: o nome já é um campo editável na linha
 * (`InlineEditText`), então a ação é levar o cursor até ele com o texto
 * selecionado. Sem isto o item de menu ficava decorativo.
 */
function focusRename(fileId: string) {
  void nextTick(() => {
    const field = document.querySelector<HTMLInputElement>(
      `[data-file-row="${CSS.escape(fileId)}"] .inline-edit__field`,
    )
    field?.focus()
    field?.select()
  })
}
</script>

<template>
  <div class="dl" role="list">
    <div
      v-for="(file, index) in files"
      :key="file.id"
      class="dl-row"
      role="listitem"
      :data-file-row="file.id"
    >
      <button
        type="button"
        class="dl-thumb"
        :aria-label="`Visualizar ${file.name}`"
        @click="emit('open', index)"
      >
        <FileCover :file="file" :height="32" mode="thumb" />
      </button>

      <div class="dl-name">
        <InlineEditText
          v-if="canManage(file)"
          :model-value="file.name"
          :field-label="`Nome do arquivo ${file.name}`"
          @save="(value) => emit('rename-inline', file, value)"
        />
        <button
          v-else
          type="button"
          class="dl-name-static"
          :title="file.name"
          @click="emit('open', index)"
        >
          {{ file.name }}
        </button>
      </div>

      <span class="dl-cell dl-cell--kind">{{ labelOf(fileLike(file)) }}</span>
      <span class="dl-cell dl-cell--size">{{ formatBytes(file.size) }}</span>
      <span class="dl-cell dl-cell--owner">{{ file.owner?.name ?? '' }}</span>
      <span class="dl-cell dl-cell--date">{{ shortDate(file.createdAt) }}</span>

      <span class="dl-acts">
        <button
          type="button"
          class="dl-act press"
          :aria-label="`Visualizar ${file.name}`"
          title="Visualizar"
          @click="emit('open', index)"
        >
          <Eye :size="14" />
        </button>
        <button
          type="button"
          class="dl-act press"
          :aria-label="`Baixar ${file.name}`"
          title="Baixar"
          @click="emit('download', file)"
        >
          <Download :size="14" />
        </button>
        <button
          v-if="canManage(file)"
          type="button"
          class="dl-act press"
          :aria-label="`Compartilhar ${file.name}`"
          title="Compartilhar por link"
          @click="emit('share', file)"
        >
          <Share2 :size="15" />
        </button>
        <FileActionsMenu
          :file="file"
          :can-manage="canManage(file)"
          @details="emit('details', file)"
          @download="emit('download', file)"
          @share="emit('share', file)"
          @rename="focusRename(file.id)"
          @move="emit('move', file)"
          @remove="emit('remove', file)"
        >
          <template #trigger>
            <button
              type="button"
              class="dl-act press"
              :aria-label="`Mais ações para ${file.name}`"
            >
              <MoreVertical :size="15" />
            </button>
          </template>
        </FileActionsMenu>
      </span>
    </div>
  </div>
</template>

<style scoped>
.dl {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  overflow: hidden;
}

.dl-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  min-width: 0;
}

.dl-row:last-child {
  border-bottom: none;
}

.dl-row:hover {
  background: var(--surface-2);
}

.dl-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
  overflow: hidden;
  flex: none;
  padding: 0;
}

.dl-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dl-name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text);
}

.dl-name-static {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 12.5px;
  font-weight: 500;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0;
}

.dl-cell {
  flex: none;
  color: var(--text-3);
  font-size: 11.5px;
  white-space: nowrap;
}

.dl-cell--kind {
  width: 78px;
}

.dl-cell--size {
  width: 64px;
  text-align: right;
}

.dl-cell--owner {
  width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dl-cell--date {
  width: 96px;
}

/*
 * `opacity`, nunca `display: none`. O menu de ações é portalado para o body e
 * o dropdown do reka é modal: ao abrir, o body fica com `pointer-events: none`
 * e a linha PERDE o `:hover`. Com `display:none` o próprio gatilho sumiria do
 * layout, o floating-ui recalcularia a âncora sobre um retângulo 0x0 e o menu
 * saltaria para o canto da viewport. Mantendo o elemento no fluxo, a âncora
 * continua válida enquanto o menu estiver aberto.
 */
.dl-acts {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: none;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.dl-row:hover .dl-acts,
.dl-row:focus-within .dl-acts,
.dl-acts:has([data-state='open']) {
  opacity: 1;
}

/* Sem hover (toque): as ações precisam estar sempre alcançáveis. */
@media (hover: none) {
  .dl-acts {
    opacity: 1;
  }
}

.dl-act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
}

.dl-act:hover {
  background: var(--surface-3);
  color: var(--text);
}

.dl-act--danger:hover {
  color: var(--err);
}

@media (max-width: 860px) {
  .dl-cell--owner,
  .dl-cell--date {
    display: none;
  }
}
</style>
