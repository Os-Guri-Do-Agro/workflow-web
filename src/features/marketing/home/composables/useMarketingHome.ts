import { useQuery } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { hasSession } from '@/composables/useSession'
import { getMarketingHome } from '@/service/marketing/marketing-home'

/** Painel da ala: uma chamada só (`GET /home`), por marca do filtro. */
export function useMarketingHome(opts: {
  groupId: MaybeRefOrGetter<string | null>
  brandId: MaybeRefOrGetter<string | null>
}) {
  return useQuery({
    queryKey: computed(() => ['marketing', toValue(opts.groupId) ?? '-', 'home', toValue(opts.brandId) ?? 'todas'] as const),
    queryFn: () => getMarketingHome(toValue(opts.groupId)!, toValue(opts.brandId)),
    enabled: computed(() => hasSession.value && !!toValue(opts.groupId)),
    staleTime: 30_000,
    // O "atrasado" e o "próximos 3 dias" dependem do relógio: revê a cada 5 min.
    refetchInterval: 5 * 60_000,
  })
}
