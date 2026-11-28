/**
 * Estado de módulo que não pode sobreviver a um logout feito por navegação SPA
 * (sem reload): a fila de envio da ala Marketing, os rascunhos de versão, o
 * teto de upload em cache. Quem tem esse estado se registra aqui quando o
 * módulo carrega; o `resetSessionState` chama todos.
 *
 * É um registro (e não um import direto no `session-reset`) de propósito: o
 * `session-reset` está no pacote principal, e importar a fila daqui puxaria o
 * motor de envio inteiro para quem nunca abriu a ala.
 */

type ResetHook = () => void

export interface PendingWork {
  /** Quantos itens ainda estão subindo ou na fila (0 = nada pendente). */
  count(): number
  /** Cancela tudo e espera o servidor saber (com teto de tempo). */
  cancel(): Promise<void>
}

const resetHooks = new Set<ResetHook>()
const pendingWork = new Set<PendingWork>()

export function onSessionReset(fn: ResetHook): () => void {
  resetHooks.add(fn)
  return () => resetHooks.delete(fn)
}

export function runSessionResetHooks(): void {
  for (const fn of [...resetHooks]) {
    try {
      fn()
    } catch (error) {
      console.error('[session] limpeza falhou', error)
    }
  }
}

export function registerPendingWork(work: PendingWork): () => void {
  pendingWork.add(work)
  return () => pendingWork.delete(work)
}

/** Envios (ou outro trabalho em segundo plano) que sair da conta interromperia. */
export function pendingWorkCount(): number {
  let n = 0
  for (const w of pendingWork) {
    try {
      n += w.count()
    } catch {
      // quem não sabe contar não segura o logout
    }
  }
  return n
}

/** Cancela o que está pendente antes de sair, ainda com a sessão válida (o servidor apaga o que ficou pela metade). */
export async function cancelPendingWork(): Promise<void> {
  await Promise.allSettled([...pendingWork].map((w) => w.cancel()))
}
