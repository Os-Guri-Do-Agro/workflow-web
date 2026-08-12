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
 * Espelho do DEFAULT do servidor (`DRIVE_MAX_FILE_BYTES`). Serve só para a
 * recusa local de conveniência no dropzone; a regra de verdade é do servidor.
 * Se a env de produção mudar, expor o limite efetivo por endpoint de config é
 * o follow-up registrado na spec.
 */
export const DRIVE_MAX_FILE_BYTES_CLIENT = 25 * 1024 * 1024

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
export type DriveKind =
  | 'image'
  | 'document'
  | 'video'
  | 'audio'
  | 'archive'
  | 'other'

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

  async overview(
    scope: DriveScope,
    companyId: string | null,
  ): Promise<DriveOverview> {
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
  // ─── Links públicos ────────────────────────────────────────────────────────

  async createShare(
    fileId: string,
    payload: { expiresAt?: string | null },
  ): Promise<DriveShareLink> {
    const { data } = await api.post<DriveShareLink>(
      `/drive/files/${fileId}/share`,
      payload,
    )
    return data
  },

  async listShares(fileId: string): Promise<DriveShareLink[]> {
    const { data } = await api.get<DriveShareLink[]>(
      `/drive/files/${fileId}/share`,
    )
    return data
  },

  async revokeShare(fileId: string, linkId: string): Promise<void> {
    await api.delete(`/drive/files/${fileId}/share/${linkId}`)
  },

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
