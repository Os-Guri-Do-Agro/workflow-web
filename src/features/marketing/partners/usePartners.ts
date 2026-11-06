import { useQuery } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { hasSession } from '@/composables/useSession'
import { getPartner, listPartners, type PartnerFilters } from '@/service/marketing/marketing-partners'

/**
 * Chaves SEMPRE sob `['marketing', groupId, ...]`: o socket `marketing:changed`
 * invalida o grupo inteiro (ver `useMarketing.ts`).
 */
export const partnerKeys = {
  list: (groupId: string, filters: PartnerFilters = {}) => ['marketing', groupId, 'partners', 'list', filters] as const,
  one: (groupId: string, id: string) => ['marketing', groupId, 'partners', 'one', id] as const,
  contacts: (groupId: string, id: string) => ['marketing', groupId, 'partners', 'contacts', id] as const,
}

export function usePartnersList(
  groupId: MaybeRefOrGetter<string | null>,
  filters: MaybeRefOrGetter<PartnerFilters> = {},
) {
  return useQuery({
    queryKey: computed(() => partnerKeys.list(toValue(groupId) ?? '-', toValue(filters))),
    queryFn: () => listPartners(toValue(groupId)!, toValue(filters)),
    enabled: computed(() => hasSession.value && !!toValue(groupId)),
    staleTime: 30_000,
  })
}

export function usePartner(groupId: MaybeRefOrGetter<string | null>, id: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => partnerKeys.one(toValue(groupId) ?? '-', toValue(id) ?? '-')),
    queryFn: () => getPartner(toValue(groupId)!, toValue(id)!),
    enabled: computed(() => hasSession.value && !!toValue(groupId) && !!toValue(id)),
    staleTime: 15_000,
    retry: false,
  })
}
