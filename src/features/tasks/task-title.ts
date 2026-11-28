/**
 * Título da tarefa em duas partes (spec board-revisados-sinal-e-dialog, D8).
 *
 * O time escreve títulos com o caminho da área na frente ("App › Parceiro ›
 * Indicados: lista de quem entrou pelo código"). No card, o caminho é contexto
 * e sai numa linha própria, menor e apagada; o assunto vem forte embaixo, e é
 * ele que precisa ser entendido antes de abrir a tarefa.
 */

/** Separador de área no título ("App › Parceiro › Indicados: ..."). */
export const AREA_SEPARATOR = ' › '

/**
 * Separa o prefixo de área do assunto. Só ` › ` conta: `:` e `·` fazem parte
 * do título de muita tarefa ("App: equipe do parceiro", "VET · Protótipo") e
 * cortar ali mudaria o sentido. Sem separador, ou com uma das partes vazia, o
 * título fica inteiro.
 */
export function splitTaskTitle(full: string): { area: string | null; subject: string } {
  const parts = full.split(AREA_SEPARATOR)
  if (parts.length < 2) return { area: null, subject: full }
  const subject = parts.pop()!.trim()
  const area = parts.join(AREA_SEPARATOR).trim()
  if (!subject || !area) return { area: null, subject: full }
  return { area, subject }
}
