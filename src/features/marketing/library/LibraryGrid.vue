<script setup lang="ts">
/**
 * Conteúdo da pasta: subpastas no topo e os arquivos em grade de miniaturas
 * ou em lista densa. Clique abre o painel de detalhes; duplo clique (ou
 * Enter) abre em tela cheia; a caixa, Ctrl+clique e Shift+clique selecionam.
 * Arrastar arquivo selecionado para uma pasta da árvore move todos.
 */
import { Folder, Star } from 'lucide-vue-next'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import type { LibraryFolder, LibraryItem } from '@/service/marketing/marketing-library'
import { formatBytes } from '../marketing-labels'
import LibraryCheck from './LibraryCheck.vue'
import { draggingItems } from './drag-state'
import {
  DRAG_ITEMS,
  formatDate,
  formatDuration,
  itemMeta,
  itemPlace,
  KIND_ICON,
  KIND_LABEL,
  thumbOf,
} from './library-meta'

const props = defineProps<{
  items: LibraryItem[]
  subfolders: LibraryFolder[]
  view: 'grade' | 'lista'
  selected: Set<string>
  activeId: string | null
  /** Mostra o lugar (marca / pasta) em cada arquivo: busca, "Todos os arquivos" */
  showPlace: boolean
}>()

const emit = defineEmits<{
  open: [item: LibraryItem, index: number, event: MouseEvent | KeyboardEvent]
  view: [item: LibraryItem, index: number]
  toggle: [item: LibraryItem, index: number, event: MouseEvent]
  openFolder: [folder: LibraryFolder]
}>()

function onDragStart(item: LibraryItem, event: DragEvent) {
  if (!event.dataTransfer) return
  // Arrastar um arquivo que está na seleção leva a seleção toda.
  const ids = props.selected.has(item.id) ? [...props.selected] : [item.id]
  const movable = ids.filter((id) => props.items.find((i) => i.id === id)?.me.canEdit)
  if (!movable.length) {
    event.preventDefault()
    return
  }
  draggingItems.value = movable
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData(DRAG_ITEMS, movable.join(','))
  event.dataTransfer.setData('text/plain', movable.length > 1 ? `${movable.length} arquivos` : item.title)
}

function onClick(item: LibraryItem, index: number, event: MouseEvent) {
  if (event.shiftKey || event.ctrlKey || event.metaKey) emit('toggle', item, index, event)
  else emit('open', item, index, event)
}

function onKey(item: LibraryItem, index: number, event: KeyboardEvent) {
  if (event.key === 'Enter') emit('view', item, index)
  else if (event.key === ' ') {
    event.preventDefault()
    emit('toggle', item, index, event as unknown as MouseEvent)
  }
}
</script>

<template>
  <div class="lg" :class="`lg--${view}`">
    <div v-if="subfolders.length" class="lg-folders" role="list" aria-label="Pastas">
      <button
        v-for="f in subfolders"
        :key="f.id"
        type="button"
        class="lg-folder"
        role="listitem"
        :data-folder-tile="f.id"
        @click="emit('openFolder', f)"
      >
        <Folder :size="16" class="lg-folder__icon" aria-hidden="true" />
        <span class="lg-folder__name">{{ f.name }}</span>
        <span class="lg-folder__count">{{ f.totalCount }}</span>
      </button>
    </div>

    <ul v-if="view === 'grade'" class="lg-grid" aria-label="Arquivos">
      <li
        v-for="(item, index) in items"
        :key="item.id"
        class="lg-tile"
        :class="{ 'is-selected': selected.has(item.id), 'is-active': activeId === item.id }"
        :data-item-id="item.id"
        tabindex="0"
        :aria-label="`${item.title}, ${KIND_LABEL[item.kind]}`"
        :draggable="item.me.canEdit"
        @dragstart="onDragStart(item, $event)"
        @click="onClick(item, index, $event)"
        @dblclick="emit('view', item, index)"
        @keydown="onKey(item, index, $event)"
      >
        <div class="lg-thumb">
          <img v-if="thumbOf(item)" :src="thumbOf(item)!" alt="" loading="lazy" decoding="async" draggable="false" />
          <video
            v-else-if="item.kind === 'video' && item.url"
            :src="`${item.url}#t=0.5`"
            preload="metadata"
            muted
            playsinline
            tabindex="-1"
            aria-hidden="true"
          />
          <component :is="KIND_ICON[item.kind]" v-else :size="30" class="lg-thumb__icon" aria-hidden="true" />
          <span v-if="item.kind === 'video' && formatDuration(item.asset.durationSec)" class="lg-badge">
            {{ formatDuration(item.asset.durationSec) }}
          </span>
          <span v-else-if="item.kind !== 'imagem'" class="lg-badge">{{ KIND_LABEL[item.kind] }}</span>
        </div>
        <span class="lg-check" :class="{ 'is-on': selected.has(item.id) }">
          <LibraryCheck
            :checked="selected.has(item.id)"
            :label="`Selecionar ${item.title}`"
            @toggle="(e) => emit('toggle', item, index, e)"
          />
        </span>
        <Star v-if="item.starred" :size="14" class="lg-star" aria-label="Favorito" />
        <div class="lg-text">
          <span class="lg-name" :title="item.title">{{ item.title }}</span>
          <span class="lg-meta">{{ showPlace ? itemPlace(item) : itemMeta(item) }}</span>
        </div>
      </li>
    </ul>

    <div v-else class="mk-panel lg-table-wrap">
      <table class="mk-table lg-table">
        <thead>
          <tr>
            <th scope="col" class="lg-col-check"><span class="sr-only">Seleção</span></th>
            <th scope="col">Arquivo</th>
            <th scope="col" class="lg-opt">Tipo</th>
            <th scope="col" class="mk-num">Tamanho</th>
            <th scope="col" class="lg-opt">Lugar</th>
            <th scope="col" class="lg-opt">Enviado por</th>
            <th scope="col" class="lg-opt">Data</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(item, index) in items"
            :key="item.id"
            class="lg-row"
            :class="{ 'is-selected': selected.has(item.id), 'is-active': activeId === item.id }"
            :data-item-id="item.id"
            tabindex="0"
            :draggable="item.me.canEdit"
            @dragstart="onDragStart(item, $event)"
            @click="onClick(item, index, $event)"
            @dblclick="emit('view', item, index)"
            @keydown="onKey(item, index, $event)"
          >
            <td class="lg-col-check">
              <LibraryCheck
                :checked="selected.has(item.id)"
                :label="`Selecionar ${item.title}`"
                @toggle="(e) => emit('toggle', item, index, e)"
              />
            </td>
            <td>
              <div class="lg-cell">
                <span class="lg-mini">
                  <img v-if="thumbOf(item)" :src="thumbOf(item)!" alt="" loading="lazy" draggable="false" />
                  <component :is="KIND_ICON[item.kind]" v-else :size="16" aria-hidden="true" />
                </span>
                <span class="lg-cell__name" :title="item.title">{{ item.title }}</span>
                <Star v-if="item.starred" :size="13" class="lg-star-inline" aria-label="Favorito" />
                <span v-for="t in item.tags.slice(0, 2)" :key="t" class="mk-chip lg-tag">{{ t }}</span>
              </div>
            </td>
            <td class="lg-opt">{{ KIND_LABEL[item.kind] }}</td>
            <td class="mk-num">{{ formatBytes(item.asset.size) }}</td>
            <td class="lg-opt lg-place" :title="itemPlace(item)">{{ itemPlace(item) }}</td>
            <td class="lg-opt">
              <span v-if="item.createdBy" class="lg-person">
                <PersonAvatar :id="item.createdBy.id" :name="item.createdBy.name" :size="20" decorative />
                {{ item.createdBy.name }}
              </span>
            </td>
            <td class="lg-opt lg-date">{{ formatDate(item.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.lg {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.lg-folders {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.lg-folder {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 38px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.lg-folder:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

.lg-folder:focus-visible,
.lg-tile:focus-visible,
.lg-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.lg-folder__icon {
  flex: none;
  color: var(--text-3);
}

.lg-folder__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lg-folder__count {
  flex: none;
  color: var(--text-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.lg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lg-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  overflow: hidden;
  cursor: pointer;
  user-select: none;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.lg-tile:hover {
  border-color: var(--border-strong);
}

.lg-tile.is-active {
  border-color: var(--accent);
}

.lg-tile.is-selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.lg-thumb {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1 / 1;
  background: var(--surface-2);
  overflow: hidden;
}

.lg-thumb img,
.lg-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.lg-thumb__icon {
  color: var(--text-3);
}

.lg-badge {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--text) 72%, transparent);
  color: var(--surface);
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}

.lg-check {
  position: absolute;
  top: 2px;
  left: 2px;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--motion-ease);
}

/* A caixa fica legível sobre qualquer foto sem um quadrado de fundo. */
.lg-check :deep(.lck__box) {
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--text) 18%, transparent);
}

.lg-check.is-on :deep(.lck__box) {
  background: var(--accent);
}

.lg-tile:hover .lg-check,
.lg-tile:focus-within .lg-check,
.lg-check.is-on,
.lg:has(.lg-check.is-on) .lg-check {
  opacity: 1;
}

.lg-star {
  position: absolute;
  top: 9px;
  right: 9px;
  color: var(--due-soon);
  fill: currentColor;
  filter: drop-shadow(0 0 1px var(--surface));
}

.lg-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  padding: 7px 9px 8px;
}

.lg-name {
  overflow: hidden;
  color: var(--text);
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lg-meta {
  overflow: hidden;
  color: var(--text-3);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lg-table-wrap {
  overflow-x: auto;
}

.lg-table {
  min-width: 640px;
}

.lg-col-check {
  width: 40px;
  padding-left: 6px !important;
  padding-right: 0 !important;
}

.lg-row {
  cursor: pointer;
}

.lg-row.is-selected td {
  background: color-mix(in srgb, var(--accent) 9%, transparent);
}

.lg-row.is-active td {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.lg-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.lg-mini {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-3);
  overflow: hidden;
}

.lg-mini img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.lg-cell__name {
  min-width: 0;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lg-star-inline {
  flex: none;
  color: var(--due-soon);
  fill: currentColor;
}

.lg-tag {
  flex: none;
  font-size: 11px;
  font-weight: 500;
}

.lg-place {
  max-width: 220px;
  overflow: hidden;
  color: var(--text-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lg-person {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.lg-date {
  color: var(--text-2);
  white-space: nowrap;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 640px) {
  .lg-grid {
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 6px;
  }

  .lg-folders {
    grid-template-columns: 1fr 1fr;
  }

  .lg-folder {
    min-height: 44px;
  }

  .lg-text {
    padding: 5px 7px 6px;
  }

  .lg-meta {
    display: none;
  }

  .lg-check {
    opacity: 1;
  }

  .lg-table {
    min-width: 0;
  }

  .lg-opt {
    display: none;
  }
}

@media (hover: none) {
  .lg-check {
    opacity: 1;
  }
}
</style>
