import { useQuery } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { hasSession } from '@/composables/useSession'
import {
  getActivation,
  listActivations,
  type ActivationFilters,
} from '@/service/marketing/marketing-activations'

/** Chaves SEMPRE sob `['marketing', groupId, ...]` (o socket invalida o grupo). */
export const activationKeys = {
  list: (groupId: string, filters: ActivationFilters = {}) =>
    ['marketing', groupId, 'activations', 'list', filters] as const,
  one: (groupId: string, id: string) => ['marketing', groupId, 'activations', 'one', id] as const,
}

export function useActivationsList(
  groupId: MaybeRefOrGetter<string | null>,
  filters: MaybeRefOrGetter<ActivationFilters> = {},
) {
  return useQuery({
    queryKey: computed(() => activationKeys.list(toValue(groupId) ?? '-', toValue(filters))),
    queryFn: () => listActivations(toValue(groupId)!, toValue(filters)),
    enabled: computed(() => hasSession.value && !!toValue(groupId)),
    staleTime: 15_000,
  })
}

export function useActivation(groupId: MaybeRefOrGetter<string | null>, id: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => activationKeys.one(toValue(groupId) ?? '-', toValue(id) ?? '-')),
    queryFn: () => getActivation(toValue(groupId)!, toValue(id)!),
    enabled: computed(() => hasSession.value && !!toValue(groupId) && !!toValue(id)),
    staleTime: 10_000,
    retry: false,
  })
}
