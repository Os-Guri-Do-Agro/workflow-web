/**
 * Memória do filtro do board — "lembrar meu recorte".
 *
 * Filtro de board é caro de remontar: quem trabalha sempre nas mesmas pessoas
 * ou nas mesmas tags refaz a mesma seleção toda vez que abre a tela. Mas
 * persistir filtro por padrão é pior que não persistir — a pessoa volta dias
 * depois, vê meia dúzia de cards e conclui que o time parou de trabalhar, sem
 * perceber que existe um recorte ligado. Por isso a memória é **explícita**:
 * só guarda quando alguém pediu, pelo botão "Lembrar filtro" da toolbar.
 *
 * A presença do registro no storage É o estado ligado — não existe um `enabled`
 * separado para os dois saírem de sincronia. Desligar apaga a chave.
 *
 * Escopo por EMPRESA: tag e pessoa são de uma empresa só, e restaurar o slug
 * `financeiro` da empresa A dentro da empresa B filtraria para o vazio, com a
 * tela dizendo "nenhuma tarefa" sem motivo aparente.
 *
 * A busca por texto NÃO é lembrada: é pergunta do momento ("cadê a do Pix?"),
 * e voltar amanhã com o board filtrado por "pix" seria o board vazio de novo.
 *
 * O agrupamento ("Agrupar: Pessoa") entra junto: quem olha o board sempre por
 * pessoa não quer religar isso a cada visita. Registro sem o campo vale "Nenhum".
 */
import { ref, watch, type Ref } from 'vue'
import { safeStorage } from '@/utils/safe-storage'

/**
 * `v1` continua valendo: o registro antigo (`user` por nome, `priority` único)
 * é lido e convertido; a próxima gravação já sai no formato novo.
 */
const STORAGE_PREFIX = 'workflow:tasks-filter:v1:'

/** `person` = linhas por responsável (spec board-tarefas-redesign, D12). */
export type BoardGrouping = 'none' | 'person'

export interface TaskFilterRefs {
  /** Pessoas (id, ou nome quando o card só traz o nome). Combinam por OU. */
  people: Ref<string[]>
  /** Níveis de prioridade (0 a 4). Combinam por OU. */
  priorities: Ref<number[]>
  /** Slugs. Combinam por E. */
  tags: Ref<string[]>
  mine: Ref<boolean>
  late: Ref<boolean>
  recent: Ref<boolean>
  nobody: Ref<boolean>
  group: Ref<BoardGrouping>
}

interface StoredFilter {
  people: string[]
  priorities: number[]
  tags: string[]
  mine: boolean
  late: boolean
  recent: boolean
  nobody: boolean
  group: BoardGrouping
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && !!s) : []

function read(companyId: string): StoredFilter | null {
  const raw = safeStorage.getItem(STORAGE_PREFIX + companyId)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // Formato antigo: um responsável (por nome) e uma prioridade.
    const legacyUser = typeof parsed.user === 'string' && parsed.user ? [parsed.user] : []
    const legacyPriority = typeof parsed.priority === 'number' ? [parsed.priority] : []
    const priorities = Array.isArray(parsed.priorities)
      ? parsed.priorities.filter((n): n is number => typeof n === 'number')
      : legacyPriority
    return {
      people: Array.isArray(parsed.people) ? strings(parsed.people) : legacyUser,
      // O registro antigo guardava o número cru (0 a 5); 5 é o mesmo nível de 4.
      priorities: [...new Set(priorities.map((n) => Math.max(0, Math.min(4, Math.floor(n)))))],
      tags: strings(parsed.tags),
      mine: parsed.mine === true,
      late: parsed.late === true,
      recent: parsed.recent === true,
      nobody: parsed.nobody === true,
      group: parsed.group === 'person' ? 'person' : 'none',
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
     * `true` quando a URL já trouxe algum filtro.
     *
     * Link compartilhado GANHA do que está guardado: quem abriu "me manda o
     * board só do CMS" quer ver o CMS, não o recorte que essa pessoa deixou
     * ligado semana passada.
     */
    urlHasFilters: () => boolean
  },
) {
  const remember = ref(false)

  function snapshot(): StoredFilter {
    return {
      people: [...filters.people.value],
      priorities: [...filters.priorities.value],
      tags: [...filters.tags.value],
      mine: filters.mine.value,
      late: filters.late.value,
      recent: filters.recent.value,
      nobody: filters.nobody.value,
      group: filters.group.value,
    }
  }

  function persist(): void {
    if (!companyId.value) return
    safeStorage.setItem(STORAGE_PREFIX + companyId.value, JSON.stringify(snapshot()))
  }

  /** Liga ou desliga a memória. Desligar apaga o registro; NÃO limpa a tela — */
  /* quem chama decide isso, para reusar o `clear` que o botão já usa. */
  function setRemember(value: boolean): void {
    remember.value = value
    if (!companyId.value) return
    if (value) persist()
    else safeStorage.removeItem(STORAGE_PREFIX + companyId.value)
  }

  function apply(saved: StoredFilter): void {
    filters.people.value = saved.people
    filters.priorities.value = saved.priorities
    filters.tags.value = saved.tags
    filters.mine.value = saved.mine
    filters.late.value = saved.late
    filters.recent.value = saved.recent
    filters.nobody.value = saved.nobody
    filters.group.value = saved.group
  }

  /**
   * Põe na tela o recorte guardado desta empresa. Devolve `false` quando não há
   * registro (memória desligada). É o que a troca de mês por um link sem filtro
   * (o menu lateral) usa: a view é a mesma, e sem isto a URL nova zerava os
   * filtros e o "Lembrar filtro" gravava o zerado por cima do que estava guardado.
   */
  function restore(): boolean {
    const saved = companyId.value ? read(companyId.value) : null
    if (!saved) return false
    apply(saved)
    return true
  }

  watch(
    companyId,
    (id) => {
      const saved = id ? read(id) : null
      remember.value = !!saved
      // Sem registro NÃO significa limpar: pode ser um link compartilhado ou a
      // primeira visita, e apagar a query da URL seria roubar o recorte que a
      // pessoa acabou de abrir.
      if (!saved || options.urlHasFilters()) return
      apply(saved)
    },
    { immediate: true },
  )

  // Toda mudança de filtro regrava, inclusive "limpar filtros": o registro é o
  // ÚLTIMO recorte, e um limpar que não fosse gravado ressuscitaria o filtro
  // antigo no próximo carregamento.
  watch(
    [
      filters.people,
      filters.priorities,
      filters.tags,
      filters.mine,
      filters.late,
      filters.recent,
      filters.nobody,
      filters.group,
    ],
    () => {
      if (remember.value) persist()
    },
    { deep: true },
  )

  return { remember, setRemember, restore }
}
