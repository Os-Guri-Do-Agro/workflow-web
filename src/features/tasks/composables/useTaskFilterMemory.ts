/**
 * Memória do filtro do board — "lembrar meu recorte".
 *
 * Filtro de board é caro de remontar: quem trabalha sempre no mesmo responsável
 * ou nas mesmas tags refaz a mesma seleção toda vez que abre a tela. Mas
 * persistir filtro por padrão é pior que não persistir — a pessoa volta dias
 * depois, vê meia dúzia de cards e conclui que o time parou de trabalhar, sem
 * perceber que existe um recorte ligado. Por isso a memória é **explícita**:
 * só guarda quando alguém pediu, com um botão que fica à vista junto do filtro.
 *
 * A presença do registro no storage É o estado ligado — não existe um `enabled`
 * separado para os dois saírem de sincronia. Desligar apaga a chave.
 *
 * Escopo por EMPRESA: tag e responsável são de uma empresa só, e restaurar o
 * slug `financeiro` da empresa A dentro da empresa B filtraria para o vazio, com
 * a tela dizendo "nenhuma atividade" sem motivo aparente.
 */
import { ref, watch, type Ref } from 'vue'
import { safeStorage } from '@/utils/safe-storage'

/** `v1`: formato de UI, descartável. Mudou o shape, o registro velho é ignorado. */
const STORAGE_PREFIX = 'workflow:tasks-filter:v1:'

export interface TaskFilterRefs {
  user: Ref<string>
  priority: Ref<number | null>
  status: Ref<string | null>
  tags: Ref<string[]>
}

interface StoredFilter {
  user: string
  priority: number | null
  status: string | null
  tags: string[]
}

function read(companyId: string): StoredFilter | null {
  const raw = safeStorage.getItem(STORAGE_PREFIX + companyId)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredFilter>
    return {
      user: typeof parsed.user === 'string' ? parsed.user : '',
      priority: typeof parsed.priority === 'number' ? parsed.priority : null,
      status: typeof parsed.status === 'string' ? parsed.status : null,
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === 'string') : [],
    }
  } catch {
    // Registro corrompido não pode impedir o board de abrir: vale como "não
    // tinha nada guardado", e a próxima escrita conserta.
    return null
  }
}

export function useTaskFilterMemory(
  companyId: Ref<string>,
  filters: TaskFilterRefs,
  options: {
    /**
     * `true` quando a URL trouxe `?tags=`.
     *
     * Link compartilhado GANHA do que está guardado: quem abriu "me manda o
     * board só do CMS" quer ver o CMS, não o recorte que essa pessoa deixou
     * ligado semana passada.
     */
    urlHasTags: () => boolean
  },
) {
  const remember = ref(false)

  function snapshot(): StoredFilter {
    return {
      user: filters.user.value,
      priority: filters.priority.value,
      // Guardado por simetria com `clearFilters`: hoje nenhuma UI escreve neste
      // filtro, mas se um dia escrever a memória já funciona.
      status: filters.status.value,
      tags: [...filters.tags.value],
    }
  }

  function persist(): void {
    if (!companyId.value) return
    safeStorage.setItem(STORAGE_PREFIX + companyId.value, JSON.stringify(snapshot()))
  }

  /** Liga ou desliga a memória. Desligar apaga o registro; NÃO limpa a tela — */
  /* quem chama decide isso, para reusar o `clearFilters` que o botão já usa. */
  function setRemember(value: boolean): void {
    remember.value = value
    if (!companyId.value) return
    if (value) persist()
    else safeStorage.removeItem(STORAGE_PREFIX + companyId.value)
  }

  watch(
    companyId,
    (id) => {
      const saved = id ? read(id) : null
      remember.value = !!saved
      if (!saved) return
      filters.user.value = saved.user
      filters.priority.value = saved.priority
      filters.status.value = saved.status
      // Sem registro de tag NÃO significa limpar: pode ser um link compartilhado
      // ou a primeira visita, e apagar a query da URL seria roubar o recorte que
      // a pessoa acabou de abrir.
      if (!options.urlHasTags()) filters.tags.value = [...saved.tags]
    },
    { immediate: true },
  )

  // Toda mudança de filtro regrava, inclusive "limpar filtros": o registro é o
  // ÚLTIMO recorte, e um limpar que não fosse gravado ressuscitaria o filtro
  // antigo no próximo carregamento.
  watch(
    [filters.user, filters.priority, filters.status, filters.tags],
    () => {
      if (remember.value) persist()
    },
    { deep: true },
  )

  return { remember, setRemember }
}
