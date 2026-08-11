export type {
  DriveFile,
  DriveFilesPage,
  DriveFolder,
  DriveOwner,
  DriveScope,
  ListDriveFilesParams,
} from '@/service/drive/drive-service'

import type { DriveFolder } from '@/service/drive/drive-service'

/** Nó da árvore de pastas da sidebar (montada no front a partir da lista flat). */
export interface DriveFolderNode extends DriveFolder {
  children: DriveFolderNode[]
  depth: number
}

/**
 * Seção de empresa na sidebar (modelo QR): todas as empresas do usuário
 * aparecem, independentemente da empresa ativa do topo.
 */
export interface DriveCompanySection {
  id: string
  name: string
  /** ADMIN nesta empresa (gerencia pastas e qualquer arquivo dela). */
  canManage: boolean
  count: number
  tree: DriveFolderNode[]
}

/** Item da fila de upload do dropzone. */
export interface UploadQueueItem {
  key: string
  name: string
  size: number
  percent: number
  error: string | null
  file: File
}
