import { dateOnlyDiffDays } from '@/utils/date'
import { priorityLevel } from './task-meta'

/**
 * Ordem dos cards dentro de cada coluna do board do mês.
 *
 * - `due` ("Entrega", o padrão): prazo crescente, então as atrasadas e as de
 *   hoje ficam no topo e as sem data no fim. Quem decide é `sortByDue`, e o
 *   arraste dentro da coluna não reordena (não haveria o que gravar).
 * - `manual`: a ordem gravada no `position`, que o arraste muda.
 *
 * Vai na URL como `?ordem=manual` (o padrão não aparece) e no "Lembrar
 * filtro", como o "Agrupar".
 */
export type BoardOrder = 'due' | 'manual'

/** O mínimo do card que a ordem de entrega lê. */
export interface DueSortable {
  dueDate?: string | null
  priorityNumber?: number
}

/** Âncora local: com ela, `dateOnlyDiffDays` devolve dias desde 1970-01-01. */
const EPOCH = new Date(1970, 0, 1)

/**
 * Dia do prazo como número (dias desde 1970), ou `null` sem data.
 *
 * É a MESMA leitura do card: `dateOnlyDiffDays` é o que o `dueSignal` usa para
 * escrever "Hoje" e "Atrasada 3d", e ele lê o dia do componente UTC do ISO (a
 * API grava meio-dia UTC, que em Brasília é o mesmo dia). Ler o dia de outro
 * jeito aqui faria um card "Hoje" cair entre os de amanhã. Não depende de
 * "hoje": a ordem dos dias é a mesma em qualquer data e em qualquer fuso.
 */
export function dueDayNumber(dueDate: string | null | undefined): number | null {
  if (!dueDate) return null
  const day = dateOnlyDiffDays(dueDate, EPOCH)
  return Number.isFinite(day) ? day : null
}

interface DueKey {
  day: number | null
  level: number
}

const dueKey = (task: DueSortable): DueKey => ({
  day: dueDayNumber(task.dueDate),
  level: priorityLevel(task.priorityNumber),
})

function compareKeys(a: DueKey, b: DueKey): number {
  if (a.day !== b.day) {
    if (a.day === null) return 1
    if (b.day === null) return -1
    return a.day - b.day
  }
  return b.level - a.level
}

/**
 * Ordem de entrega entre dois cards: o prazo mais cedo primeiro (sem data por
 * último) e, no mesmo dia, a prioridade mais alta (`priorityLevel`: Urgente 4
 * e 5 empatam). `0` = empate; quem desempata é a ordem manual.
 */
export function compareByDue(a: DueSortable, b: DueSortable): number {
  return compareKeys(dueKey(a), dueKey(b))
}

/**
 * A coluna na ordem de entrega. Estável: no empate de dia e prioridade fica a
 * ordem da lista recebida, que é a ordem manual (a API manda a coluna por
 * `position` e, no empate dele, por `createdAt`). Os cards que não têm linha
 * no servidor vêm depois dos reais nessa lista (o otimista da criação, a
 * rotina virtual `rec:*`) e entram pela data deles como qualquer outro.
 *
 * Desempata pelo ÍNDICE da lista, não pelo campo `position` do card: no
 * otimismo (arrastou, o servidor ainda não respondeu) o campo fica velho, e o
 * card pularia de lugar quando o refetch chegasse.
 *
 * Exemplo (hoje = 10):
 *
 *   [F(12) , S(sem data) , H1(10, Baixa) , A(8) , H4(10, Urgente)]
 *   → [A(8) , H4(10) , H1(10) , F(12) , S]
 */
export function sortByDue<T extends DueSortable>(list: readonly T[]): T[] {
  return list
    .map((task, index) => ({ task, index, key: dueKey(task) }))
    .sort((a, b) => compareKeys(a.key, b.key) || a.index - b.index)
    .map((entry) => entry.task)
}

/**
 * Onde um card entra na coluna para ficar no lugar da data dele: quantos cards
 * da coluna INTEIRA (não só a visível com filtro) vêm antes dele na ordem de
 * entrega. Empate conta como antes: quem chega fica depois dos que já estavam
 * no mesmo dia e na mesma prioridade.
 *
 * É o índice que vai para o `PATCH /move`. Numa coluna cuja ordem manual já é
 * a de entrega, o card entra exatamente no lugar dele e o "Manual" abre na
 * ordem de entrega; numa ordem manual diferente, ele entra na posição que a
 * data dá, e o resto da coluna fica como o time deixou. Aplicar o MESMO índice
 * na lista local é o que mantém tela e servidor iguais (nada pula no refetch).
 *
 * `column` é a coluna completa na ordem manual, SEM o card.
 *
 *   dueInsertIndex([A(8), H4(10), F(12)], H1(10, Baixa)) → 2   (depois de H4, antes de F)
 *   dueInsertIndex([A(8), F(12)], S(sem data))           → 2   (fim)
 *   dueInsertIndex([],            X)                     → 0
 */
export function dueInsertIndex(column: readonly DueSortable[], card: DueSortable): number {
  const key = dueKey(card)
  let before = 0
  for (const other of column) if (compareKeys(dueKey(other), key) <= 0) before++
  return before
}

/**
 * Posição de soltura no board com filtro ligado (spec board-tarefas-redesign,
 * risco Alto).
 *
 * O bug: o KanbanBoard só enxerga a lista FILTRADA, então o índice que o
 * Sortable devolve é o da lista visível. O TasksView aplicava esse índice na
 * lista COMPLETA da coluna e mandava o mesmo número para `PATCH /move`. Com
 * "Só minhas" ligado, soltar um card "em 2º" gravava a 2ª posição da coluna
 * inteira, que podia ser acima de três cards escondidos.
 *
 * A correção ancora no vizinho que a pessoa VIU: insere logo depois do card
 * visível anterior (no índice absoluto dele); sem anterior, logo antes do
 * próximo visível. Cards virtuais de rotina (`rec:*`) aparecem na lista visível
 * mas não existem na completa, então são pulados como âncora.
 *
 * Exemplos (A e C escondidos pelo filtro; X é o card arrastado):
 *
 *   resolveDropIndex(['A','B','C','D'], ['B','X','D'], 'X', 1) → 2  (depois de B: A,B,X,C,D)
 *   resolveDropIndex(['A','B','C','D'], ['X','B','D'], 'X', 0) → 1  (antes de B: A,X,B,C,D)
 *   resolveDropIndex(['A','B'],         ['X'],         'X', 0) → 0  (nenhum vizinho: índice visível, limitado)
 *   resolveDropIndex(['A','B'],         ['B','rec:1','X'], 'X', 2) → 2  (pula o virtual e ancora em B)
 *   resolveDropIndex(['A','B'],         ['A','B','X'], 'X', 2) → 2  (sem filtro: igual ao índice visível)
 *
 * `fullIds` é a coluna completa SEM o card arrastado.
 */
export function resolveDropIndex(
  fullIds: readonly string[],
  visibleIds: readonly string[] | null | undefined,
  movedId: string,
  fallback: number,
): number {
  const clamp = (n: number) => Math.max(0, Math.min(n, fullIds.length))
  const at = visibleIds ? visibleIds.indexOf(movedId) : -1
  if (visibleIds && at !== -1) {
    for (let i = at - 1; i >= 0; i--) {
      const j = fullIds.indexOf(visibleIds[i]!)
      if (j !== -1) return j + 1
    }
    for (let i = at + 1; i < visibleIds.length; i++) {
      const j = fullIds.indexOf(visibleIds[i]!)
      if (j !== -1) return j
    }
  }
  return clamp(fallback)
}
