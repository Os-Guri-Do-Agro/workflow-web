import axios from 'axios'
import api, { apiBaseUrl } from '../api'
import { mkt, type MarketingUploadTicket } from './marketing-core'
import type { MarketingCardDetail } from './marketing-cards'
import type { TrashedRef } from './marketing-trash'
import { blobErrorMessage, filenameFromDisposition } from './marketing-finance'

/**
 * Cliente do Acervo (spec docs/specs/2026/q4/q4-2/ala-marketing/
 * r1-acervo-tarefas-convite.md, contratos de P1). Rotas em
 * `/marketing/g/<grupo>/library/...`.
 *
 * Lugar: `companyId` de marca, ou `null` = "Geral do grupo" (na query vai como
 * `geral`). Chave do Vue Query SEMPRE `['marketing', groupId, 'library', ...]`:
 * o socket `marketing:changed` invalida o grupo inteiro.
 */

export type LibraryKind = 'imagem' | 'video' | 'pdf' | 'outro'
export type LibraryOrder = 'recentes' | 'nome' | 'favoritos'
export type LibraryBulkAction = 'mover' | 'etiquetar' | 'desetiquetar' | 'favoritar' | 'desfavoritar' | 'apagar'

export interface LibraryLocation {
  /** null = Geral do grupo */
  companyId: string | null
  name: string
  /** Arquivos soltos na raiz do lugar */
  itemCount: number
  /** Todos os arquivos do lugar */
  totalCount: number
  canWrite: boolean
}

export interface LibraryFolder {
  id: string
  companyId: string | null
  parentId: string | null
  name: string
  depth: number
  path: string[]
  itemCount: number
  totalCount: number
  childCount: number
  createdAt: string
  canWrite: boolean
  canDelete: boolean
}

export interface LibraryTree {
  locations: LibraryLocation[]
  folders: LibraryFolder[]
}

export interface LibraryAsset {
  id: string
  name: string
  mimeType: string
  size: number
  sha256: string | null
  width: number | null
  height: number | null
  durationSec: number | null
  colorSpace: string | null
  hasPreview: boolean
  status: 'PENDING' | 'READY'
}

export interface LibraryItem {
  id: string
  companyId: string | null
  folderId: string | null
  /** Nomes das pastas, da raiz do lugar até a pasta do item */
  folderPath: string[]
  /** Nome do lugar (marca ou "Geral do grupo") */
  location: string
  title: string
  tags: string[]
  note: string | null
  starred: boolean
  kind: LibraryKind
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string } | null
  asset: LibraryAsset
  /** Abre no navegador (original) */
  url: string | null
  /** Prévia RGB (CMYK, TIFF, HEIC) */
  previewUrl: string | null
  /** Miniatura da grade (imagem) */
  thumbUrl: string | null
  usageCount: number
  me: { canEdit: boolean; canDelete: boolean }
}

export interface LibraryUsage {
  id: string
  cardId: string
  cardTitle: string
  cardStatus: string
  companyId: string
  versionId: string | null
  versionNumber: number | null
  usedAt: string
  usedBy: { id: string; name: string } | null
}

export interface LibraryItemDetail extends LibraryItem {
  usages: LibraryUsage[]
}

export interface LibraryItemsPage {
  items: LibraryItem[]
  nextCursor: string | null
}

export interface LibraryFilters {
  /** undefined = todos os lugares; null = Geral do grupo */
  companyId?: string | null
  /** id da pasta ou 'raiz' */
  folderId?: string | null
  subpastas?: boolean
  q?: string
  tipo?: LibraryKind | ''
  tag?: string
  enviadoPor?: string
  favoritos?: boolean
  ordem?: LibraryOrder
  limit?: number
}

export interface LibraryDuplicate {
  itemId: string
  title: string
  companyId: string | null
  folderId: string | null
  /** "PetJourney / Fotos / Produto" */
  folderPath: string
}

export interface LibraryUploadFileInput {
  name: string
  size: number
  mimeType: string
  sha256?: string
  relativePath?: string
  keepBoth?: boolean
}

export interface LibraryUploadResult {
  companyId: string | null
  folderId: string | null
  flattened: boolean
  createdFolders: number
  files: Array<{
    index: number
    name: string
    folderId: string | null
    duplicateOf: LibraryDuplicate | null
    ticket: MarketingUploadTicket | null
    error?: string
  }>
}

const lib = (groupId: string, suffix = '') => mkt(groupId, `/library${suffix}`)
const enc = encodeURIComponent

export const libraryKeys = {
  all: (groupId: string) => ['marketing', groupId, 'library'] as const,
  folders: (groupId: string) => ['marketing', groupId, 'library', 'folders'] as const,
  items: (groupId: string, filters: LibraryFilters) => ['marketing', groupId, 'library', 'items', filters] as const,
  item: (groupId: string, itemId: string) => ['marketing', groupId, 'library', 'item', itemId] as const,
  tags: (groupId: string) => ['marketing', groupId, 'library', 'tags'] as const,
}

/** Sem as tabelas da R1 a API responde 503 com frase: a tela mostra "indisponível". */
export function isLibraryUnavailable(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 503
}

export function locationParam(companyId: string | null | undefined): string | undefined {
  if (companyId === undefined) return undefined
  return companyId === null ? 'geral' : companyId
}

function itemParams(filters: LibraryFilters, cursor?: string | null) {
  const p: Record<string, string> = {}
  const loc = locationParam(filters.companyId)
  if (loc) p.companyId = loc
  if (filters.folderId) p.folderId = filters.folderId
  if (filters.subpastas) p.subpastas = '1'
  if (filters.q?.trim()) p.q = filters.q.trim()
  if (filters.tipo) p.tipo = filters.tipo
  if (filters.tag) p.tag = filters.tag
  if (filters.enviadoPor) p.enviadoPor = filters.enviadoPor
  if (filters.favoritos) p.favoritos = '1'
  if (filters.ordem) p.ordem = filters.ordem
  if (filters.limit) p.limit = String(filters.limit)
  if (cursor) p.cursor = cursor
  return p
}

export async function getLibraryFolders(groupId: string): Promise<LibraryTree> {
  const { data } = await api.get<LibraryTree>(lib(groupId, '/folders'))
  return data
}

export async function getLibraryItems(groupId: string, filters: LibraryFilters, cursor?: string | null) {
  const { data } = await api.get<LibraryItemsPage>(lib(groupId, '/items'), { params: itemParams(filters, cursor) })
  return data
}

export async function getLibraryItem(groupId: string, itemId: string) {
  const { data } = await api.get<LibraryItemDetail>(lib(groupId, `/items/${enc(itemId)}`))
  return data
}

export async function getLibraryTags(groupId: string) {
  const { data } = await api.get<Array<{ tag: string; count: number }>>(lib(groupId, '/tags'))
  return data
}

export async function createLibraryFolder(
  groupId: string,
  body: { companyId: string | null; parentId?: string | null; name: string },
) {
  const { data } = await api.post<LibraryFolder>(lib(groupId, '/folders'), body)
  return data
}

export async function updateLibraryFolder(groupId: string, folderId: string, body: { name?: string; parentId?: string | null }) {
  const { data } = await api.patch<LibraryFolder>(lib(groupId, `/folders/${enc(folderId)}`), body)
  return data
}

/**
 * Manda a pasta para a lixeira (R2, C6) com o que tem dentro; `moveToParent`
 * leva o conteúdo para a pasta de cima e manda só a pasta.
 */
export async function deleteLibraryFolder(groupId: string, folderId: string, moveToParent = false) {
  const { data } = await api.delete<{
    ok: true
    movedItems: number
    movedFolders: number
    trashedItems?: number
    trashedFolders?: number
    trashed?: TrashedRef
  }>(
    lib(groupId, `/folders/${enc(folderId)}`),
    { params: moveToParent ? { mover: 'pai' } : undefined },
  )
  return data
}

export async function requestLibraryUploads(
  groupId: string,
  body: { companyId: string | null; folderId?: string | null; files: LibraryUploadFileInput[] },
  opts: { signal?: AbortSignal } = {},
) {
  const { data } = await api.post<LibraryUploadResult>(lib(groupId, '/uploads'), body, { signal: opts.signal })
  return data
}

export async function createLibraryItem(
  groupId: string,
  body: { assetId: string; title?: string; tags?: string[]; folderId?: string | null; companyId: string | null },
  opts: { signal?: AbortSignal } = {},
) {
  const { data } = await api.post<LibraryItemDetail>(lib(groupId, '/items'), body, { signal: opts.signal })
  return data
}

export async function updateLibraryItem(
  groupId: string,
  itemId: string,
  patch: {
    title?: string
    tags?: string[]
    note?: string | null
    starred?: boolean
    folderId?: string | null
    companyId?: string | null
  },
) {
  const { data } = await api.patch<LibraryItemDetail>(lib(groupId, `/items/${enc(itemId)}`), patch)
  return data
}

/** Manda para a lixeira (R2, C6): `trashed` serve ao "Desfazer". */
export async function deleteLibraryItem(groupId: string, itemId: string) {
  const { data } = await api.delete<{ ok: true; trashed?: TrashedRef }>(lib(groupId, `/items/${enc(itemId)}`))
  return data
}

export async function bulkLibraryItems(
  groupId: string,
  body: { ids: string[]; acao: LibraryBulkAction; folderId?: string | null; companyId?: string | null; tags?: string[] },
) {
  // `apagar` manda o lote para a lixeira e devolve `trashed.ids` (R2, C6).
  const { data } = await api.post<{ ok: true; count: number; trashed?: TrashedRef }>(lib(groupId, '/items/bulk'), body)
  return data
}

export async function getLibraryDownload(groupId: string, itemId: string) {
  const { data } = await api.get<{ url: string; name: string; size: number; sha256: string | null }>(
    lib(groupId, `/items/${enc(itemId)}/download`),
  )
  return data
}

/** Baixa o original pelo link assinado (com o título do item como nome). */
export async function downloadLibraryItem(groupId: string, itemId: string) {
  const { url, name } = await getLibraryDownload(groupId, itemId)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  return name
}

export interface LibraryZipTicket {
  token: string
  /** `/marketing/g/<g>/library/zip/<token>` (relativo à API) */
  url: string
  filename: string
  count: number
  totalBytes: number
  expiresAt: string
}

/**
 * Zip de até 200 arquivos, baixado pelo PRÓPRIO navegador (barra de download
 * com progresso, sem montar o zip inteiro na memória da aba).
 *
 * 1. `POST library/zip/ticket` confere tudo (marca, teto de 200 arquivos e de
 *    tamanho) e devolve um link de uso único que vale 60 s; a frase de recusa
 *    vem aqui, como erro normal.
 * 2. O link abre num iframe escondido. Link ou `window.location` disparariam o
 *    "Sair do site?" quando a fila de envio tem arquivo pendente; o iframe não.
 *    Se o link falhar mesmo assim (venceu, perdeu o acesso), a página de erro
 *    da API avisa por `postMessage` e a promessa rejeita com a frase dela.
 *
 * Resolve com o nome do arquivo assim que o download é entregue ao navegador.
 */
export async function downloadLibraryZip(
  groupId: string,
  ids: string[],
  opts: { onLateError?: (message: string) => void } = {},
): Promise<{ filename: string }> {
  let ticket: LibraryZipTicket
  try {
    ticket = (await api.post<LibraryZipTicket>(lib(groupId, '/zip/ticket'), { ids })).data
  } catch (error) {
    // API anterior a este link (deploy fora de ordem): o zip antigo, pela memória.
    const message = axios.isAxiosError(error) ? String((error.response?.data as { message?: unknown })?.message ?? '') : ''
    if (axios.isAxiosError(error) && error.response?.status === 404 && /^Cannot POST/i.test(message)) {
      return { filename: await downloadLibraryZipInMemory(groupId, ids) }
    }
    throw error
  }
  const href = `${apiBaseUrl()}${ticket.url}`
  const origin = new URL(href, window.location.href).origin
  const frame = document.createElement('iframe')
  frame.hidden = true
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.title = 'Download do zip'
  frame.dataset.zipDownload = ticket.token.slice(0, 8)
  return new Promise<{ filename: string }>((resolve, reject) => {
    let settled = false
    let listening = true
    const stopListening = () => {
      if (!listening) return
      listening = false
      window.removeEventListener('message', onMessage)
    }
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.origin !== origin) return
      const data = event.data as { source?: string; error?: string } | null
      if (data?.source !== 'nevo-zip') return
      stopListening()
      frame.remove()
      const message = data.error || 'Não foi possível baixar o zip. Tente de novo.'
      if (!settled) {
        settled = true
        reject(new Error(message))
      } else opts.onLateError?.(message)
    }
    window.addEventListener('message', onMessage)
    frame.src = href
    document.body.appendChild(frame)
    // Sem aviso de erro em 1,5 s, o navegador já está baixando (o zip começa a sair na hora).
    setTimeout(() => {
      if (settled) return
      settled = true
      resolve({ filename: ticket.filename })
    }, 1500)
    // Segue ouvindo um pouco (erro tardio vira aviso). O iframe fica: tirar no
    // meio cancela o download em alguns navegadores; sai depois de 10 min.
    setTimeout(stopListening, 15_000)
    setTimeout(() => frame.remove(), 10 * 60_000)
  })
}

/** O caminho antigo (API sem o link de uso único): o zip inteiro passa pela memória da aba. */
async function downloadLibraryZipInMemory(groupId: string, ids: string[]): Promise<string> {
  try {
    const response = await api.post<Blob>(lib(groupId, '/zip'), { ids }, { responseType: 'blob' })
    const name = filenameFromDisposition(response.headers['content-disposition'] as string | undefined, 'acervo.zip')
    const url = URL.createObjectURL(response.data)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
    return name
  } catch (error) {
    throw new Error(await blobErrorMessage(error, 'Não foi possível montar o zip. Tente de novo.'))
  }
}

/** "Mandar para o acervo": copia um arquivo da ala (versão, ativação). 409 traz `duplicateOf`. */
export async function sendAssetToLibrary(
  groupId: string,
  body: { assetId: string; folderId?: string | null; companyId?: string | null; title?: string; keepBoth?: boolean },
) {
  const { data } = await api.post<LibraryItemDetail>(lib(groupId, '/items/from-asset'), body)
  return data
}

/** Duplicata devolvida pelo 409 do "Mandar para o acervo". */
export function duplicateFromError(error: unknown): LibraryDuplicate | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) return null
  const dup = (error.response.data as { duplicateOf?: LibraryDuplicate } | undefined)?.duplicateOf
  return dup ?? null
}

/** "Escolher do acervo": versão nova do card copiando os itens (mesmo sha256). */
export async function createVersionFromLibrary(groupId: string, cardId: string, body: { itemIds: string[]; note?: string }) {
  const { data } = await api.post<MarketingCardDetail>(
    mkt(groupId, `/cards/${enc(cardId)}/versions/from-library`),
    body,
  )
  return data
}
