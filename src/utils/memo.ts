import { computed } from 'vue'

/**
 * Memo por chave, com invalidação reativa.
 *
 * ## O problema que isto resolve
 *
 * Função chamada de dentro de um `<template>` roda **a cada re-render**. Quando
 * ela ainda constrói um array ou objeto novo, dois custos se somam: o trabalho em
 * si, e o filho re-renderizando porque a identidade da prop mudou. Dentro de um
 * `v-for` isso multiplica pelo número de itens.
 *
 * O padrão aparece bastante neste repo (roadmap por mês, calendário por dia,
 * dashboard por card) e é invisível na leitura: cada linha parece inofensiva.
 *
 * ## Como usar
 *
 * `deps` é lido dentro de um `computed`, então qualquer ref tocada ali vira
 * dependência. Quando qualquer uma muda, o cache inteiro é descartado e a
 * primeira chamada seguinte recalcula. Invalidar demais é seguro (só recalcula);
 * invalidar de menos entregaria dado velho — por isso toque TODAS as fontes que
 * o cálculo lê.
 *
 * ```ts
 * const itensDaLane = memoPorChave(
 *   () => [annualItems.value, activeStatus.value],
 *   (laneId: string) => annualItems.value.filter((i) => i.laneId === laneId),
 * )
 * ```
 */
export function memoPorArg<A, T>(
  deps: () => unknown,
  calcular: (arg: A) => T,
): (arg: A) => T {
  const cache = computed(() => {
    // Leitura das dependências: é o que registra a reatividade.
    deps()
    return new Map<A, T>()
  })

  return (arg: A): T => {
    const mapa = cache.value
    if (mapa.has(arg)) return mapa.get(arg) as T
    const valor = calcular(arg)
    mapa.set(arg, valor)
    return valor
  }
}
