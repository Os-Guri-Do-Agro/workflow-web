<script setup lang="ts">
/**
 * Grade de arquivos do Drive.
 *
 * O card é a unidade de leitura do produto, então ele carrega: capa rica
 * (`FileCover`), nome com quebra em duas linhas (nome de arquivo real não cabe
 * em uma), metadados na base e ações que aparecem no hover/foco.
 *
 * As ações são DUAS visíveis (visualizar, baixar) mais um menu com o resto.
 * A versão anterior empilhava cinco botões de 26px no canto: virava uma barra
 * de ícones minúsculos que competia com a capa e não dizia o que cada um fazia.
 */
import { Download, Eye, MoreVertical, Share2 } from 'lucide-vue-next'
import FileCover from './FileCover.vue'
import FileActionsMenu from './FileActionsMenu.vue'
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
  rename: [file: DriveFile]
  move: [file: DriveFile]
  remove: [file: DriveFile]
}>()
</script>

<template>
  <div class="dg" role="list">
    <article
      v-for="(file, index) in files"
      :key="file.id"
      class="dg-card"
      role="listitem"
    >
      <button
        type="button"
        class="dg-cover"
        :aria-label="`Visualizar ${file.name}`"
        @click="emit('open', index)"
      >
        <FileCover :file="file" />
      </button>

      <div class="dg-body">
        <p class="dg-name" :title="file.name">{{ file.name }}</p>
        <p class="dg-meta">
          <span>{{ formatBytes(file.size) || labelOf({ filename: file.name, mimeType: file.mimeType }) }}</span>
          <span class="dg-dot" aria-hidden="true">·</span>
          <span>{{ shortDate(file.createdAt) }}</span>
          <template v-if="file.owner">
            <span class="dg-dot" aria-hidden="true">·</span>
            <span class="dg-owner">{{ file.owner.name }}</span>
          </template>
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
          <Eye :size="16" />
        </button>
        <button
          type="button"
          class="dg-act press"
          :aria-label="`Baixar ${file.name}`"
          title="Baixar"
          @click="emit('download', file)"
        >
          <Download :size="16" />
        </button>
        <button
          v-if="canManage(file)"
          type="button"
          class="dg-act press"
          :aria-label="`Compartilhar ${file.name}`"
          title="Compartilhar por link"
          @click="emit('share', file)"
        >
          <Share2 :size="16" />
        </button>
        <FileActionsMenu
          :file="file"
          :can-manage="canManage(file)"
          @details="emit('details', file)"
          @download="emit('download', file)"
          @share="emit('share', file)"
          @rename="emit('rename', file)"
          @move="emit('move', file)"
          @remove="emit('remove', file)"
        >
          <template #trigger>
            <button
              type="button"
              class="dg-act press"
              :aria-label="`Mais ações para ${file.name}`"
            >
              <MoreVertical :size="16" />
            </button>
          </template>
        </FileActionsMenu>
      </div>
    </article>
  </div>
</template>

<style scoped>
.dg {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
  gap: 16px;
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
    transform var(--motion) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion) var(--motion-ease);
}

.dg-card:hover,
.dg-card:focus-within {
  transform: translateY(-2px);
  border-color: var(--border-strong);
  box-shadow: var(--shadow-lg);
}

@media (prefers-reduced-motion: reduce) {
  .dg-card {
    transition: border-color var(--motion-fast) var(--motion-ease);
  }
  .dg-card:hover,
  .dg-card:focus-within {
    transform: none;
  }
}

.dg-cover {
  display: block;
  border: none;
  border-bottom: 1px solid var(--border);
  padding: 0;
  background: none;
  cursor: pointer;
  text-align: left;
}

.dg-body {
  padding: 12px 14px 14px;
  min-width: 0;
}

.dg-name {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  /* Duas linhas: nome de arquivo real raramente cabe em uma. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.dg-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 6px 0 0;
  color: var(--text-3);
  font-size: 11px;
  min-width: 0;
}

.dg-dot {
  opacity: 0.6;
}

.dg-owner {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dg-acts {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow);
  opacity: 0;
  transform: translateY(-4px);
  pointer-events: none;
  transition:
    opacity var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.dg-card:hover .dg-acts,
.dg-card:focus-within .dg-acts {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

/* Sem hover (toque): as ações ficam sempre visíveis, senão são inalcançáveis. */
@media (hover: none) {
  .dg-acts {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }
}

.dg-act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
}

.dg-act:hover {
  background: var(--surface-2);
  color: var(--text);
}
</style>
