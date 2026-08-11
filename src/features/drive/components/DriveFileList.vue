<script setup lang="ts">
/**
 * Lista densa de arquivos do Drive. Renomear é INLINE aqui (InlineEditText,
 * Esc desfaz), a grade usa dialog — mesma mutation por trás.
 */
import { Download, Eye, FolderInput, Trash2 } from 'lucide-vue-next'
import InlineEditText from '@/components/ui/InlineEditText.vue'
import { formatBytes, iconOf, labelOf } from '@/utils/file-kind'
import type { DriveFile } from '@/features/drive/types'

defineProps<{
  files: DriveFile[]
  canManage: (file: DriveFile) => boolean
}>()

const emit = defineEmits<{
  open: [index: number]
  download: [file: DriveFile]
  'rename-inline': [file: DriveFile, name: string]
  move: [file: DriveFile]
  remove: [file: DriveFile]
}>()

function fileLike(file: DriveFile) {
  return { filename: file.name, mimeType: file.mimeType }
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="dl" role="list">
    <div v-for="(file, index) in files" :key="file.id" class="dl-row" role="listitem">
      <button
        type="button"
        class="dl-thumb"
        :aria-label="`Visualizar ${file.name}`"
        @click="emit('open', index)"
      >
        <img
          v-if="file.previewUrl"
          :src="file.previewUrl"
          :alt="''"
          class="dl-thumb-img"
          loading="lazy"
        />
        <component :is="iconOf(fileLike(file))" v-else :size="16" />
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
      <span class="dl-cell dl-cell--date">{{ formatDate(file.createdAt) }}</span>

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
        <template v-if="canManage(file)">
          <button
            type="button"
            class="dl-act press"
            :aria-label="`Mover ${file.name}`"
            title="Mover"
            @click="emit('move', file)"
          >
            <FolderInput :size="14" />
          </button>
          <button
            type="button"
            class="dl-act dl-act--danger press"
            :aria-label="`Excluir ${file.name}`"
            title="Excluir"
            @click="emit('remove', file)"
          >
            <Trash2 :size="14" />
          </button>
        </template>
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

.dl-acts {
  display: none;
  align-items: center;
  gap: 2px;
  flex: none;
}

.dl-row:hover .dl-acts,
.dl-row:focus-within .dl-acts {
  display: inline-flex;
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
