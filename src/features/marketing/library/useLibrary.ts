import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/vue-query'
import axios from 'axios'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { hasSession } from '@/composables/useSession'
import {
  getLibraryFolders,
  getLibraryItem,
  getLibraryItems,
  getLibraryTags,
  isLibraryUnavailable,
  libraryKeys,
  type LibraryFilters,
} from '@/service/marketing/marketing-library'

/**
 * Consultas do Acervo. Chaves sob `['marketing', g, 'library', ...]`: o
 * `marketing:changed` do layout invalida o grupo inteiro, então outra pessoa
 * subindo, movendo ou apagando aparece aqui sem recarregar.
 *
 * "Indisponível" (503, migration da R1 pendente) não é erro de rede: não
 * adianta repetir, e a tela mostra a frase própria.
 */
const retry = (count: number, error: unknown) => {
  if (isLibraryUnavailable(error)) return false
  // 4xx (não existe, não é seu, recusado) não melhora tentando de novo.
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  if (status && status >= 400 && status < 500) return false
  return count < 2
}

export function useLibraryTree(groupId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => libraryKeys.folders(toValue(groupId) ?? '-')),
    queryFn: () => getLibraryFolders(toValue(groupId)!),
    enabled: computed(() => hasSession.value && !!toValue(groupId)),
    staleTime: 30_000,
    retry,
  })
}

export function useLibraryItems(
  groupId: MaybeRefOrGetter<string | null>,
  filters: MaybeRefOrGetter<LibraryFilters>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  return useInfiniteQuery({
    queryKey: computed(() => libraryKeys.items(toValue(groupId) ?? '-', toValue(filters))),
    queryFn: ({ pageParam }) => getLibraryItems(toValue(groupId)!, toValue(filters), pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: computed(() => hasSession.value && !!toValue(groupId) && toValue(enabled)),
    staleTime: 15_000,
    retry,
  })
}

export function useLibraryItem(groupId: MaybeRefOrGetter<string | null>, itemId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => libraryKeys.item(toValue(groupId) ?? '-', toValue(itemId) ?? '-')),
    queryFn: () => getLibraryItem(toValue(groupId)!, toValue(itemId)!),
    enabled: computed(() => hasSession.value && !!toValue(groupId) && !!toValue(itemId)),
    staleTime: 15_000,
    retry,
  })
}

export function useLibraryTags(groupId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => libraryKeys.tags(toValue(groupId) ?? '-')),
    queryFn: () => getLibraryTags(toValue(groupId)!),
    enabled: computed(() => hasSession.value && !!toValue(groupId)),
    staleTime: 60_000,
    retry,
  })
}

/** Depois de qualquer escrita: árvore, lista, detalhe e etiquetas de novo. */
export function useLibraryRefresh(groupId: MaybeRefOrGetter<string | null>) {
  const client = useQueryClient()
  return () => {
    const g = toValue(groupId)
    if (g) void client.invalidateQueries({ queryKey: libraryKeys.all(g) })
  }
}
