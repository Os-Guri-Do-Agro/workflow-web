/**
 * Transporte dos arquivos da ala: hash no worker, PUT único e upload em partes
 * (TUS) direto no storage. Não sabe nada de fila nem de tela: quem orquestra
 * (estados, repetição, bandeja) é o `upload-queue.ts`.
 *
 * TUS (decisão D5 da spec r1-acervo-tarefas-convite): o Supabase Storage aceita
 * o token de `createSignedUploadUrl` no cabeçalho `x-signature` em
 * `<storage>/upload/resumable/sign`, então o navegador sobe em partes sem
 * service key e sem a API no meio. Fontes: supabase.com/docs/guides/storage/
 * uploads/resumable-uploads (seção "Presigned uploads") e o código do
 * supabase/storage (src/http/routes/tus/index.ts e lifecycle.ts).
 */
import type { MarketingUploadTicket } from '@/service/marketing/marketing-core'
import { Sha256 } from './sha256'

export type UploadErrorKind =
  /** rede caiu, timeout, 5xx, 429: repete sozinho */
  | 'network'
  /** token assinado venceu: pede outro e retoma */
  | 'expired'
  /** acima do limite do storage */
  | 'too-large'
  /** o objeto já está lá (resposta perdida de um envio que chegou) */
  | 'exists'
  /** o upload em partes sumiu do storage (24 h): recomeça */
  | 'gone'
  /** o storage não tem a rota do TUS: cai no PUT único */
  | 'unsupported'
  /** o navegador não conseguiu ler o arquivo */
  | 'read'
  /** cancelado por quem enviou */
  | 'aborted'
  /** recusa definitiva */
  | 'refused'

export class UploadError extends Error {
  constructor(
    message: string,
    readonly kind: UploadErrorKind,
    readonly status = 0,
  ) {
    super(message)
    this.name = 'UploadError'
  }
}

export const isAbort = (e: unknown) => e instanceof UploadError && e.kind === 'aborted'

function abortError() {
  return new UploadError('Envio cancelado.', 'aborted')
}

// ── XHR (progresso de envio e cancelar; o fetch não dá progresso de upload) ──

interface XhrResult {
  status: number
  text: string
  header(name: string): string | null
}

interface XhrOptions {
  method: string
  url: string
  headers?: Record<string, string>
  body?: Blob | null
  signal?: AbortSignal
  onUploadProgress?: (loaded: number) => void
  /** Sem nenhum byte saindo por este tempo, a conexão é dada como caída. */
  stallMs?: number
  /** Teto de espera pela resposta depois que o corpo inteiro saiu. */
  responseMs?: number
}

export function xhrSend(opts: XhrOptions): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(abortError())
    const xhr = new XMLHttpRequest()
    const stallMs = opts.stallMs ?? 30_000
    const responseMs = opts.responseMs ?? 120_000
    let timer: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const arm = (ms: number, why: string) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (settled) return
        settled = true
        xhr.abort()
        cleanup()
        reject(new UploadError(why, 'network'))
      }, ms)
    }
    const onAbort = () => {
      if (settled) return
      settled = true
      xhr.abort()
      cleanup()
      reject(abortError())
    }
    const cleanup = () => {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true })

    xhr.open(opts.method, opts.url, true)
    for (const [k, v] of Object.entries(opts.headers ?? {})) xhr.setRequestHeader(k, v)
    if (opts.body) {
      xhr.upload.onprogress = (e) => {
        arm(stallMs, 'A conexão parou de responder.')
        opts.onUploadProgress?.(e.loaded)
      }
      xhr.upload.onload = () => arm(responseMs, 'O servidor demorou demais para responder.')
    }
    xhr.onload = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve({ status: xhr.status, text: xhr.responseText ?? '', header: (n) => xhr.getResponseHeader(n) })
    }
    xhr.onerror = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new UploadError('Falha de rede ao enviar.', 'network'))
    }
    xhr.onabort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(abortError())
    }
    arm(opts.body ? stallMs : responseMs, 'A conexão parou de responder.')
    xhr.send(opts.body ?? null)
  })
}

/** Traduz a resposta de erro do storage (`{statusCode, error, message}`) para o tipo de falha. */
export function storageError(status: number, text: string): UploadError {
  let body: { error?: string; message?: string } = {}
  try {
    body = JSON.parse(text) as typeof body
  } catch {
    // corpo não é JSON (proxy, HTML de erro): decide pelo status
  }
  const msg = `${body.error ?? ''} ${body.message ?? ''} ${text.slice(0, 300)}`
  if (/Bucket not found/i.test(msg)) {
    // O lugar dos arquivos da ala não existe no storage: repetir não resolve.
    return new UploadError('O espaço de arquivos da ala não está pronto no servidor. Avise quem cuida do Nevo.', 'refused', status)
  }
  if (status === 409 || /Duplicate|already exists/i.test(msg)) {
    return new UploadError('O arquivo já tinha chegado.', 'exists', status)
  }
  if (status === 413 || /Payload too large|maximum allowed size|EntityTooLarge/i.test(msg)) {
    return new UploadError('O arquivo passa do limite do plano.', 'too-large', status)
  }
  if ((status === 400 || status === 401 || status === 403) && /signature|jwt|expired|token|unauthori/i.test(msg)) {
    return new UploadError('A autorização de envio venceu.', 'expired', status)
  }
  if (status === 0 || status === 408 || status === 429 || status >= 500) {
    return new UploadError('O servidor não respondeu. Tentando de novo.', 'network', status)
  }
  if (status === 404 || status === 410) return new UploadError('O envio em partes expirou. Recomeçando.', 'gone', status)
  return new UploadError('O servidor recusou o arquivo. Tente de novo; se continuar, fale com o suporte.', 'refused', status)
}

// ── Hash (worker, com plano B na thread principal) ───────────────────────────

const HASH_SLICE = 8 * 1024 * 1024
/**
 * Até aqui o hash roda na própria thread (a 175 MB/s, 2 MB custam ~12 ms):
 * subir um worker para uma nota fiscal de 200 KB custava mais que o cálculo.
 */
const INLINE_HASH_MAX = 2 * 1024 * 1024
/** Sem progresso do worker por este tempo, ele é dado como travado. */
export const HASH_STALL_MS = 30_000

/** sha256 hex do arquivo, lido em fatias num Web Worker (arquivo pequeno: na hora). */
export function hashFile(
  file: Blob,
  opts: { signal?: AbortSignal; onProgress?: (loaded: number) => void } = {},
): Promise<string> {
  if (file.size <= INLINE_HASH_MAX) {
    return (async () => {
      if (opts.signal?.aborted) throw abortError()
      let bytes: Uint8Array
      try {
        bytes = new Uint8Array(await file.arrayBuffer())
      } catch {
        throw new UploadError('Não deu para ler o arquivo. Ele pode ter sido movido ou apagado.', 'read')
      }
      if (opts.signal?.aborted) throw abortError()
      const hex = new Sha256().update(bytes).hex()
      opts.onProgress?.(file.size)
      return hex
    })()
  }
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(abortError())
    let worker: Worker | null = null
    try {
      worker = new Worker(new URL('./hash.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      worker = null
    }
    if (!worker) {
      hashOnMainThread(file, opts).then(resolve, reject)
      return
    }
    const w = worker
    let done = false
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      done = true
      clearTimeout(watchdog)
      w.terminate()
      opts.signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      if (done) return
      finish()
      reject(abortError())
    }
    // Vigia: worker que parou de avisar progresso (travou, foi suspenso pelo
    // navegador) é encerrado, e o cálculo recomeça aqui na thread da tela.
    const arm = () => {
      clearTimeout(watchdog)
      watchdog = setTimeout(() => {
        if (done) return
        finish()
        hashOnMainThread(file, opts).then(resolve, reject)
      }, HASH_STALL_MS)
    }
    arm()
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    w.onmessage = (event: MessageEvent<{ type: string; loaded?: number; hex?: string; message?: string }>) => {
      const m = event.data
      if (done) return
      if (m.type === 'progress') {
        arm()
        opts.onProgress?.(m.loaded ?? 0)
      } else if (m.type === 'done') {
        finish()
        resolve(m.hex!)
      } else if (m.type === 'error') {
        finish()
        reject(new UploadError('Não deu para ler o arquivo. Ele pode ter sido movido ou apagado.', 'read'))
      }
    }
    // Worker que nem carrega (CSP, navegador antigo): calcula aqui mesmo, em fatias.
    w.onerror = (event) => {
      event.preventDefault()
      if (done) return
      finish()
      hashOnMainThread(file, opts).then(resolve, reject)
    }
    w.postMessage({ file, slice: HASH_SLICE })
  })
}

/** Plano B: mesmo cálculo incremental, cedendo a thread entre as fatias. */
async function hashOnMainThread(
  file: Blob,
  opts: { signal?: AbortSignal; onProgress?: (loaded: number) => void },
): Promise<string> {
  const hash = new Sha256()
  const slice = 2 * 1024 * 1024
  for (let offset = 0; offset < file.size; offset += slice) {
    if (opts.signal?.aborted) throw abortError()
    const end = Math.min(file.size, offset + slice)
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer())
    } catch {
      throw new UploadError('Não deu para ler o arquivo. Ele pode ter sido movido ou apagado.', 'read')
    }
    hash.update(bytes)
    opts.onProgress?.(end)
    await new Promise((r) => setTimeout(r, 0))
  }
  return hash.hex()
}

/** Duração de vídeo ou áudio lida no navegador (o servidor não lê vídeo). */
export function mediaDuration(file: File): Promise<number | undefined> {
  if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio')
    const url = URL.createObjectURL(file)
    const timer = setTimeout(() => done(undefined), 8000)
    function done(value?: number) {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      el.removeAttribute('src')
      resolve(value)
    }
    el.preload = 'metadata'
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : undefined)
    el.onerror = () => done(undefined)
    el.src = url
  })
}

// ── Envio para o storage ─────────────────────────────────────────────────────

export interface SendOptions {
  contentType: string
  signal?: AbortSignal
  /** bytes que o storage já tem deste arquivo */
  onProgress?: (sent: number) => void
  /** Estado do TUS, guardado pela fila entre tentativas (é o que permite retomar). */
  tus?: { url: string | null }
}

/** Storage sem a rota do TUS (rara): a sessão inteira passa a usar o PUT único. */
let tusUnavailable = false

/**
 * Sobe os bytes: acima de uma parte (6 MB) e com o ticket trazendo `resumable`,
 * em partes pelo TUS; senão PUT único na URL assinada. Devolve qual caminho usou.
 * "Já existe" conta como sucesso: o confirm confere o objeto real depois.
 */
export async function sendToStorage(
  file: File,
  ticket: MarketingUploadTicket,
  opts: SendOptions,
): Promise<'tus' | 'put'> {
  const r = ticket.resumable
  if (r && !tusUnavailable && file.size > r.chunkSize) {
    try {
      await tusUpload(file, ticket.token, r, opts)
      return 'tus'
    } catch (error) {
      if (error instanceof UploadError && error.kind === 'exists') return 'tus'
      if (!(error instanceof UploadError && error.kind === 'unsupported')) throw error
      tusUnavailable = true
    }
  }
  try {
    await putSigned(file, ticket, opts)
  } catch (error) {
    if (error instanceof UploadError && error.kind === 'exists') return 'put'
    throw error
  }
  return 'put'
}

async function putSigned(file: File, ticket: MarketingUploadTicket, opts: SendOptions) {
  opts.onProgress?.(0)
  const res = await xhrSend({
    method: 'PUT',
    url: ticket.uploadUrl,
    // Mesmos cabeçalhos do caminho que já roda em produção (Drive e M1 a M3).
    headers: { 'Content-Type': opts.contentType, Authorization: `Bearer ${ticket.token}` },
    body: file,
    signal: opts.signal,
    onUploadProgress: (loaded) => opts.onProgress?.(Math.min(loaded, file.size)),
  })
  if (res.status >= 200 && res.status < 300) {
    opts.onProgress?.(file.size)
    return
  }
  throw storageError(res.status, res.text)
}

function base64Utf8(value: string): string {
  let bin = ''
  for (const b of new TextEncoder().encode(value)) bin += String.fromCharCode(b)
  return btoa(bin)
}

/**
 * Cliente TUS 1.0.0 mínimo, no formato do Supabase: POST cria (metadados
 * bucketName/objectName/contentType/cacheControl), PATCH sobe cada parte com
 * Upload-Offset, HEAD descobre onde parou. As partes são do tamanho que o
 * storage exige (6 MB); depois de um corte, a próxima parte sai do offset que o
 * HEAD devolveu, que nem sempre é múltiplo de 6 MB (o servidor guarda o que
 * chegou).
 */
async function tusUpload(
  file: File,
  token: string,
  r: NonNullable<MarketingUploadTicket['resumable']>,
  opts: SendOptions,
) {
  const state = opts.tus ?? { url: null }
  const base = { 'Tus-Resumable': '1.0.0', 'x-signature': token }
  let offset = 0

  const head = async (url: string): Promise<number | null> => {
    const res = await xhrSend({ method: 'HEAD', url, headers: base, signal: opts.signal })
    if (res.status === 200 || res.status === 204) {
      const n = Number(res.header('Upload-Offset'))
      return Number.isFinite(n) && n >= 0 ? n : 0
    }
    if (res.status === 404 || res.status === 410) return null
    throw storageError(res.status, res.text)
  }

  if (state.url) {
    const at = await head(state.url)
    if (at === null) state.url = null
    else offset = at
  }
  if (!state.url) {
    const metadata = [
      ['bucketName', r.bucket],
      ['objectName', r.objectName],
      ['contentType', opts.contentType],
      ['cacheControl', '3600'],
    ]
      .map(([k, v]) => `${k} ${base64Utf8(v!)}`)
      .join(',')
    const res = await xhrSend({
      method: 'POST',
      url: r.endpoint,
      headers: { ...base, 'Upload-Length': String(file.size), 'Upload-Metadata': metadata },
      signal: opts.signal,
    })
    // "Bucket not found" é recusa definitiva (o `storageError` diz), não rota ausente nem rede.
    if (/Bucket not found/i.test(res.text)) throw storageError(res.status, res.text)
    if (res.status === 404 || res.status === 405 || res.status === 501) {
      // rota do TUS ausente neste storage: o PUT único resolve até o teto
      throw new UploadError('Upload em partes indisponível.', 'unsupported', res.status)
    }
    if (res.status !== 201 && res.status !== 200) throw storageError(res.status, res.text)
    const location = res.header('Location')
    if (!location) throw new UploadError('O servidor não abriu o envio em partes. Tentando de novo.', 'network', res.status)
    state.url = new URL(location, r.endpoint).toString()
    offset = 0
  }
  opts.onProgress?.(offset)

  while (offset < file.size) {
    const end = Math.min(file.size, offset + r.chunkSize)
    const from = offset
    const res = await xhrSend({
      method: 'PATCH',
      url: state.url,
      headers: { ...base, 'Upload-Offset': String(from), 'Content-Type': 'application/offset+octet-stream' },
      body: file.slice(from, end),
      signal: opts.signal,
      onUploadProgress: (loaded) => opts.onProgress?.(Math.min(file.size, from + loaded)),
    })
    if (res.status === 204 || res.status === 200) {
      const next = Number(res.header('Upload-Offset'))
      offset = Number.isFinite(next) && next > from ? next : end
      opts.onProgress?.(offset)
      continue
    }
    if (res.status === 409) {
      // offset fora de sincronia (parte repetida depois de um corte): pergunta ao storage
      const at = await head(state.url)
      if (at === null) {
        state.url = null
        throw new UploadError('O envio em partes expirou. Recomeçando.', 'gone', 404)
      }
      offset = at
      opts.onProgress?.(offset)
      continue
    }
    if (res.status === 404 || res.status === 410) {
      state.url = null
      throw new UploadError('O envio em partes expirou. Recomeçando.', 'gone', res.status)
    }
    throw storageError(res.status, res.text)
  }
}
