<script setup lang="ts">
/**
 * Drive de arquivos (spec: docs/specs/2026/q3/q3-2/drive-p1-nativo.md).
 *
 * Dois espaços: Pessoal (só o dono vê) e a empresa ativa (todo membro vê e
 * sobe; quem subiu gerencia o próprio arquivo; ADMIN gerencia tudo, incluindo
 * pastas). Escopo e pasta atuais persistem na URL (`?scope=` / `?folder=`),
 * padrão do QR; grade/lista persiste em preferência de UI.
 *
 * O storage é privado: preview de imagem vem assinado da listagem; abrir ou
 * baixar pede URL fresca na hora (o viewer recebe `resolveUrl`).
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { refDebounced } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import {
  CloudUpload,
  FolderPlus,
  HardDrive,
  House,
  LayoutGrid,
  List,
  Search,
  X,
} from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import FileViewer, {
  type ResolvedFileUrl,
  type ViewerFile,
} from '@/components/ui/FileViewer.vue'
import DriveSidebar from './components/DriveSidebar.vue'
import DriveFileGrid from './components/DriveFileGrid.vue'
import DriveFileList from './components/DriveFileList.vue'
import DriveNameDialog from './components/DriveNameDialog.vue'
import DriveMoveDialog from './components/DriveMoveDialog.vue'
import UploadDropzone from './components/UploadDropzone.vue'
import {
  buildFolderTree,
  folderPath,
  useDriveFolderMutations,
  useDriveFolders,
} from './composables/useDriveFolders'
import { useDriveFileMutations, useDriveFiles } from './composables/useDriveFiles'
import driveService, {
  DRIVE_MAX_FILE_BYTES_CLIENT,
} from '@/service/drive/drive-service'
import type { DriveFile, DriveFolderNode, DriveScope } from './types'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useUiStore } from '@/stores/uiStores'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'

const route = useRoute()
const router = useRouter()
const workspace = useWorkspaceStore()
const uiStore = useUiStore()
const { driveViewMode } = storeToRefs(uiStore)
const { me } = useCurrentUser()
const { error: showError } = useToast()

// ─── Estado de navegação (URL é a fonte) ─────────────────────────────────────

const activeCompanyId = computed(() => workspace.activeCompanyId)
const hasCompany = computed(() => !!activeCompanyId.value)
const companyName = computed(
  () =>
    workspace.companies.find((c) => c.id === activeCompanyId.value)?.name ??
    null,
)
const isAdmin = computed(() => workspace.isAdmin)

function scopeFromQuery(): DriveScope {
  return route.query.scope === 'company' && hasCompany.value
    ? 'company'
    : 'personal'
}

const scope = ref<DriveScope>(scopeFromQuery())
const folderId = ref<string | null>(
  typeof route.query.folder === 'string' ? route.query.folder : null,
)
const search = ref('')
// refDebounced (padrão das Notas): sem timer manual pra vazar no unmount.
const debouncedSearch = refDebounced(search, 300)
const page = ref(1)

watch(debouncedSearch, () => {
  page.value = 1
})

watch([scope, folderId], () => {
  page.value = 1
  void router.replace({
    query: {
      ...route.query,
      scope: scope.value,
      folder: folderId.value ?? undefined,
    },
  })
})

// Sync de volta: back/forward do navegador muda a query e a tela acompanha.
// Guardas de igualdade impedem o eco do router.replace acima virar laço.
watch(
  () => [route.query.scope, route.query.folder],
  () => {
    const nextScope = scopeFromQuery()
    const nextFolder =
      typeof route.query.folder === 'string' ? route.query.folder : null
    if (nextScope !== scope.value) scope.value = nextScope
    if (nextFolder !== folderId.value) folderId.value = nextFolder
  },
)

// Empresa ativa sumiu (logout/troca): espaço da empresa deixa de existir.
watch(hasCompany, (value) => {
  if (!value && scope.value === 'company') {
    scope.value = 'personal'
    folderId.value = null
  }
})

// ─── Dados ───────────────────────────────────────────────────────────────────

const personalFoldersQuery = useDriveFolders('personal', activeCompanyId)
const companyFoldersQuery = useDriveFolders('company', activeCompanyId, hasCompany)

const personalTree = computed(() =>
  buildFolderTree(personalFoldersQuery.data.value ?? []),
)
const companyTree = computed(() =>
  buildFolderTree(companyFoldersQuery.data.value ?? []),
)

const filesQuery = useDriveFiles({
  scope,
  companyId: activeCompanyId,
  folderId,
  search: debouncedSearch,
  page,
})

const files = computed(() => filesQuery.data.value?.items ?? [])
const total = computed(() => filesQuery.data.value?.total ?? 0)
const pageSize = computed(() => filesQuery.data.value?.pageSize ?? 50)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const counts = computed(
  () => filesQuery.data.value?.counts ?? { personal: 0, company: 0 },
)

const activeFolders = computed(() =>
  scope.value === 'personal'
    ? (personalFoldersQuery.data.value ?? [])
    : (companyFoldersQuery.data.value ?? []),
)

const breadcrumb = computed(() => folderPath(activeFolders.value, folderId.value))

// Pasta da URL não existe mais neste espaço (trocou de empresa, foi excluída):
// volta pra raiz em vez de mostrar uma listagem vazia inexplicável.
watch(
  [activeFolders, folderId],
  ([folders, id]) => {
    if (id && folders.length > 0 && !folders.some((f) => f.id === id)) {
      folderId.value = null
    }
  },
)

// ─── Permissões (padrão QR) ──────────────────────────────────────────────────

const canManageFolderHere = computed(() =>
  scope.value === 'personal' ? true : isAdmin.value,
)

function canManageFile(file: DriveFile): boolean {
  if (file.companyId === null) return true
  return isAdmin.value || (!!me.value && file.ownerId === me.value.id)
}

// ─── Mutations ───────────────────────────────────────────────────────────────

const folderMut = useDriveFolderMutations()
const fileMut = useDriveFileMutations()

// ─── Upload ──────────────────────────────────────────────────────────────────

const dropRef = ref<InstanceType<typeof UploadDropzone> | null>(null)

function uploader(file: File, onProgress: (percent: number) => void) {
  return driveService.upload(
    file,
    {
      companyId: scope.value === 'company' ? activeCompanyId.value : null,
      folderId: folderId.value,
    },
    onProgress,
  )
}

// ─── Abrir / baixar (URL assinada fresca) ────────────────────────────────────

function withDownloadParam(url: string, name: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(name)}`
}

/**
 * Snapshot da listagem no momento de abrir: refetch não bagunça o viewer.
 * O vínculo item→arquivo vai por `id` embutido no ViewerFile (interface
 * estrutural aceita a propriedade extra), não por posição de array.
 */
type ViewerItem = ViewerFile & { id: string }
const viewerSession = ref<{
  byId: Map<string, DriveFile>
  items: ViewerItem[]
} | null>(null)
const viewerIndex = ref<number | null>(null)

function openViewer(index: number) {
  const snapshot = files.value.slice()
  viewerSession.value = {
    byId: new Map(snapshot.map((file) => [file.id, file])),
    items: snapshot.map((file) => ({
      id: file.id,
      filename: file.name,
      mimeType: file.mimeType,
      size: file.size,
      uploadedBy: file.owner ? { name: file.owner.name } : null,
    })),
  }
  viewerIndex.value = index
}

async function resolveViewerUrl(item: ViewerFile): Promise<ResolvedFileUrl> {
  const id = (item as ViewerItem).id
  const file = id ? viewerSession.value?.byId.get(id) : undefined
  if (!file) throw new Error('Arquivo fora da sessão do visualizador')
  const url = await driveService.fileUrl(file.id)
  return { url, downloadUrl: withDownloadParam(url, file.name) }
}

async function download(file: DriveFile) {
  try {
    const url = await driveService.fileUrl(file.id)
    const anchor = document.createElement('a')
    anchor.href = withDownloadParam(url, file.name)
    anchor.download = file.name
    anchor.rel = 'noopener noreferrer'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } catch (error) {
    showError(getApiErrorMessage(error, 'Não foi possível baixar o arquivo'))
  }
}

// ─── Diálogos ────────────────────────────────────────────────────────────────

type NameDialogState =
  | { mode: 'create-folder'; scope: DriveScope; parentId: string | null }
  | { mode: 'rename-folder'; folder: DriveFolderNode }
  | { mode: 'rename-file'; file: DriveFile }

const nameDialog = ref<NameDialogState | null>(null)

const nameDialogTitle = computed(() => {
  if (!nameDialog.value) return ''
  if (nameDialog.value.mode === 'create-folder') return 'Nova pasta'
  if (nameDialog.value.mode === 'rename-folder') return 'Renomear pasta'
  return 'Renomear arquivo'
})

const nameDialogInitial = computed(() => {
  if (!nameDialog.value) return ''
  if (nameDialog.value.mode === 'rename-folder') return nameDialog.value.folder.name
  if (nameDialog.value.mode === 'rename-file') return nameDialog.value.file.name
  return ''
})

const nameDialogLoading = computed(
  () =>
    folderMut.create.isPending.value ||
    folderMut.rename.isPending.value ||
    fileMut.rename.isPending.value,
)

function submitName(name: string) {
  const state = nameDialog.value
  if (!state) return
  if (state.mode === 'create-folder') {
    folderMut.create.mutate(
      {
        name,
        companyId: state.scope === 'company' ? activeCompanyId.value : null,
        parentId: state.parentId,
      },
      { onSuccess: () => (nameDialog.value = null) },
    )
    return
  }
  if (state.mode === 'rename-folder') {
    folderMut.rename.mutate(
      { id: state.folder.id, name },
      { onSuccess: () => (nameDialog.value = null) },
    )
    return
  }
  fileMut.rename.mutate(
    { id: state.file.id, name },
    { onSuccess: () => (nameDialog.value = null) },
  )
}

type MoveDialogState =
  | { kind: 'file'; file: DriveFile }
  | { kind: 'folder'; folder: DriveFolderNode }

const moveDialog = ref<MoveDialogState | null>(null)

const moveDialogTree = computed(() =>
  scope.value === 'personal' ? personalTree.value : companyTree.value,
)

const moveDialogItemName = computed(() =>
  moveDialog.value?.kind === 'file'
    ? moveDialog.value.file.name
    : (moveDialog.value?.folder.name ?? ''),
)

const moveDialogCurrentId = computed(() =>
  moveDialog.value?.kind === 'file'
    ? moveDialog.value.file.folderId
    : (moveDialog.value?.folder.parentId ?? null),
)

/** Pasta movida não pode ir para si mesma nem para descendente. */
const moveDialogDisabledIds = computed(() => {
  if (moveDialog.value?.kind !== 'folder') return []
  const ids: string[] = []
  const walk = (node: DriveFolderNode) => {
    ids.push(node.id)
    node.children.forEach(walk)
  }
  walk(moveDialog.value.folder)
  return ids
})

const moveDialogLoading = computed(
  () => fileMut.move.isPending.value || folderMut.move.isPending.value,
)

function submitMove(targetId: string | null) {
  const state = moveDialog.value
  if (!state) return
  if (state.kind === 'file') {
    fileMut.move.mutate(
      { id: state.file.id, folderId: targetId },
      { onSuccess: () => (moveDialog.value = null) },
    )
    return
  }
  folderMut.move.mutate(
    { id: state.folder.id, parentId: targetId },
    { onSuccess: () => (moveDialog.value = null) },
  )
}

type ConfirmState =
  | { kind: 'file'; file: DriveFile }
  | { kind: 'folder'; folder: DriveFolderNode }

const confirmState = ref<ConfirmState | null>(null)

const confirmTitle = computed(() =>
  confirmState.value?.kind === 'file' ? 'Excluir arquivo' : 'Excluir pasta',
)

const confirmMessage = computed(() => {
  const state = confirmState.value
  if (!state) return ''
  if (state.kind === 'file') {
    return `"${state.file.name}" será excluído do Drive. Esta ação não pode ser desfeita.`
  }
  const inside = state.folder._count?.files ?? 0
  const subfolders = state.folder.children.length
  const detail =
    inside > 0 || subfolders > 0
      ? ' Tudo dentro dela (arquivos e subpastas) será excluído junto.'
      : ''
  return `A pasta "${state.folder.name}" será excluída.${detail} Esta ação não pode ser desfeita.`
})

const confirmLoading = computed(
  () => fileMut.remove.isPending.value || folderMut.remove.isPending.value,
)

function submitConfirm() {
  const state = confirmState.value
  if (!state) return
  if (state.kind === 'file') {
    fileMut.remove.mutate(state.file.id, {
      onSuccess: () => (confirmState.value = null),
    })
    return
  }
  folderMut.remove.mutate(state.folder.id, {
    onSuccess: () => {
      if (folderId.value === state.folder.id) folderId.value = null
      confirmState.value = null
    },
  })
}

// ─── Sidebar / navegação ─────────────────────────────────────────────────────

function selectScope(nextScope: DriveScope, nextFolderId: string | null) {
  scope.value = nextScope
  folderId.value = nextFolderId
  search.value = ''
}

const isSearching = computed(() => debouncedSearch.value.trim().length > 0)
const loading = computed(() => filesQuery.isLoading.value)
</script>

<template>
  <section class="drive">
    <header class="drive-head">
      <div class="drive-title">
        <h1><HardDrive :size="20" class="drive-title-icon" /> Drive</h1>
        <p class="drive-sub">Seus arquivos e os da empresa, num lugar só</p>
      </div>

      <div class="drive-tools">
        <div class="drive-search">
          <Search :size="14" class="drive-search-icon" aria-hidden="true" />
          <input
            v-model="search"
            type="search"
            class="drive-search-input"
            placeholder="Buscar arquivos"
            aria-label="Buscar arquivos por nome"
          />
          <button
            v-if="search"
            type="button"
            class="drive-search-clear"
            aria-label="Limpar busca"
            @click="search = ''"
          >
            <X :size="12" />
          </button>
        </div>

        <div class="drive-viewtoggle" role="group" aria-label="Modo de exibição">
          <button
            type="button"
            class="drive-vt press"
            :class="{ 'drive-vt--active': driveViewMode === 'grid' }"
            aria-label="Ver em grade"
            title="Grade"
            @click="driveViewMode = 'grid'"
          >
            <LayoutGrid :size="14" />
          </button>
          <button
            type="button"
            class="drive-vt press"
            :class="{ 'drive-vt--active': driveViewMode === 'list' }"
            aria-label="Ver em lista"
            title="Lista"
            @click="driveViewMode = 'list'"
          >
            <List :size="14" />
          </button>
        </div>

        <button
          v-if="canManageFolderHere"
          type="button"
          class="drive-btn drive-btn--ghost press"
          @click="nameDialog = { mode: 'create-folder', scope, parentId: folderId }"
        >
          <FolderPlus :size="14" />
          Nova pasta
        </button>

        <button
          type="button"
          class="drive-btn drive-btn--primary press"
          @click="dropRef?.open()"
        >
          <CloudUpload :size="14" />
          Enviar
        </button>
      </div>
    </header>

    <div class="drive-body">
      <DriveSidebar
        :active-scope="scope"
        :active-folder-id="folderId"
        :personal-tree="personalTree"
        :company-tree="companyTree"
        :personal-count="counts.personal"
        :company-count="counts.company"
        :company-name="companyName"
        :has-company="hasCompany"
        :can-manage-personal="true"
        :can-manage-company="isAdmin"
        @select="selectScope"
        @create-folder="(s, parentId) => (nameDialog = { mode: 'create-folder', scope: s, parentId })"
        @rename-folder="(folder) => (nameDialog = { mode: 'rename-folder', folder })"
        @move-folder="(folder) => (moveDialog = { kind: 'folder', folder })"
        @delete-folder="(folder) => (confirmState = { kind: 'folder', folder })"
      />

      <UploadDropzone
        ref="dropRef"
        class="drive-main"
        :uploader="uploader"
        :max-bytes="DRIVE_MAX_FILE_BYTES_CLIENT"
        @uploaded="fileMut.invalidate()"
      >
        <!-- Breadcrumb (fora de busca) / rótulo de resultados -->
        <nav v-if="!isSearching" class="drive-crumbs" aria-label="Caminho da pasta">
          <button type="button" class="drive-crumb" @click="folderId = null">
            <House :size="12" />
            {{ scope === 'personal' ? 'Pessoal' : (companyName ?? 'Empresa') }}
          </button>
          <template v-for="crumb in breadcrumb" :key="crumb.id">
            <span class="drive-crumb-sep" aria-hidden="true">/</span>
            <button
              type="button"
              class="drive-crumb"
              :class="{ 'drive-crumb--current': crumb.id === folderId }"
              @click="folderId = crumb.id"
            >
              {{ crumb.name }}
            </button>
          </template>
        </nav>
        <p v-else class="drive-results" aria-live="polite">
          {{ total }} resultado(s) para "{{ debouncedSearch }}"
        </p>

        <!-- Conteúdo -->
        <div v-if="loading" class="drive-loading">
          <Skeleton v-for="n in 6" :key="n" type="card" />
        </div>

        <EmptyState
          v-else-if="files.length === 0 && isSearching"
          :icon="Search"
          title="Nada encontrado"
          description="Nenhum arquivo com esse nome neste espaço."
        />

        <EmptyState
          v-else-if="files.length === 0"
          :icon="CloudUpload"
          title="Nenhum arquivo aqui"
          description="Arraste arquivos para esta área ou use o botão Enviar."
        >
          <template #action>
            <button
              type="button"
              class="drive-btn drive-btn--primary press"
              @click="dropRef?.open()"
            >
              <CloudUpload :size="14" />
              Enviar arquivos
            </button>
          </template>
        </EmptyState>

        <DriveFileGrid
          v-else-if="driveViewMode === 'grid'"
          :files="files"
          :can-manage="canManageFile"
          @open="openViewer"
          @download="download"
          @rename="(file) => (nameDialog = { mode: 'rename-file', file })"
          @move="(file) => (moveDialog = { kind: 'file', file })"
          @remove="(file) => (confirmState = { kind: 'file', file })"
        />

        <DriveFileList
          v-else
          :files="files"
          :can-manage="canManageFile"
          @open="openViewer"
          @download="download"
          @rename-inline="(file, name) => fileMut.rename.mutate({ id: file.id, name })"
          @move="(file) => (moveDialog = { kind: 'file', file })"
          @remove="(file) => (confirmState = { kind: 'file', file })"
        />

        <!-- Paginação -->
        <footer v-if="totalPages > 1" class="drive-pager">
          <button
            type="button"
            class="drive-btn drive-btn--ghost press"
            :disabled="page <= 1"
            @click="page--"
          >
            Anterior
          </button>
          <span class="drive-pager-info">Página {{ page }} de {{ totalPages }}</span>
          <button
            type="button"
            class="drive-btn drive-btn--ghost press"
            :disabled="page >= totalPages"
            @click="page++"
          >
            Próxima
          </button>
        </footer>
      </UploadDropzone>
    </div>

    <!-- Overlays -->
    <DriveNameDialog
      :model-value="nameDialog !== null"
      :title="nameDialogTitle"
      :field-label="nameDialog?.mode === 'rename-file' ? 'Nome do arquivo' : 'Nome da pasta'"
      :initial-name="nameDialogInitial"
      :submit-label="nameDialog?.mode === 'create-folder' ? 'Criar' : 'Salvar'"
      :loading="nameDialogLoading"
      @update:model-value="(open) => { if (!open) nameDialog = null }"
      @submit="submitName"
    />

    <DriveMoveDialog
      :model-value="moveDialog !== null"
      :tree="moveDialogTree"
      :item-name="moveDialogItemName"
      :current-id="moveDialogCurrentId"
      :disabled-ids="moveDialogDisabledIds"
      :loading="moveDialogLoading"
      @update:model-value="(open) => { if (!open) moveDialog = null }"
      @submit="submitMove"
    />

    <ConfirmDialog
      :model-value="confirmState !== null"
      :title="confirmTitle"
      :message="confirmMessage"
      confirm-label="Excluir"
      cancel-label="Cancelar"
      :loading="confirmLoading"
      danger
      @update:model-value="(open: boolean) => { if (!open) confirmState = null }"
      @confirm="submitConfirm"
    />

    <FileViewer
      v-if="viewerIndex !== null && viewerSession"
      :items="viewerSession.items"
      :start-index="viewerIndex"
      :resolve-url="resolveViewerUrl"
      @close="viewerIndex = null; viewerSession = null"
    />
  </section>
</template>

<style scoped>
.drive {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px 26px 40px;
  min-height: 100%;
}

.drive-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.drive-title h1 {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0;
  color: var(--text);
  font-size: 19px;
  font-weight: 700;
}

.drive-title-icon {
  color: var(--accent);
}

.drive-sub {
  margin: 3px 0 0;
  color: var(--text-3);
  font-size: 12.5px;
}

.drive-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.drive-search {
  position: relative;
  display: flex;
  align-items: center;
}

.drive-search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-3);
  pointer-events: none;
}

.drive-search-input {
  width: 210px;
  padding: 8px 28px 8px 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font-size: 12.5px;
  font-family: inherit;
}

.drive-search-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.drive-search-clear {
  position: absolute;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.drive-search-clear:hover {
  color: var(--text);
}

.drive-viewtoggle {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.drive-vt {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  background: var(--surface);
  color: var(--text-3);
  cursor: pointer;
}

.drive-vt--active {
  background: var(--surface-3);
  color: var(--text);
}

.drive-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 13px;
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}

.drive-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.drive-btn--ghost {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-2);
}

.drive-btn--ghost:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}

.drive-btn--primary {
  border: none;
  background: var(--accent);
  color: var(--accent-fg);
}

.drive-body {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  min-height: 0;
  flex: 1;
}

.drive-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.drive-crumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.drive-crumb {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.drive-crumb:hover {
  background: var(--surface-2);
  color: var(--text);
}

.drive-crumb--current {
  color: var(--text);
  font-weight: 600;
}

.drive-crumb-sep {
  color: var(--text-4);
  font-size: 11px;
}

.drive-results {
  margin: 0;
  color: var(--text-3);
  font-size: 12px;
}

.drive-loading {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.drive-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding-top: 4px;
}

.drive-pager-info {
  color: var(--text-3);
  font-size: 12px;
}

@media (max-width: 900px) {
  .drive-body {
    flex-direction: column;
  }
}
</style>
