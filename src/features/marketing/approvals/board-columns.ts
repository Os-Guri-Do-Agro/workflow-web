import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { safeStorage } from '@/utils/safe-storage'
import type { CardStatus } from '../marketing-labels'
import type { Track } from './approvals-meta'

/**
 * Colunas recolhidas do board da Aprovação (pedido do Nicolas em nov/2026:
 * "ruim ficou arrastar tanto").
 *
 * - Coluna vazia vira faixa de 44px. Clicar abre só por agora (não grava).
 * - A coluna final da trilha (Publicado, Impresso e entregue) começa recolhida
 *   mesmo com cards: é o arquivo morto do fluxo e ocupava a largura de uma
 *   coluna de trabalho.
 * - Abrir ou recolher uma coluna COM cards é escolha da pessoa e fica guardada
 *   por pessoa e por trilha, no mesmo padrão das outras preferências da ala
 *   (`safeStorage`, chave `marketing.*`). Filtro e trilha seguem na URL.
 */

/** Coluna final da trilha: começa recolhida mesmo com cards. */
export const TERMINAL_STATUS: Record<Track, CardStatus> = { digital: 'PUBLISHED', print: 'DELIVERED' }

export type ColumnChoice = 'open' | 'closed'
type Choices = Partial<Record<Track, Partial<Record<CardStatus, ColumnChoice>>>>

const KEY = 'marketing.board.columns'
const keyFor = (userId: string | null | undefined) => (userId ? `${KEY}.${userId}` : null)

function read(key: string | null): Choices {
  if (!key) return {}
  try {
    const raw = JSON.parse(safeStorage.getItem(key) ?? '{}') as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: Choices = {}
    for (const track of ['digital', 'print'] as const) {
      const byStatus = (raw as Record<string, unknown>)[track]
      if (!byStatus || typeof byStatus !== 'object') continue
      const clean: Partial<Record<CardStatus, ColumnChoice>> = {}
      for (const [status, value] of Object.entries(byStatus as Record<string, unknown>)) {
        if (value === 'open' || value === 'closed') clean[status as CardStatus] = value
      }
      out[track] = clean
    }
    return out
  } catch {
    return {}
  }
}

/**
 * A coluna aparece recolhida? `peek` = aberta por agora (coluna vazia clicada).
 * Vazia sempre recolhe; com cards vale a escolha da pessoa, senão o padrão
 * (só a final começa recolhida).
 */
export function columnCollapsed(input: {
  status: CardStatus
  count: number
  track: Track
  choice: ColumnChoice | undefined
  peek: boolean
}): boolean {
  if (input.count === 0) return !input.peek
  const choice = input.choice ?? (TERMINAL_STATUS[input.track] === input.status ? 'closed' : 'open')
  return choice === 'closed'
}

/** Escolhas de abrir/recolher da pessoa logada (`userId` reativo: troca de conta troca a chave). */
export function useBoardColumnChoices(userId: MaybeRefOrGetter<string | null | undefined>) {
  const choices = ref<Choices>({})

  watch(
    () => toValue(userId),
    (id) => {
      choices.value = read(keyFor(id))
    },
    { immediate: true },
  )

  function choiceOf(track: Track, status: CardStatus): ColumnChoice | undefined {
    return choices.value[track]?.[status]
  }

  function choose(track: Track, status: CardStatus, value: ColumnChoice) {
    const next: Choices = { ...choices.value, [track]: { ...choices.value[track], [status]: value } }
    choices.value = next
    const key = keyFor(toValue(userId))
    if (key) safeStorage.setItem(key, JSON.stringify(next))
  }

  return { choiceOf, choose }
}
