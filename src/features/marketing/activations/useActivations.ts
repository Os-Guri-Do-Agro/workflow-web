import { useInfiniteQuery, useQuery } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { hasSession } from '@/composables/useSession'
import {
  getActivation,
  listActivations,
  listActivationsPage,
  type ActivationFilters,
  type ActivationWhen,
} from '@/service/marketing/marketing-activations'

/** Chaves SEMPRE sob `['marketing', groupId, ...]` (o socket invalida o grupo). */
export const activationKeys = {
  list: (groupId: string, filters: ActivationFilters = {}) =>
    ['marketing', groupId, 'activations', 'list', filters] as const,
  page: (groupId: string, filters: ActivationFilters, when: ActivationWhen) =>
    ['marketing', groupId, 'activations', 'page', when, filters] as const,
  one: (groupId: string, id: string) => ['marketing', groupId, 'activations', 'one', id] as const,
}

/** Lista inteira (até 500): o painel do parceiro, que mostra poucas. */
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

/**
 * Tela de Ativações: uma aba por vez, de 50 em 50, com "Carregar mais" (R1,
 * D12). A contagem das duas abas vem em toda página. O socket invalida o
 * grupo e o Vue Query rebusca as páginas já abertas, na ordem.
 */
export function useActivationsPages(
  groupId: MaybeRefOrGetter<string | null>,
  filters: MaybeRefOrGetter<ActivationFilters>,
  when: MaybeRefOrGetter<ActivationWhen>,
) {
  return useInfiniteQuery({
    queryKey: computed(() =>
      activationKeys.page(toValue(groupId) ?? '-', toValue(filters), toValue(when)),
    ),
    queryFn: ({ pageParam }) =>
      listActivationsPage(toValue(groupId)!, toValue(filters), toValue(when), pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
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
