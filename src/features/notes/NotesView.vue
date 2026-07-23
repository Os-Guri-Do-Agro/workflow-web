<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { refDebounced } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { FileText, FileStack, LayoutGrid, List, Plus, Search, X } from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useUiPreferences } from '@/composables/useUiPreferences'
import { useUiStore } from '@/stores/uiStores'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import NoteCard from './components/NoteCard.vue'
import NoteFolderTree from './components/NoteFolderTree.vue'
import NoteFolderDialog from './components/NoteFolderDialog.vue'
import { buildFolderTree, useNoteFolders, useNoteMutations, useNotesList } from './composables/useNotes'
import type { NoteFolderNode, NoteListItem } from './types'

const router = useRouter()
const { density } = useUiPreferences()
const { notesViewMode: viewMode } = storeToRefs(useUiStore())
const { success, error: showError } = useToast()

const search = ref('')
/** 300ms: digitar 20 caracteres deixa de disparar 20 requests. */
const debouncedSearch = refDebounced(search, 300)
const selectedFolder = ref<string | null>(null)
const selectedTag = ref<string | null>(null)
const expanded = ref(new Set<string>())

const filters = computed(() => ({
  ...(selectedFolder.value ? { folderId: selectedFolder.value } : {}),
  ...(debouncedSearch.value.trim() ? { search: debouncedSearch.value.trim() } : {}),
  ...(selectedTag.value ? { tag: selectedTag.value } : {}),
}))

const { data: notes, isPending, isError, error, refetch, isFetching } = useNotesList(filters)
const { data: folders, isError: foldersError } = useNoteFolders()
const { togglePin, moveToFolder, createFolder, updateFolder, removeFolder } = useNoteMutations()

const tree = computed<NoteFolderNode[]>(() => buildFolderTree(folders.value ?? []))
const pinned = computed(() => (notes.value ?? []).filter((note) => note.isPinned))
const rest = computed(() => (notes.value ?? []).filter((note) => !note.isPinned))
const totalNotes = computed(() => notes.value?.length ?? 0)
const hasFilters = computed(() => !!search.value.trim() || !!selectedTag.value || !!selectedFolder.value)

const folderDialog = ref(false)
const editingFolder = ref<NoteFolderNode | null>(null)
/** Pasta-pai ao criar uma subpasta (null = pasta raiz). */
const parentFolder = ref<NoteFolderNode | null>(null)
const deletingFolder = ref<NoteFolderNode | null>(null)

function openNote(id: string) {
  router.push(`/notes/${id}`)
}

function selectFolder(id: string | null) {
  selectedFolder.value = selectedFolder.value === id ? null : id
}

function toggleFolder(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

function openCreateFolder() {
  editingFolder.value = null
  parentFolder.value = null
  folderDialog.value = true
}

function openCreateSubfolder(parent: NoteFolderNode) {
  editingFolder.value = null
  parentFolder.value = parent
  // Garante que a pasta-pai fique expandida para a nova subpasta aparecer.
  if (!expanded.value.has(parent.id)) toggleFolder(parent.id)
  folderDialog.value = true
}

function openEditFolder(folder: NoteFolderNode) {
  editingFolder.value = folder
  parentFolder.value = null
  folderDialog.value = true
}

async function submitFolder(input: { name: string; color: string }) {
  try {
    if (editingFolder.value) {
      await updateFolder.mutateAsync({
        id: editingFolder.value.id,
        input: { name: input.name, color: input.color },
      })
      success('Pasta atualizada')
    } else {
      await createFolder.mutateAsync({
        name: input.name,
        color: input.color,
        // Só envia parentId quando é subpasta: o DTO valida com @IsString e
        // rejeita null explícito.
        ...(parentFolder.value ? { parentId: parentFolder.value.id } : {}),
      })
      success(parentFolder.value ? 'Subpasta criada' : 'Pasta criada')
    }
    folderDialog.value = false
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível salvar a pasta'))
  }
}

async function confirmRemoveFolder() {
  const folder = deletingFolder.value
  if (!folder) return
  try {
    await removeFolder.mutateAsync(folder.id)
    if (selectedFolder.value === folder.id) selectedFolder.value = null
    deletingFolder.value = null
    success('Pasta excluída')
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível excluir a pasta'))
  }
}

async function handleDropNote({ noteId, folderId }: { noteId: string; folderId: string }) {
  try {
    await moveToFolder.mutateAsync({ id: noteId, folderId })
    success('Nota movida')
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível mover a nota'))
  }
}

async function handleTogglePin(note: NoteListItem) {
  try {
    await togglePin.mutateAsync(note)
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível fixar a nota'))
  }
}

function clearFilters() {
  search.value = ''
  selectedTag.value = null
  selectedFolder.value = null
}
</script>

<template>
  <div class="notes" :class="`notes--${density}`">
    <header class="notes__head">
      <div>
        <h1 class="notes__title">Notas</h1>
        <p class="notes__sub">Documentação e anotações do time</p>
      </div>

      <div class="notes__head-actions">
        <div class="notes__view" role="group" aria-label="Modo de exibição">
          <button
            type="button"
            :class="{ 'notes__view--on': viewMode === 'grid' }"
            aria-label="Ver em grade"
            :aria-pressed="viewMode === 'grid'"
            @click="viewMode = 'grid'"
          >
            <LayoutGrid :size="15" />
          </button>
          <button
            type="button"
            :class="{ 'notes__view--on': viewMode === 'list' }"
            aria-label="Ver em lista"
            :aria-pressed="viewMode === 'list'"
            @click="viewMode = 'list'"
          >
            <List :size="15" />
          </button>
        </div>

        <button type="button" class="notes__create" @click="router.push('/notes/new')">
          <Plus :size="15" />
          Nova nota
        </button>
      </div>
    </header>

    <div class="notes__layout">
      <aside class="notes__side">
        <div class="notes__search">
          <Search :size="15" />
          <input
            v-model="search"
            type="search"
            placeholder="Buscar notas"
            aria-label="Buscar notas"
          />
        </div>

        <button
          type="button"
          class="notes__all"
          :class="{ 'notes__all--on': selectedFolder === null }"
          @click="selectedFolder = null"
        >
          <FileStack :size="15" />
          <span>Todas as notas</span>
          <span class="notes__all-count">{{ totalNotes }}</span>
        </button>

        <div class="notes__side-head">
          <span>Pastas</span>
          <button type="button" aria-label="Nova pasta" title="Nova pasta" @click="openCreateFolder">
            <Plus :size="13" />
          </button>
        </div>

        <p v-if="foldersError" class="notes__side-empty">Não foi possível carregar as pastas.</p>
        <p v-else-if="!tree.length" class="notes__side-empty">
          Nenhuma pasta ainda. Crie uma para organizar suas notas.
        </p>
        <NoteFolderTree
          v-else
          :nodes="tree"
          :selected-id="selectedFolder"
          :expanded="expanded"
          @select="selectFolder"
          @toggle="toggleFolder"
          @edit="openEditFolder"
          @remove="deletingFolder = $event"
          @add-child="openCreateSubfolder"
          @drop-note="handleDropNote"
        />
      </aside>

      <section class="notes__content">
        <div v-if="selectedTag" class="notes__chips">
          <button type="button" class="notes__chip" @click="selectedTag = null">
            #{{ selectedTag }}
            <X :size="12" />
          </button>
        </div>

        <div v-if="isPending" class="notes__grid">
          <Skeleton v-for="i in 6" :key="i" type="card" height="150px" />
        </div>

        <EmptyState
          v-else-if="isError"
          title="Não foi possível carregar as notas"
          :description="getApiErrorMessage(error, 'Verifique sua conexão e tente de novo.')"
        >
          <template #action>
            <button type="button" class="notes__create" @click="refetch()">Tentar de novo</button>
          </template>
        </EmptyState>

        <EmptyState
          v-else-if="!totalNotes"
          :icon="FileText"
          :title="hasFilters ? 'Nenhuma nota encontrada' : 'Nenhuma nota ainda'"
          :description="
            hasFilters
              ? 'Tente outro termo ou limpe os filtros.'
              : 'Crie a primeira nota para começar a documentar.'
          "
        >
          <template #action>
            <button
              type="button"
              class="notes__create"
              @click="hasFilters ? clearFilters() : router.push('/notes/new')"
            >
              {{ hasFilters ? 'Limpar filtros' : 'Criar primeira nota' }}
            </button>
          </template>
        </EmptyState>

        <template v-else>
          <template v-if="pinned.length">
            <h2 class="notes__section">Fixadas</h2>
            <div :class="viewMode === 'grid' ? 'notes__grid' : 'notes__list'">
              <NoteCard
                v-for="note in pinned"
                :key="note.id"
                :note="note"
                :mode="viewMode"
                @open="openNote"
                @toggle-pin="handleTogglePin"
                @tag="selectedTag = $event"
              />
            </div>
          </template>

          <h2 v-if="pinned.length && rest.length" class="notes__section">Outras</h2>
          <div v-if="rest.length" :class="viewMode === 'grid' ? 'notes__grid' : 'notes__list'">
            <NoteCard
              v-for="note in rest"
              :key="note.id"
              :note="note"
              :mode="viewMode"
              @open="openNote"
              @toggle-pin="handleTogglePin"
              @tag="selectedTag = $event"
            />
          </div>
        </template>

        <span v-if="isFetching && !isPending" class="notes__fetching">Atualizando...</span>
      </section>
    </div>

    <NoteFolderDialog
      v-model="folderDialog"
      :folder="editingFolder"
      :parent="parentFolder"
      :loading="createFolder.isPending.value || updateFolder.isPending.value"
      @submit="submitFolder"
    />

    <ConfirmDialog
      :model-value="!!deletingFolder"
      title="Excluir pasta"
      :message="`As ${deletingFolder?.totalNotes ?? 0} nota(s) desta pasta não serão apagadas: elas ficam sem pasta.`"
      confirm-label="Excluir pasta"
      danger
      :loading="removeFolder.isPending.value"
      @update:model-value="deletingFolder = null"
      @confirm="confirmRemoveFolder"
    />
  </div>
</template>

<style scoped>
.notes {
  padding: 24px;
}

.notes--compact {
  padding: 16px;
}

.notes__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.notes__title {
  margin: 0;
  color: var(--text);
  font-size: 22px;
  font-weight: 660;
  letter-spacing: -0.02em;
}

.notes__sub {
  margin: 3px 0 0;
  color: var(--text-3);
  font-size: 13px;
}

.notes__head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notes__view {
  display: inline-flex;
  padding: 2px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.notes__view button {
  display: inline-flex;
  padding: 5px 8px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-3);
  cursor: pointer;
}

.notes__view button:hover {
  color: var(--text);
}

.notes__view--on {
  background: var(--surface);
  color: var(--text) !important;
  box-shadow: var(--shadow-sm);
}

.notes__create {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--accent);
  border: none;
  border-radius: var(--radius-sm);
  color: var(--accent-fg);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: filter var(--motion-fast) var(--motion-ease);
}

.notes__create:hover {
  filter: brightness(1.08);
}

.notes__create:active {
  transform: scale(0.98);
}

.notes__layout {
  display: grid;
  grid-template-columns: 244px 1fr;
  gap: 20px;
  align-items: start;
}

.notes__side {
  position: sticky;
  top: 12px;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.notes__search {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  padding: 7px 9px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-3);
}

.notes__search:focus-within {
  border-color: var(--accent);
}

.notes__search input {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
}

.notes__search input:focus {
  outline: none;
}

.notes__all {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 7px 8px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.notes__all:hover {
  background: var(--surface-2);
  color: var(--text);
}

.notes__all--on {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--text);
  font-weight: 550;
}

.notes__all-count {
  margin-left: auto;
  color: var(--text-4);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.notes__side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 14px 0 4px;
  padding: 0 8px;
  color: var(--text-4);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.notes__side-head button {
  display: inline-flex;
  padding: 3px;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: var(--text-3);
  cursor: pointer;
}

.notes__side-head button:hover {
  background: var(--surface-2);
  color: var(--text);
}

.notes__side-empty {
  margin: 6px 8px;
  color: var(--text-4);
  font-size: 11.5px;
  line-height: 1.5;
}

.notes__content {
  min-height: 240px;
}

.notes__chips {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.notes__chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: 999px;
  color: var(--accent);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.notes__section {
  margin: 4px 0 10px;
  color: var(--text-4);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.notes__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  margin-bottom: 22px;
}

.notes__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 22px;
}

.notes__fetching {
  display: block;
  margin-top: 4px;
  color: var(--text-4);
  font-size: 11px;
}

@media (max-width: 900px) {
  .notes__layout {
    grid-template-columns: 1fr;
  }
  .notes__side {
    position: static;
  }
}

@media (prefers-reduced-motion: reduce) {
  .notes__create {
    transition-duration: 1ms;
  }
  .notes__create:active {
    transform: none;
  }
}
</style>
