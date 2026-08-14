import axios from 'axios'
import api from '../api'

/**
 * Drive de arquivos (spec: docs/specs/2026/q3/q3-2/drive-p1-nativo.md).
 *
 * Escopo segue a convenção do QR: `companyId: null`/ausente = pessoal;
 * preenchido = da empresa. O `x-company-id` da empresa ativa é injetado pelo
 * interceptor do axios e define a empresa da área "company".
 *
 * O storage é PRIVADO: nenhuma URL persistida chega ao front. A listagem já
 * traz `previewUrl` assinada (~1h) para os tipos cuja capa é derivada dos
 * bytes; abrir/baixar pede uma URL fresca em `fileUrl()`.
 */

export type DriveScope = 'personal' | 'company'

/**
 * Espelho do DEFAULT do servidor (`DRIVE_MAX_FILE_BYTES`), que por sua vez é o
 * teto real do storage hoje (50 MB, medido). Serve só para a recusa local de
 * conveniência no dropzone; a regra de verdade é do servidor.
 */
export const DRIVE_MAX_FILE_BYTES_CLIENT = 50 * 1024 * 1024

/**
 * Acima disto o envio vai DIRETO ao storage, sem passar pela API. Abaixo,
 * continua no multipart de sempre: para arquivo pequeno, o caminho direto
 * custaria duas viagens extras (assinar + confirmar) sem ganho nenhum.
 *
 * O valor acompanha `DRIVE_MULTIPART_MAX_BYTES` do servidor — se o cliente
 * mandar um arquivo maior que isso pelo multipart, o servidor recusa com 400.
 */
export const DIRECT_UPLOAD_THRESHOLD_BYTES = 8 * 1024 * 1024

/**
 * Axios sem interceptores, para falar com hosts que NÃO são a nossa API.
 * O cliente do app injeta `Authorization`/`x-company-id` e trata 401 como
 * sessão expirada; nenhuma das duas coisas pode valer para o Supabase.
 */
const rawHttp = axios.create()

export interface DriveOwner {
  id: string
  name: string
}

export interface DriveFolder {
  id: string
  name: string
  companyId: string | null
  ownerId: string | null
  parentId: string | null
  createdAt: string
  updatedAt: string
  owner?: DriveOwner | null
  _count?: { files: number; children: number }
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size: number
  companyId: string | null
  ownerId: string | null
  folderId: string | null
  createdAt: string
  updatedAt: string
  owner: DriveOwner | null
  /**
   * URL assinada (~1h) da FONTE do arquivo, para o cliente derivar a capa.
   * Vem preenchida para imagem e, até 12 MB, para PDF, vídeo, texto, JSON e
   * XML (`needsCoverSource` no backend); `null` nos demais, que usam capa
   * tipográfica. Não é só de imagem: passar isto adiante concede leitura do
   * arquivo pelo prazo da assinatura.
   */
  previewUrl: string | null
}

export interface DriveFilesPage {
  items: DriveFile[]
  total: number
  page: number
  pageSize: number
  /** Contadores da sidebar — ignoram o filtro ativo (padrão QR). */
  counts: {
    personal: number
    companies: Array<{ companyId: string; files: number }>
  }
}

export interface DriveShareLink {
  id: string
  token: string
  revoked: boolean
  expiresAt: string | null
  downloadCount: number
  lastAccessAt: string | null
  createdAt: string
  /** Caminho relativo (`/f/<token>`); a origem é a do próprio front. */
  path: string
}

/** Famílias do filtro por tipo (espelha `drive-kind.ts` da API). */
export type DriveKind = 'image' | 'document' | 'video' | 'audio' | 'archive' | 'other'

export interface DriveOverview {
  files: number
  bytes: number
  /** Teto só para a barra de uso; não é cota que bloqueia upload. */
  quotaBytes: number
  byKind: Record<DriveKind, number>
  recent: DriveFile[]
}

export interface ListDriveFilesParams {
  scope: DriveScope
  /** Empresa alvo quando scope=company (modelo QR: independe da ativa). */
  companyId?: string | null
  /** Pasta atual; null/ausente = raiz do espaço. Ignorado quando há busca. */
  folderId?: string | null
  search?: string
  /** Família de arquivo; como a busca, varre o espaço e ignora a pasta. */
  kind?: DriveKind | null
  sort?: DriveSort
  page?: number
  pageSize?: number
}

export type DriveSort = 'recent' | 'name' | 'size'

const driveService = {
  // ─── Pastas ─────────────────────────────────────────────────────────────────

  async overview(scope: DriveScope, companyId: string | null): Promise<DriveOverview> {
    const { data } = await api.get<DriveOverview>('/drive/overview', {
      params: { scope, companyId: companyId ?? undefined },
    })
    return data
  },

  /** TODAS as pastas visíveis (pessoais + de cada empresa) numa resposta só. */
  async listFolders(): Promise<DriveFolder[]> {
    const { data } = await api.get<DriveFolder[]>('/drive/folders')
    return data
  },

  async createFolder(input: {
    name: string
    companyId?: string | null
    parentId?: string | null
  }): Promise<DriveFolder> {
    const body: Record<string, unknown> = { name: input.name }
    if (input.companyId) body.companyId = input.companyId
    if (input.parentId) body.parentId = input.parentId
    const { data } = await api.post<DriveFolder>('/drive/folders', body)
    return data
  },

  async updateFolder(
    id: string,
    input: { name?: string; parentId?: string | null },
  ): Promise<DriveFolder> {
    const { data } = await api.patch<DriveFolder>(`/drive/folders/${id}`, input)
    return data
  },

  async deleteFolder(
    id: string,
  ): Promise<{ message: string; removedFolders: number; removedFiles: number }> {
    const { data } = await api.delete(`/drive/folders/${id}`)
    return data
  },

  // ─── Arquivos ───────────────────────────────────────────────────────────────

  async listFiles(params: ListDriveFilesParams): Promise<DriveFilesPage> {
    const { data } = await api.get<DriveFilesPage>('/drive/files', {
      params: {
        scope: params.scope,
        companyId: params.companyId ?? undefined,
        folderId: params.folderId ?? undefined,
        search: params.search || undefined,
        kind: params.kind ?? undefined,
        sort: params.sort,
        page: params.page,
        pageSize: params.pageSize,
      },
    })
    return data
  },

  /**
   * Envia um arquivo, escolhendo o caminho pelo tamanho.
   *
   * - Pequeno: multipart pela API (caminho de sempre, uma requisição).
   * - Grande: sobe DIRETO para o storage por URL assinada. O arquivo não passa
   *   pela API, que é o que permite 100 MB sem transformar cada upload em um
   *   buffer do tamanho do arquivo na memória do container.
   */
  async upload(
    file: File,
    input: { companyId?: string | null; folderId?: string | null },
    onProgress?: (percent: number) => void,
  ): Promise<DriveFile> {
    if (file.size > DIRECT_UPLOAD_THRESHOLD_BYTES) {
      // Função solta, não `this.uploadDirect`: o service é um objeto literal e
      // `this` se perde em qualquer desestruturação.
      return uploadDirect(file, input, onProgress)
    }

    const form = new FormData()
    form.append('file', file)
    if (input.companyId) form.append('companyId', input.companyId)
    if (input.folderId) form.append('folderId', input.folderId)

    const { data } = await api.post<DriveFile>('/drive/files', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!onProgress) return
        // Sem `total` (proxy sem content-length), segura em 99 até o servidor
        // responder — barra em 100 com request pendente mente pro usuário.
        if (event.total) {
          onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
        } else {
          onProgress(99)
        }
      },
    })
    return data
  },

  // ─── Links públicos ────────────────────────────────────────────────────────

  async createShare(
    fileId: string,
    payload: { expiresAt?: string | null },
  ): Promise<DriveShareLink> {
    const { data } = await api.post<DriveShareLink>(`/drive/files/${fileId}/share`, payload)
    return data
  },

  async listShares(fileId: string): Promise<DriveShareLink[]> {
    const { data } = await api.get<DriveShareLink[]>(`/drive/files/${fileId}/share`)
    return data
  },

  async revokeShare(fileId: string, linkId: string): Promise<void> {
    await api.delete(`/drive/files/${fileId}/share/${linkId}`)
  },

  // ─── Arquivo: URL, renomear/mover, excluir ─────────────────────────────────

  async fileUrl(id: string): Promise<string> {
    const { data } = await api.get<{ url: string }>(`/drive/files/${id}/url`)
    return data.url
  },

  async updateFile(
    id: string,
    input: { name?: string; folderId?: string | null },
  ): Promise<DriveFile> {
    const { data } = await api.patch<DriveFile>(`/drive/files/${id}`, input)
    return data
  },

  async deleteFile(id: string): Promise<{ message: string }> {
    const { data } = await api.delete(`/drive/files/${id}`)
    return data
  },
}

/**
 * Upload direto: pede a URL assinada, sobe para o Supabase e confirma.
 *
 * O PUT vai num axios CRU (`rawHttp`), sem os interceptores do app: mandar o
 * `Authorization` do nosso JWT para um host de terceiro é vazamento de
 * credencial, e — pior — um 401 vindo do Supabase acionaria o interceptor de
 * sessão expirada e deslogaria o usuário no meio do envio.
 */
async function uploadDirect(
  file: File,
  input: { companyId?: string | null; folderId?: string | null },
  onProgress?: (percent: number) => void,
): Promise<DriveFile> {
  const { data: prepared } = await api.post<{
    fileId: string
    storagePath: string
    signedUrl: string
    token: string
  }>('/drive/files/upload-url', {
    name: file.name,
    size: file.size,
    mimeType: file.type || undefined,
    companyId: input.companyId ?? undefined,
    folderId: input.folderId ?? undefined,
  })

  await rawHttp.put(prepared.signedUrl, file, {
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      // O token vem na própria URL assinada; o header é o que o Supabase
      // exige para aceitar o PUT nela.
      Authorization: `Bearer ${prepared.token}`,
    },
    onUploadProgress: (event) => {
      if (!onProgress) return
      // 98 no fim da transferência: ainda falta a confirmação no servidor, e
      // 100 antes disso mostraria "pronto" para um arquivo ainda não salvo.
      if (event.total) {
        onProgress(Math.min(98, Math.round((event.loaded / event.total) * 98)))
      } else {
        onProgress(90)
      }
    },
  })

  const { data } = await api.post<DriveFile>('/drive/files/confirm', {
    fileId: prepared.fileId,
    storagePath: prepared.storagePath,
    name: file.name,
    mimeType: file.type || undefined,
    companyId: input.companyId ?? undefined,
    folderId: input.folderId ?? undefined,
  })
  onProgress?.(100)
  return data
}

export default driveService
