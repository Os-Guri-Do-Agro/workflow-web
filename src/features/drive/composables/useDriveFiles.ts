import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, unref, type MaybeRef } from 'vue'
import driveService, {
  type DriveFilesPage,
  type DriveKind,
  type DriveOverview,
  type DriveScope,
  type DriveSort,
} from '@/service/drive/drive-service'
import { driveKeys } from './useDriveFolders'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'

export function useDriveFiles(params: {
  scope: MaybeRef<DriveScope>
  /** Empresa SELECIONADA na sidebar (null = escopo pessoal). */
  companyId: MaybeRef<string | null>
  folderId: MaybeRef<string | null>
  search: MaybeRef<string>
  kind: MaybeRef<DriveKind | null>
  sort: MaybeRef<DriveSort>
  page: MaybeRef<number>
}) {
  return useQuery<DriveFilesPage>({
    queryKey: computed(() =>
      driveKeys.files(
        unref(params.companyId),
        unref(params.scope),
        unref(params.folderId),
        unref(params.search).trim(),
        unref(params.kind),
        unref(params.sort),
        unref(params.page),
      ),
    ),
    queryFn: () =>
      driveService.listFiles({
        scope: unref(params.scope),
        companyId: unref(params.companyId),
        folderId: unref(params.folderId),
        search: unref(params.search).trim() || undefined,
        kind: unref(params.kind),
        sort: unref(params.sort),
        page: unref(params.page),
      }),
    // Página anterior visível enquanto a próxima carrega (sem "piscar" skeleton).
    placeholderData: (previous) => previous,
    staleTime: 1000 * 15,
  })
}

/**
 * Visão geral do espaço (bytes, famílias, recentes). Query separada da
 * listagem de propósito: ela NÃO depende de pasta, busca, filtro nem página,
 * então navegar entre pastas não refaz a agregação nem faz o hero piscar.
 */
export function useDriveOverview(params: {
  scope: MaybeRef<DriveScope>
  companyId: MaybeRef<string | null>
}) {
  return useQuery<DriveOverview>({
    queryKey: computed(() =>
      driveKeys.overview(unref(params.companyId), unref(params.scope)),
    ),
    queryFn: () =>
      driveService.overview(unref(params.scope), unref(params.companyId)),
    placeholderData: (previous) => previous,
    staleTime: 1000 * 30,
  })
}

export function useDriveFileMutations() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: driveKeys.all })
  // Renomear não muda contadores de pasta: só a listagem de arquivos refaz.
  const invalidateFiles = () =>
    queryClient.invalidateQueries({ queryKey: ['drive', 'files'] })

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      driveService.updateFile(id, { name }),
    onSuccess: () => {
      success('Arquivo renomeado')
      void invalidateFiles()
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível renomear o arquivo')),
  })

  const move = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      driveService.updateFile(id, { folderId }),
    onSuccess: () => {
      success('Arquivo movido')
      void invalidate()
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível mover o arquivo')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => driveService.deleteFile(id),
    onSuccess: () => {
      success('Arquivo excluído')
      void invalidate()
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível excluir o arquivo')),
  })

  return { rename, move, remove, invalidate }
}
