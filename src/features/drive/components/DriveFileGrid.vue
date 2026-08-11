<script setup lang="ts">
/**
 * Grade de arquivos do Drive. Preview real para imagem (URL assinada da
 * listagem), glifo por tipo para o resto. Ações no hover/foco; gerenciar
 * (renomear/mover/excluir) só aparece para quem pode (dono do upload ou ADMIN).
 */
import { Download, Eye, FolderInput, Pencil, Trash2 } from 'lucide-vue-next'
import { formatBytes, iconOf, labelOf } from '@/utils/file-kind'
import type { DriveFile } from '@/features/drive/types'

defineProps<{
  files: DriveFile[]
  canManage: (file: DriveFile) => boolean
}>()

const emit = defineEmits<{
  open: [index: number]
  download: [file: DriveFile]
  rename: [file: DriveFile]
  move: [file: DriveFile]
  remove: [file: DriveFile]
}>()

function fileLike(file: DriveFile) {
  return { filename: file.name, mimeType: file.mimeType }
}
</script>

<template>
  <div class="dg" role="list">
    <article
      v-for="(file, index) in files"
      :key="file.id"
      class="dg-card hover-lift"
      role="listitem"
    >
      <button
        type="button"
        class="dg-thumb"
        :aria-label="`Visualizar ${file.name}`"
        @click="emit('open', index)"
      >
        <img
          v-if="file.previewUrl"
          :src="file.previewUrl"
          :alt="file.name"
          class="dg-thumb-img"
          loading="lazy"
        />
        <component :is="iconOf(fileLike(file))" v-else :size="30" class="dg-thumb-icon" />
      </button>

      <div class="dg-body">
        <p class="dg-name" :title="file.name">{{ file.name }}</p>
        <p class="dg-meta">
          {{ labelOf(fileLike(file)) }}
          <template v-if="formatBytes(file.size)"> · {{ formatBytes(file.size) }}</template>
          <template v-if="file.owner"> · {{ file.owner.name }}</template>
        </p>
      </div>

      <div class="dg-acts">
        <button
          type="button"
          class="dg-act press"
          :aria-label="`Visualizar ${file.name}`"
          title="Visualizar"
          @click="emit('open', index)"
        >
          <Eye :size="14" />
        </button>
        <button
          type="button"
          class="dg-act press"
          :aria-label="`Baixar ${file.name}`"
          title="Baixar"
          @click="emit('download', file)"
        >
          <Download :size="14" />
        </button>
        <template v-if="canManage(file)">
          <button
            type="button"
            class="dg-act press"
            :aria-label="`Renomear ${file.name}`"
            title="Renomear"
            @click="emit('rename', file)"
          >
            <Pencil :size="14" />
          </button>
          <button
            type="button"
            class="dg-act press"
            :aria-label="`Mover ${file.name}`"
            title="Mover"
            @click="emit('move', file)"
          >
            <FolderInput :size="14" />
          </button>
          <button
            type="button"
            class="dg-act dg-act--danger press"
            :aria-label="`Excluir ${file.name}`"
            title="Excluir"
            @click="emit('remove', file)"
          >
            <Trash2 :size="14" />
          </button>
        </template>
      </div>
    </article>
  </div>
</template>

<style scoped>
.dg {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.dg-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  overflow: hidden;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion) var(--motion-ease);
}

.dg-card:hover,
.dg-card:focus-within {
  border-color: var(--border-strong);
}

.dg-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 116px;
  border: none;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  cursor: pointer;
  padding: 0;
}

.dg-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dg-thumb-icon {
  color: var(--text-3);
}

.dg-body {
  padding: 10px 12px 12px;
  min-width: 0;
}

.dg-name {
  margin: 0;
  color: var(--text);
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dg-meta {
  margin: 3px 0 0;
  color: var(--text-3);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dg-acts {
  position: absolute;
  top: 8px;
  right: 8px;
  display: none;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(8px);
}

.dg-card:hover .dg-acts,
.dg-card:focus-within .dg-acts {
  display: inline-flex;
}

.dg-act {
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

.dg-act:hover {
  background: var(--surface-2);
  color: var(--text);
}

.dg-act--danger:hover {
  color: var(--err);
}
</style>
