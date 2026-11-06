/**
 * De onde vêm os arquivos da ala: arrastar (arquivos ou pastas, na área
 * inteira do diálogo ou painel), Ctrl+V de imagem e os seletores do celular
 * ("Tirar foto" e "Galeria", em `UploadSourceButtons.vue`).
 *
 * Tudo devolve `UploadEntry[]` (`{ file, relativePath? }`), o formato do
 * `enqueue` da fila. Pasta arrastada vem achatada, com o `relativePath` de cada
 * arquivo (`fotos/2026/gato.jpg`): o Acervo usa para recriar as subpastas, os
 * outros destinos ignoram.
 */
import { onScopeDispose, ref, type Ref } from 'vue'
import type { UploadEntry } from './upload-queue'

/** Teto de arquivos por gesto (arrastar a pasta errada não vira 20 mil envios). */
export const MAX_FILES_PER_DROP = 1000

export function hasFiles(dt: DataTransfer | null | undefined): boolean {
  return !!dt && [...dt.types].includes('Files')
}

// ── Arrastar ─────────────────────────────────────────────────────────────────

/** Entrada do File System Access (Chromium, Firefox e Safari têm o `webkitGetAsEntry`). */
interface FsEntry {
  isFile: boolean
  isDirectory: boolean
  name: string
  file?: (ok: (f: File) => void, fail: (e: unknown) => void) => void
  createReader?: () => { readEntries: (ok: (list: FsEntry[]) => void, fail: (e: unknown) => void) => void }
}

function readAll(dir: FsEntry): Promise<FsEntry[]> {
  const reader = dir.createReader!()
  const out: FsEntry[] = []
  return new Promise((resolve) => {
    const next = () =>
      reader.readEntries(
        (batch) => {
          if (!batch.length) return resolve(out)
          out.push(...batch)
          next()
        },
        () => resolve(out),
      )
    next()
  })
}

async function walk(entry: FsEntry, prefix: string, out: UploadEntry[]) {
  if (out.length >= MAX_FILES_PER_DROP) return
  if (entry.isFile && entry.file) {
    const file = await new Promise<File | null>((resolve) => entry.file!(resolve, () => resolve(null)))
    if (file && !isJunk(file.name)) out.push({ file, relativePath: prefix ? `${prefix}/${file.name}` : undefined })
    return
  }
  if (entry.isDirectory && entry.createReader) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    for (const child of await readAll(entry)) await walk(child, path, out)
  }
}

/** Arquivo de sistema que ninguém quer subir. */
function isJunk(name: string) {
  return name === '.DS_Store' || name === 'Thumbs.db' || name === 'desktop.ini' || name.startsWith('._')
}

/**
 * Lê o que veio no `drop`. A lista de entradas precisa ser pega AINDA dentro do
 * evento (depois o navegador esvazia o DataTransfer), por isso a primeira
 * parte é síncrona. DataTransfer criado por script (testes) não tem entrada de
 * sistema de arquivos: cai no `getAsFile`.
 */
export function entriesFromDrop(dt: DataTransfer): Promise<UploadEntry[]> {
  const roots: FsEntry[] = []
  const loose: File[] = []
  const items = dt.items ? [...dt.items] : []
  for (const item of items) {
    if (item.kind !== 'file') continue
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.() ?? null
    if (entry) roots.push(entry)
    else {
      const f = item.getAsFile()
      if (f) loose.push(f)
    }
  }
  if (!items.length) loose.push(...dt.files)
  return (async () => {
    const out: UploadEntry[] = loose.filter((f) => !isJunk(f.name)).map((file) => ({ file }))
    for (const root of roots) await walk(root, '', out)
    return out.slice(0, MAX_FILES_PER_DROP)
  })()
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

// ── Colar (Ctrl+V) ───────────────────────────────────────────────────────────

const NOT_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image', 'hidden'])

/** Foco num campo de texto: o Ctrl+V é do texto, não da fila. */
export function isTextField(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled
  if (el instanceof HTMLInputElement) return !NOT_TEXT_INPUTS.has(el.type) && !el.readOnly && !el.disabled
  return (el as HTMLElement).isContentEditable === true
}

function two(n: number) {
  return String(n).padStart(2, '0')
}

/**
 * Imagem copiada vem como "image.png" (print, copiar imagem do navegador). Vira
 * `colado-AAAA-MM-DD-HHMMSS.png` para não chegar no card um monte de "image.png".
 */
export function pastedFile(file: File, index = 0): File {
  const generic = !file.name || /^image\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(file.name)
  if (!generic) return file
  const d = new Date()
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/\+.*/, '')
  const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`
  return new File([file], `colado-${stamp}${index ? `-${index + 1}` : ''}.${ext}`, {
    type: file.type || 'image/png',
    lastModified: file.lastModified,
  })
}

interface PasteHandler {
  enabled: () => boolean
  priority: number
  order: number
  onFiles: (entries: UploadEntry[]) => void
}

const pasteHandlers = new Set<PasteHandler>()
let pasteOrder = 0
let pasteListening = false

function onDocumentPaste(e: ClipboardEvent) {
  if (isTextField(document.activeElement)) return
  const files = [...(e.clipboardData?.files ?? [])]
  if (!files.length) {
    for (const item of e.clipboardData?.items ?? []) {
      if (item.kind === 'file') {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
  }
  if (!files.length) return
  const handler = [...pasteHandlers]
    .filter((h) => h.enabled())
    .sort((a, b) => b.priority - a.priority || b.order - a.order)[0]
  if (!handler) return
  e.preventDefault()
  handler.onFiles(files.map((f, i) => ({ file: pastedFile(f, files.length > 1 ? i : 0) })))
}

/**
 * Ctrl+V de arquivo (imagem copiada, print) cai na área que está na frente.
 * Vale só com o foco FORA de campo de texto. Diálogo usa prioridade maior que
 * painel: com o diálogo aberto, a colagem é dele.
 */
export function usePasteFiles(opts: { enabled: () => boolean; onFiles: (entries: UploadEntry[]) => void; priority?: number }) {
  const handler: PasteHandler = {
    enabled: opts.enabled,
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

// ── Seletor de arquivo ───────────────────────────────────────────────────────

/** Os arquivos de um `<input type=file>` (e limpa o input para escolher o mesmo de novo). */
export function filesFromInput(event: Event): UploadEntry[] {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  return files.map((file) => ({ file }))
}
