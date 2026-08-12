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
  Filter,
  FolderPlus,
  HardDrive,
  House,
  LayoutGrid,
  List,
  Search,
  X,
} from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import DriveHero from './components/DriveHero.vue'
import DriveRecents from './components/DriveRecents.vue'
import DriveKindFilter from './components/DriveKindFilter.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import FileViewer, {
  type ResolvedFileUrl,
  type ViewerFile,
} from '@/components/ui/FileViewer.vue'
import DriveSidebar from './components/DriveSidebar.vue'
import DriveFileGrid from './components/DriveFileGrid.vue'
import DriveFileList from './components/DriveFileList.vue'
import FileDetailsPanel from './components/FileDetailsPanel.vue'
import ShareFileDialog from './components/ShareFileDialog.vue'
import DriveNameDialog from './components/DriveNameDialog.vue'
import DriveMoveDialog from './components/DriveMoveDialog.vue'
import UploadDropzone from './components/UploadDropzone.vue'
import {
  buildFolderTree,
  folderPath,
  useDriveFolderMutations,
  useDriveFolders,
} from './composables/useDriveFolders'
import {
  useDriveFileMutations,
  useDriveFiles,
  useDriveOverview,
} from './composables/useDriveFiles'
import driveService, {
  DRIVE_MAX_FILE_BYTES_CLIENT,
  type DriveKind,
  type DriveSort,
} from '@/service/drive/drive-service'
import { formatBytes } from '@/utils/file-kind'
import type {
  DriveCompanySection,
  DriveFile,
  DriveFolderNode,
  DriveScope,
} from './types'
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
// Modelo QR: a sidebar lista TODAS as empresas do usuário e a seleção é local
// da tela (`?scope=personal|<companyId>`), sem tocar na empresa ativa do topo.

/** Empresas do usuário (id, nome, minha role) — vêm do workspace store. */
const memberCompanies = computed(() => workspace.companies)

function scopeKeyFromQuery(): string {
  const raw = route.query.scope
  return typeof raw === 'string' && raw.length > 0 ? raw : 'personal'
}

/** 'personal' ou o id da empresa selecionada. */
const selectedKey = ref<string>(scopeKeyFromQuery())
const selectedCompanyId = computed<string | null>(() =>
  selectedKey.value === 'personal' ? null : selectedKey.value,
)
const scope = computed<DriveScope>(() =>
  selectedCompanyId.value ? 'company' : 'personal',
)
const selectedCompany = computed(() =>
  memberCompanies.value.find((c) => c.id === selectedCompanyId.value),
)

// Seleção aponta para empresa que não é minha (URL velha, saí da empresa):
// volta pro Pessoal assim que a lista de empresas estiver carregada.
watch([memberCompanies, selectedCompanyId], ([companies, companyId]) => {
  if (
    companyId &&
    companies.length > 0 &&
    !companies.some((c) => c.id === companyId)
  ) {
    selectedKey.value = 'personal'
    folderId.value = null
  }
})

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

watch([selectedKey, folderId], () => {
  page.value = 1
  void router.replace({
    query: {
      ...route.query,
      scope: selectedKey.value,
      folder: folderId.value ?? undefined,
    },
  })
})

// Sync de volta: back/forward do navegador muda a query e a tela acompanha.
// Guardas de igualdade impedem o eco do router.replace acima virar laço.
watch(
  () => [route.query.scope, route.query.folder],
  () => {
    const nextKey = scopeKeyFromQuery()
    const nextFolder =
      typeof route.query.folder === 'string' ? route.query.folder : null
    if (nextKey !== selectedKey.value) selectedKey.value = nextKey
    if (nextFolder !== folderId.value) folderId.value = nextFolder
  },
)

// ─── Dados ───────────────────────────────────────────────────────────────────

// Uma resposta com TODAS as pastas visíveis; o front agrupa por empresa.
const foldersQuery = useDriveFolders()
const allFolders = computed(() => foldersQuery.data.value ?? [])

const personalTree = computed(() =>
  buildFolderTree(allFolders.value.filter((f) => f.companyId === null)),
)
const treeByCompany = computed(() => {
  const map = new Map<string, ReturnType<typeof buildFolderTree>>()
  for (const company of memberCompanies.value) {
    map.set(
      company.id,
      buildFolderTree(
        allFolders.value.filter((f) => f.companyId === company.id),
      ),
    )
  }
  return map
})

const SORT_OPTIONS = [
  { label: 'Mais recentes', value: 'recent' },
  { label: 'Nome (A-Z)', value: 'name' },
  { label: 'Maiores primeiro', value: 'size' },
] as const

const sort = ref<DriveSort>('recent')
watch(sort, () => {
  page.value = 1
})

/** Faceta de tipo ativa (null = todos). Some ao trocar de espaço ou buscar. */
const kind = ref<DriveKind | null>(null)

function selectKind(next: DriveKind | null) {
  kind.value = next
  page.value = 1
}

const overviewQuery = useDriveOverview({
  scope,
  companyId: selectedCompanyId,
})
const overview = computed(() => overviewQuery.data.value)

/** Recentes e facetas: só na raiz, sem busca e sem filtro (ver template). */
const showOverviewSections = computed(
  () =>
    !isSearching.value &&
    !kind.value &&
    folderId.value === null &&
    (overview.value?.recent.length ?? 0) > 0,
)

/**
 * Abrir um recente monta uma sessão de UM item: os recentes vêm da visão geral
 * e não estão necessariamente na página listada, então navegar por setas ali
 * levaria a arquivos que não têm relação com o que foi clicado.
 */
function openRecent(file: DriveFile) {
  viewerSession.value = {
    byId: new Map([[file.id, file]]),
    items: [
      {
        id: file.id,
        filename: file.name,
        mimeType: file.mimeType,
        size: file.size,
        uploadedBy: file.owner ? { name: file.owner.name } : null,
      },
    ],
  }
  viewerIndex.value = 0
}

const filesQuery = useDriveFiles({
  scope,
  companyId: selectedCompanyId,
  folderId,
  search: debouncedSearch,
  kind,
  sort,
  page,
})

const files = computed(() => filesQuery.data.value?.items ?? [])
const total = computed(() => filesQuery.data.value?.total ?? 0)
const pageSize = computed(() => filesQuery.data.value?.pageSize ?? 50)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const counts = computed(
  () =>
    filesQuery.data.value?.counts ?? {
      personal: 0,
      companies: [] as Array<{ companyId: string; files: number }>,
    },
)

/** Seções da sidebar: uma por empresa do usuário, com contador e árvore. */
const companySections = computed<DriveCompanySection[]>(() =>
  memberCompanies.value.map((company) => ({
    id: company.id,
    name: company.name,
    canManage: company.myRole === 'ADMIN',
    count:
      counts.value.companies.find((c) => c.companyId === company.id)?.files ??
      0,
    tree: treeByCompany.value.get(company.id) ?? [],
  })),
)

const activeFolders = computed(() =>
  allFolders.value.filter((f) => f.companyId === selectedCompanyId.value),
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

// ─── Permissões (padrão QR, por empresa SELECIONADA) ─────────────────────────

const selectedIsAdmin = computed(
  () => selectedCompany.value?.myRole === 'ADMIN',
)

const canManageFolderHere = computed(() =>
  scope.value === 'personal' ? true : selectedIsAdmin.value,
)

function canManageFile(file: DriveFile): boolean {
  if (file.companyId === null) return true
  return selectedIsAdmin.value || (!!me.value && file.ownerId === me.value.id)
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
      companyId: selectedCompanyId.value,
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

// ─── Compartilhar e detalhes ─────────────────────────────────────────────────

const shareTarget = ref<DriveFile | null>(null)
const detailsTarget = ref<DriveFile | null>(null)

/** Detalhes segue a listagem: renomear com o painel aberto não deixa dado velho. */
watch(files, (list) => {
  const current = detailsTarget.value
  if (!current) return
  const fresh = list.find((f) => f.id === current.id)
  detailsTarget.value = fresh ?? null
})

const detailsFolderName = computed(() => {
  const target = detailsTarget.value
  if (!target?.folderId) return null
  return allFolders.value.find((f) => f.id === target.folderId)?.name ?? null
})

function openDetails(file: DriveFile) {
  detailsTarget.value = file
}

function openViewerFromDetails() {
  const index = files.value.findIndex((f) => f.id === detailsTarget.value?.id)
  if (index >= 0) openViewer(index)
}

// ─── Diálogos ────────────────────────────────────────────────────────────────

type NameDialogState =
  | { mode: 'create-folder'; companyId: string | null; parentId: string | null }
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
        companyId: state.companyId,
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
  selectedCompanyId.value
    ? (treeByCompany.value.get(selectedCompanyId.value) ?? [])
    : personalTree.value,
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

function selectScope(
  _nextScope: DriveScope,
  companyId: string | null,
  nextFolderId: string | null,
) {
  selectedKey.value = companyId ?? 'personal'
  folderId.value = nextFolderId
  search.value = ''
  // A faceta é do espaço anterior: manter "Vídeos" ao entrar numa empresa que
  // não tem vídeo nenhum abriria o novo espaço num vazio enganoso.
  kind.value = null
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

        <!--
          Wrapper com largura fixa: o trigger do AppSelect é `width: 100%`, e a
          classe passada ao componente não chega nele (raiz headless), então
          sem este div o select esticaria e quebraria a toolbar em três linhas.
        -->
        <div class="drive-sort">
          <AppSelect
            v-model="sort"
            density="compact"
            :items="SORT_OPTIONS"
            label="Ordenar arquivos"
          />
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
          @click="nameDialog = { mode: 'create-folder', companyId: selectedCompanyId, parentId: folderId }"
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
        :active-key="selectedKey"
        :active-folder-id="folderId"
        :personal-tree="personalTree"
        :personal-count="counts.personal"
        :companies="companySections"
        @select="selectScope"
        @create-folder="(companyId, parentId) => (nameDialog = { mode: 'create-folder', companyId, parentId })"
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
        <DriveHero
          :space-name="selectedCompany?.name ?? 'Pessoal'"
          :is-personal="selectedCompanyId === null"
          :files="overview?.files ?? 0"
          :bytes="overview?.bytes ?? 0"
          :quota-bytes="overview?.quotaBytes ?? 0"
          :loading="overviewQuery.isPending.value"
        />

        <!--
          Recentes e facetas só aparecem na RAIZ, sem busca e sem filtro: dentro
          de uma pasta o assunto é a pasta, e repetir os recentes do espaço ali
          rouba a atenção do conteúdo que o usuário foi ver.
        -->
        <DriveRecents
          v-if="showOverviewSections"
          :files="overview?.recent ?? []"
          @open="openRecent"
        />

        <DriveKindFilter
          v-if="overview && !isSearching"
          :counts="overview.byKind"
          :total="overview.files"
          :active="kind"
          @select="selectKind"
        />

        <!-- Breadcrumb (fora de busca) / rótulo de resultados -->
        <nav v-if="!isSearching" class="drive-crumbs" aria-label="Caminho da pasta">
          <button type="button" class="drive-crumb" @click="folderId = null">
            <House :size="12" />
            {{ selectedCompany?.name ?? 'Pessoal' }}
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
          v-else-if="files.length === 0 && kind"
          :icon="Filter"
          title="Nenhum arquivo deste tipo"
          :description="`Este espaço não tem arquivos na categoria escolhida.`"
        >
          <template #action>
            <button type="button" class="drive-btn press" @click="selectKind(null)">
              Ver todos os arquivos
            </button>
          </template>
        </EmptyState>

        <!--
          Vazio não é erro: é o começo. Em vez de um ícone e uma frase seca num
          retângulo branco, a área vira a própria zona de soltar, com o que dá
          para fazer e os limites reais (tamanho e tipos) ditos na hora, e não
          depois do erro 400.
        -->
        <div v-else-if="files.length === 0" v-reveal="3" class="drive-blank">
          <span class="drive-blank-art" aria-hidden="true">
            <CloudUpload :size="30" />
          </span>
          <h2 class="drive-blank-title">
            {{ folderId ? 'Esta pasta está vazia' : 'Comece seu Drive' }}
          </h2>
          <p class="drive-blank-text">
            Arraste arquivos para qualquer lugar desta área ou envie pelo botão.
            Imagens, PDFs, vídeos e documentos ganham pré-visualização.
          </p>
          <div class="drive-blank-actions">
            <button
              type="button"
              class="drive-btn drive-btn--primary press"
              @click="dropRef?.open()"
            >
              <CloudUpload :size="14" />
              Enviar arquivos
            </button>
            <button
              v-if="canManageFolderHere"
              type="button"
              class="drive-btn press"
              @click="nameDialog = { mode: 'create-folder', companyId: selectedCompanyId, parentId: folderId }"
            >
              <FolderPlus :size="14" />
              Criar pasta
            </button>
          </div>
          <p class="drive-blank-hint">
            Até {{ formatBytes(DRIVE_MAX_FILE_BYTES_CLIENT) }} por arquivo
          </p>
        </div>

        <DriveFileGrid
          v-else-if="driveViewMode === 'grid'"
          :files="files"
          :can-manage="canManageFile"
          @open="openViewer"
          @download="download"
          @share="(file) => (shareTarget = file)"
          @details="openDetails"
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
          @share="(file) => (shareTarget = file)"
          @details="openDetails"
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

      <FileDetailsPanel
        :file="detailsTarget"
        :folder-name="detailsFolderName"
        :can-manage="detailsTarget ? canManageFile(detailsTarget) : false"
        @close="detailsTarget = null"
        @open="openViewerFromDetails"
        @download="detailsTarget && download(detailsTarget)"
        @share="shareTarget = detailsTarget"
      />
    </div>

    <!-- Overlays -->
    <ShareFileDialog :file="shareTarget" @close="shareTarget = null" />
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

.drive-sort {
  width: 168px;
  flex: none;
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

/* ─── Estado vazio: convite, não aviso ─────────────────────────────────── */

.drive-blank {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 54px 24px 60px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-xl);
  /* Tinta de acento MUITO baixa: sinaliza a zona de soltar sem virar cartaz. */
  background:
    radial-gradient(
      120% 90% at 50% 0%,
      color-mix(in srgb, var(--accent) 7%, transparent) 0%,
      transparent 70%
    ),
    var(--surface);
}

.drive-blank-art {
  display: grid;
  place-items: center;
  width: 66px;
  height: 66px;
  margin-bottom: 16px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 13%, var(--surface-2));
  color: var(--accent);
}

.drive-blank-title {
  margin: 0 0 7px;
  color: var(--text);
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.drive-blank-text {
  margin: 0 0 20px;
  max-width: 430px;
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.6;
}

.drive-blank-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}

.drive-blank-hint {
  margin: 16px 0 0;
  color: var(--text-4);
  font-size: 11px;
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
