/**
 * De onde vêm os arquivos da ala (o mesmo para o Acervo e para os outros
 * destinos): arrastar (arquivos E pastas, na área inteira do diálogo, painel
 * ou tela), Ctrl+V, o seletor de arquivo (inclusive de pasta) e, no celular,
 * "Tirar foto" e "Galeria" (`UploadSourceButtons.vue`).
 *
 * Tudo devolve `UploadEntry` (`{ file, relativePath? }`), o formato do
 * `enqueue` da fila. Pasta arrastada vem achatada, com o `relativePath` de
 * cada arquivo ("Viagem/Dia 1/IMG_001.jpg", a pasta arrastada incluída): o
 * Acervo recria as subpastas a partir dele, os outros destinos ignoram.
 */
import { onScopeDispose, ref, type Ref } from 'vue'
import type { UploadEntry } from './upload-queue'

export type SourcedFile = UploadEntry

export interface SourcedFiles {
  files: UploadEntry[]
  /** Passou do teto (`maxFiles`): o resto ficou de fora */
  truncated: boolean
  /** Pastas ou arquivos que o navegador não deixou ler (permissão, atalho quebrado) */
  unreadable: number
}

/** Teto de arquivos por gesto (arrastar a pasta errada não vira 20 mil envios). */
export const MAX_FILES_PER_DROP = 2000

/** Lixo de sistema que nunca deve subir (macOS, Windows, Office). */
const JUNK = new Set(['.ds_store', 'thumbs.db', 'desktop.ini', '.localized', 'ehthumbs.db', 'icon\r'])

export function isJunkFile(name: string): boolean {
  const n = name.toLowerCase()
  return JUNK.has(n) || n.startsWith('._') || n.startsWith('~$')
}

/** O arrasto traz arquivos do sistema (não texto, não um item da própria tela). */
export function hasFiles(dt: DataTransfer | null | undefined): boolean {
  return !!dt && Array.from(dt.types ?? []).includes('Files')
}

export function isFileDrag(event: DragEvent): boolean {
  return hasFiles(event.dataTransfer)
}

// ── Arrastar (com pastas) ────────────────────────────────────────────────────

/** Entrada do File System Access (Chromium, Firefox e Safari têm o `webkitGetAsEntry`). */
interface FsEntry {
  isFile: boolean
  isDirectory: boolean
  name: string
  fullPath: string
}
interface FsFileEntry extends FsEntry {
  file(success: (file: File) => void, error?: (err: unknown) => void): void
}
interface FsDirectoryEntry extends FsEntry {
  createReader(): { readEntries(success: (entries: FsEntry[]) => void, error?: (err: unknown) => void): void }
}

function entryFile(entry: FsFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

/** `readEntries` devolve em lotes (o Chrome manda até 100): lê até vir vazio. */
async function readAll(dir: FsDirectoryEntry): Promise<FsEntry[]> {
  const reader = dir.createReader()
  const out: FsEntry[] = []
  for (;;) {
    const batch = await new Promise<FsEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (!batch.length) return out
    out.push(...batch)
  }
}

/**
 * Arquivos de um `drop`, atravessando as pastas com `webkitGetAsEntry`.
 *
 * IMPORTANTE: chame no próprio handler do `drop`, ANTES de qualquer `await`.
 * O `DataTransfer` só vale durante o evento; as entradas são capturadas na
 * hora e a travessia segue depois. DataTransfer criado por script (testes) e
 * navegador sem `webkitGetAsEntry` caem nos arquivos soltos, sem pasta.
 */
export function filesFromDrop(dt: DataTransfer | null, opts: { maxFiles?: number } = {}): Promise<SourcedFiles> {
  const max = opts.maxFiles ?? MAX_FILES_PER_DROP
  if (!dt) return Promise.resolve({ files: [], truncated: false, unreadable: 0 })
  const roots: FsEntry[] = []
  const loose: File[] = []
  const items = dt.items ? Array.from(dt.items) : []
  for (const item of items) {
    if (item.kind !== 'file') continue
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.() ?? null
    if (entry) roots.push(entry)
    else {
      const f = item.getAsFile()
      if (f) loose.push(f)
    }
  }
  if (!items.length && dt.files) loose.push(...Array.from(dt.files))

  return (async () => {
    const files: UploadEntry[] = []
    let truncated = false
    let unreadable = 0
    const push = (file: File, relativePath?: string) => {
      if (isJunkFile(file.name)) return
      if (files.length >= max) {
        truncated = true
        return
      }
      files.push(relativePath ? { file, relativePath } : { file })
    }
    for (const f of loose) push(f)
    const walk = async (entry: FsEntry): Promise<void> => {
      if (files.length >= max) {
        truncated = true
        return
      }
      if (entry.isFile) {
        try {
          const file = await entryFile(entry as FsFileEntry)
          const rel = entry.fullPath.replace(/^\/+/, '')
          // Arquivo solto na raiz do arrasto: sem caminho (não cria pasta).
          push(file, rel.includes('/') ? rel : undefined)
        } catch {
          unreadable++
        }
        return
      }
      if (entry.isDirectory) {
        if (isJunkFile(entry.name)) return
        try {
          for (const child of await readAll(entry as FsDirectoryEntry)) await walk(child)
        } catch {
          unreadable++
        }
      }
    }
    for (const root of roots) await walk(root)
    return { files, truncated, unreadable }
  })()
}

/** Só os arquivos do `drop` (quem não precisa saber do teto nem do ilegível). */
export async function entriesFromDrop(dt: DataTransfer): Promise<UploadEntry[]> {
  return (await filesFromDrop(dt)).files
}

/**
 * Soltar arquivos numa área (o diálogo ou o painel inteiro). Devolve `isOver`
 * para o destaque e `on`, os ouvintes para o `v-on` do elemento:
 *
 *   const drop = useFileDrop({ enabled: () => canEdit.value, onFiles: add })
 *   <section v-on="drop.on" :class="{ 'is-over': drop.isOver.value }">
 *
 * Área dentro de área (o orçamento dentro do painel da ativação): a de dentro
 * segura o evento (`stopPropagation`), e a de fora apaga o destaque sozinha
 * quando para de receber `dragover` (o navegador manda um a cada ~50 ms
 * enquanto o arquivo está em cima). Sem contador de dragenter/dragleave, que
 * desanda com filhos e áreas aninhadas.
 */
export function useFileDrop(opts: { enabled?: () => boolean; onFiles: (entries: UploadEntry[]) => void }) {
  const isOver = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  const allowed = (e: DragEvent) => (opts.enabled?.() ?? true) && hasFiles(e.dataTransfer)
  const beat = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    isOver.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (isOver.value = false), 200)
  }
  const on = {
    dragenter(e: DragEvent) {
      if (allowed(e)) beat(e)
    },
    dragover(e: DragEvent) {
      if (allowed(e)) beat(e)
    },
    dragleave(e: DragEvent) {
      const to = e.relatedTarget as Node | null
      if (!to || !(e.currentTarget as HTMLElement).contains(to)) {
        clearTimeout(timer)
        isOver.value = false
      }
    },
    drop(e: DragEvent) {
      if (!allowed(e)) return
      e.preventDefault()
      e.stopPropagation()
      clearTimeout(timer)
      isOver.value = false
      void entriesFromDrop(e.dataTransfer!).then((entries) => {
        if (entries.length) opts.onFiles(entries)
      })
    },
  }
  onScopeDispose(() => clearTimeout(timer))
  return { isOver: isOver as Readonly<Ref<boolean>>, on }
}

/**
 * Arquivo solto FORA de um alvo (barra de cima, margem, aba) faria o navegador
 * abrir o arquivo e sair da ala. Ligado no documento enquanto a ala está
 * montada (`MarketingLayout`): soltar fora não faz nada. Alvos de verdade
 * chamam `preventDefault` antes e seguem funcionando.
 */
export function swallowStrayDrop(event: DragEvent) {
  if (!isFileDrag(event)) return
  // Nenhuma área aceitou (ninguém chamou preventDefault antes): cursor de "não pode".
  const unhandled = !event.defaultPrevented
  event.preventDefault()
  if (unhandled && event.type === 'dragover' && event.dataTransfer) event.dataTransfer.dropEffect = 'none'
}

// ── Colar (Ctrl+V) ───────────────────────────────────────────────────────────

const NOT_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image', 'hidden'])

/** Foco num campo de texto: o Ctrl+V é do texto, não da fila. */
export function isTextField(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled
  if (el instanceof HTMLInputElement) return !NOT_TEXT_INPUTS.has(el.type) && !el.readOnly && !el.disabled
  if (el instanceof HTMLSelectElement) return true
  return (el as HTMLElement).isContentEditable === true
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/tiff': 'tif',
}

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`
}

/**
 * Imagem copiada vem como "image.png" (print, copiar imagem do navegador): o
 * mesmo nome sempre. Vira "Colado <data hora>.png", com " (2)" quando vêm
 * várias de uma vez. Arquivo com nome de verdade fica como está.
 */
export function pastedFiles(files: File[], when = new Date()): UploadEntry[] {
  const at = stamp(when)
  return files.map((f, i) => {
    const generic = !f.name || /^image\.(png|jpe?g|gif|webp|avif|bmp|tiff?)$/i.test(f.name)
    if (!generic) return { file: f }
    const ext = EXT_BY_MIME[f.type] ?? 'png'
    const name = `Colado ${at}${files.length > 1 ? ` (${i + 1})` : ''}.${ext}`
    return { file: new File([f], name, { type: f.type || 'image/png', lastModified: Date.now() }) }
  })
}

/** Os arquivos de um `paste` (imagem copiada, print ou arquivo copiado do sistema). */
export function filesFromPaste(event: ClipboardEvent): File[] {
  const files = Array.from(event.clipboardData?.files ?? [])
  if (!files.length) {
    for (const item of Array.from(event.clipboardData?.items ?? [])) {
      if (item.kind !== 'file') continue
      const f = item.getAsFile()
      if (f) files.push(f)
    }
  }
  return files
}

interface PasteHandler {
  enabled: () => boolean
  /** Elemento da área: com um diálogo aberto, só a área DENTRO do diálogo da frente recebe. */
  root?: () => HTMLElement | null | undefined
  priority: number
  order: number
  onFiles: (entries: UploadEntry[]) => void
}

const pasteHandlers = new Set<PasteHandler>()
let pasteOrder = 0
let pasteListening = false

/** O diálogo modal da frente (o último aberto fica por último no `body`). */
function topModal(): Element | null {
  const open = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'))
  return open.length ? open[open.length - 1]! : null
}

function onDocumentPaste(e: ClipboardEvent) {
  if (isTextField(document.activeElement)) return
  const files = filesFromPaste(e)
  if (!files.length) return
  const modal = topModal()
  const handler = [...pasteHandlers]
    .filter((h) => {
      if (!h.enabled()) return false
      // Com um diálogo aberto, a colagem é dele: a tela de trás (ou o painel
      // de trás) não recebe, mesmo ligada.
      if (!modal) return true
      const root = h.root?.()
      return !!root && modal.contains(root)
    })
    .sort((a, b) => b.priority - a.priority || b.order - a.order)[0]
  if (!handler) return
  e.preventDefault()
  handler.onFiles(pastedFiles(files))
}

/**
 * Ctrl+V de arquivo (imagem copiada, print) cai na área que está na frente.
 * Vale só com o foco FORA de campo de texto. Diálogo usa prioridade maior que
 * painel; e, com qualquer diálogo modal aberto, só recebe a área cujo `root`
 * está dentro dele (o "Mover", a confirmação ou o diálogo de outra tela não
 * deixam a colagem cair na tela de trás).
 */
export function usePasteFiles(opts: {
  enabled: () => boolean
  onFiles: (entries: UploadEntry[]) => void
  priority?: number
  root?: () => HTMLElement | null | undefined
}) {
  const handler: PasteHandler = {
    enabled: opts.enabled,
    root: opts.root,
    priority: opts.priority ?? 0,
    order: ++pasteOrder,
    onFiles: opts.onFiles,
  }
  pasteHandlers.add(handler)
  if (!pasteListening && typeof document !== 'undefined') {
    pasteListening = true
    document.addEventListener('paste', onDocumentPaste)
  }
  onScopeDispose(() => pasteHandlers.delete(handler))
}

// ── Seletor de arquivo e de pasta ────────────────────────────────────────────

/**
 * Os arquivos de um `<input type=file>` (o evento `change` ou o próprio input),
 * sem lixo de sistema, e limpa o input para escolher o mesmo de novo. Com
 * `webkitdirectory` o navegador preenche `webkitRelativePath`
 * ("Viagem/Dia 1/IMG.jpg"), que vira o caminho.
 */
export function filesFromInput(source: Event | HTMLInputElement | null): UploadEntry[] {
  const input = (source instanceof Event ? source.target : source) as HTMLInputElement | null
  const list = input?.files ? Array.from(input.files) : []
  if (input) input.value = ''
  return list
    .filter((f) => !isJunkFile(f.name))
    .map((file) => {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath
      return rel && rel.includes('/') ? { file, relativePath: rel } : { file }
    })
}
