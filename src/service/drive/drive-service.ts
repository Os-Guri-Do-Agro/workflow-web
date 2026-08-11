import api from '../api'

/**
 * Drive de arquivos (spec: docs/specs/2026/q3/q3-2/drive-p1-nativo.md).
 *
 * Escopo segue a convenção do QR: `companyId: null`/ausente = pessoal;
 * preenchido = da empresa. O `x-company-id` da empresa ativa é injetado pelo
 * interceptor do axios e define a empresa da área "company".
 *
 * O storage é PRIVADO: nenhuma URL persistida chega ao front. Preview de
 * imagem vem assinado na listagem (`previewUrl`, ~1h); abrir/baixar pede URL
 * fresca em `fileUrl()` (~5min).
 */

export type DriveScope = 'personal' | 'company'

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
  /** Assinada (~1h), só para imagens; null para os demais tipos. */
  previewUrl: string | null
}

export interface DriveFilesPage {
  items: DriveFile[]
  total: number
  page: number
  pageSize: number
  /** Contadores da sidebar — ignoram o filtro ativo (padrão QR). */
  counts: { personal: number; company: number }
}

export interface ListDriveFilesParams {
  scope: DriveScope
  /** Pasta atual; null/ausente = raiz do espaço. Ignorado quando há busca. */
  folderId?: string | null
  search?: string
  page?: number
  pageSize?: number
}

const driveService = {
  // ─── Pastas ─────────────────────────────────────────────────────────────────

  async listFolders(scope: DriveScope): Promise<DriveFolder[]> {
    const { data } = await api.get<DriveFolder[]>('/drive/folders', {
      params: { scope },
    })
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
        folderId: params.folderId ?? undefined,
        search: params.search || undefined,
        page: params.page,
        pageSize: params.pageSize,
      },
    })
    return data
  },

  async upload(
    file: File,
    input: { companyId?: string | null; folderId?: string | null },
    onProgress?: (percent: number) => void,
  ): Promise<DriveFile> {
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

  /** URL assinada fresca (~5min) para abrir/baixar. */
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

export default driveService
