import { File as FileIcon, FileImage, FileText, FileVideo, type LucideIcon } from 'lucide-vue-next'
import type {
  LibraryFolder,
  LibraryItem,
  LibraryKind,
  LibraryLocation,
} from '@/service/marketing/marketing-library'
import { formatBytes } from '../marketing-labels'

/**
 * Rótulos e formas do Acervo para a tela (o servidor é quem decide acesso;
 * aqui é só apresentação). Lugar: `companyId` de marca ou `null` (Geral).
 */

export const GERAL_LABEL = 'Geral do grupo'
/** Valor do lugar na URL (`?local=`) para a Geral. */
export const GERAL_PARAM = 'geral'

export const KIND_LABEL: Record<LibraryKind, string> = {
  imagem: 'Imagem',
  video: 'Vídeo',
  pdf: 'PDF',
  outro: 'Outro',
}

export const KIND_ICON: Record<LibraryKind, LucideIcon> = {
  imagem: FileImage,
  video: FileVideo,
  pdf: FileText,
  outro: FileIcon,
}

export const KIND_OPTIONS = (['imagem', 'video', 'pdf', 'outro'] as LibraryKind[]).map((k) => ({
  value: k,
  label: KIND_LABEL[k],
}))

export function locationKey(companyId: string | null): string {
  return companyId ?? GERAL_PARAM
}

export function locationFromKey(key: string | null | undefined): string | null | undefined {
  if (!key) return undefined
  return key === GERAL_PARAM ? null : key
}

/** O que está aberto na tela (ou escolhido num diálogo). */
export interface LibrarySelection {
  /** undefined = Todos os arquivos; null = Geral do grupo */
  companyId: string | null | undefined
  folderId: string | null
}

export interface FolderNode extends LibraryFolder {
  children: FolderNode[]
}

/** Árvore por lugar a partir da lista plana (irmãs em ordem alfabética). */
export function buildFolderTree(folders: LibraryFolder[]): Map<string, FolderNode[]> {
  const nodes = new Map<string, FolderNode>()
  for (const f of folders) nodes.set(f.id, { ...f, children: [] })
  const roots = new Map<string, FolderNode[]>()
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else {
      const key = locationKey(node.companyId)
      roots.set(key, [...(roots.get(key) ?? []), node])
    }
  }
  const sort = (list: FolderNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))
    for (const n of list) sort(n.children)
  }
  for (const list of roots.values()) sort(list)
  return roots
}

/** Ids da pasta e de tudo dentro dela (para não soltar pasta dentro de si). */
export function subtreeOf(folderId: string, folders: LibraryFolder[]): Set<string> {
  const out = new Set([folderId])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id)
        grew = true
      }
    }
  }
  return out
}

/** "PetJourney / Fotos / Produto". */
export function placeLabel(
  location: Pick<LibraryLocation, 'name'> | undefined,
  folder: Pick<LibraryFolder, 'path'> | undefined,
): string {
  return [location?.name ?? GERAL_LABEL, ...(folder?.path ?? [])].join(' / ')
}

export function itemPlace(item: Pick<LibraryItem, 'location' | 'folderPath'>): string {
  return [item.location, ...item.folderPath].join(' / ')
}

/** URL que o navegador desenha na grade: miniatura, prévia RGB ou o original. */
export function thumbOf(item: LibraryItem): string | null {
  if (item.kind !== 'imagem') return null
  if (item.thumbUrl) return item.thumbUrl
  if (item.previewUrl) return item.previewUrl
  // TIFF/HEIC sem prévia: o navegador não desenha.
  if (/tiff|heic|heif/i.test(item.asset.mimeType)) return null
  return item.url
}

/** URL para ver grande (tela cheia, painel): a prévia RGB vence o original. */
export function viewUrlOf(item: LibraryItem): string | null {
  return item.previewUrl ?? item.url
}

/** Extensão do original para pôr depois do título (vazio se o título já termina nela). */
export function fileExtOf(name: string, title = ''): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name)
  if (!m) return ''
  const ext = `.${m[1]!.toLowerCase()}`
  return title.toLowerCase().endsWith(ext) ? '' : ext
}

export function formatDimensions(item: LibraryItem): string | null {
  const { width, height } = item.asset
  return width && height ? `${width} × ${height} px` : null
}

export function formatDuration(sec: number | null | undefined): string | null {
  if (!sec || sec <= 0) return null
  const s = Math.round(sec)
  const m = Math.floor(s / 60)
  const r = s % 60
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

const COLOR_SPACE_LABEL: Record<string, string> = {
  srgb: 'RGB (sRGB)',
  rgb: 'RGB',
  cmyk: 'CMYK',
  'b-w': 'Preto e branco',
  grey16: 'Cinza 16 bits',
  rgb16: 'RGB 16 bits',
  lab: 'Lab',
}

export function formatColorSpace(space: string | null | undefined): string | null {
  if (!space) return null
  return COLOR_SPACE_LABEL[space.toLowerCase()] ?? space.toUpperCase()
}

export function shortHash(sha: string | null | undefined): string | null {
  return sha ? sha.slice(0, 12) : null
}

export function itemMeta(item: LibraryItem): string {
  const parts = [KIND_LABEL[item.kind], formatBytes(item.asset.size)]
  const dim = formatDimensions(item)
  if (dim && item.kind === 'imagem') parts.push(dim.replace(' px', ''))
  const dur = formatDuration(item.asset.durationSec)
  if (dur) parts.push(dur)
  return parts.join(' · ')
}

const DATE_FMT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
})
const DATE_TIME_FMT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

export function formatDate(iso: string): string {
  return DATE_FMT.format(new Date(iso)).replace(/\./g, '')
}

export function formatDateTime(iso: string): string {
  return DATE_TIME_FMT.format(new Date(iso)).replace(/\./g, '')
}

/** Etiqueta como o servidor guarda (minúscula, sem acento, sem #). */
export function normalizeTag(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/#/g, '')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 40)
}

/** Itens arrastados dentro da tela (mover para pasta) e pasta arrastada. */
export const DRAG_ITEMS = 'application/x-nevo-acervo-itens'
export const DRAG_FOLDER = 'application/x-nevo-acervo-pasta'
