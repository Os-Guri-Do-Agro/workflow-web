<script setup lang="ts">
/**
 * Linha recursiva da árvore de pastas da sidebar do Drive. SFC próprio porque
 * recursão por template (o componente se referencia pelo nome do arquivo) é
 * tipada de graça, ao contrário do render-function auto-referente.
 */
import { ChevronRight, Folder, MoreVertical } from 'lucide-vue-next'
import FolderActionsMenu from './FolderActionsMenu.vue'
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

      <!--
        O span existe porque a raiz do FolderActionsMenu (DropdownMenuRoot) é
        renderless com dois filhos: classe passada ao componente é descartada
        pelo Vue, então `dsr-acts` precisa de um elemento real.
      -->
      <span v-if="canManage" class="dsr-acts">
        <FolderActionsMenu
          :folder-name="node.name"
          @create="emit('create', node.id)"
          @rename="emit('rename', node)"
          @move="emit('move', node)"
          @remove="emit('remove', node)"
        >
          <template #trigger>
            <button
              type="button"
              class="dsr-act press"
              :aria-label="`Ações da pasta ${node.name}`"
              @click.stop
            >
              <MoreVertical :size="14" />
            </button>
          </template>
        </FolderActionsMenu>
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

/*
 * `opacity`, nunca `display:none`: o menu é portalado e modal, então ao abrir
 * o body perde `pointer-events`, a linha perde `:hover` e o gatilho sairia do
 * layout — o floating-ui reancoraria sobre um retângulo vazio e o menu pularia
 * para o canto da tela. Mesmo motivo da lista de arquivos.
 */
.dsr-acts {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding-right: 4px;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.dsr-row:hover .dsr-acts,
.dsr-row:focus-within .dsr-acts,
.dsr-acts:has([data-state='open']) {
  opacity: 1;
}

@media (hover: none) {
  .dsr-acts {
    opacity: 1;
  }
}

.dsr-act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
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
