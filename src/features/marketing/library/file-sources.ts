/**
 * De onde vêm os arquivos que a pessoa quer subir: arrastar (arquivos E
 * pastas), colar (Ctrl+V de imagem), escolher no seletor (inclusive pasta) e,
 * no celular, câmera ou galeria. Genérico de propósito: o Acervo usa hoje, e o
 * motor de envio da ala (R1-B) e outras telas podem usar igual.
 *
 * Saída sempre no mesmo formato: `{ file, relativePath? }`. O `relativePath`
 * ("Viagem/Dia 1/IMG_001.jpg") é o caminho dentro do que foi arrastado ou
 * escolhido; quem recebe recria as subpastas a partir dele.
 */

export interface SourcedFile {
  file: File
  /** Caminho dentro da pasta arrastada, com o nome do arquivo no fim */
  relativePath?: string
}

export interface SourcedFiles {
  files: SourcedFile[]
  /** Passou do teto (`maxFiles`): o resto ficou de fora */
  truncated: boolean
  /** Pastas que o navegador não deixou ler (permissão, atalho quebrado) */
  unreadable: number
}

/** Lixo de sistema que nunca deve subir. */
const JUNK = new Set(['.ds_store', 'thumbs.db', 'desktop.ini', '.localized'])

export function isJunkFile(name: string): boolean {
  const n = name.toLowerCase()
  return JUNK.has(n) || n.startsWith('._') || n.startsWith('~$')
}

/** O arrasto traz arquivos do sistema (não texto, não um item da própria tela). */
export function isFileDrag(event: DragEvent): boolean {
  const types = event.dataTransfer?.types
  return !!types && Array.from(types).includes('Files')
}

/** Foco num campo de texto: o Ctrl+V é do campo, não do envio. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
}

// ── Arrastar (com pastas) ─────────────────────────────────────────────────

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
 * hora e a travessia segue depois. Navegador sem `webkitGetAsEntry` (raro) cai
 * nos arquivos soltos, sem pasta.
 */
export function filesFromDrop(dt: DataTransfer | null, opts: { maxFiles?: number } = {}): Promise<SourcedFiles> {
  const max = opts.maxFiles ?? 2000
  if (!dt) return Promise.resolve({ files: [], truncated: false, unreadable: 0 })
  const roots: FsEntry[] = []
  const loose: File[] = []
  const items = dt.items ? Array.from(dt.items) : []
  for (const item of items) {
    if (item.kind !== 'file') continue
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.()
    if (entry) roots.push(entry)
    else {
      const f = item.getAsFile()
      if (f) loose.push(f)
    }
  }
  if (!items.length && dt.files) loose.push(...Array.from(dt.files))

  return (async () => {
    const files: SourcedFile[] = []
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

// ── Seletor de arquivo e de pasta ─────────────────────────────────────────

/**
 * Arquivos de um `<input type="file">`. Com `webkitdirectory` o navegador
 * preenche `webkitRelativePath` ("Viagem/Dia 1/IMG.jpg"), que vira o caminho.
 */
export function filesFromInput(input: HTMLInputElement | null): SourcedFile[] {
  const list = input?.files ? Array.from(input.files) : []
  return list
    .filter((f) => !isJunkFile(f.name))
    .map((file) => {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath
      return rel && rel.includes('/') ? { file, relativePath: rel } : { file }
    })
}

/**
 * Abre o seletor do sistema sem um `<input>` no template. No celular,
 * `capture: 'environment'` abre a câmera traseira e `accept: 'image/*,video/*'`
 * vai direto para a galeria. Resolve vazio se a pessoa cancelar (o navegador
 * avisa com o evento `cancel` onde existe).
 */
export function pickFiles(opts: {
  accept?: string
  multiple?: boolean
  capture?: 'environment' | 'user'
  directory?: boolean
} = {}): Promise<SourcedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (opts.accept) input.accept = opts.accept
    if (opts.multiple) input.multiple = true
    if (opts.capture) input.setAttribute('capture', opts.capture)
    if (opts.directory) input.setAttribute('webkitdirectory', '')
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    document.body.appendChild(input)
    const done = (files: SourcedFile[]) => {
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', () => done(filesFromInput(input)), { once: true })
    input.addEventListener('cancel', () => done([]), { once: true })
    input.click()
  })
}

// ── Colar (Ctrl+V) ─────────────────────────────────────────────────────────

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
}

/**
 * Imagens de um `paste`. Print copiado chega como "image.png" (o mesmo nome
 * sempre): renomeia para "Colado <data hora>.png", com sufixo quando vêm várias.
 * Só imagem (é o que o sistema põe na área de transferência ao copiar).
 */
export function imagesFromPaste(event: ClipboardEvent): SourcedFile[] {
  const items = event.clipboardData?.items ? Array.from(event.clipboardData.items) : []
  const files: File[] = []
  for (const item of items) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const f = item.getAsFile()
    if (f) files.push(f)
  }
  if (!files.length && event.clipboardData?.files) {
    files.push(...Array.from(event.clipboardData.files).filter((f) => f.type.startsWith('image/')))
  }
  const when = stamp()
  return files.map((f, i) => {
    const generic = !f.name || /^image\.(png|jpe?g|gif|webp)$/i.test(f.name)
    if (!generic) return { file: f }
    const ext = EXT_BY_MIME[f.type] ?? 'png'
    const name = `Colado ${when}${files.length > 1 ? ` (${i + 1})` : ''}.${ext}`
    return { file: new File([f], name, { type: f.type, lastModified: Date.now() }) }
  })
}
