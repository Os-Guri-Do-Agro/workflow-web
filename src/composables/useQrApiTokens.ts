import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, unref, type MaybeRef } from 'vue'
import qrService, { type QrApiToken } from '@/service/qr/qr-service'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'

export const qrTokenKeys = {
  all: ['qr-api-tokens'] as const,
  company: (companyId: string) => ['qr-api-tokens', companyId] as const,
}

/** Tokens de API de UMA empresa (ADMIN). Só busca com companyId. */
export function useQrApiTokens(companyId: MaybeRef<string | null | undefined>) {
  return useQuery<QrApiToken[]>({
    queryKey: computed(() => qrTokenKeys.company(unref(companyId) ?? '')),
    queryFn: () => qrService.listTokens(unref(companyId) as string),
    enabled: computed(() => !!unref(companyId)),
    staleTime: 1000 * 30,
  })
}

export function useQrApiTokenMutations(
  companyId: MaybeRef<string | null | undefined>,
) {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: qrTokenKeys.all })

  const create = useMutation({
    mutationFn: (data: { name: string; defaultFolderId?: string | null }) =>
      qrService.createToken(unref(companyId) as string, data),
    onSuccess: () => {
      success('Token criado')
      void invalidate()
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível criar o token')),
  })

  const revoke = useMutation({
    mutationFn: (id: string) =>
      qrService.revokeToken(unref(companyId) as string, id),
    onSuccess: () => {
      success('Token revogado')
      void invalidate()
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível revogar o token')),
  })

  return { create, revoke }
}
