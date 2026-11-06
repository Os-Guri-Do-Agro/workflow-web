import { useInfiniteQuery, useQuery, type InfiniteData, type QueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { hasSession } from '@/composables/useSession'
import {
  getActivation,
  listActivations,
  listActivationsPage,
  type ActivationFilters,
  type ActivationPage,
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

/** A chave é de uma lista paginada de ativações deste grupo? */
export function isActivationPagesKey(key: readonly unknown[], groupId: string): boolean {
  return key[0] === 'marketing' && key[1] === groupId && key[2] === 'activations' && key[3] === 'page'
}

/** Até aqui refazer tudo é barato (2 pedidos); acima disso o evento só refaz a primeira página. */
const FULL_REFETCH_MAX_PAGES = 2

/**
 * Chamado pelo socket `marketing:changed` no lugar da invalidação cega do grupo
 * para as listas paginadas de Ativações. Invalidar um `useInfiniteQuery` refaz,
 * em sequência, TODAS as páginas já abertas (até 8 pedidos a cada evento, e
 * cada ativação criada por alguém dispara um).
 *
 * - Lista fora da tela: só fica marcada como velha (refaz inteira ao voltar).
 * - Na tela com até 2 páginas: refaz tudo, como sempre.
 * - Na tela com mais: refaz SÓ a primeira (onde aparece o que é novo ou mudou
 *   de dia) e troca no cache, mantendo as outras. O cursor é por posição
 *   (keyset): se o `nextCursor` da página nova é o mesmo da antiga, o limite
 *   entre a página 1 e a 2 não mexeu e as demais continuam valendo; se mudou
 *   (entrou, saiu ou andou item na fronteira), refaz tudo para não perder nem
 *   duplicar linha. Edição de uma ativação nas páginas fundas só aparece no
 *   próximo refresh completo (foco na janela depois de 15s, ou "voltar à aba").
 */
export async function refreshActivationPages(queryClient: QueryClient, groupId: string): Promise<void> {
  const queries = queryClient.getQueryCache().findAll({
    predicate: (q) => isActivationPagesKey(q.queryKey, groupId),
  })
  await Promise.all(
    queries.map(async (query) => {
      const full = () => queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true })
      if (!query.isActive()) {
        query.invalidate()
        return
      }
      const old = query.state.data as InfiniteData<ActivationPage, string | null> | undefined
      if (!old || old.pages.length <= FULL_REFETCH_MAX_PAGES || query.state.fetchStatus === 'fetching') {
        await full()
        return
      }
      const [, , , , when, filters] = query.queryKey as unknown as [
        string,
        string,
        string,
        string,
        ActivationWhen,
        ActivationFilters,
      ]
      let fresh: ActivationPage
      try {
        fresh = await listActivationsPage(groupId, filters, when)
      } catch {
        return // sem rede agora: a lista que está na tela continua valendo
      }
      // Durante o pedido a lista pode ter mudado (alguém carregou mais, trocou de aba).
      const current = queryClient.getQueryData<InfiniteData<ActivationPage, string | null>>(query.queryKey)
      const boundary = old.pages[0]!.nextCursor
      if (!current || current.pages[0]?.nextCursor !== boundary || fresh.nextCursor !== boundary) {
        await full()
        return
      }
      queryClient.setQueryData<InfiniteData<ActivationPage, string | null>>(query.queryKey, {
        ...current,
        // A contagem das abas sai da última página (a mais nova): todas levam a fresca.
        pages: current.pages.map((p, i) => (i === 0 ? fresh : { ...p, counts: fresh.counts })),
      })
    }),
  )
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
 * D12). A contagem das duas abas vem em toda página. O socket NÃO invalida
 * esta lista pelo caminho comum (refaria todas as páginas abertas): usa
 * `refreshActivationPages`, que refaz só a primeira.
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
