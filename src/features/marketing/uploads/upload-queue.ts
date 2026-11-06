/**
 * Fila GLOBAL de envio da ala Marketing (spec r1-acervo-tarefas-convite, D4 e D5).
 *
 * Um motor só para todos os uploads da ala (versão de card, foto de ativação,
 * nota fiscal, arquivo de orçamento e, na junção, o Acervo):
 *
 * - sobe 3 arquivos em paralelo, cada um passando por
 *   `queued -> hashing -> uploading -> confirming -> done` (ou `error`/`canceled`);
 * - o sha256 sai de um Web Worker incremental (`transport.hashFile`);
 * - acima de 6 MB sobe em partes pelo TUS do storage, que retoma de onde parou;
 * - erro de rede repete sozinho com recuo (1, 2, 4, 8, 15, 30 s...) e, sem
 *   internet, espera o evento `online` sem gastar tentativa;
 * - cancelar aborta o que está no ar e apaga o envio pendente na API;
 * - é um singleton de módulo: sobrevive à troca de rota (e ao fechar o diálogo
 *   que o chamou). A bandeja `UploadTray.vue` só desenha este estado;
 * - fechar a aba com envio pendente pede confirmação (`beforeunload`).
 *
 * Destinos entram por `UploadTarget` (ver `upload-targets.ts`); o Acervo pluga
 * o dele sem mexer aqui.
 */
import { computed, markRaw, reactive, type ComputedRef } from 'vue'
import axios from 'axios'
import { getApiErrorMessage } from '@/service/api'
import {
  abortMarketingUpload,
  confirmMarketingAsset,
  getUploadLimits,
  renewUploadTicket,
  type MarketingAsset,
  type MarketingUploadMeta,
  type MarketingUploadTicket,
} from '@/service/marketing/marketing-core'
import { queryClient } from '@/service/query-client'
import { hashFile, isAbort, mediaDuration, sendToStorage, UploadError } from './transport'

// ── Tipos públicos ───────────────────────────────────────────────────────────

export type UploadStatus = 'queued' | 'hashing' | 'uploading' | 'confirming' | 'done' | 'error' | 'canceled'

/** Pergunta que o destino pode fazer antes de subir (ex.: duplicata no Acervo). */
export interface UploadPrompt {
  message: string
  choices: Array<{ value: string; label: string; primary?: boolean }>
}

/**
 * O que o `requestTicket` do destino devolve:
 * - o ticket da rota da fase (o normal);
 * - `{ prompt }`: a fila pausa o arquivo e mostra a pergunta na bandeja; a
 *   escolha volta no `meta.choice` da próxima chamada;
 * - `{ skip }`: não sobe (fica como cancelado, com o motivo).
 */
export type TicketResult = MarketingUploadTicket | { prompt: UploadPrompt } | { skip: true; reason?: string }

export interface UploadTarget {
  /** Destino estável, ex.: `card:<id>`, `activation:<id>`. Agrupa na bandeja e nas telas. */
  key: string
  /** Tipo do destino: `card-version`, `activation-photo`, `expense-invoice`, `quote-file`, `library`... */
  kind: string
  /** Rótulo curto na bandeja ("Card Post do Dia dos Pets") */
  label: string
  /** Chama a rota da fase que valida o dono e devolve o ticket. */
  requestTicket(groupId: string, meta: MarketingUploadMeta & { choice?: string }): Promise<TicketResult>
  /** Filtro antes de entrar na fila: devolve a frase de recusa, ou null. */
  accept?(file: File): string | null
  /** Depois do confirm (arquivo READY no servidor). */
  onUploaded?(asset: MarketingAsset, item: UploadItem): void | Promise<void>
  /** Chaves do Vue Query a invalidar quando um arquivo fica pronto (padrão: `['marketing', groupId]`). */
  invalidate?(groupId: string): ReadonlyArray<readonly unknown[]>
}

export interface UploadEntry {
  file: File
  /** Caminho dentro da pasta arrastada (`fotos/2026/gato.jpg`); o Acervo recria as subpastas */
  relativePath?: string
}

export interface UploadHooks {
  onItemDone?(item: UploadItem, asset: MarketingAsset): void
  /** done, error ou canceled */
  onItemSettled?(item: UploadItem): void
  /** Toda vez que o lote inteiro fica sem nada ativo (pode voltar a rodar num "Tentar de novo"). */
  onBatchSettled?(batch: UploadBatch): void
}

export interface UploadItem {
  readonly id: string
  readonly batchId: string
  readonly groupId: string
  readonly target: UploadTarget
  readonly file: File
  readonly name: string
  readonly size: number
  readonly mimeType: string
  readonly relativePath: string | null
  /** `blob:` de imagem que o navegador desenha (miniatura na bandeja e no diálogo) */
  readonly thumbUrl: string | null
  readonly addedAt: number
  status: UploadStatus
  /** bytes já lidos pelo hash */
  hashed: number
  /** bytes que o storage já tem */
  sent: number
  speedBps: number | null
  etaSec: number | null
  /** erro em pt-BR, para a pessoa */
  error: string | null
  /** aviso enquanto a fila tenta de novo sozinha */
  notice: string | null
  retryAt: number | null
  attempts: number
  sha256: string | null
  /** PENDING depois do ticket, READY depois do confirm */
  asset: MarketingAsset | null
  prompt: UploadPrompt | null
  transport: 'tus' | 'put' | null
  finishedAt: number | null
}

export interface UploadBatch {
  readonly id: string
  readonly groupId: string
  readonly target: UploadTarget
  /** Itens que entraram na fila (na ordem em que vieram) */
  readonly items: UploadItem[]
  /** Arquivos que o `accept` do destino recusou (não entraram) */
  readonly rejected: Array<{ name: string; reason: string }>
  /** Resolve na primeira vez que o lote inteiro termina (done, error ou canceled) */
  readonly settled: Promise<UploadItem[]>
}

export type UploadEvent = { type: 'done' | 'error' | 'canceled' | 'removed' | 'queued'; item: UploadItem }

// ── Estado ───────────────────────────────────────────────────────────────────

const MAX_ACTIVE = 3
const MAX_AUTO_RETRIES = 8
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000]
const PREVIEWABLE = /^image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)$/i

interface Internal {
  ctrl: AbortController | null
  ticket: MarketingUploadTicket | null
  tus: { url: string | null }
  durationSec: number | null | undefined
  choice?: string
  paused: boolean
  renewals: number
  /** o último erro foi de rede depois de esgotar as tentativas (retomar mantém o ticket) */
  networkExhausted: boolean
  sample: { t: number; sent: number } | null
}

interface BatchState {
  batch: UploadBatch
  hooks: UploadHooks
  resolve: (items: UploadItem[]) => void
  resolved: boolean
}

const state = reactive({ items: [] as UploadItem[] })
const internals = new Map<string, Internal>()
const batches = new Map<string, BatchState>()
const listeners = new Set<(e: UploadEvent) => void>()
let active = 0
let seq = 0

const uid = (p: string) => `${p}${Date.now().toString(36)}${(++seq).toString(36)}`

function emit(type: UploadEvent['type'], item: UploadItem) {
  for (const fn of listeners) {
    try {
      fn({ type, item })
    } catch (error) {
      console.error('[uploads] ouvinte falhou', error)
    }
  }
}

const ACTIVE: UploadStatus[] = ['hashing', 'uploading', 'confirming']
const isActive = (i: UploadItem) => ACTIVE.includes(i.status)
const isPending = (i: UploadItem) => i.status === 'queued' || isActive(i)
const isSettled = (i: UploadItem) => i.status === 'done' || i.status === 'error' || i.status === 'canceled'

// ── Ambiente: rede, aba ──────────────────────────────────────────────────────

const wakers = new Set<() => void>()
let envReady = false
const OFFLINE_NOTICE = 'Sem internet. Continua sozinho quando a rede voltar.'

function ensureEnv() {
  if (envReady || typeof window === 'undefined') return
  envReady = true
  // Sem rede, a requisição no ar pode só ficar parada (sem erro): a linha diz
  // "Sem internet" em vez de mostrar a última velocidade como se andasse.
  window.addEventListener('offline', () => {
    for (const i of state.items) {
      if (i.status !== 'uploading' && i.status !== 'confirming') continue
      i.notice = OFFLINE_NOTICE
      i.speedBps = null
      i.etaSec = null
    }
  })
  window.addEventListener('online', () => {
    for (const i of state.items) if (i.notice === OFFLINE_NOTICE) i.notice = null
    for (const wake of [...wakers]) wake()
  })
  // Fechar a aba (ou recarregar) com envio pendente pede confirmação. Navegar
  // dentro do app não dispara isto: a fila é de módulo e segue subindo.
  window.addEventListener('beforeunload', (event) => {
    if (!state.items.some(isPending)) return
    event.preventDefault()
    event.returnValue = ''
  })
}

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/** Espera o recuo (ou a rede voltar, o que vier antes). `ms = null`: só a rede. */
function waitRetry(ms: number | null, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new UploadError('Envio cancelado.', 'aborted'))
    let timer: ReturnType<typeof setTimeout> | undefined
    const done = () => {
      clearTimeout(timer)
      wakers.delete(done)
      signal.removeEventListener('abort', onAbort)
      resolve()
    }
    const onAbort = () => {
      clearTimeout(timer)
      wakers.delete(done)
      reject(new UploadError('Envio cancelado.', 'aborted'))
    }
    wakers.add(done)
    signal.addEventListener('abort', onAbort, { once: true })
    if (ms !== null) timer = setTimeout(done, ms)
  })
}

function isRetryable(error: unknown): boolean {
  if (error instanceof UploadError) return error.kind === 'network'
  if (axios.isAxiosError(error)) {
    const s = error.response?.status
    return !error.response || s === 408 || s === 429 || s === 502 || s === 503 || s === 504
  }
  return false
}

function describe(error: unknown): string {
  if (error instanceof UploadError) return error.message
  return getApiErrorMessage(error, 'Não deu para enviar este arquivo. Tente de novo.')
}

/** Roda `fn` repetindo erro de rede com recuo; sem internet, espera a rede sem gastar tentativa. */
async function withRetry<T>(item: UploadItem, signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
  const int = internals.get(item.id)!
  for (;;) {
    try {
      const out = await fn()
      item.notice = null
      item.retryAt = null
      return out
    } catch (error) {
      if (signal.aborted || isAbort(error)) throw new UploadError('Envio cancelado.', 'aborted')
      if (!isRetryable(error)) throw error
      if (offline()) {
        item.notice = OFFLINE_NOTICE
        item.retryAt = null
        item.speedBps = null
        item.etaSec = null
        // acorda no `online`; e a cada 30 s confere de novo (navigator.onLine às vezes mente)
        await waitRetry(30_000, signal)
        continue
      }
      item.attempts++
      if (item.attempts > MAX_AUTO_RETRIES) {
        int.networkExhausted = true
        throw new UploadError('O storage não respondeu depois de várias tentativas. Tente de novo.', 'network')
      }
      const ms = BACKOFF_MS[Math.min(item.attempts - 1, BACKOFF_MS.length - 1)]! + Math.floor(Math.random() * 400)
      item.notice = `Falha de rede. Nova tentativa em ${Math.max(1, Math.round(ms / 1000))} s.`
      item.retryAt = Date.now() + ms
      item.speedBps = null
      item.etaSec = null
      await waitRetry(ms, signal)
    }
  }
}

// ── Progresso, velocidade e tempo restante ───────────────────────────────────

function progress(item: UploadItem, sent: number) {
  const int = internals.get(item.id)!
  const now = performance.now()
  item.sent = Math.max(0, Math.min(item.size, sent))
  const s = int.sample
  if (!s) {
    int.sample = { t: now, sent: item.sent }
    return
  }
  const dt = (now - s.t) / 1000
  if (dt < 0.5) return
  const delta = item.sent - s.sent
  int.sample = { t: now, sent: item.sent }
  if (delta < 0) return
  const rate = delta / dt
  item.speedBps = item.speedBps === null ? rate : item.speedBps * 0.7 + rate * 0.3
  item.etaSec = item.speedBps > 1 ? Math.ceil((item.size - item.sent) / item.speedBps) : null
}

// ── Invalidação do cache (em lote: 30 fotos não viram 30 ondas de refetch) ───

const pendingKeys = new Map<string, readonly unknown[]>()
let flushTimer: ReturnType<typeof setTimeout> | undefined

function invalidateLater(keys: ReadonlyArray<readonly unknown[]>) {
  for (const k of keys) pendingKeys.set(JSON.stringify(k), k)
  clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    const all = [...pendingKeys.values()]
    pendingKeys.clear()
    for (const queryKey of all) void queryClient.invalidateQueries({ queryKey: [...queryKey] })
  }, 250)
}

// ── Execução ─────────────────────────────────────────────────────────────────

function pump() {
  while (active < MAX_ACTIVE) {
    const next = state.items.find((i) => i.status === 'queued' && !internals.get(i.id)?.paused)
    if (!next) return
    void run(next)
  }
}

async function run(item: UploadItem) {
  const int = internals.get(item.id)!
  const ctrl = new AbortController()
  int.ctrl = ctrl
  const signal = ctrl.signal
  active++
  item.status = 'hashing'
  item.error = null
  item.notice = null
  try {
    if (item.size <= 0) throw new UploadError('Arquivo vazio.', 'refused')
    // Teto por arquivo ANTES do hash quando o arquivo é grande (não calcula 300 MB
    // à toa); arquivo pequeno calcula enquanto o teto chega (é uma ida à API só por sessão).
    const limitsP = getUploadLimits(item.groupId).catch(() => null)
    const checkLimits = async () => {
      const limits = await limitsP
      if (limits && item.size > limits.maxBytes) {
        throw new UploadError(`Passa do limite de ${limits.maxMb} MB por arquivo.`, 'too-large')
      }
    }
    if (item.size > 32 * 1024 * 1024) await checkLimits()

    // 1. sha256 no worker (e a duração do vídeo, em paralelo)
    if (!item.sha256) {
      item.hashed = 0
      const [hex, duration] = await Promise.all([
        hashFile(item.file, { signal, onProgress: (n) => (item.hashed = n) }),
        int.durationSec === undefined ? mediaDuration(item.file) : Promise.resolve(int.durationSec ?? undefined),
      ])
      item.sha256 = hex
      item.hashed = item.size
      int.durationSec = duration ?? null
    }
    await checkLimits()

    // 2. ticket na rota da fase (que valida o dono)
    item.status = 'uploading'
    if (!int.ticket) {
      const result = await withRetry(item, signal, () =>
        item.target.requestTicket(item.groupId, {
          name: item.name,
          mimeType: item.mimeType,
          size: item.size,
          sha256: item.sha256 ?? undefined,
          relativePath: item.relativePath ?? undefined,
          choice: int.choice,
        }),
      )
      if ('prompt' in result) {
        item.prompt = result.prompt
        item.status = 'queued'
        int.paused = true
        return
      }
      if ('skip' in result) {
        item.status = 'canceled'
        item.notice = result.reason ?? 'Pulado.'
        item.finishedAt = Date.now()
        emit('canceled', item)
        return
      }
      int.ticket = markRaw(result)
      int.tus = { url: null }
      item.asset = result.asset
    }

    // 3. bytes direto no storage (PUT único ou TUS em partes)
    int.sample = null
    await withRetry(item, signal, async () => {
      try {
        item.transport = await sendToStorage(item.file, int.ticket!, {
          contentType: item.mimeType,
          signal,
          tus: int.tus,
          onProgress: (sent) => progress(item, sent),
        })
      } catch (error) {
        if (error instanceof UploadError && error.kind === 'expired' && int.renewals < 3) {
          // token assinado venceu (2 h): pede outro para o MESMO objeto e retoma
          int.renewals++
          int.ticket = markRaw(await renewUploadTicket(item.groupId, int.ticket!.asset.id))
          throw new UploadError(error.message, 'network')
        }
        if (error instanceof UploadError && error.kind === 'gone') {
          int.tus = { url: null }
          throw new UploadError(error.message, 'network')
        }
        throw error
      }
    })
    item.sent = item.size
    item.speedBps = null
    item.etaSec = 0

    // 4. confirm da fundação (confere no storage, mede, prévia RGB, sha256)
    item.status = 'confirming'
    const asset = await withRetry(item, signal, () =>
      confirmMarketingAsset(item.groupId, int.ticket!.asset.id, {
        durationSec: int.durationSec ?? undefined,
      }),
    )
    item.asset = asset
    item.status = 'done'
    item.finishedAt = Date.now()
    item.notice = null
    int.ticket = null
    try {
      await item.target.onUploaded?.(asset, item)
    } catch (error) {
      console.error('[uploads] onUploaded falhou', error)
    }
    invalidateLater(item.target.invalidate?.(item.groupId) ?? [['marketing', item.groupId]])
    batches.get(item.batchId)?.hooks.onItemDone?.(item, asset)
    emit('done', item)
  } catch (error) {
    if (item.status === 'canceled' || isAbort(error)) {
      // cancel() já marcou e limpou
    } else {
      item.status = 'error'
      item.error = describe(error)
      item.notice = null
      item.retryAt = null
      item.speedBps = null
      item.etaSec = null
      item.finishedAt = Date.now()
      emit('error', item)
    }
  } finally {
    if (int.ctrl === ctrl) int.ctrl = null
    active--
    if (isSettled(item)) settleCheck(item)
    pump()
  }
}

function settleCheck(item: UploadItem) {
  const b = batches.get(item.batchId)
  if (!b) return
  try {
    b.hooks.onItemSettled?.(item)
  } catch (error) {
    console.error('[uploads] onItemSettled falhou', error)
  }
  if (!b.batch.items.every(isSettled)) return
  if (!b.resolved) {
    b.resolved = true
    b.resolve(b.batch.items)
  }
  try {
    b.hooks.onBatchSettled?.(b.batch)
  } catch (error) {
    console.error('[uploads] onBatchSettled falhou', error)
  }
}

// ── API pública ──────────────────────────────────────────────────────────────

function enqueue(groupId: string, entries: UploadEntry[], target: UploadTarget, hooks: UploadHooks = {}): UploadBatch {
  ensureEnv()
  const raw = markRaw(target)
  const batchId = uid('b')
  const items: UploadItem[] = []
  const rejected: Array<{ name: string; reason: string }> = []
  for (const entry of entries) {
    const file = entry.file
    const reason = raw.accept?.(file) ?? null
    if (reason) {
      rejected.push({ name: file.name, reason })
      continue
    }
    const mimeType = file.type || 'application/octet-stream'
    const item = reactive<UploadItem>({
      id: uid('u'),
      batchId,
      groupId,
      target: raw,
      file: markRaw(file),
      name: file.name || 'arquivo',
      size: file.size,
      mimeType,
      relativePath: entry.relativePath?.replace(/^\/+/, '') || null,
      thumbUrl: PREVIEWABLE.test(mimeType) ? URL.createObjectURL(file) : null,
      addedAt: Date.now(),
      status: 'queued',
      hashed: 0,
      sent: 0,
      speedBps: null,
      etaSec: null,
      error: null,
      notice: null,
      retryAt: null,
      attempts: 0,
      sha256: null,
      asset: null,
      prompt: null,
      transport: null,
      finishedAt: null,
    }) as UploadItem
    internals.set(item.id, {
      ctrl: null,
      ticket: null,
      tus: { url: null },
      durationSec: undefined,
      paused: false,
      renewals: 0,
      networkExhausted: false,
      sample: null,
    })
    state.items.push(item)
    // o objeto reativo é o que está no array (quem recebe o lote mexe no mesmo)
    items.push(state.items[state.items.length - 1]!)
  }
  let resolve!: (items: UploadItem[]) => void
  const settled = new Promise<UploadItem[]>((r) => (resolve = r))
  const batch: UploadBatch = { id: batchId, groupId, target: raw, items, rejected, settled }
  batches.set(batchId, { batch, hooks, resolve, resolved: false })
  if (!items.length) {
    batches.get(batchId)!.resolved = true
    resolve([])
  }
  for (const item of items) emit('queued', item)
  pump()
  return batch
}

function find(itemId: string) {
  return state.items.find((i) => i.id === itemId)
}

/** Cancela: aborta o que está no ar e apaga o envio pendente na API. */
function cancel(itemId: string) {
  const item = find(itemId)
  if (!item || isSettled(item)) return
  const int = internals.get(item.id)!
  item.status = 'canceled'
  item.prompt = null
  item.notice = null
  item.retryAt = null
  item.speedBps = null
  item.etaSec = null
  item.finishedAt = Date.now()
  int.paused = false
  int.ctrl?.abort()
  const pendingAsset = int.ticket?.asset.id
  int.ticket = null
  int.tus = { url: null }
  if (pendingAsset) void abortMarketingUpload(item.groupId, pendingAsset).catch(() => {})
  emit('canceled', item)
  // ativo: o `finally` do run libera a vaga e confere o lote
  if (!int.ctrl) settleCheck(item)
}

/** Tenta de novo um arquivo com erro ou cancelado. Erro de rede retoma do ponto (mesmo ticket e TUS). */
function retry(itemId: string) {
  const item = find(itemId)
  if (!item || (item.status !== 'error' && item.status !== 'canceled')) return
  const int = internals.get(item.id)!
  if (item.status === 'error' && int.ticket && !int.networkExhausted) {
    // recusa definitiva (storage ou confirm): recomeça com ticket novo
    void abortMarketingUpload(item.groupId, int.ticket.asset.id).catch(() => {})
    int.ticket = null
    int.tus = { url: null }
    item.asset = null
  }
  int.networkExhausted = false
  int.renewals = 0
  item.status = 'queued'
  item.error = null
  item.notice = null
  item.attempts = 0
  item.sent = int.ticket ? item.sent : 0
  item.finishedAt = null
  emit('queued', item)
  pump()
}

/** Responde à pergunta do destino (ex.: "Manter os dois" ou "Pular"). */
function answer(itemId: string, choice: string) {
  const item = find(itemId)
  if (!item || !item.prompt) return
  const int = internals.get(item.id)!
  int.choice = choice
  int.paused = false
  item.prompt = null
  item.status = 'queued'
  pump()
}

/** Tira da lista (só o que não está subindo). O arquivo já enviado continua no servidor. */
function dismiss(itemId: string) {
  const item = find(itemId)
  if (!item || isActive(item) || item.status === 'queued') return
  state.items.splice(state.items.indexOf(item), 1)
  internals.delete(item.id)
  if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl)
  emit('removed', item)
}

/** Limpa os prontos e os cancelados (os com erro ficam até a pessoa decidir). */
function clearFinished() {
  for (const item of [...state.items]) if (item.status === 'done' || item.status === 'canceled') dismiss(item.id)
}

function cancelAll() {
  for (const item of [...state.items]) if (isPending(item)) cancel(item.id)
}

const items = computed(() => state.items)
const pending = computed(() => state.items.filter(isPending))

/** Soma da bandeja: bytes, velocidade e tempo restante do que está pendente. */
const totals = computed(() => {
  const live = state.items.filter(isPending)
  const bytes = live.reduce((s, i) => s + i.size, 0)
  const sent = live.reduce((s, i) => s + i.sent, 0)
  const speed = live.reduce((s, i) => s + (i.speedBps ?? 0), 0)
  return {
    count: live.length,
    bytes,
    sent,
    speedBps: speed > 0 ? speed : null,
    etaSec: speed > 1 ? Math.ceil((bytes - sent) / speed) : null,
    errors: state.items.filter((i) => i.status === 'error').length,
    done: state.items.filter((i) => i.status === 'done').length,
  }
})

function itemsFor(targetKey: string): ComputedRef<UploadItem[]> {
  return computed(() => state.items.filter((i) => i.target.key === targetKey))
}

/** Avisa a cada mudança de estado relevante (fila, pronto, erro, cancelado, removido). */
function subscribe(fn: (e: UploadEvent) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const queue = {
  enqueue,
  cancel,
  retry,
  answer,
  dismiss,
  clearFinished,
  cancelAll,
  subscribe,
  itemsFor,
  find,
  items,
  pending,
  totals,
  hasPending: () => state.items.some(isPending),
}

export type UploadQueue = typeof queue

/** A fila da ala (singleton de módulo: a mesma instância em qualquer tela). */
export function useUploadQueue(): UploadQueue {
  return queue
}

/** Ativo ou na fila: conta como "enviando" para a tela. */
export function isUploadPending(item: UploadItem) {
  return isPending(item)
}
