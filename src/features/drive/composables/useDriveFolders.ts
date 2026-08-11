import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, unref, type MaybeRef } from 'vue'
import driveService, {
  type DriveFolder,
  type DriveScope,
} from '@/service/drive/drive-service'
import type { DriveFolderNode } from '@/features/drive/types'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'

/**
 * Chaves SEMPRE prefixadas pela empresa ativa: trocar de empresa não pode
 * servir cache da anterior (AC20 da spec drive-p1).
 */
export const driveKeys = {
  all: ['drive'] as const,
  folders: (companyId: string | null, scope: DriveScope) =>
    ['drive', 'folders', companyId ?? 'none', scope] as const,
  files: (
    companyId: string | null,
    scope: DriveScope,
    folderId: string | null,
    search: string,
    page: number,
  ) =>
    [
      'drive',
      'files',
      companyId ?? 'none',
      scope,
      folderId ?? 'root',
      search,
      page,
    ] as const,
}

/** Lista flat → árvore ordenada por nome, com profundidade para indentação. */
export function buildFolderTree(folders: DriveFolder[]): DriveFolderNode[] {
  const nodes = new Map<string, DriveFolderNode>()
  for (const folder of folders) {
    nodes.set(folder.id, { ...folder, children: [], depth: 0 })
  }
  const roots: DriveFolderNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sortLevel = (level: DriveFolderNode[], depth: number) => {
    level.sort((a, b) => a.name.localeCompare(b.name))
    for (const node of level) {
      node.depth = depth
      sortLevel(node.children, depth + 1)
    }
  }
  sortLevel(roots, 0)
  return roots
}

/** Caminho raiz→pasta (para breadcrumb). Vazio se a pasta não existe na lista. */
export function folderPath(
  folders: DriveFolder[],
  folderId: string | null,
): DriveFolder[] {
  if (!folderId) return []
  const byId = new Map(folders.map((f) => [f.id, f]))
  const path: DriveFolder[] = []
  let cursor = byId.get(folderId)
  // Teto defensivo: dado com ciclo não pode travar a UI num laço infinito.
  for (let depth = 0; cursor && depth < 64; depth++) {
    path.unshift(cursor)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return path
}

export function useDriveFolders(
  scope: MaybeRef<DriveScope>,
  companyId: MaybeRef<string | null>,
  enabled: MaybeRef<boolean> = true,
) {
  return useQuery<DriveFolder[]>({
    queryKey: computed(() =>
      driveKeys.folders(unref(companyId), unref(scope)),
    ),
    queryFn: () => driveService.listFolders(unref(scope)),
    staleTime: 1000 * 30,
    enabled: computed(() => unref(enabled)),
  })
}

export function useDriveFolderMutations() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: driveKeys.all })

  const create = useMutation({
    mutationFn: (data: {
      name: string
      companyId?: string | null
      parentId?: string | null
    }) => driveService.createFolder(data),
    onSuccess: () => {
      success('Pasta criada')
      void invalidate()
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível criar a pasta')),
  })

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      driveService.updateFolder(id, { name }),
    onSuccess: () => {
      success('Pasta renomeada')
      void invalidate()
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível renomear a pasta')),
  })

  const move = useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) =>
      driveService.updateFolder(id, { parentId }),
    onSuccess: () => {
      success('Pasta movida')
      void invalidate()
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível mover a pasta')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => driveService.deleteFolder(id),
    onSuccess: (result) => {
      success(
        result.removedFiles > 0
          ? `Pasta excluída (${result.removedFiles} arquivo(s) removido(s))`
          : 'Pasta excluída',
      )
      void invalidate()
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível excluir a pasta')),
  })

  return { create, rename, move, remove }
}
