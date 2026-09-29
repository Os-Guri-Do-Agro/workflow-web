/**
 * Chave de exibição da tarefa (spec board-tarefas-redesign, D2), sem migration:
 * `<PREFIXO>-<6 últimos caracteres do id, em maiúsculas>`.
 *
 * O front não tem infraestrutura de teste; os exemplos abaixo são o contrato e
 * foram conferidos rodando o arquivo (ver o relatório da fatia S0):
 *
 *   companyKeyPrefix('PetJourney')          → 'PJ'   (camelCase conta como palavra)
 *   companyKeyPrefix('Stack Roads')         → 'SR'
 *   companyKeyPrefix('Nevo')                → 'NE'   (uma palavra: 2 primeiras letras)
 *   companyKeyPrefix('Fluvio')              → 'FL'
 *   companyKeyPrefix('JL Rent a Car')       → 'JRC'  (conectivo "a" não entra)
 *   companyKeyPrefix('Ótica São João')      → 'OSJ'  (sem acento)
 *   companyKeyPrefix('')                    → ''
 *
 *   taskKey({ id: 'cm1x9a0bc000k7q2xm' }, 'PetJourney')  → 'PJ-K7Q2XM'
 *   taskKey({ id: 'cm1x9a0bc000k7q2xm' }, 'Stack Roads') → 'SR-K7Q2XM'
 *   taskKey({ id: 'cm1x9a0bc000k7q2xm' }, '')            → 'K7Q2XM' (empresa ainda não carregou)
 *   taskKey({ id: 'a-12' }, 'PetJourney')                → 'PJ-A12' (id curto: o que houver)
 *   taskKey({ id: 'rec:tpl-1:2026-09-28' }, 'PetJourney') → null (rotina virtual não tem chave)
 *   taskKey({ id: 'tmp:mg1x-1' }, 'PetJourney')          → null (card otimista da criação inline)
 *
 *   matchesTaskKey('PJ-K7Q2XM', 'pj-k7q2xm') → true
 *   matchesTaskKey('PJ-K7Q2XM', 'k7q2xm')    → true
 *   matchesTaskKey('PJ-K7Q2XM', 'k7q2')      → true
 *   matchesTaskKey('PJ-K7Q2XM', 'sr-k7q2')   → false
 *
 * Por que o sufixo do id e não um número por ordem de criação: o sufixo é
 * estável para sempre (não muda ao trocar de mês, ao renomear nem quando alguém
 * exclui outra tarefa). Numerar na leitura renumeraria tudo a cada exclusão e
 * quebraria em silêncio toda referência feita antes. O id é cuid: o fim é
 * aleatório, e numa empresa com 5 mil tarefas a chance de existir algum par
 * com o mesmo sufixo é de ~0,6%. A chave sequencial de verdade é follow-up com
 * migration, e esta continua resolvendo como apelido.
 */
import { isOccurrenceId } from './recurring/recurrence-types'
import { isPendingTaskId } from './pending-task'

const SUFFIX_LENGTH = 6
const MAX_PREFIX = 4

/** Palavras que não viram inicial ("JL Rent a Car" é JRC, não JRAC). */
const CONNECTIVES = new Set(['a', 'o', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'the', 'of', 'and'])

/** Prefixo da empresa: iniciais das palavras; com uma palavra só, as 2 primeiras letras. */
export function companyKeyPrefix(companyName: string | null | undefined): string {
  const plain = (companyName ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // "PetJourney" → "Pet Journey": camelCase separa palavra como espaço.
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  const words = plain
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .filter((w, i, all) => all.length === 1 || !CONNECTIVES.has(w.toLowerCase()))
  if (!words.length) return ''
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return words
    .map((w) => w[0]!)
    .join('')
    .slice(0, MAX_PREFIX)
    .toUpperCase()
}

/** Os 6 últimos caracteres alfanuméricos do id, em maiúsculas. */
export function taskKeySuffix(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, '').slice(-SUFFIX_LENGTH).toUpperCase()
}

/**
 * Chave da tarefa ou subtarefa. `null` para o card virtual de rotina
 * (`rec:<regra>:<data>`) e para o card otimista da criação inline (`tmp:*`):
 * nenhum dos dois tem linha no banco, então não há o que citar.
 */
export function taskKey(
  task: { id: string } | null | undefined,
  companyName: string | null | undefined,
): string | null {
  if (!task?.id || isOccurrenceId(task.id) || isPendingTaskId(task.id)) return null
  const suffix = taskKeySuffix(task.id)
  if (!suffix) return null
  const prefix = companyKeyPrefix(companyName)
  return prefix ? `${prefix}-${suffix}` : suffix
}

/**
 * A busca aceita a chave inteira, só o sufixo ou o começo do sufixo
 * ("PJ-K7Q2XM", "k7q2xm", "k7q2"), sem caixa e sem espaço em volta.
 */
export function matchesTaskKey(key: string | null | undefined, query: string): boolean {
  if (!key) return false
  const q = query.trim().toUpperCase()
  if (!q) return false
  if (key.startsWith(q)) return true
  const suffix = key.includes('-') ? key.slice(key.lastIndexOf('-') + 1) : key
  return suffix.startsWith(q)
}
