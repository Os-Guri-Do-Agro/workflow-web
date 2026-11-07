import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { hasSession } from '@/composables/useSession'
import {
  createLink,
  deleteLink,
  favoriteLink,
  listLinks,
  revealLink,
  updateLink,
  type LinkInput,
  type MarketingLink,
} from '@/service/marketing/marketing-links'

/**
 * Links de trabalho: a lista vem inteira (por marca) e a busca e a categoria
 * filtram na tela, na hora. A senha NUNCA entra no cache: o `reveal` devolve o
 * valor para quem pediu e ele mora só no componente da linha, por 30 s.
 */
export function useMarketingLinks(opts: {
  groupId: MaybeRefOrGetter<string | null>
  brandId: MaybeRefOrGetter<string | null>
}) {
  const queryClient = useQueryClient()
  const key = computed(
    () => ['marketing', toValue(opts.groupId) ?? '-', 'links', toValue(opts.brandId) ?? 'todas'] as const,
  )

  const query = useQuery({
    queryKey: key,
    queryFn: () => listLinks(toValue(opts.groupId)!, { companyId: toValue(opts.brandId) }),
    enabled: computed(() => hasSession.value && !!toValue(opts.groupId)),
    staleTime: 30_000,
  })

  const groupId = () => {
    const g = toValue(opts.groupId)
    if (!g) throw new Error('Grupo não carregado')
    return g
  }

  function patch(fn: (list: MarketingLink[]) => MarketingLink[]) {
    const current = queryClient.getQueryData<MarketingLink[]>(key.value)
    if (current) queryClient.setQueryData<MarketingLink[]>(key.value, fn(current))
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['marketing', toValue(opts.groupId), 'links'] })

  async function create(input: LinkInput) {
    const link = await createLink(groupId(), input)
    void invalidate()
    return link
  }

  async function update(linkId: string, input: LinkInput) {
    const link = await updateLink(groupId(), linkId, input)
    patch((list) => list.map((l) => (l.id === linkId ? link : l)))
    void invalidate()
    return link
  }

  /** Manda para a lixeira (R2, C6); devolve o `trashed` para o "Desfazer". */
  async function remove(linkId: string) {
    const res = await deleteLink(groupId(), linkId)
    patch((list) => list.filter((l) => l.id !== linkId))
    void invalidate()
    return res?.trashed
  }

  /** Favorito é otimista (volta se a API recusar). */
  async function toggleFavorite(link: MarketingLink) {
    const next = !link.isFavorite
    patch((list) => list.map((l) => (l.id === link.id ? { ...l, isFavorite: next } : l)))
    try {
      await favoriteLink(groupId(), link.id, next)
    } catch (err) {
      patch((list) => list.map((l) => (l.id === link.id ? { ...l, isFavorite: !next } : l)))
      throw err
    }
  }

  function reveal(linkId: string) {
    return revealLink(groupId(), linkId)
  }

  return { query, create, update, remove, toggleFavorite, reveal }
}
