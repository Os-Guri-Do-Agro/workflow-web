<script setup lang="ts">
/**
 * Árvore de pastas, recursiva. O backend sempre teve `parentId`, mas a UI
 * antiga renderizava uma lista plana sem nenhuma operação de escrita.
 *
 * Aceita soltar uma nota em cima de uma pasta para movê-la.
 */
import { ref } from 'vue'
import { ChevronRight, Folder, FolderOpen, Pencil, Trash2 } from 'lucide-vue-next'
import type { NoteFolderNode } from '../types'

defineProps<{
  nodes: NoteFolderNode[]
  selectedId: string | null
  expanded: Set<string>
}>()

const emit = defineEmits<{
  select: [string]
  toggle: [string]
  edit: [NoteFolderNode]
  remove: [NoteFolderNode]
  dropNote: [{ noteId: string; folderId: string }]
}>()

const dropTarget = ref<string | null>(null)

function onDrop(event: DragEvent, folderId: string) {
  dropTarget.value = null
  const noteId = event.dataTransfer?.getData('text/note-id')
  if (noteId) emit('dropNote', { noteId, folderId })
}
</script>

<template>
  <ul class="tree" role="tree">
    <li v-for="node in nodes" :key="node.id" role="none">
      <div
        class="tree__row"
        :class="{
          'tree__row--active': selectedId === node.id,
          'tree__row--drop': dropTarget === node.id,
        }"
        :style="{ paddingLeft: `${8 + node.depth * 14}px` }"
        role="treeitem"
        :aria-selected="selectedId === node.id"
        :aria-expanded="node.children.length ? expanded.has(node.id) : undefined"
        tabindex="0"
        @click="emit('select', node.id)"
        @keydown.enter="emit('select', node.id)"
        @dragover.prevent="dropTarget = node.id"
        @dragleave="dropTarget = null"
        @drop.prevent="onDrop($event, node.id)"
      >
        <button
          v-if="node.children.length"
          type="button"
          class="tree__caret"
          :class="{ 'tree__caret--open': expanded.has(node.id) }"
          :aria-label="expanded.has(node.id) ? 'Recolher pasta' : 'Expandir pasta'"
          @click.stop="emit('toggle', node.id)"
        >
          <ChevronRight :size="13" />
        </button>
        <span v-else class="tree__caret tree__caret--empty" />

        <component
          :is="expanded.has(node.id) && node.children.length ? FolderOpen : Folder"
          :size="15"
          class="tree__icon"
          :style="node.color ? { color: node.color } : undefined"
        />

        <span class="tree__name">{{ node.name }}</span>
        <span class="tree__count">{{ node.totalNotes }}</span>

        <span class="tree__actions">
          <button
            type="button"
            :aria-label="`Editar pasta ${node.name}`"
            @click.stop="emit('edit', node)"
          >
            <Pencil :size="12" />
          </button>
          <button
            type="button"
            :aria-label="`Excluir pasta ${node.name}`"
            @click.stop="emit('remove', node)"
          >
            <Trash2 :size="12" />
          </button>
        </span>
      </div>

      <NoteFolderTree
        v-if="node.children.length && expanded.has(node.id)"
        :nodes="node.children"
        :selected-id="selectedId"
        :expanded="expanded"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
        @edit="emit('edit', $event)"
        @remove="emit('remove', $event)"
        @drop-note="emit('dropNote', $event)"
      />
    </li>
  </ul>
</template>

<style scoped>
.tree {
  margin: 0;
  padding: 0;
  list-style: none;
}

.tree__row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease);
}

.tree__row:hover {
  background: var(--surface-2);
  color: var(--text);
}

.tree__row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.tree__row--active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--text);
  font-weight: 550;
}

.tree__row--drop {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.tree__caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: var(--text-3);
  cursor: pointer;
  transition: transform var(--motion-fast) var(--motion-ease);
}

.tree__caret--open {
  transform: rotate(90deg);
}

.tree__caret--empty {
  cursor: default;
}

.tree__icon {
  flex-shrink: 0;
  color: var(--text-3);
}

.tree__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree__count {
  color: var(--text-4);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.tree__actions {
  display: none;
  gap: 2px;
}

.tree__row:hover .tree__actions,
.tree__row:focus-within .tree__actions {
  display: inline-flex;
}

.tree__row:hover .tree__count,
.tree__row:focus-within .tree__count {
  display: none;
}

.tree__actions button {
  display: inline-flex;
  padding: 3px;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: var(--text-3);
  cursor: pointer;
}

.tree__actions button:hover {
  background: var(--surface-3);
  color: var(--text);
}

@media (prefers-reduced-motion: reduce) {
  .tree__row,
  .tree__caret {
    transition-duration: 1ms;
  }
}
</style>
