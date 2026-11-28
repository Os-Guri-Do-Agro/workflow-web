import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import {
  createAppToken,
  getAppAttribution,
  getAppDataOverview,
  getAppDataStatus,
  getAppTokens,
  revokeAppToken,
  type AppDataFilter,
} from '@/service/marketing/marketing-app-data'

/**
 * Vue Query da área Dados. Chave sempre `['marketing', g, 'app-data', ...]`
 * (regra 2 da ala): o socket `marketing:changed` (que a entrada do app também
 * dispara) invalida o grupo inteiro e a tela atualiza sozinha.
 */
type Group = MaybeRefOrGetter<string | null>

export const appDataKeys = {
  all: (g: string) => ['marketing', g, 'app-data'] as const,
  tokens: (g: string) => ['marketing', g, 'app-data', 'tokens'] as const,
}

function filterKey(f: AppDataFilter) {
  return { companyId: f.companyId ?? null, days: f.days ?? 30, to: f.to ?? null }
}

export function useAppDataStatus(groupId: Group, companyId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => ['marketing', toValue(groupId) ?? '-', 'app-data', 'status', toValue(companyId)]),
    queryFn: () => getAppDataStatus(toValue(groupId)!, toValue(companyId)),
    enabled: computed(() => !!toValue(groupId)),
    staleTime: 60_000,
  })
}

export function useAppDataOverview(groupId: Group, filter: MaybeRefOrGetter<AppDataFilter>) {
  return useQuery({
    queryKey: computed(() => ['marketing', toValue(groupId) ?? '-', 'app-data', 'overview', filterKey(toValue(filter))]),
    queryFn: () => getAppDataOverview(toValue(groupId)!, toValue(filter)),
    enabled: computed(() => !!toValue(groupId)),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })
}

export function useAppAttribution(groupId: Group, filter: MaybeRefOrGetter<AppDataFilter>, enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    queryKey: computed(() => ['marketing', toValue(groupId) ?? '-', 'app-data', 'attribution', filterKey(toValue(filter))]),
    queryFn: () => getAppAttribution(toValue(groupId)!, toValue(filter)),
    enabled: computed(() => !!toValue(groupId) && toValue(enabled)),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })
}

export function useAppTokens(groupId: Group, enabled: MaybeRefOrGetter<boolean>) {
  return useQuery({
    queryKey: computed(() => appDataKeys.tokens(toValue(groupId) ?? '-')),
    queryFn: () => getAppTokens(toValue(groupId)!),
    enabled: computed(() => !!toValue(groupId) && toValue(enabled)),
  })
}

export function useAppTokenMutations(groupId: Group) {
  const qc = useQueryClient()
  const refresh = () => {
    const g = toValue(groupId)
    if (g) void qc.invalidateQueries({ queryKey: appDataKeys.all(g) })
  }
  const create = useMutation({
    mutationFn: (body: { companyId: string; name: string }) => createAppToken(toValue(groupId)!, body),
    onSuccess: refresh,
  })
  const revoke = useMutation({
    mutationFn: (tokenId: string) => revokeAppToken(toValue(groupId)!, tokenId),
    onSuccess: refresh,
  })
  return { create, revoke }
}
