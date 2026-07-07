import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, unref, type MaybeRef } from 'vue'
import qrService, { type QrFolder } from '@/service/qr/qr-service'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'

export const qrFolderKeys = {
  all: ['qr-folders'] as const,
  scoped: (companyId?: string | null) =>
    ['qr-folders', companyId ?? 'all'] as const,
}

/** Pastas visíveis (pessoais + das empresas do usuário). */
export function useQrFolders(companyId?: MaybeRef<string | null | undefined>) {
  return useQuery<QrFolder[]>({
    queryKey: computed(() => qrFolderKeys.scoped(unref(companyId) ?? null)),
    queryFn: () => qrService.listFolders(unref(companyId) ?? null),
    staleTime: 1000 * 30,
  })
}

/** Mutations de pasta — criar/renomear/excluir. Excluir exige senha. */
export function useQrFolderMutations() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: qrFolderKeys.all })

  const create = useMutation({
    mutationFn: (data: { name: string; companyId?: string | null }) =>
      qrService.createFolder(data),
    onSuccess: () => {
      success('Pasta criada')
      void invalidate()
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível criar a pasta')),
  })

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      qrService.renameFolder(id, name),
    onSuccess: () => {
      success('Pasta renomeada')
      void invalidate()
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível renomear a pasta')),
  })

  const remove = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      qrService.removeFolder(id, password),
    onSuccess: () => {
      success('Pasta excluída (QRs mantidos)')
      void invalidate()
      // QRs podem ter saído da pasta — recarrega a lista de QR também.
      void queryClient.invalidateQueries({ queryKey: ['qr'] })
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível excluir a pasta')),
  })

  return { create, rename, remove }
}
