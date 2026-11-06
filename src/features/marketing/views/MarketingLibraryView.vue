<script setup lang="ts">
/**
 * Acervo da ala Marketing (spec r1-acervo-tarefas-convite.md, P1): material
 * de cada marca e da Geral do grupo (logo, foto de produto, bruto), em pastas.
 *
 * - Esquerda: a árvore (Todos os arquivos, Geral do grupo e as marcas) com
 *   criar, renomear, arrastar para mover e apagar.
 * - Filtros na URL (`?local=`, `?pasta=`, `?q=`, `?tipo=`, `?tag=`, `?por=`,
 *   `?fav=1`, `?ordem=`, `?vista=lista`, `?item=`), então link colado abre igual.
 * - Grade de miniaturas (ou lista), seleção por caixa e Shift+clique, barra de
 *   ações em lote, painel de detalhes e tela cheia com setas e Esc.
 * - Entrada: arrastar arquivos E pastas (recria as subpastas), Ctrl+V de
 *   imagem na pasta aberta, Enviar arquivos ou pasta; no celular "Tirar foto"
 *   e "Galeria". Arquivo repetido pergunta "Manter os dois" ou "Pular".
 *
 * Quem decide o que cada um pode é o servidor; a tela só esconde o que não dá.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderInput,
  FolderOpen,
  FolderPlus,
  FolderTree,
  Images,
  ImagePlus,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  Star,
  Tags,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import AppSelect from '@/components/ui/AppSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FileViewer, { type ResolvedFileUrl, type ViewerFile } from '@/components/ui/FileViewer.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { usePhoneViewport } from '@/composables/usePhoneViewport'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import {
  bulkLibraryItems,
  createLibraryFolder,
  deleteLibraryFolder,
  deleteLibraryItem,
  downloadLibraryZip,
  getLibraryDownload,
  isLibraryUnavailable,
  updateLibraryFolder,
  type LibraryBulkAction,
  type LibraryDuplicate,
  type LibraryFilters,
  type LibraryFolder,
  type LibraryItem,
  type LibraryKind,
  type LibraryOrder,
} from '@/service/marketing/marketing-library'
import axios from 'axios'
import { useMarketing, useMarketingMembers } from '../composables/useMarketing'
import LibraryDetails from '../library/LibraryDetails.vue'
import LibraryDuplicateDialog from '../library/LibraryDuplicateDialog.vue'
import LibraryFolderPickDialog from '../library/LibraryFolderPickDialog.vue'
import LibraryFolderTree from '../library/LibraryFolderTree.vue'
import LibraryGrid from '../library/LibraryGrid.vue'
import LibraryCheck from '../library/LibraryCheck.vue'
import LibraryNameDialog from '../library/LibraryNameDialog.vue'
import LibrarySheet from '../library/LibrarySheet.vue'
import LibraryTagsDialog from '../library/LibraryTagsDialog.vue'
import LibraryUploadPanel from '../library/LibraryUploadPanel.vue'
import { filesFromDrop, filesFromInput, imagesFromPaste, isEditableTarget, isFileDrag, type SourcedFile } from '../library/file-sources'
import {
  fileExtOf,
  GERAL_PARAM,
  KIND_OPTIONS,
  locationFromKey,
  locationKey,
  placeLabel,
  viewUrlOf,
  type LibrarySelection,
} from '../library/library-meta'
import { enqueueLibraryUploads, libraryUploads, type DuplicateDecision } from '../library/library-upload'
import { useLibraryItem, useLibraryItems, useLibraryRefresh, useLibraryTags, useLibraryTree } from '../library/useLibrary'
import '../library/library.css'

const mk = useMarketing()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const phone = usePhoneViewport()
const groupId = computed(() => mk.groupId.value!)
const refresh = useLibraryRefresh(groupId)
const canEditRole = computed(() => mk.can('EDITOR'))

// ── Estado na URL ──────────────────────────────────────────────────────────

function qs(key: string): string {
  const v = route.query[key]
  return typeof v === 'string' ? v : ''
}

function setQuery(patch: Record<string, string | null | undefined>, push = false) {
  const query = { ...route.query }
  for (const [k, v] of Object.entries(patch)) {
    if (v) query[k] = v
    else delete query[k]
  }
  void (push ? router.push({ query }) : router.replace({ query }))
}

const tipo = computed<LibraryKind | ''>(() => {
  const v = qs('tipo')
  return (['imagem', 'video', 'pdf', 'outro'] as string[]).includes(v) ? (v as LibraryKind) : ''
})
const ordem = computed<LibraryOrder>(() => {
  const v = qs('ordem')
  return v === 'nome' || v === 'favoritos' ? v : 'recentes'
})
const view = computed<'grade' | 'lista'>(() => (qs('vista') === 'lista' ? 'lista' : 'grade'))
const favOnly = computed(() => qs('fav') === '1')
const openId = computed(() => qs('item') || null)

// Busca com atraso curto: a URL (e a consulta) mudam quando a pessoa para de digitar.
const searchText = ref(qs('q'))
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchText, (v) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => setQuery({ q: v.trim() || null, item: null }), 250)
})
watch(
  () => route.query.q,
  (v) => {
    const s = typeof v === 'string' ? v : ''
    if (s !== searchText.value.trim()) searchText.value = s
  },
)

// ── Dados ──────────────────────────────────────────────────────────────────

const treeQuery = useLibraryTree(groupId)
const tagsQuery = useLibraryTags(groupId)
const membersQuery = useMarketingMembers(groupId)
const tagSuggestions = computed(() => tagsQuery.data.value ?? [])

/** Com o filtro de marca do layout (`?marca=`), a árvore mostra essa marca e a Geral. */
const locations = computed(() => {
  const all = treeQuery.data.value?.locations ?? []
  const brand = mk.brandFilter.value
  return brand ? all.filter((l) => l.companyId === null || l.companyId === brand) : all
})
const folders = computed(() =>
  (treeQuery.data.value?.folders ?? []).filter((f) => locations.value.some((l) => l.companyId === f.companyId)),
)
const allCount = computed(() => locations.value.reduce((s, l) => s + l.totalCount, 0))

const selection = computed<LibrarySelection>(() => {
  const key = qs('local')
  if (key === 'todos') return { companyId: undefined, folderId: null }
  if (key) {
    const companyId = locationFromKey(key)
    if (companyId !== undefined && locations.value.some((l) => l.companyId === companyId)) {
      const folder = folders.value.find((f) => f.id === qs('pasta') && f.companyId === companyId)
      return { companyId, folderId: folder?.id ?? null }
    }
  }
  if (mk.brandFilter.value) return { companyId: mk.brandFilter.value, folderId: null }
  // Quem vê uma marca só (o freelancer) abre direto nela: é onde ele envia.
  const brands = locations.value.filter((l) => l.companyId !== null)
  if (brands.length === 1) return { companyId: brands[0]!.companyId, folderId: null }
  return { companyId: undefined, folderId: null }
})
const currentLocation = computed(() =>
  selection.value.companyId === undefined ? undefined : locations.value.find((l) => l.companyId === selection.value.companyId),
)
const currentFolder = computed(() =>
  selection.value.folderId ? folders.value.find((f) => f.id === selection.value.folderId) : undefined,
)
const searching = computed(() => !!(qs('q') || tipo.value || qs('tag') || qs('por') || favOnly.value))
const isAll = computed(() => selection.value.companyId === undefined)

const filters = computed<LibraryFilters>(() => ({
  companyId: selection.value.companyId,
  folderId: selection.value.folderId ?? (isAll.value ? undefined : 'raiz'),
  subpastas: searching.value,
  q: qs('q') || undefined,
  tipo: tipo.value || undefined,
  tag: qs('tag') || undefined,
  enviadoPor: qs('por') || undefined,
  favoritos: favOnly.value || undefined,
  ordem: ordem.value === 'recentes' ? undefined : ordem.value,
  limit: 60,
}))

const treeReady = computed(() => !!treeQuery.data.value)
const itemsQuery = useLibraryItems(groupId, filters, treeReady)
const items = computed(() => itemsQuery.data.value?.pages.flatMap((p) => p.items) ?? [])
const unavailable = computed(() => isLibraryUnavailable(treeQuery.error.value) || isLibraryUnavailable(itemsQuery.error.value))

const subfolders = computed(() => {
  if (searching.value || isAll.value) return []
  const parentId = selection.value.folderId
  return folders.value
    .filter((f) => f.companyId === selection.value.companyId && f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))
})

/** Onde um envio sem destino explícito cai: o lugar e a pasta abertos, se a pessoa escreve ali. */
const uploadDest = computed(() => {
  const loc = currentLocation.value
  if (!loc || !loc.canWrite) return null
  if (currentFolder.value && !currentFolder.value.canWrite) return null
  return { companyId: loc.companyId, folderId: currentFolder.value?.id ?? null }
})
const canUploadSomewhere = computed(() => locations.value.some((l) => l.canWrite))
const canCreateHere = computed(() => {
  if (!currentLocation.value?.canWrite) return false
  return !currentFolder.value || currentFolder.value.depth < 5
})
const hereLabel = computed(() =>
  currentLocation.value ? placeLabel(currentLocation.value, currentFolder.value) : 'Todos os arquivos',
)

// Breadcrumb: Acervo / Lugar / Pasta / Subpasta
const crumbs = computed(() => {
  const out: Array<{ label: string; sel: LibrarySelection }> = []
  const loc = currentLocation.value
  if (!loc) return out
  out.push({ label: loc.name, sel: { companyId: loc.companyId, folderId: null } })
  if (currentFolder.value) {
    const byId = new Map(folders.value.map((f) => [f.id, f]))
    const chain: LibraryFolder[] = []
    let cur: LibraryFolder | undefined = currentFolder.value
    while (cur) {
      chain.unshift(cur)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    for (const f of chain) out.push({ label: f.name, sel: { companyId: f.companyId, folderId: f.id } })
  }
  return out
})

function go(sel: LibrarySelection) {
  setQuery(
    {
      local: sel.companyId === undefined ? 'todos' : locationKey(sel.companyId),
      pasta: sel.folderId,
      item: null,
    },
    true,
  )
  treeSheet.value = false
}

// Filtros (AppSelect)
const placeItems = computed(() => [
  { label: 'Todos os lugares', value: '' },
  ...locations.value.map((l) => ({ label: l.name, value: locationKey(l.companyId) })),
])
const placeValue = computed({
  get: () => (selection.value.companyId === undefined ? '' : locationKey(selection.value.companyId)),
  set: (v: string | number | null | (string | number | null)[]) => {
    const key = typeof v === 'string' ? v : ''
    go({ companyId: key ? locationFromKey(key) : undefined, folderId: null })
  },
})
const kindItems = [{ label: 'Todos os tipos', value: '' }, ...KIND_OPTIONS]
const tagItems = computed(() => [
  { label: 'Todas as etiquetas', value: '' },
  ...tagSuggestions.value.map((t) => ({ label: `${t.tag} (${t.count})`, value: t.tag })),
])
const personItems = computed(() => [
  { label: 'Qualquer pessoa', value: '' },
  ...(membersQuery.data.value ?? []).map((m) => ({ label: m.name, value: m.userId })),
])
const orderItems = [
  { label: 'Mais recentes', value: 'recentes' },
  { label: 'Nome', value: 'nome' },
  { label: 'Favoritos primeiro', value: 'favoritos' },
]
function selectModel(key: string, fallback = '') {
  return computed({
    get: () => qs(key) || fallback,
    set: (v: string | number | null | (string | number | null)[]) => {
      const s = typeof v === 'string' ? v : ''
      setQuery({ [key]: s && s !== fallback ? s : null, item: null })
    },
  })
}
const kindModel = selectModel('tipo')
const tagModel = selectModel('tag')
const personModel = selectModel('por')
const orderModel = selectModel('ordem', 'recentes')
const filtersOpen = ref(false)
const activeFilterCount = computed(() => [tipo.value, qs('tag'), qs('por'), favOnly.value].filter(Boolean).length)
function clearFilters() {
  searchText.value = ''
  setQuery({ q: null, tipo: null, tag: null, por: null, fav: null, item: null })
}

// ── Seleção ────────────────────────────────────────────────────────────────

const selected = ref(new Set<string>())
const anchor = ref<number | null>(null)
watch(
  () => [selection.value.companyId, selection.value.folderId, filters.value] as const,
  () => {
    selected.value = new Set()
    anchor.value = null
  },
)
// O que sumiu da lista (apagado por outra pessoa) sai da seleção.
watch(items, (list) => {
  if (!selected.value.size) return
  const ids = new Set(list.map((i) => i.id))
  const next = new Set([...selected.value].filter((id) => ids.has(id)))
  if (next.size !== selected.value.size) selected.value = next
})
const selectedItems = computed(() => items.value.filter((i) => selected.value.has(i.id)))
const allSelected = computed(() => items.value.length > 0 && selected.value.size === items.value.length)

function toggle(item: LibraryItem, index: number, event: MouseEvent) {
  const next = new Set(selected.value)
  if (event.shiftKey && anchor.value !== null) {
    const [a, b] = [anchor.value, index].sort((x, y) => x - y)
    for (let i = a!; i <= b!; i++) {
      const it = items.value[i]
      if (it) next.add(it.id)
    }
  } else {
    if (next.has(item.id)) next.delete(item.id)
    else next.add(item.id)
    anchor.value = index
  }
  selected.value = next
}

function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(items.value.map((i) => i.id))
}

function openItem(item: LibraryItem, index: number) {
  anchor.value = index
  setQuery({ item: item.id })
}

// ── Detalhes e tela cheia ─────────────────────────────────────────────────

const listItem = computed(() => (openId.value ? items.value.find((i) => i.id === openId.value) : undefined))
// Link colado com `?item=` de um arquivo que não está na página carregada.
const deepQuery = useLibraryItem(groupId, () => (openId.value && !listItem.value && treeReady.value ? openId.value : null))
const openItemData = computed<LibraryItem | null>(() => listItem.value ?? deepQuery.data.value ?? null)
watch(
  () => deepQuery.error.value,
  (err) => {
    if (err && axios.isAxiosError(err) && err.response?.status === 404) {
      toast.error('Esse arquivo não está mais no Acervo (ou é de uma marca que você não vê).')
      setQuery({ item: null })
    }
  },
)
function closeDetails() {
  setQuery({ item: null })
}

const viewerIndex = ref<number | null>(null)
type LibViewerFile = ViewerFile & { itemId: string; viewUrl: string | null }
const viewerItems = computed<LibViewerFile[]>(() => {
  const list = items.value.length ? items.value : openItemData.value ? [openItemData.value] : []
  return list.map((i) => ({
    itemId: i.id,
    viewUrl: viewUrlOf(i),
    filename: `${i.title}${fileExtOf(i.asset.name, i.title)}`,
    mimeType: i.asset.hasPreview ? 'image/webp' : i.asset.mimeType,
    size: i.asset.size,
    uploadedBy: i.createdBy,
  }))
})
async function resolveViewerUrl(file: ViewerFile): Promise<ResolvedFileUrl> {
  const f = file as LibViewerFile
  const dl = await getLibraryDownload(groupId.value, f.itemId)
  return { url: f.viewUrl ?? dl.url, downloadUrl: dl.url }
}
function viewItem(item: LibraryItem) {
  const idx = viewerItems.value.findIndex((v) => v.itemId === item.id)
  viewerIndex.value = idx >= 0 ? idx : 0
}

// ── Envio ──────────────────────────────────────────────────────────────────

const dup = reactive({
  open: false,
  fileName: '',
  where: '',
  existingTitle: '',
  more: false,
  resolve: null as ((d: DuplicateDecision) => void) | null,
})
const batchDecision = new Map<string, DuplicateDecision>()

function askDuplicate(d: LibraryDuplicate, task: { batchId: string; name: string }): Promise<DuplicateDecision> {
  const remembered = batchDecision.get(task.batchId)
  if (remembered) return Promise.resolve(remembered)
  return new Promise((resolve) => {
    const batchLeft = libraryUploads.tasks.filter(
      (t) => t.batchId === task.batchId && t.name !== task.name && ['queued', 'uploading'].includes(t.status),
    ).length
    Object.assign(dup, {
      open: true,
      fileName: task.name,
      where: d.folderPath,
      existingTitle: d.title,
      more: batchLeft > 0,
      resolve,
    })
  })
}

function onDuplicateDecide(decision: DuplicateDecision, applyAll: boolean, batchId: string | null) {
  if (applyAll && batchId) batchDecision.set(batchId, decision)
  const r = dup.resolve
  dup.open = false
  dup.resolve = null
  r?.(decision)
}
const dupBatch = ref<string | null>(null)

function startUpload(entries: SourcedFile[], dest?: { companyId: string | null; folderId: string | null } | null) {
  if (!entries.length) return
  const target = dest ?? uploadDest.value
  if (!target) {
    if (!canUploadSomewhere.value) {
      toast.error('Seu papel não envia arquivos para o Acervo.')
      return
    }
    pendingEntries.value = entries
    pickDest.open = true
    return
  }
  const loc = locations.value.find((l) => l.companyId === target.companyId)
  const folder = target.folderId ? folders.value.find((f) => f.id === target.folderId) : undefined
  const label = placeLabel(loc, folder)
  enqueueLibraryUploads(groupId.value, entries, target, {
    onDuplicate: (d, task) => {
      dupBatch.value = task.batchId
      return askDuplicate(d, task)
    },
    onDone: (s) => {
      batchDecision.delete(s.batchId)
      refresh()
      const parts: string[] = []
      if (s.done) parts.push(s.done === 1 ? `1 arquivo enviado para ${label}` : `${s.done} arquivos enviados para ${label}`)
      if (s.skipped) parts.push(s.skipped === 1 ? '1 pulado' : `${s.skipped} pulados`)
      if (s.failed) parts.push(s.failed === 1 ? '1 não subiu (veja nos envios)' : `${s.failed} não subiram (veja nos envios)`)
      if (s.flattened) parts.push('pastas além de 5 níveis ficaram no 5º nível')
      if (!parts.length) return
      if (s.failed) toast.warning(parts.join('; ') + '.')
      else toast.success(parts.join('; ') + '.')
    },
  })
}

const pendingEntries = ref<SourcedFile[]>([])
const pickDest = reactive({ open: false })
function onPickDest(dest: { companyId: string | null; folderId: string | null }) {
  pickDest.open = false
  const entries = pendingEntries.value
  pendingEntries.value = []
  startUpload(entries, dest)
}

const fileInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)
const cameraInput = ref<HTMLInputElement | null>(null)
const galleryInput = ref<HTMLInputElement | null>(null)
function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  const entries = filesFromInput(input)
  input.value = ''
  startUpload(entries)
}

// Arrastar arquivos e pastas do computador para a área de conteúdo.
const dropActive = ref(false)
function onDragEnter(event: DragEvent) {
  if (isFileDrag(event)) dropActive.value = true
}
function onDropFiles(event: DragEvent, dest?: { companyId: string | null; folderId: string | null } | null) {
  dropActive.value = false
  // Captura as entradas AGORA (o DataTransfer só vale durante o evento).
  const pending = filesFromDrop(event.dataTransfer)
  void pending.then(({ files, truncated, unreadable }) => {
    if (truncated) toast.warning('Muitos arquivos de uma vez: foram os 2000 primeiros. Solte o resto depois.')
    if (unreadable) toast.warning('Alguma pasta não pôde ser lida pelo navegador e ficou de fora.')
    if (!files.length) return
    startUpload(files, dest)
  })
}

// Ctrl+V de imagem na pasta aberta.
function onPaste(event: ClipboardEvent) {
  if (isEditableTarget(event.target) || pickDest.open || dup.open) return
  const files = imagesFromPaste(event)
  if (!files.length) return
  event.preventDefault()
  if (!uploadDest.value) {
    toast.info(
      canUploadSomewhere.value
        ? 'Abra uma marca ou pasta onde você envia arquivos para colar a imagem lá.'
        : 'Seu papel não envia arquivos para o Acervo.',
    )
    return
  }
  startUpload(files)
}
/**
 * Arquivo solto fora de um alvo (barra de cima, margem) faria o navegador
 * abrir o arquivo e sair da ala: nesta tela, soltar fora não faz nada.
 */
function swallowStrayDrop(event: DragEvent) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  if (event.type === 'drop') dropActive.value = false
}
function endDrag() {
  dropActive.value = false
}
onMounted(() => {
  document.addEventListener('paste', onPaste)
  document.addEventListener('dragover', swallowStrayDrop)
  document.addEventListener('drop', swallowStrayDrop)
  document.addEventListener('dragend', endDrag)
})
onBeforeUnmount(() => {
  document.removeEventListener('paste', onPaste)
  document.removeEventListener('dragover', swallowStrayDrop)
  document.removeEventListener('drop', swallowStrayDrop)
  document.removeEventListener('dragend', endDrag)
})

// ── Pastas ─────────────────────────────────────────────────────────────────

const nameDlg = reactive({
  open: false,
  mode: 'create' as 'create' | 'rename',
  where: '',
  initial: '',
  loading: false,
  error: '',
  companyId: null as string | null,
  parentId: null as string | null,
  folderId: null as string | null,
})

function askCreateFolder(dest: { companyId: string | null; parentId: string | null }) {
  const loc = locations.value.find((l) => l.companyId === dest.companyId)
  const parent = dest.parentId ? folders.value.find((f) => f.id === dest.parentId) : undefined
  Object.assign(nameDlg, {
    open: true,
    mode: 'create',
    where: placeLabel(loc, parent),
    initial: '',
    error: '',
    companyId: dest.companyId,
    parentId: dest.parentId,
    folderId: null,
  })
}

function askRename(folder: LibraryFolder) {
  const loc = locations.value.find((l) => l.companyId === folder.companyId)
  const parent = folder.parentId ? folders.value.find((f) => f.id === folder.parentId) : undefined
  Object.assign(nameDlg, {
    open: true,
    mode: 'rename',
    where: placeLabel(loc, parent),
    initial: folder.name,
    error: '',
    companyId: folder.companyId,
    parentId: folder.parentId,
    folderId: folder.id,
  })
}

async function submitName(name: string) {
  nameDlg.loading = true
  nameDlg.error = ''
  try {
    if (nameDlg.mode === 'create') {
      await createLibraryFolder(groupId.value, { companyId: nameDlg.companyId, parentId: nameDlg.parentId, name })
      toast.success(`Pasta "${name}" criada.`)
    } else if (nameDlg.folderId) {
      await updateLibraryFolder(groupId.value, nameDlg.folderId, { name })
    }
    nameDlg.open = false
    refresh()
  } catch (error) {
    nameDlg.error = getApiErrorMessage(error, 'Não foi possível salvar a pasta.')
  } finally {
    nameDlg.loading = false
  }
}

const folderDel = reactive({
  open: false,
  folder: null as LibraryFolder | null,
  withContent: false,
  message: '',
  loading: false,
})

function askDeleteFolder(folder: LibraryFolder) {
  Object.assign(folderDel, {
    open: true,
    folder,
    withContent: false,
    message: folder.totalCount || folder.childCount
      ? `A pasta "${folder.name}" não está vazia. Na próxima etapa você escolhe o que fazer com o conteúdo.`
      : `A pasta "${folder.name}" está vazia e vai sair do Acervo.`,
    loading: false,
  })
}

async function confirmDeleteFolder() {
  const folder = folderDel.folder
  if (!folder) return
  folderDel.loading = true
  try {
    await deleteLibraryFolder(groupId.value, folder.id, folderDel.withContent)
    folderDel.open = false
    // A pasta aberta era a apagada (ou estava dentro dela): volta para a de cima.
    const open = currentFolder.value
    const insideDeleted =
      !!open &&
      open.companyId === folder.companyId &&
      open.path.length >= folder.path.length &&
      folder.path.every((n, i) => open.path[i] === n)
    if (insideDeleted && !folderDel.withContent) go({ companyId: folder.companyId, folderId: folder.parentId })
    else if (open?.id === folder.id) go({ companyId: folder.companyId, folderId: folder.parentId })
    toast.success(folderDel.withContent ? `Pasta "${folder.name}" apagada; o conteúdo subiu um nível.` : `Pasta "${folder.name}" apagada.`)
    refresh()
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 409 && !folderDel.withContent) {
      const parentLabel = placeLabel(
        locations.value.find((l) => l.companyId === folder.companyId),
        folder.parentId ? folders.value.find((f) => f.id === folder.parentId) : undefined,
      )
      folderDel.withContent = true
      folderDel.message = `${getApiErrorMessage(error, 'A pasta tem conteúdo.')} Apagar mesmo assim leva tudo para ${parentLabel}. Nenhum arquivo é apagado.`
    } else {
      folderDel.open = false
      toast.error(getApiErrorMessage(error, 'Não foi possível apagar a pasta.'))
    }
  } finally {
    folderDel.loading = false
  }
}

async function onDropFolder(folderId: string, dest: { companyId: string | null; folderId: string | null }) {
  try {
    await updateLibraryFolder(groupId.value, folderId, { parentId: dest.folderId })
    refresh()
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não foi possível mover a pasta.'))
  }
}

// ── Lote e ações de arquivo ────────────────────────────────────────────────

const busy = ref(false)
const moveDlg = reactive({ open: false, ids: [] as string[], loading: false, error: '' })
const tagsDlg = reactive({ open: false, loading: false, error: '' })
const delDlg = reactive({ open: false, ids: [] as string[], loading: false })

async function runBulk(acao: LibraryBulkAction, ids: string[], extra: { folderId?: string | null; companyId?: string | null; tags?: string[] } = {}) {
  busy.value = true
  try {
    const res = await bulkLibraryItems(groupId.value, { ids, acao, ...extra })
    refresh()
    return res
  } finally {
    busy.value = false
  }
}

function askMove(ids: string[]) {
  Object.assign(moveDlg, { open: true, ids, loading: false, error: '' })
}

async function confirmMove(dest: { companyId: string | null; folderId: string | null }) {
  moveDlg.loading = true
  moveDlg.error = ''
  try {
    await runBulk('mover', moveDlg.ids, { folderId: dest.folderId, companyId: dest.companyId })
    const n = moveDlg.ids.length
    moveDlg.open = false
    selected.value = new Set()
    toast.success(n === 1 ? 'Arquivo movido.' : `${n} arquivos movidos.`)
  } catch (error) {
    moveDlg.error = getApiErrorMessage(error, 'Não foi possível mover.')
  } finally {
    moveDlg.loading = false
  }
}

async function onDropItems(ids: string[], dest: { companyId: string | null; folderId: string | null }) {
  try {
    await runBulk('mover', ids, { folderId: dest.folderId, companyId: dest.companyId })
    selected.value = new Set()
    toast.success(ids.length === 1 ? 'Arquivo movido.' : `${ids.length} arquivos movidos.`)
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não foi possível mover.'))
  }
}

async function applyTags(tags: string[], mode: 'etiquetar' | 'desetiquetar') {
  tagsDlg.loading = true
  tagsDlg.error = ''
  try {
    await runBulk(mode, [...selected.value], { tags })
    tagsDlg.open = false
    toast.success(mode === 'etiquetar' ? 'Etiquetas adicionadas.' : 'Etiquetas tiradas.')
  } catch (error) {
    tagsDlg.error = getApiErrorMessage(error, 'Não foi possível mudar as etiquetas.')
  } finally {
    tagsDlg.loading = false
  }
}

const allStarred = computed(() => selectedItems.value.length > 0 && selectedItems.value.every((i) => i.starred))
async function toggleStarBulk() {
  try {
    await runBulk(allStarred.value ? 'desfavoritar' : 'favoritar', [...selected.value])
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não foi possível mudar os favoritos.'))
  }
}

async function downloadZip() {
  busy.value = true
  try {
    const name = await downloadLibraryZip(groupId.value, [...selected.value])
    toast.success(`Zip pronto: ${name}`)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Não foi possível montar o zip.')
  } finally {
    busy.value = false
  }
}

function askDelete(ids: string[]) {
  Object.assign(delDlg, { open: true, ids, loading: false })
}

async function confirmDelete() {
  delDlg.loading = true
  try {
    if (delDlg.ids.length === 1) await deleteLibraryItem(groupId.value, delDlg.ids[0]!)
    else await runBulk('apagar', delDlg.ids)
    const n = delDlg.ids.length
    if (openId.value && delDlg.ids.includes(openId.value)) closeDetails()
    selected.value = new Set()
    delDlg.open = false
    refresh()
    toast.success(n === 1 ? 'Arquivo apagado do Acervo.' : `${n} arquivos apagados do Acervo.`)
  } catch (error) {
    delDlg.open = false
    toast.error(getApiErrorMessage(error, 'Não foi possível apagar.'))
  } finally {
    delDlg.loading = false
  }
}

const canEditSelection = computed(() => selectedItems.value.length > 0 && selectedItems.value.every((i) => i.me.canEdit))
const canDeleteSelection = computed(() => selectedItems.value.length > 0 && selectedItems.value.every((i) => i.me.canDelete))

// ── Celular ────────────────────────────────────────────────────────────────

const treeSheet = ref(false)
const detailsSheet = computed({
  get: () => phone.value && !!openItemData.value,
  set: (v: boolean) => {
    if (!v) closeDetails()
  },
})

// Rolagem infinita: carrega a próxima página quando o fim da grade aparece.
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && itemsQuery.hasNextPage.value && !itemsQuery.isFetchingNextPage.value) {
      void itemsQuery.fetchNextPage()
    }
  }, { rootMargin: '400px' })
  if (sentinel.value) observer.observe(sentinel.value)
})
watch(sentinel, (el, old) => {
  if (old) observer?.unobserve(old)
  if (el) observer?.observe(el)
})
onBeforeUnmount(() => observer?.disconnect())

const loading = computed(() => treeQuery.isLoading.value || (treeReady.value && itemsQuery.isLoading.value))
const loadError = computed(() => !unavailable.value && (treeQuery.isError.value || itemsQuery.isError.value))
function retryLoad() {
  void treeQuery.refetch()
  void itemsQuery.refetch()
}

/** Linha acima da grade: o que está na tela e quantos. */
const contextLine = computed(() => {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  if (searching.value) {
    const loaded = items.value.length
    const more = itemsQuery.hasNextPage.value ? '+' : ''
    return `${n(loaded, 'resultado', 'resultados')}${more} em ${hereLabel.value}${currentLocation.value ? ' e subpastas' : ''}`
  }
  if (isAll.value) return `${n(allCount.value, 'arquivo', 'arquivos')} no Acervo`
  const direct = currentFolder.value ? currentFolder.value.itemCount : (currentLocation.value?.itemCount ?? 0)
  const subs = subfolders.value.length
  return [subs ? n(subs, 'pasta', 'pastas') : '', n(direct, 'arquivo', 'arquivos')].filter(Boolean).join(' e ')
})

const emptyTitle = computed(() => {
  if (searching.value) return 'Nenhum arquivo com esses filtros'
  if (isAll.value) return 'O Acervo ainda está vazio'
  return currentFolder.value ? 'Pasta vazia' : `Nada em ${currentLocation.value?.name ?? 'neste lugar'} ainda`
})
const emptyDescription = computed(() => {
  if (searching.value) return 'Tente outra busca ou limpe os filtros.'
  if (uploadDest.value) {
    return phone.value
      ? 'Use "Tirar foto" ou "Galeria" para enviar.'
      : 'Arraste arquivos ou pastas para cá, cole uma imagem com Ctrl+V ou use Enviar.'
  }
  if (isAll.value && canUploadSomewhere.value) return 'Escolha uma marca à esquerda e envie o material dela: logo, fotos, vídeos, PDFs.'
  return 'Quando o time enviar material, ele aparece aqui.'
})
</script>

<template>
  <div class="mk-page lib-page">
    <EmptyState
      v-if="unavailable"
      :icon="Images"
      title="O Acervo ainda não está disponível"
      description="Estamos terminando de instalar o Acervo no servidor. O resto da ala segue funcionando. Tente de novo em alguns minutos."
    >
      <template #action>
        <button type="button" class="mk-btn" @click="retryLoad">Tentar de novo</button>
      </template>
    </EmptyState>

    <template v-else>
      <!-- Barra de cima: onde estou e enviar -->
      <div class="mk-toolbar lib-top">
        <button v-if="phone" type="button" class="mk-btn" data-action="open-tree" @click="treeSheet = true">
          <FolderTree :size="15" aria-hidden="true" />
          Pastas
        </button>
        <nav v-if="phone" class="lib-crumbs lib-crumbs--phone" aria-label="Caminho no Acervo">
          <button
            v-if="crumbs.length"
            type="button"
            class="lib-crumb lib-crumb--up"
            :aria-label="`Voltar para ${crumbs.length > 1 ? crumbs[crumbs.length - 2]!.label : 'Acervo'}`"
            @click="go(crumbs.length > 1 ? crumbs[crumbs.length - 2]!.sel : { companyId: undefined, folderId: null })"
          >
            <ChevronLeft :size="16" aria-hidden="true" />
            {{ crumbs.length > 1 ? crumbs[crumbs.length - 2]!.label : 'Acervo' }}
          </button>
          <span class="lib-crumb is-current" aria-current="page">{{ crumbs.length ? crumbs[crumbs.length - 1]!.label : 'Acervo' }}</span>
        </nav>
        <nav v-else class="lib-crumbs" aria-label="Caminho no Acervo">
          <button type="button" class="lib-crumb" :class="{ 'is-current': isAll }" @click="go({ companyId: undefined, folderId: null })">
            Acervo
          </button>
          <template v-for="(c, i) in crumbs" :key="i">
            <ChevronRight :size="13" class="lib-crumb-sep" aria-hidden="true" />
            <button
              type="button"
              class="lib-crumb"
              :class="{ 'is-current': i === crumbs.length - 1 }"
              :aria-current="i === crumbs.length - 1 ? 'page' : undefined"
              @click="go(c.sel)"
            >
              {{ c.label }}
            </button>
          </template>
        </nav>
        <span class="mk-toolbar__spacer" />
        <template v-if="canEditRole">
          <button
            v-if="!phone && canCreateHere"
            type="button"
            class="mk-btn"
            data-action="new-folder"
            @click="askCreateFolder({ companyId: currentLocation!.companyId, parentId: currentFolder?.id ?? null })"
          >
            <FolderPlus :size="15" aria-hidden="true" />
            Nova pasta
          </button>
          <template v-if="phone">
            <button type="button" class="mk-btn mk-btn--primary" data-action="camera" @click="cameraInput?.click()">
              <Camera :size="15" aria-hidden="true" />
              Tirar foto
            </button>
            <button type="button" class="mk-btn" data-action="gallery" @click="galleryInput?.click()">
              <ImagePlus :size="15" aria-hidden="true" />
              Galeria
            </button>
          </template>
          <DropdownMenuRoot v-else>
            <DropdownMenuTrigger as-child>
              <button type="button" class="mk-btn mk-btn--primary" data-action="upload-menu" :disabled="!canUploadSomewhere">
                <Upload :size="15" aria-hidden="true" />
                Enviar
                <ChevronDown :size="13" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent class="dd-menu lib-upload-menu" :side-offset="4" align="end">
                <DropdownMenuItem class="dd-item" data-action="upload-files" @select="fileInput?.click()">
                  <Upload :size="15" aria-hidden="true" />
                  <span>Arquivos</span>
                </DropdownMenuItem>
                <DropdownMenuItem class="dd-item" data-action="upload-folder" @select="folderInput?.click()">
                  <FolderOpen :size="15" aria-hidden="true" />
                  <span>Pasta inteira</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        </template>
        <input ref="fileInput" class="lib-hidden" type="file" name="files" multiple tabindex="-1" aria-hidden="true" @change="onInput" />
        <input ref="folderInput" class="lib-hidden" type="file" name="folder" webkitdirectory multiple tabindex="-1" aria-hidden="true" @change="onInput" />
        <input ref="cameraInput" class="lib-hidden" type="file" name="camera" accept="image/*" capture="environment" tabindex="-1" aria-hidden="true" @change="onInput" />
        <input ref="galleryInput" class="lib-hidden" type="file" name="gallery" accept="image/*,video/*" multiple tabindex="-1" aria-hidden="true" @change="onInput" />
      </div>

      <!-- Filtros (ou ações em lote quando há seleção) -->
      <div v-if="selected.size" class="lib-bulk" role="toolbar" aria-label="Ações nos arquivos selecionados" data-bar="bulk">
        <LibraryCheck :checked="allSelected" :indeterminate="!allSelected" label="Selecionar todos os carregados" @toggle="toggleAll" />
        <span class="lib-bulk__count">{{ selected.size === 1 ? '1 selecionado' : `${selected.size} selecionados` }}</span>
        <span class="lib-bulk__sep" aria-hidden="true" />
        <button v-if="canEditSelection" type="button" class="mk-btn mk-btn--ghost" data-bulk="mover" :disabled="busy" @click="askMove([...selected])">
          <FolderInput :size="14" aria-hidden="true" />
          Mover
        </button>
        <button v-if="canEditSelection" type="button" class="mk-btn mk-btn--ghost" data-bulk="etiquetar" :disabled="busy" @click="tagsDlg.open = true">
          <Tags :size="14" aria-hidden="true" />
          Etiquetar
        </button>
        <button v-if="canEditSelection" type="button" class="mk-btn mk-btn--ghost" data-bulk="favoritar" :disabled="busy" @click="toggleStarBulk">
          <Star :size="14" aria-hidden="true" />
          {{ allStarred ? 'Tirar dos favoritos' : 'Favoritar' }}
        </button>
        <button type="button" class="mk-btn mk-btn--ghost" data-bulk="zip" :disabled="busy" @click="downloadZip">
          <Download :size="14" aria-hidden="true" />
          Baixar zip
        </button>
        <button v-if="canDeleteSelection" type="button" class="mk-btn mk-btn--ghost mk-btn--danger" data-bulk="apagar" :disabled="busy" @click="askDelete([...selected])">
          <Trash2 :size="14" aria-hidden="true" />
          Apagar
        </button>
        <span class="mk-toolbar__spacer" />
        <button type="button" class="mk-btn mk-btn--ghost" @click="selected = new Set()">
          <X :size="14" aria-hidden="true" />
          Limpar seleção
        </button>
      </div>

      <div v-else class="lib-filters">
        <label class="lib-search">
          <Search :size="14" class="lib-search__icon" aria-hidden="true" />
          <input
            v-model="searchText"
            class="mk-input lib-search__input"
            type="search"
            name="q"
            placeholder="Buscar por título, arquivo, nota ou etiqueta"
            aria-label="Buscar no Acervo"
          />
        </label>
        <button
          v-if="phone"
          type="button"
          class="mk-btn"
          :aria-expanded="filtersOpen"
          @click="filtersOpen = !filtersOpen"
        >
          <SlidersHorizontal :size="14" aria-hidden="true" />
          Filtros{{ activeFilterCount ? ` (${activeFilterCount})` : '' }}
        </button>
        <template v-if="!phone || filtersOpen">
          <div class="lib-filter">
            <AppSelect v-model="placeValue" :items="placeItems" label="Lugar" density="compact" placeholder="Todos os lugares" />
          </div>
          <div class="lib-filter">
            <AppSelect v-model="kindModel" :items="kindItems" label="Tipo" density="compact" placeholder="Todos os tipos" />
          </div>
          <div class="lib-filter">
            <AppSelect v-model="tagModel" :items="tagItems" label="Etiqueta" density="compact" placeholder="Todas as etiquetas" />
          </div>
          <div class="lib-filter">
            <AppSelect v-model="personModel" :items="personItems" label="Enviado por" density="compact" placeholder="Qualquer pessoa" />
          </div>
          <button
            type="button"
            class="mk-btn lib-fav"
            :class="{ 'is-on': favOnly }"
            :aria-pressed="favOnly"
            data-filter="favoritos"
            @click="setQuery({ fav: favOnly ? null : '1', item: null })"
          >
            <Star :size="14" aria-hidden="true" />
            Favoritos
          </button>
          <button v-if="searching" type="button" class="mk-btn mk-btn--ghost" @click="clearFilters">Limpar filtros</button>
        </template>
      </div>

      <div class="lib" :class="{ 'has-details': !!openItemData && !phone }">
        <aside v-if="!phone" class="lib__tree mk-panel" aria-label="Pastas">
          <div v-if="treeQuery.isLoading.value" class="lib__tree-loading">
            <Skeleton type="text" :lines="6" />
          </div>
          <LibraryFolderTree
            v-else
            :locations="locations"
            :folders="folders"
            :selection="selection"
            :show-all="!mk.brandFilter.value"
            :all-count="allCount"
            mode="browse"
            @select="go"
            @create="askCreateFolder"
            @rename="askRename"
            @remove="askDeleteFolder"
            @drop-folder="onDropFolder"
            @drop-items="onDropItems"
            @drop-files="onDropFiles"
          />
        </aside>

        <section
          class="lib__main"
          :aria-label="hereLabel"
          @dragenter="onDragEnter"
        >
          <LibraryUploadPanel :group-id="groupId" />
          <p v-if="!canEditRole" class="mk-hint lib-readonly">Você vê e baixa o Acervo. Enviar e organizar é com Editor ou Admin.</p>
          <p v-else-if="currentLocation && !currentLocation.canWrite" class="mk-hint lib-readonly">
            Aqui só Admin ou Dono com acesso a todas as marcas envia e organiza. Você vê e baixa.
          </p>

          <div v-if="loading" class="lib-skeleton" aria-busy="true">
            <Skeleton v-for="n in 12" :key="n" type="block" height="180px" />
          </div>

          <div v-else-if="loadError" class="mk-load-error" role="alert">
            <p>Não foi possível carregar o Acervo.</p>
            <button type="button" class="mk-btn" @click="retryLoad">Tentar de novo</button>
          </div>

          <template v-else>
            <div v-if="items.length || subfolders.length" class="lib-results">
              <p class="lib-context">{{ contextLine }}</p>
              <span class="mk-toolbar__spacer" />
              <div class="lib-filter lib-filter--order">
                <AppSelect v-model="orderModel" :items="orderItems" label="Ordem" density="compact" />
              </div>
              <div class="lib-views" role="group" aria-label="Como mostrar">
                <button
                  type="button"
                  class="lib-view-btn"
                  :class="{ 'is-on': view === 'grade' }"
                  :aria-pressed="view === 'grade'"
                  aria-label="Grade de miniaturas"
                  title="Grade"
                  @click="setQuery({ vista: null })"
                >
                  <LayoutGrid :size="15" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="lib-view-btn"
                  :class="{ 'is-on': view === 'lista' }"
                  :aria-pressed="view === 'lista'"
                  aria-label="Lista"
                  title="Lista"
                  data-view="lista"
                  @click="setQuery({ vista: 'lista' })"
                >
                  <List :size="15" aria-hidden="true" />
                </button>
              </div>
            </div>
            <EmptyState
              v-if="!items.length && !subfolders.length"
              :icon="searching ? Search : Images"
              :title="emptyTitle"
              :description="emptyDescription"
            >
              <template v-if="searching" #action>
                <button type="button" class="mk-btn" @click="clearFilters">Limpar filtros</button>
              </template>
              <template v-else-if="uploadDest && !phone" #action>
                <button type="button" class="mk-btn mk-btn--primary" @click="fileInput?.click()">
                  <Upload :size="14" aria-hidden="true" />
                  Enviar arquivos
                </button>
              </template>
            </EmptyState>
            <LibraryGrid
              v-else
              :items="items"
              :subfolders="subfolders"
              :view="view"
              :selected="selected"
              :active-id="openId"
              :show-place="searching || isAll"
              @open="openItem"
              @view="(it) => viewItem(it)"
              @toggle="toggle"
              @open-folder="(f) => go({ companyId: f.companyId, folderId: f.id })"
            />
            <div ref="sentinel" class="lib-sentinel" aria-hidden="true" />
            <div v-if="itemsQuery.hasNextPage.value" class="lib-more">
              <button type="button" class="mk-btn" :disabled="itemsQuery.isFetchingNextPage.value" @click="itemsQuery.fetchNextPage()">
                {{ itemsQuery.isFetchingNextPage.value ? 'Carregando...' : 'Carregar mais' }}
              </button>
            </div>
          </template>

          <div
            v-if="dropActive"
            class="lib-drop"
            :class="{ 'is-blocked': !uploadDest && !canUploadSomewhere }"
            data-drop="overlay"
            @dragover.prevent
            @dragleave.self="dropActive = false"
            @drop.prevent="onDropFiles($event)"
          >
            <div class="lib-drop__card">
              <Upload :size="22" aria-hidden="true" />
              <strong v-if="uploadDest">Solte para enviar para {{ hereLabel }}</strong>
              <strong v-else-if="canUploadSomewhere">Solte e escolha a pasta de destino</strong>
              <strong v-else>Seu papel não envia arquivos para o Acervo</strong>
              <span>Pastas inteiras viram pastas no Acervo.</span>
            </div>
          </div>
        </section>

        <div v-if="openItemData && !phone" class="lib__details mk-panel">
          <LibraryDetails
            :key="openItemData.id"
            :group-id="groupId"
            :item="openItemData"
            :tag-suggestions="tagSuggestions"
            @close="closeDetails"
            @view="viewItem"
            @move="(it) => askMove([it.id])"
            @remove="(it) => askDelete([it.id])"
          />
        </div>
      </div>
    </template>

    <!-- Celular: pastas e detalhes em folha de baixo -->
    <LibrarySheet v-if="phone" v-model:open="treeSheet" title="Pastas do Acervo">
      <LibraryFolderTree
        :locations="locations"
        :folders="folders"
        :selection="selection"
        :show-all="!mk.brandFilter.value"
        :all-count="allCount"
        mode="browse"
        @select="go"
        @create="askCreateFolder"
        @rename="askRename"
        @remove="askDeleteFolder"
      />
    </LibrarySheet>
    <LibrarySheet v-if="phone" v-model:open="detailsSheet" title="Detalhes do arquivo" tall>
      <LibraryDetails
        v-if="openItemData"
        :key="openItemData.id"
        :group-id="groupId"
        :item="openItemData"
        :tag-suggestions="tagSuggestions"
        in-sheet
        @close="closeDetails"
        @view="viewItem"
        @move="(it) => askMove([it.id])"
        @remove="(it) => askDelete([it.id])"
      />
    </LibrarySheet>


    <FileViewer
      v-if="viewerIndex !== null && viewerItems.length"
      :items="viewerItems"
      :start-index="viewerIndex"
      :resolve-url="resolveViewerUrl"
      @close="viewerIndex = null"
    />

    <LibraryNameDialog
      v-model="nameDlg.open"
      :mode="nameDlg.mode"
      :where="nameDlg.where"
      :initial-name="nameDlg.initial"
      :loading="nameDlg.loading"
      :error="nameDlg.error"
      @submit="submitName"
    />

    <ConfirmDialog
      v-model="folderDel.open"
      :title="folderDel.withContent ? 'Levar o conteúdo para cima?' : 'Apagar a pasta?'"
      :message="folderDel.message"
      :confirm-label="folderDel.withContent ? 'Apagar e levar o conteúdo' : 'Apagar pasta'"
      :loading="folderDel.loading"
      danger
      @confirm="confirmDeleteFolder"
    />

    <LibraryFolderPickDialog
      v-model="moveDlg.open"
      :title="moveDlg.ids.length === 1 ? 'Mover arquivo' : `Mover ${moveDlg.ids.length} arquivos`"
      confirm-label="Mover para cá"
      :locations="locations"
      :folders="folders"
      :initial="currentLocation ? { companyId: currentLocation.companyId, folderId: currentFolder?.id ?? null } : null"
      hint="Mudar de marca faz o arquivo aparecer para quem vê a nova marca e sumir para quem só via a antiga."
      :loading="moveDlg.loading"
      :error="moveDlg.error"
      @confirm="confirmMove"
    />

    <LibraryFolderPickDialog
      v-model="pickDest.open"
      :title="pendingEntries.length === 1 ? 'Enviar 1 arquivo para' : `Enviar ${pendingEntries.length} arquivos para`"
      confirm-label="Enviar para cá"
      :locations="locations"
      :folders="folders"
      :initial="currentLocation ? { companyId: currentLocation.companyId, folderId: currentFolder?.id ?? null } : null"
      @confirm="onPickDest"
      @update:model-value="(v) => { if (!v) pendingEntries = [] }"
    />

    <LibraryTagsDialog
      v-model="tagsDlg.open"
      :count="selected.size"
      :suggestions="tagSuggestions"
      :loading="tagsDlg.loading"
      :error="tagsDlg.error"
      @apply="applyTags"
    />

    <ConfirmDialog
      v-model="delDlg.open"
      :title="delDlg.ids.length === 1 ? 'Apagar do Acervo?' : `Apagar ${delDlg.ids.length} arquivos do Acervo?`"
      message="Sai do Acervo e do storage. As versões de card que usaram estes arquivos têm cópia própria e continuam intactas."
      confirm-label="Apagar"
      :loading="delDlg.loading"
      danger
      @confirm="confirmDelete"
    />

    <LibraryDuplicateDialog
      v-model="dup.open"
      :file-name="dup.fileName"
      :where="dup.where"
      :existing-title="dup.existingTitle"
      :more="dup.more"
      @decide="(d, all) => onDuplicateDecide(d, all, dupBatch)"
    />
  </div>
</template>

<style scoped>
.lib-page {
  gap: 10px;
}

.lib-top {
  min-height: 34px;
}

.lib-crumbs {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  overflow: hidden;
}

.lib-crumb {
  max-width: 200px;
  padding: 4px 6px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.lib-crumb:hover {
  background: var(--surface-2);
  color: var(--text);
}

.lib-crumb.is-current {
  color: var(--text);
  font-weight: 700;
}

.lib-crumb:focus-visible,
.lib-view-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.lib-crumb-sep {
  flex: none;
  color: var(--text-3);
}

.lib-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.lib-filters,
.lib-bulk {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 40px;
}

.lib-bulk {
  padding: 3px 8px 3px 4px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 7%, var(--surface));
}

.lib-bulk__count {
  font-size: 13px;
  font-weight: 650;
}

.lib-bulk__sep {
  width: 1px;
  height: 18px;
  background: var(--border);
}

.lib-search {
  position: relative;
  flex: 1 1 220px;
  max-width: 320px;
}

.lib-search__icon {
  position: absolute;
  top: 50%;
  left: 10px;
  color: var(--text-3);
  transform: translateY(-50%);
  pointer-events: none;
}

.lib-search__input {
  padding-left: 30px;
}

.lib-filter {
  width: 158px;
}

.lib-filter--order {
  width: 160px;
}

.lib-fav.is-on {
  border-color: color-mix(in srgb, var(--due-soon) 55%, var(--border));
  background: color-mix(in srgb, var(--due-soon) 12%, var(--surface));
  color: var(--text);
}

.lib-fav.is-on :deep(svg) {
  color: var(--due-soon);
  fill: currentColor;
}

.lib-views {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.lib-view-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 28px;
  border: 0;
  border-radius: calc(var(--radius-sm) - 2px);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.lib-view-btn.is-on {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.lib {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.lib.has-details {
  grid-template-columns: 248px minmax(0, 1fr) 320px;
}

.lib__tree {
  position: sticky;
  top: 8px;
  max-height: calc(100vh - 180px);
  padding: 6px;
  overflow-y: auto;
}

.lib__tree-loading {
  padding: 8px;
}

.lib__main {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 320px;
}

.lib__details {
  position: sticky;
  top: 8px;
  display: flex;
  max-height: calc(100vh - 180px);
  overflow: hidden;
}

.lib__details > * {
  flex: 1;
  min-width: 0;
}

.lib-readonly {
  margin: 0;
}

.lib-results {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
}

.lib-context {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--text-2);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lib-skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
  gap: 10px;
}

.lib-sentinel {
  height: 1px;
}

.lib-more {
  display: flex;
  justify-content: center;
}

.lib-drop {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  min-height: 240px;
  border: 2px dashed var(--accent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}

.lib-drop.is-blocked {
  border-color: var(--err);
  background: color-mix(in srgb, var(--err) 6%, var(--surface));
}

.lib-drop__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px;
  color: var(--text-2);
  font-size: 13px;
  text-align: center;
  pointer-events: none;
}

.lib-drop__card strong {
  color: var(--text);
  font-size: 14px;
}

@media (max-width: 1180px) {
  .lib.has-details {
    grid-template-columns: 220px minmax(0, 1fr) 300px;
  }
}

@media (max-width: 980px) {
  .lib,
  .lib.has-details {
    grid-template-columns: 200px minmax(0, 1fr);
  }

  .lib__details {
    position: fixed;
    top: 72px;
    right: 12px;
    bottom: 12px;
    z-index: 40;
    width: min(340px, calc(100vw - 24px));
    max-height: none;
    box-shadow: var(--shadow-overlay);
  }
}

@media (max-width: 640px) {
  .lib,
  .lib.has-details {
    grid-template-columns: minmax(0, 1fr);
  }

  .lib-crumbs {
    flex: 1 1 100%;
    order: 3;
  }

  .lib-crumbs--phone {
    gap: 6px;
  }

  .lib-crumbs--phone span.lib-crumb {
    cursor: default;
  }

  .lib-crumbs--phone span.lib-crumb:hover {
    background: transparent;
  }

  .lib-crumb--up {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex: none;
    max-width: 45%;
    min-height: 40px;
    color: var(--text-3);
    font-size: 13px;
  }

  .lib-crumbs--phone .lib-crumb.is-current {
    max-width: none;
    min-width: 0;
    font-size: 16px;
  }

  .lib-results {
    flex-wrap: wrap;
  }

  .lib-results .lib-context {
    flex: 1 1 100%;
  }

  .lib-results .mk-toolbar__spacer {
    display: none;
  }

  .lib-results .lib-filter--order {
    flex: 1;
    width: auto;
  }

  .lib-search {
    flex: 1 1 100%;
    max-width: none;
  }

  .lib-filter,
  .lib-filter--order {
    width: calc(50% - 4px);
  }

  .lib-fav {
    flex: 1 1 calc(50% - 4px);
  }

  .lib-view-btn {
    width: 44px;
    height: 40px;
  }

  .lib-bulk .mk-btn {
    flex: 1 1 calc(50% - 4px);
  }

  .lib-skeleton {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
}
</style>

<style>
.lib-upload-menu {
  min-width: 180px;
}
</style>
