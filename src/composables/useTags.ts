import { computed, ref, watch, type Ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import tagService, { type TagWithUsage } from '@/service/tags/tag-service'

/**
 * Catálogo de tags da empresa para o autocomplete.
 *
 * A busca acontece no SERVIDOR e é debounced. Não é preciosismo: como tag nunca
 * é excluída (decisão de produto), o catálogo de uma empresa antiga só cresce,
 * e a ordenação por uso depende de uma contagem que só o banco tem. Filtrar um
 * array carregado inteiro daria a lista errada e ficaria lenta.
 */
export function useTags(companyId: Ref<string | null | undefined>) {
  const queryClient = useQueryClient()
  const term = ref('')
  const debouncedTerm = ref('')

  let timer: number | undefined
  watch(term, (value) => {
    window.clearTimeout(timer)
    // 220ms: curto o bastante para parecer instantâneo enquanto digita e longo
    // o bastante para não disparar uma requisição por tecla.
    timer = window.setTimeout(() => {
      debouncedTerm.value = value
    }, 220)
  })

  const queryKey = computed(() => ['tags', companyId.value, debouncedTerm.value])

  const query = useQuery<TagWithUsage[]>({
    queryKey,
    queryFn: () =>
      tagService.list({
        q: debouncedTerm.value || undefined,
        companyId: companyId.value ?? undefined,
      }),
    enabled: computed(() => !!companyId.value),
    // O catálogo muda pouco e a lista aparece a cada abertura do campo.
    staleTime: 60_000,
    // Mantém a lista anterior na tela enquanto a busca nova volta, em vez de
    // piscar vazio a cada letra.
    placeholderData: (previous) => previous,
  })

  /** Invalida TODA variação de busca: uma tag nova entra em qualquer filtro. */
  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['tags', companyId.value] })
  }

  /**
   * Cria (ou reaproveita) a tag pelo nome. A API é idempotente por nome
   * normalizado, então "Bug", "bug " e "Bùg" devolvem a mesma tag.
   */
  async function createTag(name: string, color?: string): Promise<TagWithUsage> {
    const tag = await tagService.create(name, {
      color,
      companyId: companyId.value ?? undefined,
    })
    invalidate()
    return tag
  }

  async function renameTag(
    id: string,
    data: { name?: string; color?: string },
  ): Promise<TagWithUsage> {
    const tag = await tagService.update(id, data, companyId.value ?? undefined)
    invalidate()
    // O nome da tag aparece dentro das atividades já carregadas; sem isso o
    // chip continuaria com o nome antigo até o próximo refetch.
    void queryClient.invalidateQueries({ queryKey: ['activity'] })
    void queryClient.invalidateQueries({ queryKey: ['boards'] })
    return tag
  }

  return {
    tags: computed(() => query.data.value ?? []),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    term,
    createTag,
    renameTag,
    invalidate,
  }
}
