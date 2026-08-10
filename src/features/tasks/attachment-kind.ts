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
import type { ActivityAttachment } from './activity-types'

/**
 * Classificação de anexo para ícone, preview e rótulo.
 *
 * Deriva de `mimeType` quando existe e cai na extensão quando não existe: o
 * acervo legado (anexos de antes de ago/2026) tem `mimeType` nulo ou preenchido
 * best-effort pelo backfill da migration. Nenhuma decisão de segurança depende
 * disto: é só para a tela saber que ícone mostrar e se dá para pré-visualizar.
 */
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

export function kindOf(attachment: {
  filename: string
  mimeType?: string | null
}): AttachmentKind {
  const mime = attachment.mimeType?.toLowerCase() ?? ''
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'text/markdown') return 'markdown'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'

  return EXTENSION_KIND[extensionOf(attachment.filename)] ?? 'other'
}

export function iconOf(attachment: {
  filename: string
  mimeType?: string | null
}): LucideIcon {
  return KIND_ICON[kindOf(attachment)]
}

export function labelOf(attachment: {
  filename: string
  mimeType?: string | null
}): string {
  return KIND_LABEL[kindOf(attachment)]
}

/** O viewer sabe renderizar. Todo o resto cai no cartão de download. */
export function isPreviewable(attachment: {
  filename: string
  mimeType?: string | null
}): boolean {
  const kind = kindOf(attachment)
  return kind === 'image' || kind === 'pdf'
}

export function isImage(attachment: {
  filename: string
  mimeType?: string | null
}): boolean {
  return kindOf(attachment) === 'image'
}

/**
 * Tamanho legível, ou string vazia.
 *
 * Vazio (e não "0 B" nem "desconhecido") quando o anexo é legado e não tem
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
export function sortAttachments(items: ActivityAttachment[]): ActivityAttachment[] {
  return [...items].sort((a, b) => {
    const imageA = isImage(a) ? 0 : 1
    const imageB = isImage(b) ? 0 : 1
    return imageA - imageB || a.filename.localeCompare(b.filename)
  })
}
