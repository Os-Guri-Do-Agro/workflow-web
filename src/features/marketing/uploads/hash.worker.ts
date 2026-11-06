/**
 * Worker do hash: lê o arquivo em fatias e calcula o sha256 incremental fora
 * da thread da tela (vídeo de 300 MB não trava a página). Uma mensagem por
 * arquivo; quem chama encerra o worker no fim ou no cancelar.
 *
 * A leitura da PRÓXIMA fatia começa antes de calcular a atual: disco e CPU
 * trabalham ao mesmo tempo, em vez de um esperar o outro.
 *
 * Mensagens: entra `{ file, slice? }`; sai `{ type: 'progress', loaded }`
 * (no máximo a cada 80 ms), `{ type: 'done', hex }` ou `{ type: 'error', message }`.
 */
import { Sha256 } from './sha256'

/** Só o que o worker usa do escopo global (o lib "WebWorker" não está no tsconfig). */
interface WorkerScope {
  onmessage: ((event: MessageEvent<{ file: Blob; slice?: number }>) => void) | null
  postMessage(message: unknown): void
}
const scope = self as unknown as WorkerScope

scope.onmessage = async (event) => {
  const { file } = event.data
  const slice = Math.max(64 * 1024, event.data.slice ?? 8 * 1024 * 1024)
  const read = (offset: number) => file.slice(offset, Math.min(file.size, offset + slice)).arrayBuffer()
  try {
    const hash = new Sha256()
    let last = 0
    let pending: Promise<ArrayBuffer> | null = file.size > 0 ? read(0) : null
    for (let offset = 0; offset < file.size; offset += slice) {
      const bytes = await pending!
      const next = offset + slice
      pending = next < file.size ? read(next) : null
      hash.update(new Uint8Array(bytes))
      const end = Math.min(file.size, next)
      const now = performance.now()
      if (now - last > 80 || end === file.size) {
        scope.postMessage({ type: 'progress', loaded: end })
        last = now
      }
    }
    scope.postMessage({ type: 'done', hex: hash.hex() })
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
