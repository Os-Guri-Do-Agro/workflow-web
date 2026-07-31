import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import publicAccessService, {
  type ApiTokenScope,
  type PublicAccessList,
} from '@/service/public-access/public-access-service'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'

export const publicAccessKeys = {
  tokens: ['public-access', 'tokens'] as const,
}

/** Tokens de TODAS as empresas onde sou ADMIN (a listagem da página). */
export function usePublicAccessTokens() {
  return useQuery<PublicAccessList>({
    queryKey: publicAccessKeys.tokens,
    queryFn: () => publicAccessService.list(),
    staleTime: 1000 * 30,
  })
}

export function usePublicAccessMutations() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: publicAccessKeys.tokens })

  const create = useMutation({
    mutationFn: (vars: {
      companyId: string
      name: string
      scope?: ApiTokenScope | null
      defaultFolderId?: string | null
    }) =>
      publicAccessService.create(vars.companyId, {
        name: vars.name,
        scope: vars.scope ?? null,
        defaultFolderId: vars.defaultFolderId ?? null,
      }),
    onSuccess: () => {
      success('Token criado')
      invalidate()
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível criar o token')),
  })

  const revoke = useMutation({
    mutationFn: (vars: { companyId: string; id: string }) =>
      publicAccessService.revoke(vars.companyId, vars.id),
    onSuccess: () => {
      success('Token revogado')
      invalidate()
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível revogar o token')),
  })

  return { create, revoke }
}
