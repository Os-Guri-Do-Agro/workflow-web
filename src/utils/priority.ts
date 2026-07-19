/**
 * Coerção de prioridade vinda de formulário/API.
 *
 * O idioma `Number(x) || fallback` é uma armadilha aqui: a prioridade mais alta
 * é `0` (P0, crítica) e `0` é falsy, então toda gravação rebaixava a tarefa em
 * silêncio. Só caímos no fallback quando o valor realmente não é numérico.
 */
export function normalizePriority(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
