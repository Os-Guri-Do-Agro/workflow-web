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
