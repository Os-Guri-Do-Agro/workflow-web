<script setup lang="ts">
/**
 * Linha recursiva da árvore de pastas da sidebar do Drive. SFC próprio porque
 * recursão por template (o componente se referencia pelo nome do arquivo) é
 * tipada de graça, ao contrário do render-function auto-referente.
 */
import {
  ChevronRight,
  Folder,
  FolderInput,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-vue-next'
import type { DriveFolderNode } from '@/features/drive/types'

const props = defineProps<{
  node: DriveFolderNode
  activeFolderId: string | null
  collapsed: Set<string>
  canManage: boolean
}>()

const emit = defineEmits<{
  select: [folderId: string]
  toggle: [folderId: string]
  create: [parentId: string]
  rename: [folder: DriveFolderNode]
  move: [folder: DriveFolderNode]
  remove: [folder: DriveFolderNode]
}>()

function isCollapsed(): boolean {
  return props.collapsed.has(props.node.id)
}
</script>

<template>
  <div class="dsr-branch">
    <div
      class="dsr-row"
      :class="{ 'dsr-row--active': activeFolderId === node.id }"
      :style="{ paddingLeft: `${10 + node.depth * 14}px` }"
    >
      <button
        v-if="node.children.length > 0"
        type="button"
        class="dsr-chev"
        :class="{ 'dsr-chev--open': !isCollapsed() }"
        :aria-label="isCollapsed() ? 'Expandir pasta' : 'Recolher pasta'"
        @click.stop="emit('toggle', node.id)"
      >
        <ChevronRight :size="12" />
      </button>
      <span v-else class="dsr-chev dsr-chev--spacer" />

      <button type="button" class="dsr-main" @click="emit('select', node.id)">
        <Folder :size="13" class="dsr-icon" />
        <span class="dsr-label">{{ node.name }}</span>
        <span class="dsr-count">{{ node._count?.files ?? 0 }}</span>
      </button>

      <span v-if="canManage" class="dsr-acts">
        <button
          type="button"
          class="dsr-act press"
          :aria-label="`Nova subpasta em ${node.name}`"
          title="Nova subpasta"
          @click.stop="emit('create', node.id)"
        >
          <FolderPlus :size="12" />
        </button>
        <button
          type="button"
          class="dsr-act press"
          :aria-label="`Mover pasta ${node.name}`"
          title="Mover"
          @click.stop="emit('move', node)"
        >
          <FolderInput :size="12" />
        </button>
        <button
          type="button"
          class="dsr-act press"
          :aria-label="`Renomear pasta ${node.name}`"
          title="Renomear"
          @click.stop="emit('rename', node)"
        >
          <Pencil :size="12" />
        </button>
        <button
          type="button"
          class="dsr-act dsr-act--danger press"
          :aria-label="`Excluir pasta ${node.name}`"
          title="Excluir"
          @click.stop="emit('remove', node)"
        >
          <Trash2 :size="12" />
        </button>
      </span>
    </div>

    <template v-if="!isCollapsed()">
      <DriveSidebarRow
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :active-folder-id="activeFolderId"
        :collapsed="collapsed"
        :can-manage="canManage"
        @select="(id) => emit('select', id)"
        @toggle="(id) => emit('toggle', id)"
        @create="(id) => emit('create', id)"
        @rename="(f) => emit('rename', f)"
        @move="(f) => emit('move', f)"
        @remove="(f) => emit('remove', f)"
      />
    </template>
  </div>
</template>

<style scoped>
.dsr-branch {
  display: flex;
  flex-direction: column;
}

.dsr-row {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
}

.dsr-row:hover {
  background: var(--surface-2);
}

.dsr-row--active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--text);
}

.dsr-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 6px 4px;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 12.5px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.dsr-icon {
  flex: none;
  color: var(--text-3);
}

.dsr-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsr-count {
  flex: none;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-2);
  border-radius: 999px;
  padding: 1px 7px;
}

.dsr-chev {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  flex: none;
  border-radius: 4px;
  transition: transform var(--motion-fast) var(--motion-ease);
}

.dsr-chev--open {
  transform: rotate(90deg);
}

.dsr-chev--spacer {
  cursor: default;
}

.dsr-acts {
  display: none;
  align-items: center;
  gap: 2px;
  padding-right: 4px;
}

.dsr-row:hover .dsr-acts,
.dsr-row:focus-within .dsr-acts {
  display: inline-flex;
}

.dsr-act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.dsr-act:hover {
  background: var(--surface-3);
  color: var(--text);
}

.dsr-act--danger:hover {
  color: var(--err);
}
</style>
