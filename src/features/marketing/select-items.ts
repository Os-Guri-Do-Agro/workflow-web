/**
 * Apoio aos `AppSelect` da ala Marketing.
 *
 * O `AppSelect` emite `string | number | null | array`; na ala todo valor é
 * texto (id, enum ou '' para "Nenhum"), então o `@update:model-value` passa por
 * `asText`. `selectItems` monta os `{ label, value }` de uma lista, com a opção
 * "vazia" opcional na frente (valor '').
 */

import { ref, watch } from 'vue'

export interface SelectItem {
  label: string
  value: string
}

/** Valor do `AppSelect` como texto ('' quando vier outra coisa). */
export function asText(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Lista de itens do `AppSelect` a partir de uma lista qualquer. */
export function selectItems<T>(
  list: readonly T[],
  value: (item: T) => string,
  label: (item: T) => string,
  empty?: string,
): SelectItem[] {
  const items = list.map((it) => ({ label: label(it), value: value(it) }))
  return empty === undefined ? items : [{ label: empty, value: '' }, ...items]
}

/** Itens a partir de um mapa de rótulos (enum -> texto), na ordem de `keys`. */
export function labelItems<K extends string>(
  keys: readonly K[],
  labels: Record<K, string>,
  empty?: string,
): SelectItem[] {
  return selectItems(keys, (k) => k, (k) => labels[k], empty)
}

/**
 * Valor mostrado por um `AppSelect` que SALVA SOZINHO ao escolher.
 *
 * - `shown` é o que o campo exibe: assim que a pessoa escolhe, já mostra a
 *   escolha (sem esperar a API);
 * - muda sozinho quando o valor gravado (`server`) muda, inclusive pelo tempo
 *   real de outra pessoa;
 * - `revert()` devolve ao valor gravado quando a API recusa.
 *
 * Nunca grava nada por conta própria (nem ao montar, nem ao reabrir): quem
 * salva é o `@update:model-value` do campo, que chama `pick` e a mutação.
 */
export function useSavedSelect(server: () => string) {
  const shown = ref(server())
  watch(server, (v) => {
    shown.value = v
  })
  return {
    shown,
    /** Mostra a escolha e devolve true se ela difere do que está gravado. */
    pick(next: string): boolean {
      shown.value = next
      return next !== server()
    },
    revert() {
      shown.value = server()
    },
  }
}
