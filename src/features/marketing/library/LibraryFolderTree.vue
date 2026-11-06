<script setup lang="ts">
/**
 * Árvore do Acervo: "Todos os arquivos", a Geral do grupo e cada marca, com as
 * pastas dentro. A mesma árvore serve à tela (modo `browse`: contagem, menu,
 * arrastar para mover, soltar arquivo para enviar) e aos diálogos de escolher
 * pasta (modo `pick`).
 */
import { computed, reactive, ref, watch } from 'vue'
import { ChevronRight, FolderPlus, Images, Layers } from 'lucide-vue-next'
import type { LibraryFolder, LibraryLocation } from '@/service/marketing/marketing-library'
import { brandTone, toneStyle } from '../marketing-labels'
import { useMarketing } from '../composables/useMarketing'
import LibraryTreeRow from './LibraryTreeRow.vue'
import { buildFolderTree, DRAG_FOLDER, DRAG_ITEMS, locationKey, type FolderNode, type LibrarySelection } from './library-meta'
import { clearDrag, draggingFolder } from './drag-state'
import { isFileDrag } from './file-sources'

const props = withDefaults(
  defineProps<{
    locations: LibraryLocation[]
    folders: LibraryFolder[]
    selection: LibrarySelection
    mode?: 'browse' | 'pick'
    showAll?: boolean
    allCount?: number
    writableOnly?: boolean
    maxDepth?: number
  }>(),
  { mode: 'browse', showAll: false, allCount: 0, writableOnly: false, maxDepth: 5 },
)

const emit = defineEmits<{
  select: [selection: LibrarySelection]
  create: [dest: { companyId: string | null; parentId: string | null }]
  rename: [folder: LibraryFolder]
  remove: [folder: LibraryFolder]
  dropFolder: [folderId: string, dest: { companyId: string | null; folderId: string | null }]
  dropItems: [ids: string[], dest: { companyId: string | null; folderId: string | null }]
  dropFiles: [event: DragEvent, dest: { companyId: string | null; folderId: string | null }]
}>()

const mk = useMarketing()
const tree = computed(() => buildFolderTree(props.folders))
const collapsed = reactive(new Set<string>())
const overLocation = ref<string | null>(null)

/** Abre o caminho até a pasta escolhida (link colado, voltar da busca). */
watch(
  () => [props.selection.folderId, props.folders] as const,
  ([folderId]) => {
    if (!folderId) return
    const byId = new Map(props.folders.map((f) => [f.id, f]))
    let cur = byId.get(folderId)
    while (cur?.parentId) {
      collapsed.delete(cur.parentId)
      cur = byId.get(cur.parentId)
    }
    if (cur) collapsed.delete(`loc:${locationKey(cur.companyId)}`)
  },
  { immediate: true },
)

function toggle(key: string) {
  if (collapsed.has(key)) collapsed.delete(key)
  else collapsed.add(key)
}

function brandOf(companyId: string | null) {
  return companyId ? mk.brandById(companyId) : undefined
}

function isActiveLocation(loc: LibraryLocation) {
  return props.selection.companyId === loc.companyId && !props.selection.folderId
}

function selectFolder(node: FolderNode) {
  emit('select', { companyId: node.companyId, folderId: node.id })
}

function rootDrop(loc: LibraryLocation, event: DragEvent) {
  overLocation.value = null
  if (props.mode !== 'browse' || !loc.canWrite) return
  const types = Array.from(event.dataTransfer?.types ?? [])
  const dest = { companyId: loc.companyId, folderId: null }
  event.preventDefault()
  if (types.includes(DRAG_FOLDER)) {
    const f = draggingFolder.value
    const id = event.dataTransfer?.getData(DRAG_FOLDER)
    if (id && f && f.companyId === loc.companyId && f.parentId !== null) emit('dropFolder', id, dest)
  } else if (types.includes(DRAG_ITEMS)) {
    const ids = event.dataTransfer?.getData(DRAG_ITEMS)
    if (ids) emit('dropItems', ids.split(',').filter(Boolean), dest)
  } else if (isFileDrag(event)) {
    emit('dropFiles', event, dest)
  }
  clearDrag()
}

function rootDragOver(loc: LibraryLocation, event: DragEvent) {
  if (props.mode !== 'browse' || !loc.canWrite) return
  const types = Array.from(event.dataTransfer?.types ?? [])
  if (types.includes(DRAG_FOLDER)) {
    const f = draggingFolder.value
    if (!f || f.companyId !== loc.companyId || f.parentId === null) return
  } else if (!types.includes(DRAG_ITEMS) && !isFileDrag(event)) {
    return
  }
  event.preventDefault()
  overLocation.value = locationKey(loc.companyId)
}
</script>

<template>
  <div class="lft" role="tree" aria-label="Pastas do Acervo">
    <button
      v-if="showAll"
      type="button"
      class="lft-loc lft-loc--all"
      :class="{ 'is-active': selection.companyId === undefined }"
      role="treeitem"
      :aria-selected="selection.companyId === undefined"
      @click="emit('select', { companyId: undefined, folderId: null })"
    >
      <Layers :size="14" class="lft-loc__icon" aria-hidden="true" />
      <span class="lft-loc__name">Todos os arquivos</span>
      <span v-if="allCount" class="lft-count">{{ allCount }}</span>
    </button>

    <div v-for="loc in locations" :key="locationKey(loc.companyId)" class="lft-group" role="none">
      <div
        class="lft-loc"
        :class="{
          'is-active': isActiveLocation(loc),
          'is-over': overLocation === locationKey(loc.companyId),
          'is-disabled': mode === 'pick' && writableOnly && !loc.canWrite,
        }"
        role="treeitem"
        :aria-selected="isActiveLocation(loc)"
        :aria-expanded="(tree.get(locationKey(loc.companyId)) ?? []).length ? !collapsed.has(`loc:${locationKey(loc.companyId)}`) : undefined"
        :data-location="locationKey(loc.companyId)"
        @dragover="rootDragOver(loc, $event)"
        @dragleave="overLocation = null"
        @drop="rootDrop(loc, $event)"
      >
        <button
          v-if="(tree.get(locationKey(loc.companyId)) ?? []).length"
          type="button"
          class="lft-chev"
          :class="{ 'is-open': !collapsed.has(`loc:${locationKey(loc.companyId)}`) }"
          :aria-label="collapsed.has(`loc:${locationKey(loc.companyId)}`) ? `Abrir ${loc.name}` : `Recolher ${loc.name}`"
          @click.stop="toggle(`loc:${locationKey(loc.companyId)}`)"
        >
          <ChevronRight :size="12" aria-hidden="true" />
        </button>
        <span v-else class="lft-chev" aria-hidden="true" />
        <button
          type="button"
          class="lft-loc__main"
          :disabled="mode === 'pick' && writableOnly && !loc.canWrite"
          :title="mode === 'pick' && writableOnly && !loc.canWrite ? 'Você não envia arquivos aqui' : loc.name"
          @click="emit('select', { companyId: loc.companyId, folderId: null })"
        >
          <span
            v-if="loc.companyId"
            class="mk-dot"
            :style="toneStyle(brandTone(brandOf(loc.companyId)))"
            aria-hidden="true"
          />
          <Images v-else :size="14" class="lft-loc__icon" aria-hidden="true" />
          <span class="lft-loc__name">{{ loc.name }}</span>
          <span v-if="mode === 'browse' && loc.totalCount" class="lft-count">{{ loc.totalCount }}</span>
        </button>
        <button
          v-if="mode === 'browse' && loc.canWrite"
          type="button"
          class="lft-add"
          :aria-label="`Nova pasta em ${loc.name}`"
          :title="`Nova pasta em ${loc.name}`"
          @click.stop="emit('create', { companyId: loc.companyId, parentId: null })"
        >
          <FolderPlus :size="14" aria-hidden="true" />
        </button>
      </div>
      <div v-if="!collapsed.has(`loc:${locationKey(loc.companyId)}`)" role="group">
        <LibraryTreeRow
          v-for="node in tree.get(locationKey(loc.companyId)) ?? []"
          :key="node.id"
          :node="node"
          :level="1"
          :active-folder-id="selection.folderId"
          :collapsed="collapsed"
          :mode="mode"
          :writable-only="writableOnly"
          :max-depth="maxDepth"
          @select="selectFolder"
          @toggle="toggle"
          @create="(f) => emit('create', { companyId: f.companyId, parentId: f.id })"
          @rename="(f) => emit('rename', f)"
          @remove="(f) => emit('remove', f)"
          @drop-folder="(id, t) => emit('dropFolder', id, { companyId: t.companyId, folderId: t.id })"
          @drop-items="(ids, t) => emit('dropItems', ids, { companyId: t.companyId, folderId: t.id })"
          @drop-files="(e, t) => emit('dropFiles', e, { companyId: t.companyId, folderId: t.id })"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.lft {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lft-group {
  display: flex;
  flex-direction: column;
}

.lft-loc {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 32px;
  border-radius: var(--radius-sm);
  color: var(--text);
}

.lft-loc:hover {
  background: var(--surface-2);
}

.lft-loc.is-active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.lft-loc.is-over {
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.lft-loc.is-disabled {
  opacity: 0.55;
}

.lft-loc--all {
  gap: 8px;
  width: 100%;
  padding: 0 8px 0 26px;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.lft-loc--all.is-active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.lft-chev {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 18px;
  height: 18px;
  margin-left: 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.lft-chev :deep(svg) {
  transition: transform var(--motion-fast) var(--motion-ease);
}

.lft-chev.is-open :deep(svg) {
  transform: rotate(90deg);
}

.lft-loc__main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 6px 4px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.lft-loc__main:disabled {
  cursor: not-allowed;
}

.lft-loc__main:focus-visible,
.lft-loc--all:focus-visible,
.lft-add:focus-visible,
.lft-chev:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.lft-loc__icon {
  flex: none;
  color: var(--text-3);
}

.lft-loc__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lft-count {
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

.lft-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 24px;
  height: 24px;
  margin-right: 2px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  opacity: 0;
}

.lft-loc:hover .lft-add,
.lft-loc:focus-within .lft-add {
  opacity: 1;
}

.lft-add:hover {
  background: var(--surface-3, var(--surface-2));
  color: var(--text);
}

@media (max-width: 640px), (hover: none) {
  .lft-loc,
  .lft-loc--all {
    min-height: 44px;
  }

  .lft-add {
    width: 40px;
    height: 40px;
    opacity: 1;
  }
}
</style>
