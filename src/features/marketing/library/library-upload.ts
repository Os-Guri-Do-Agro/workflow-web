/**
 * Adaptador de envio do Acervo.
 *
 * HOJE: cada arquivo sobe pelo `uploadMarketingFile` da fundação (sha256 no
 * navegador, PUT direto no storage, confirm), até 3 ao mesmo tempo, com
 * progresso por arquivo. O ticket vem de `POST library/uploads` (que avisa
 * duplicata e recria a subpasta do `relativePath`) e, no fim, `POST
 * library/items` cria o item. A fila mora no módulo (`libraryUploads`), então
 * sair da tela não cancela o envio.
 *
 * TROCA PELA FILA GLOBAL DA ALA (R1-B, bandeja "Envios"): só o miolo de
 * `runTask` muda. Hoje ele chama
 *     uploadMarketingFile(groupId, file, requestTicket, onProgress)
 * e depois `finishTask`. Com o motor do R1-B, troque essa chamada pelo
 * enfileirar dele passando O MESMO `requestTicket` (que já resolve duplicata,
 * subpasta e "Manter os dois") e chame `finishTask(task, asset)` quando ele
 * confirmar o arquivo. Assinatura pública (`enqueueLibraryUploads`), ganchos,
 * diálogo de duplicata e criação do item ficam iguais. Aí o estado
 * `libraryUploads` e o aviso de aba fechando podem sair (a bandeja faz).
 *
 * O que este adaptador NÃO faz (fica para o motor do R1-B): hash fora da
 * thread da tela, envio retomável em partes, cancelar no meio de um arquivo.
 * Dá para tirar da fila o que ainda não começou e tentar de novo o que falhou.
 */
import { reactive } from 'vue'
import { getApiErrorMessage } from '@/service/api'
import { uploadMarketingFile, type MarketingUploadTicket } from '@/service/marketing/marketing-core'
import {
  createLibraryItem,
  requestLibraryUploads,
  type LibraryDuplicate,
  type LibraryItemDetail,
} from '@/service/marketing/marketing-library'

export interface LibraryUploadEntry {
  file: File
  relativePath?: string
}

export interface LibraryUploadDest {
  /** null = Geral do grupo */
  companyId: string | null
  folderId: string | null
}

export type LibraryUploadStatus = 'queued' | 'uploading' | 'saving' | 'done' | 'skipped' | 'error'

export interface LibraryUploadTask {
  key: string
  batchId: string
  groupId: string
  name: string
  size: number
  mimeType: string
  relativePath?: string
  dest: LibraryUploadDest
  status: LibraryUploadStatus
  progress: number
  error?: string
  itemId?: string
  /** "Manter os dois" já decidido para este arquivo */
  keepBoth?: boolean
  file: File
}

export type DuplicateDecision = 'keep' | 'skip'

export interface LibraryUploadHooks {
  /**
   * O mesmo arquivo (sha256) já está no Acervo. Devolva 'keep' (Manter os dois)
   * ou 'skip' (Pular). Chamado UM de cada vez, mesmo com 3 envios em paralelo.
   * Sem o gancho, pula.
   */
  onDuplicate?: (dup: LibraryDuplicate, task: LibraryUploadTask) => Promise<DuplicateDecision>
  /** Cada item criado (para abrir, selecionar, mostrar). */
  onItem?: (item: LibraryItemDetail, task: LibraryUploadTask) => void
  /** Fim do lote. `flattened`: alguma pasta passava de 5 níveis. */
  onDone?: (summary: LibraryUploadSummary) => void
}

export interface LibraryUploadSummary {
  batchId: string
  done: number
  skipped: number
  failed: number
  flattened: boolean
}

const PARALLEL = 3

/** Estado da fila (todas as abas do Acervo nesta janela leem daqui). */
export const libraryUploads = reactive({
  tasks: [] as LibraryUploadTask[],
  /** Repetidos esperando a resposta "Manter os dois" ou "Pular" (inclui o da tela) */
  waitingDuplicates: 0,
})

let seq = 0
let running = 0
const pending: LibraryUploadTask[] = []
const hooksByBatch = new Map<string, LibraryUploadHooks>()
const flattenedByBatch = new Set<string>()

class SkipUpload extends Error {}

/** Diálogo de duplicata é um de cada vez (fila de promessas). */
let duplicateChain: Promise<unknown> = Promise.resolve()

function askDuplicate(task: LibraryUploadTask, dup: LibraryDuplicate): Promise<DuplicateDecision> {
  const hooks = hooksByBatch.get(task.batchId)
  libraryUploads.waitingDuplicates++
  const run = async () => (hooks?.onDuplicate ? hooks.onDuplicate(dup, task) : ('skip' as const))
  const next = duplicateChain.then(run, run).finally(() => {
    libraryUploads.waitingDuplicates = Math.max(0, libraryUploads.waitingDuplicates - 1)
  })
  duplicateChain = next.catch(() => undefined)
  return next
}

/** Ticket de UM arquivo: duplicata, subpasta e "Manter os dois" resolvidos aqui. */
function requestTicketFor(task: LibraryUploadTask) {
  return async (meta: { name: string; mimeType: string; size: number; sha256?: string }): Promise<MarketingUploadTicket> => {
    const res = await requestLibraryUploads(task.groupId, {
      companyId: task.dest.companyId,
      folderId: task.dest.folderId,
      files: [{ ...meta, relativePath: task.relativePath, keepBoth: task.keepBoth || undefined }],
    })
    if (res.flattened) flattenedByBatch.add(task.batchId)
    const f = res.files[0]
    if (!f) throw new Error('O servidor não devolveu o envio deste arquivo.')
    if (f.error) throw new Error(f.error)
    if (!f.ticket && f.duplicateOf) {
      const decision = await askDuplicate(task, f.duplicateOf)
      if (decision === 'skip') throw new SkipUpload()
      task.keepBoth = true
      return requestTicketFor(task)(meta)
    }
    if (!f.ticket) throw new Error('O servidor não liberou o envio deste arquivo.')
    task.dest = { ...task.dest, folderId: f.folderId }
    return f.ticket
  }
}

/** Depois do confirm: cria o item na pasta que o servidor resolveu. */
async function finishTask(task: LibraryUploadTask, assetId: string) {
  task.status = 'saving'
  const item = await createLibraryItem(task.groupId, {
    assetId,
    folderId: task.dest.folderId,
    companyId: task.dest.companyId,
  })
  task.status = 'done'
  task.progress = 100
  task.itemId = item.id
  hooksByBatch.get(task.batchId)?.onItem?.(item, task)
}

async function runTask(task: LibraryUploadTask) {
  task.status = 'uploading'
  task.error = undefined
  task.progress = 0
  try {
    const asset = await uploadMarketingFile(task.groupId, task.file, requestTicketFor(task), (p) => {
      task.progress = Math.max(task.progress, p)
    })
    await finishTask(task, asset.id)
  } catch (error) {
    if (error instanceof SkipUpload) {
      task.status = 'skipped'
    } else {
      task.status = 'error'
      task.error = getApiErrorMessage(error, 'Não foi possível enviar este arquivo. Tente de novo.')
    }
  }
}

function pump() {
  while (running < PARALLEL && pending.length) {
    const task = pending.shift() as LibraryUploadTask
    if (task.status !== 'queued') continue
    running++
    void runTask(task).finally(() => {
      running--
      maybeFinishBatch(task.batchId)
      pump()
    })
  }
}

function maybeFinishBatch(batchId: string) {
  const tasks = libraryUploads.tasks.filter((t) => t.batchId === batchId)
  if (tasks.some((t) => t.status === 'queued' || t.status === 'uploading' || t.status === 'saving')) return
  const hooks = hooksByBatch.get(batchId)
  hooks?.onDone?.({
    batchId,
    done: tasks.filter((t) => t.status === 'done').length,
    skipped: tasks.filter((t) => t.status === 'skipped').length,
    failed: tasks.filter((t) => t.status === 'error').length,
    flattened: flattenedByBatch.has(batchId),
  })
  flattenedByBatch.delete(batchId)
}

/**
 * Enfileira arquivos para o Acervo. `dest` é o lugar (marca ou Geral) e a
 * pasta de destino; o `relativePath` de cada entrada recria as subpastas
 * dentro dela. Devolve o id do lote (os ganchos recebem o mesmo).
 */
export function enqueueLibraryUploads(
  groupId: string,
  entries: Array<{ file: File; relativePath?: string }>,
  dest: { companyId: string | null; folderId: string | null },
  hooks: LibraryUploadHooks = {},
): string {
  const batchId = `b${++seq}`
  hooksByBatch.set(batchId, hooks)
  for (const entry of entries) {
    libraryUploads.tasks.push({
      key: `${batchId}-${++seq}`,
      batchId,
      groupId,
      name: entry.file.name,
      size: entry.file.size,
      mimeType: entry.file.type || 'application/octet-stream',
      relativePath: entry.relativePath,
      dest: { ...dest },
      status: 'queued',
      progress: 0,
      file: entry.file,
    })
    // O objeto reativo (e não o literal) entra na fila: a tela vê o progresso.
    pending.push(libraryUploads.tasks[libraryUploads.tasks.length - 1] as LibraryUploadTask)
  }
  ensureUnloadGuard()
  pump()
  if (!entries.length) maybeFinishBatch(batchId)
  return batchId
}

/** Tenta de novo um arquivo que falhou. */
export function retryLibraryUpload(key: string) {
  const task = libraryUploads.tasks.find((t) => t.key === key)
  if (!task || task.status !== 'error') return
  task.status = 'queued'
  task.error = undefined
  task.progress = 0
  pending.push(task)
  ensureUnloadGuard()
  pump()
}

/** Tira da fila o que ainda não começou. */
export function cancelQueuedLibraryUpload(key: string) {
  const task = libraryUploads.tasks.find((t) => t.key === key)
  if (!task || task.status !== 'queued') return
  task.status = 'skipped'
  maybeFinishBatch(task.batchId)
}

/** Some com o que terminou (feito, pulado). Erros ficam para tentar de novo. */
export function clearFinishedLibraryUploads() {
  libraryUploads.tasks = libraryUploads.tasks.filter((t) => t.status !== 'done' && t.status !== 'skipped')
}

export function activeLibraryUploads() {
  return libraryUploads.tasks.filter((t) => t.status === 'queued' || t.status === 'uploading' || t.status === 'saving')
}

/** Fechar a aba com envio em andamento pede confirmação. */
let unloadGuard = false
function ensureUnloadGuard() {
  if (unloadGuard || typeof window === 'undefined') return
  unloadGuard = true
  window.addEventListener('beforeunload', (event) => {
    if (!activeLibraryUploads().length) return
    event.preventDefault()
    event.returnValue = ''
  })
}
