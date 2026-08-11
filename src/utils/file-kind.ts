import {
  Archive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  File as FileIcon,
  type LucideIcon,
} from 'lucide-vue-next'

/**
 * Classificação de arquivo para ícone, preview e rótulo — compartilhada entre
 * anexos de tarefa e o Drive (promovida de `features/tasks/attachment-kind.ts`
 * na spec drive-p1; o módulo antigo reexporta daqui).
 *
 * Deriva de `mimeType` quando existe e cai na extensão quando não existe: o
 * acervo legado de anexos (antes de ago/2026) tem `mimeType` nulo ou preenchido
 * best-effort pelo backfill da migration. Nenhuma decisão de segurança depende
 * disto: é só para a tela saber que ícone mostrar e se dá para pré-visualizar.
 */

/** Forma mínima que as funções daqui precisam. Anexo e DriveFile satisfazem. */
export interface FileLike {
  filename: string
  mimeType?: string | null
}

export type AttachmentKind =
  | 'image'
  | 'pdf'
  | 'markdown'
  | 'text'
  | 'code'
  | 'sheet'
  | 'doc'
  | 'archive'
  | 'video'
  | 'audio'
  | 'other'

const EXTENSION_KIND: Record<string, AttachmentKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  avif: 'image',
  bmp: 'image',
  svg: 'image',
  pdf: 'pdf',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  csv: 'sheet',
  xls: 'sheet',
  xlsx: 'sheet',
  doc: 'doc',
  docx: 'doc',
  ppt: 'doc',
  pptx: 'doc',
  json: 'code',
  xml: 'code',
  yml: 'code',
  yaml: 'code',
  ts: 'code',
  js: 'code',
  sql: 'code',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
}

const KIND_ICON: Record<AttachmentKind, LucideIcon> = {
  image: FileImage,
  pdf: FileType,
  markdown: FileText,
  text: FileText,
  code: FileCode,
  sheet: FileSpreadsheet,
  doc: FileText,
  archive: Archive,
  video: FileVideo,
  audio: FileAudio,
  other: FileIcon,
}

const KIND_LABEL: Record<AttachmentKind, string> = {
  image: 'Imagem',
  pdf: 'PDF',
  markdown: 'Markdown',
  text: 'Texto',
  code: 'Código',
  sheet: 'Planilha',
  doc: 'Documento',
  archive: 'Compactado',
  video: 'Vídeo',
  audio: 'Áudio',
  other: 'Arquivo',
}

export function extensionOf(filename: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(filename.trim())
  return match?.[1]?.toLowerCase() ?? ''
}

export function kindOf(file: FileLike): AttachmentKind {
  const mime = file.mimeType?.toLowerCase() ?? ''
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'text/markdown') return 'markdown'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'

  return EXTENSION_KIND[extensionOf(file.filename)] ?? 'other'
}

export function iconOf(file: FileLike): LucideIcon {
  return KIND_ICON[kindOf(file)]
}

export function labelOf(file: FileLike): string {
  return KIND_LABEL[kindOf(file)]
}

/** O viewer sabe renderizar. Todo o resto cai no cartão de download. */
export function isPreviewable(file: FileLike): boolean {
  const kind = kindOf(file)
  return kind === 'image' || kind === 'pdf' || kind === 'markdown'
}

/**
 * Markdown pelo NOME do arquivo, antes de ele existir como anexo.
 *
 * `kindOf` responde sobre arquivo já gravado (tem `mimeType`); aqui a pergunta
 * é sobre um `File` que o usuário acabou de escolher, e a única informação
 * confiável é a extensão — o browser preenche `type` de `.md` de um jeito em
 * cada sistema (`text/markdown`, `text/plain` ou vazio).
 */
export function isMarkdownFilename(filename: string): boolean {
  return /\.(md|markdown)$/i.test(filename.trim())
}

export function isImage(file: FileLike): boolean {
  return kindOf(file) === 'image'
}

/**
 * Tamanho legível, ou string vazia.
 *
 * Vazio (e não "0 B" nem "desconhecido") quando o arquivo é legado e não tem
 * tamanho gravado: a linha simplesmente não mostra o campo, em vez de exibir um
 * número errado ou um rótulo que não ajuda ninguém.
 */
export function formatBytes(size?: number | null): string {
  if (size === null || size === undefined || size < 0) return ''
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB']
  let value = size / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded.toString().replace('.', ',')} ${units[unit]}`
}

/** Ordena a lista: imagens primeiro (a grade fica coerente), depois por nome. */
export function sortAttachments<T extends FileLike>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const imageA = isImage(a) ? 0 : 1
    const imageB = isImage(b) ? 0 : 1
    return imageA - imageB || a.filename.localeCompare(b.filename)
  })
}
