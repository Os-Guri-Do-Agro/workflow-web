/**
 * Card otimista da criação inline (spec board-tarefas-redesign, D5): existe só
 * na tela, do Enter até o `POST /activity` responder. O id `tmp:*` nunca vai ao
 * servidor, não tem chave (`taskKey` devolve null), não arrasta, não abre o
 * painel e fica fora da troca de tarefa por J/K. Quando o POST responde, o card
 * real entra no lugar dele; se falhar, ele some (rollback).
 */
export const PENDING_TASK_PREFIX = 'tmp:'

export function isPendingTaskId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(PENDING_TASK_PREFIX)
}

let sequence = 0

export function newPendingTaskId(): string {
  sequence += 1
  return `${PENDING_TASK_PREFIX}${Date.now().toString(36)}-${sequence}`
}
