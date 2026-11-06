<script setup lang="ts">
/**
 * Linha recursiva da árvore do Acervo (mesmo desenho da árvore do Drive).
 * No modo `browse` a linha arrasta (mover pasta), recebe itens e arquivos
 * soltos (mover e enviar para cá) e tem o menu Nova subpasta, Renomear e
 * Apagar. No modo `pick` só escolhe.
 */
import { computed, ref } from 'vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { ChevronRight, Folder, FolderOpen, FolderPlus, MoreVertical, Pencil, Trash2 } from 'lucide-vue-next'
import { DRAG_FOLDER, DRAG_ITEMS, type FolderNode } from './library-meta'
import { clearDrag, draggingFolder } from './drag-state'
import { isFileDrag } from '../uploads/file-sources'

const props = defineProps<{
  node: FolderNode
  level: number
  activeFolderId: string | null
  collapsed: Set<string>
  mode: 'browse' | 'pick'
  /** Pick: só pastas onde a pessoa escreve ficam clicáveis */
  writableOnly?: boolean
  maxDepth: number
}>()

const emit = defineEmits<{
  select: [folder: FolderNode]
  toggle: [folderId: string]
  create: [folder: FolderNode]
  rename: [folder: FolderNode]
  remove: [folder: FolderNode]
  dropFolder: [folderId: string, target: FolderNode]
  dropItems: [ids: string[], target: FolderNode]
  dropFiles: [event: DragEvent, target: FolderNode]
}>()

const over = ref(false)
const open = computed(() => !props.collapsed.has(props.node.id))
const active = computed(() => props.activeFolderId === props.node.id)
const disabled = computed(() => props.mode === 'pick' && props.writableOnly && !props.node.canWrite)
const browse = computed(() => props.mode === 'browse')

/** Aceita a pasta arrastada? Mesmo lugar, não ela mesma nem o que está dentro dela. */
function acceptsFolder(): boolean {
  const f = draggingFolder.value
  if (!f || !props.node.canWrite) return false
  if (f.companyId !== props.node.companyId || f.id === props.node.id) return false
  // Nome é único entre irmãs, então o caminho identifica a pasta no lugar: a
  // linha alvo está dentro da arrastada se o caminho dela começa pelo dela.
  const inside = props.node.path.length >= f.path.length && f.path.every((n, i) => props.node.path[i] === n)
  return !inside && f.parentId !== props.node.id
}

function accepts(event: DragEvent): boolean {
  if (!browse.value) return false
  const types = Array.from(event.dataTransfer?.types ?? [])
  if (types.includes(DRAG_FOLDER)) return acceptsFolder()
  if (types.includes(DRAG_ITEMS)) return props.node.canWrite
  return isFileDrag(event) && props.node.canWrite
}

function onDragStart(event: DragEvent) {
  if (!browse.value || !props.node.canWrite || !event.dataTransfer) return
  draggingFolder.value = props.node
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData(DRAG_FOLDER, props.node.id)
  event.dataTransfer.setData('text/plain', props.node.name)
}

function onDragOver(event: DragEvent) {
  if (!accepts(event)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = isFileDrag(event) ? 'copy' : 'move'
  over.value = true
}

function onDrop(event: DragEvent) {
  over.value = false
  if (!accepts(event)) return
  event.preventDefault()
  event.stopPropagation()
  const dt = event.dataTransfer
  const folderId = dt?.getData(DRAG_FOLDER)
  const items = dt?.getData(DRAG_ITEMS)
  if (folderId) emit('dropFolder', folderId, props.node)
  else if (items) emit('dropItems', items.split(',').filter(Boolean), props.node)
  else emit('dropFiles', event, props.node)
  clearDrag()
}
</script>

<template>
  <div class="ltr-branch">
    <div
      class="ltr-row"
      :class="{ 'is-active': active, 'is-over': over, 'is-disabled': disabled }"
      :style="{ paddingLeft: `${6 + level * 14}px` }"
      :data-folder-id="node.id"
      :draggable="browse && node.canWrite"
      @dragstart="onDragStart"
      @dragend="clearDrag"
      @dragover="onDragOver"
      @dragleave="over = false"
      @drop="onDrop"
    >
      <button
        v-if="node.children.length"
        type="button"
        class="ltr-chev"
        :class="{ 'is-open': open }"
        :aria-label="`Subpastas de ${node.name}`"
        :aria-expanded="open"
        @click.stop="emit('toggle', node.id)"
      >
        <ChevronRight :size="12" aria-hidden="true" />
      </button>
      <span v-else class="ltr-chev ltr-chev--spacer" aria-hidden="true" />
      <button
        type="button"
        class="ltr-main"
        :disabled="disabled"
        :title="disabled ? 'Você não envia arquivos nesta pasta' : node.path.join(' / ')"
        :aria-current="active ? 'true' : undefined"
        @click="emit('select', node)"
      >
        <component :is="active ? FolderOpen : Folder" :size="14" class="ltr-icon" aria-hidden="true" />
        <span class="ltr-label">{{ node.name }}</span>
        <span v-if="browse && node.totalCount" class="ltr-count">{{ node.totalCount }}</span>
      </button>
      <span v-if="browse && node.canWrite" class="ltr-acts">
        <DropdownMenuRoot>
          <DropdownMenuTrigger as-child>
            <button type="button" class="ltr-act" :aria-label="`Ações da pasta ${node.name}`" @click.stop>
              <MoreVertical :size="14" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent class="dd-menu ltr-menu" :side-offset="4" align="end">
              <DropdownMenuItem v-if="node.depth < maxDepth" class="dd-item" @select="emit('create', node)">
                <FolderPlus :size="15" aria-hidden="true" />
                <span>Nova subpasta</span>
              </DropdownMenuItem>
              <DropdownMenuItem class="dd-item" @select="emit('rename', node)">
                <Pencil :size="15" aria-hidden="true" />
                <span>Renomear</span>
              </DropdownMenuItem>
              <template v-if="node.canDelete">
                <DropdownMenuSeparator class="dd-sep" />
                <DropdownMenuItem class="dd-item dd-item--danger" @select="emit('remove', node)">
                  <Trash2 :size="15" aria-hidden="true" />
                  <span>Apagar pasta</span>
                </DropdownMenuItem>
              </template>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </span>
    </div>
    <div v-if="open && node.children.length">
      <LibraryTreeRow
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :level="level + 1"
        :active-folder-id="activeFolderId"
        :collapsed="collapsed"
        :mode="mode"
        :writable-only="writableOnly"
        :max-depth="maxDepth"
        @select="(f) => emit('select', f)"
        @toggle="(id) => emit('toggle', id)"
        @create="(f) => emit('create', f)"
        @rename="(f) => emit('rename', f)"
        @remove="(f) => emit('remove', f)"
        @drop-folder="(id, t) => emit('dropFolder', id, t)"
        @drop-items="(ids, t) => emit('dropItems', ids, t)"
        @drop-files="(e, t) => emit('dropFiles', e, t)"
      />
    </div>
  </div>
</template>

<style scoped>
.ltr-branch {
  display: flex;
  flex-direction: column;
}

.ltr-row {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 30px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
}

.ltr-row:hover {
  background: var(--surface-2);
}

.ltr-row.is-active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--text);
}

.ltr-row.is-over {
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.ltr-row.is-disabled {
  opacity: 0.55;
}

.ltr-chev {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.ltr-chev:hover {
  background: var(--surface-3, var(--surface-2));
  color: var(--text);
}

.ltr-chev--spacer {
  cursor: default;
}

.ltr-chev--spacer:hover {
  background: transparent;
}

.ltr-chev :deep(svg) {
  transition: transform var(--motion-fast) var(--motion-ease);
}

.ltr-chev.is-open :deep(svg) {
  transform: rotate(90deg);
}

.ltr-main {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
  min-width: 0;
  padding: 5px 4px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}

.ltr-main:disabled {
  cursor: not-allowed;
}

.ltr-main:focus-visible,
.ltr-act:focus-visible,
.ltr-chev:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.ltr-icon {
  flex: none;
  color: var(--text-3);
}

.ltr-row.is-active .ltr-icon {
  color: var(--accent-ink);
}

.ltr-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ltr-count {
  flex: none;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-3);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}

.ltr-acts {
  display: inline-flex;
  flex: none;
  opacity: 0;
}

.ltr-row:hover .ltr-acts,
.ltr-row:focus-within .ltr-acts {
  opacity: 1;
}

.ltr-act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.ltr-act:hover {
  background: var(--surface-3, var(--surface-2));
  color: var(--text);
}

@media (max-width: 640px), (hover: none) {
  .ltr-row {
    min-height: 44px;
  }

  .ltr-acts {
    opacity: 1;
  }

  .ltr-act {
    width: 44px;
    height: 44px;
  }

  /* A seta que abre e recolhe: alvo de 44 px (o desenho segue pequeno). */
  .ltr-chev {
    width: 36px;
    height: 44px;
  }
}
</style>

<style>
.ltr-menu {
  min-width: 180px;
}
</style>
