/**
 * Seleção múltipla da vista Lista (spec board-tarefas-redesign, D11).
 *
 * Três gestos, os mesmos do Linear e do Jira:
 * - clique no checkbox, Ctrl/Cmd+clique na linha e X alternam UMA linha;
 * - Shift (clique ou X) soma o intervalo entre a âncora e a linha, na ordem
 *   que a pessoa VÊ (grupos abertos, filtro aplicado);
 * - Esc limpa.
 *
 * Quem decide o que é selecionável é o chamador: a ordem visível já vem sem as
 * rotinas virtuais (`rec:*`), que não têm linha no banco e não podem receber
 * edição em massa sem materializar antes.
 *
 * A seleção é um `Set` trocado inteiro a cada mudança (`shallowRef`): com 200
 * linhas, cada linha consulta `has(id)` em O(1) e só um valor é observado.
 */
import { computed, ref, shallowRef, watch, type Ref } from 'vue'

export function useTaskSelection(opts: {
  /** Ids selecionáveis na ordem visível. É por ela que o Shift monta o intervalo. */
  order: Ref<readonly string[]>
  /**
   * Ids que ainda existem na lista (filtrada, incluindo grupos recolhidos). O
   * que sai dela (filtro, exclusão, troca de mês, refetch) sai da seleção: a
   * barra de massa nunca age sobre uma tarefa que a pessoa não está vendo.
   */
  available: Ref<ReadonlySet<string>>
}) {
  const selected = shallowRef<ReadonlySet<string>>(new Set())
  /** Última linha alternada. Âncora do intervalo por Shift. */
  const anchor = ref<string | null>(null)

  const count = computed(() => selected.value.size)
  const isSelected = (id: string) => selected.value.has(id)

  function toggle(id: string) {
    const next = new Set(selected.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selected.value = next
    anchor.value = id
  }

  /**
   * Soma à seleção tudo entre a âncora e `id` (inclusive), na ordem visível.
   * Sem âncora à vista (primeiro gesto, ou a âncora saiu pelo filtro), vale
   * como um toggle simples: é o que a pessoa espera do primeiro Shift+clique.
   */
  function selectRange(id: string) {
    const order = opts.order.value
    const from = anchor.value ? order.indexOf(anchor.value) : -1
    const to = order.indexOf(id)
    if (from === -1 || to === -1) {
      toggle(id)
      return
    }
    const [start, end] = from < to ? [from, to] : [to, from]
    const next = new Set(selected.value)
    for (const rowId of order.slice(start, end + 1)) next.add(rowId)
    selected.value = next
    anchor.value = id
  }

  /**
   * Troca a seleção inteira (ex.: depois de uma falha, ficam só as que
   * falharam). Só entra o que ainda está na lista: um id que já saiu (excluído
   * por outra pessoa, levado para outro mês) virava seleção fantasma, com a
   * barra contando uma tarefa que ninguém vê. A poda do `watch` abaixo não
   * pegava esse caso, porque a lista já tinha mudado antes do `set`.
   */
  function set(ids: Iterable<string>) {
    const available = opts.available.value
    selected.value = new Set([...ids].filter((id) => available.has(id)))
  }

  /** Tira da seleção as que já foram resolvidas, sem mexer no resto. */
  function remove(ids: Iterable<string>) {
    const next = new Set(selected.value)
    let changed = false
    for (const id of ids) changed = next.delete(id) || changed
    if (changed) selected.value = next
  }

  function clear() {
    if (selected.value.size) selected.value = new Set()
    anchor.value = null
  }

  watch(opts.available, (available) => {
    let changed = false
    const next = new Set<string>()
    for (const id of selected.value) {
      if (available.has(id)) next.add(id)
      else changed = true
    }
    if (changed) selected.value = next
    if (anchor.value && !available.has(anchor.value)) anchor.value = null
  })

  return { selected, count, isSelected, toggle, selectRange, set, remove, clear }
}

export type TaskSelection = ReturnType<typeof useTaskSelection>
