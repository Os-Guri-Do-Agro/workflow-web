<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Copy,
  ImagePlus,
  Loader2,
  MoreVertical,
  Paintbrush,
  Plus,
  Search,
  Trash2,
} from 'lucide-vue-next'
import { useBoards, useBoardMutations } from '@/composables/useBoards'
import { useToast } from '@/composables/useToast'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import type { BoardMeta } from '@/service/boards/boards-service'
import boardsService from '@/service/boards/boards-service'
import shareService from '@/service/share/share-service'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'

const router = useRouter()
const workspace = useWorkspaceStore()
const { success, error: showError } = useToast()
const { data: boards, isFetching, isLoading, refetch } = useBoards()
const { createBoard, duplicateBoard, removeBoard } = useBoardMutations()

const search = ref('')
const title = ref('')
const menuOpenId = ref<string | null>(null)
const boardPendingRemoval = ref<BoardMeta | null>(null)

const roleKnown = computed(() => !!workspace.activeRole)
const canWrite = computed(() => !roleKnown.value || workspace.canEdit)
const createTitle = computed(() =>
  canWrite.value ? 'Criar board' : 'Você precisa ser WORKER ou superior',
)
const filteredBoards = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = boards.value ?? []
  if (!q) return list
  return list.filter((board) => board.title.toLowerCase().includes(q))
})

async function handleCreate() {
  if (!canWrite.value) return

  try {
    const board = await createBoard.mutateAsync({
      title: title.value.trim() || 'Novo board',
    })
    title.value = ''
    success('Board criado')
    await router.push(`/boards/${board.id}`)
  } catch {
    showError('Não foi possível criar o board')
  }
}

async function ensureActiveRole() {
  if (workspace.activeRole) return

  try {
    const companies = await workspace.fetchCompanies()
    const activeId = workspace.activeCompanyId || localStorage.getItem('activeCompany') || companies[0]?.id
    if (activeId) workspace.setActiveCompany(activeId)
  } catch {
    /* O backend ainda valida permissão; não bloqueia digitação por falha de role. */
  }
}

onMounted(ensureActiveRole)

async function handleDuplicate(board: BoardMeta) {
  try {
    const duplicated = await duplicateBoard.mutateAsync(board.id)
    menuOpenId.value = null
    success('Board duplicado')
    await router.push(`/boards/${duplicated.id}`)
  } catch {
    showError('Não foi possível duplicar o board')
  }
}

async function handleShare(board: BoardMeta) {
  if (!canWrite.value) return

  try {
    const link = await shareService.shareBoard(board.id)
    await navigator.clipboard.writeText(`${window.location.origin}${link.path}`)
    menuOpenId.value = null
    success('Link público copiado')
  } catch {
    showError('Não foi possível compartilhar o board')
  }
}

async function handleThumbnail(board: BoardMeta, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    await boardsService.uploadThumbnail(board.id, file)
    menuOpenId.value = null
    await refetch()
    success('Thumbnail atualizada')
  } catch {
    showError('Não foi possível enviar a thumbnail')
  }
}

function requestRemove(board: BoardMeta) {
  boardPendingRemoval.value = board
  menuOpenId.value = null
}

async function confirmRemove() {
  const board = boardPendingRemoval.value
  if (!board) return

  try {
    await removeBoard.mutateAsync(board.id)
    boardPendingRemoval.value = null
    menuOpenId.value = null
    success('Board removido')
  } catch {
    showError('Não foi possível remover o board')
  }
}

function formatUpdatedAt(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
</script>

<template>
  <main class="boards-page">
    <header class="boards-header">
      <div>
        <span class="eyebrow">
          <Paintbrush :size="12" />
          Boards
        </span>
        <h1 class="page-title">Canvas colaborativo</h1>
        <p class="page-sub">
          Lousas de desenho sincronizadas via Yjs para rascunhos, fluxos e diagramas rápidos.
        </p>
      </div>
    </header>

    <section class="toolbar">
      <div class="search-wrap">
        <Search :size="15" class="search-icon" />
        <input v-model="search" class="search-input" placeholder="Buscar boards..." />
      </div>

      <form class="create-form" @submit.prevent="handleCreate">
        <input
          v-model="title"
          class="create-input"
          :disabled="createBoard.isPending.value"
          placeholder="Nome do novo board"
        />
        <button
          class="create-btn"
          type="submit"
          :disabled="!canWrite || createBoard.isPending.value"
          :title="createTitle"
        >
          <Loader2 v-if="createBoard.isPending.value" :size="14" class="spin" />
          <Plus v-else :size="14" />
          <span>Criar</span>
        </button>
      </form>
    </section>

    <section v-if="isLoading" class="state">
      <Loader2 :size="22" class="spin" />
      <span>Carregando boards...</span>
    </section>

    <section v-else-if="filteredBoards.length === 0" class="state">
      <Paintbrush :size="26" />
      <strong>Nenhum board encontrado</strong>
      <span>Crie o primeiro canvas para começar a desenhar.</span>
      <button class="ghost-btn" type="button" :disabled="isFetching" @click="() => refetch()">
        <Loader2 v-if="isFetching" :size="14" class="spin" />
        <span>{{ isFetching ? 'Recarregando...' : 'Recarregar' }}</span>
      </button>
    </section>

    <section v-else class="boards-grid">
      <article
        v-for="board in filteredBoards"
        :key="board.id"
        class="board-card hover-lift"
        @click="router.push(`/boards/${board.id}`)"
      >
        <div class="thumb">
          <img v-if="board.thumbnailUrl" :src="board.thumbnailUrl" :alt="board.title" />
          <Paintbrush v-else :size="30" />
        </div>
        <div class="card-body">
          <div class="card-title-row">
            <h2>{{ board.title }}</h2>
            <div class="card-menu" @click.stop>
              <button class="icon-btn" type="button" @click="menuOpenId = menuOpenId === board.id ? null : board.id">
                <MoreVertical :size="15" />
              </button>
              <div v-if="menuOpenId === board.id" class="menu-pop">
                <button type="button" @click="handleDuplicate(board)">
                  <Copy :size="13" />
                  Duplicar
                </button>
                <button type="button" :disabled="!canWrite" @click="handleShare(board)">
                  <Copy :size="13" />
                  Compartilhar
                </button>
                <label class="menu-file" :class="{ disabled: !canWrite }">
                  <ImagePlus :size="13" />
                  Thumbnail
                  <input type="file" accept="image/*" :disabled="!canWrite" @change="handleThumbnail(board, $event)" />
                </label>
                <button
                  type="button"
                  class="danger"
                  :disabled="!canWrite"
                  @click="requestRemove(board)"
                >
                  <Trash2 :size="13" />
                  Remover
                </button>
              </div>
            </div>
          </div>
          <p>Atualizado em {{ formatUpdatedAt(board.updatedAt) }}</p>
        </div>
      </article>
    </section>

    <ConfirmDialog
      :model-value="!!boardPendingRemoval"
      danger
      title="Remover board?"
      :message="`Isso removerá '${boardPendingRemoval?.title || ''}' e o canvas associado.`"
      confirm-label="Remover"
      :loading="removeBoard.isPending.value"
      @update:model-value="(value) => { if (!value) boardPendingRemoval = null }"
      @confirm="confirmRemove"
    />
  </main>
</template>

<style scoped>
.boards-page {
  min-height: 100%;
  padding: 28px;
  background: var(--bg);
  color: var(--text);
}

.boards-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-4);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.page-title {
  margin: 8px 0 6px;
  color: var(--text);
  font-size: clamp(28px, 4vw, 42px);
  line-height: 1;
}

.page-sub {
  margin: 0;
  max-width: 640px;
  color: var(--text-2);
  font-size: 14px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
}

.search-wrap,
.create-form {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-wrap {
  flex: 1;
  min-width: 220px;
  height: 38px;
  padding: 0 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.search-icon {
  color: var(--text-3);
}

.search-input,
.create-input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-family: inherit;
}

.search-input {
  flex: 1;
}

.create-form {
  height: 38px;
  padding: 0 4px 0 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.create-input {
  width: 190px;
}

.create-btn,
.ghost-btn {
  border: 0;
  border-radius: 8px;
  background: var(--accent);
  color: var(--accent-fg);
  font-family: inherit;
  font-weight: 750;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.create-btn {
  height: 30px;
  padding: 0 11px;
}

.ghost-btn {
  height: 32px;
  padding: 0 12px;
}

.create-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.boards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 14px;
}

.board-card {
  overflow: visible;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  position: relative;
}

.thumb {
  height: 150px;
  overflow: hidden;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, transparent), transparent),
    var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  border-bottom: 1px solid var(--border);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-body {
  padding: 13px;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.card-title-row h2 {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  font-weight: 760;
}

.card-body p {
  margin: 5px 0 0;
  color: var(--text-3);
  font-size: 12px;
}

.card-menu {
  position: relative;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.menu-pop {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  width: 168px;
  padding: 8px;
  z-index: 20;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--shadow-overlay);
}

.menu-pop button,
.menu-file {
  width: 100%;
  min-height: 36px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
}

.menu-pop button:hover,
.menu-file:hover {
  background: var(--surface-2);
  color: var(--text);
}

.menu-pop .danger {
  color: var(--err);
}

.menu-pop button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.menu-file.disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.menu-file input {
  display: none;
}

.state {
  min-height: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-3);
  text-align: center;
}

.state strong {
  color: var(--text);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .boards-page {
    padding: 18px;
  }

  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .search-wrap,
  .create-form {
    width: 100%;
  }

  .create-input {
    flex: 1;
    width: auto;
  }
}
</style>
