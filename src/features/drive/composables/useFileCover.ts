import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { kindOf, type FileLike } from '@/utils/file-kind'

/**
 * Capa visual de um arquivo, derivada NO NAVEGADOR.
 *
 * ## Por que no cliente
 *
 * Gerar thumbnail no servidor exige ffmpeg e um renderizador de PDF dentro do
 * container (o Railway já cai no deploy por push; somar 300 MB de binário e
 * CPU de render por upload é outra briga, registrada como fora de escopo).
 * Aqui a capa nasce da URL assinada que a listagem já devolve, e o custo é do
 * navegador de quem está olhando a pasta.
 *
 * ## Estratégia por tipo
 *
 * - imagem  → a própria URL assinada
 * - PDF     → primeira página rasterizada com pdf.js
 * - vídeo   → frame extraído com `<video>` + `<canvas>`
 * - texto   → primeiras linhas do conteúdo (vira capa tipográfica com prosa)
 * - resto   → sem capa derivada; o componente desenha a capa por extensão
 *
 * ## O que impede isso de virar peso morto
 *
 * 1. Só roda quando o card entra na viewport (`enabled`, ligado ao
 *    IntersectionObserver do componente).
 * 2. Resultado fica em cache de módulo por `fileId`, então rolar a lista de
 *    volta não refaz trabalho.
 * 3. O backend só assina URL de arquivo abaixo de 12 MB para tipos derivados,
 *    então não existe caminho que baixe um vídeo gigante para achar um frame.
 * 4. Falha nunca aparece como erro: cai na capa tipográfica, que é um estado
 *    legítimo e não um defeito.
 */

export type CoverKind = 'image' | 'canvas' | 'text' | 'none'

export interface FileCover {
  kind: CoverKind
  /** `image`/`canvas`: src da imagem. `text`: o trecho lido. */
  value: string
}

interface CoverTarget extends FileLike {
  id: string
  previewUrl?: string | null
}

/**
 * Cache de processo: o mesmo arquivo não é rasterizado duas vezes por sessão.
 *
 * Com teto, porque o valor de PDF e vídeo é um data URL base64 de dezenas de
 * KB: sem limite, varrer um acervo grande acumula dezenas de MB que só saem no
 * reload. Descarte é FIFO (o Map preserva ordem de inserção), que basta aqui —
 * o padrão de uso é varrer pastas para a frente, não revisitar aleatoriamente.
 */
const COVER_CACHE_MAX = 150
const coverCache = new Map<string, FileCover>()

function cacheCover(id: string, cover: FileCover): void {
  if (coverCache.size >= COVER_CACHE_MAX) {
    const oldest = coverCache.keys().next().value
    if (oldest !== undefined) coverCache.delete(oldest)
  }
  coverCache.set(id, cover)
}

/** Rasterização é cara; mais de duas ao mesmo tempo trava a rolagem. */
let activeRenders = 0
const MAX_CONCURRENT_RENDERS = 2
const renderQueue: Array<() => void> = []

function acquireRenderSlot(): Promise<void> {
  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    renderQueue.push(() => {
      activeRenders++
      resolve()
    })
  })
}

function releaseRenderSlot(): void {
  activeRenders--
  renderQueue.shift()?.()
}

/** pdf.js só é baixado quando existe um PDF de fato para rasterizar. */
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then(async (lib) => {
      // O worker vem do próprio pacote (bundle local): o CSP do app não
      // permitiria buscar worker de CDN, e não queremos essa dependência.
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      lib.GlobalWorkerOptions.workerSrc = worker.default
      return lib
    })
  }
  return pdfjsPromise
}

const COVER_WIDTH = 480

async function pdfCover(url: string, signal: AbortSignal): Promise<FileCover> {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({ url, disableAutoFetch: true })
  // `destroyed` guarda contra o destroy duplo: o `finally` sempre destrói, e o
  // listener continuaria vivo no signal (que sobrevive ao render) para abortar
  // um task que já não existe.
  let destroyed = false
  const destroy = () => {
    if (destroyed) return
    destroyed = true
    void task.destroy()
  }
  signal.addEventListener('abort', destroy, { once: true })

  const doc = await task.promise
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: COVER_WIDTH / base.width })

    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas indisponível')
    // Fundo branco: PDF com transparência ficaria ilegível no tema escuro.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({ canvas, canvasContext: context, viewport }).promise
    return { kind: 'canvas', value: canvas.toDataURL('image/jpeg', 0.72) }
  } finally {
    signal.removeEventListener('abort', destroy)
    destroy()
  }
}

/** Nenhuma derivação pode ficar pendurada para sempre segurando um slot. */
const COVER_TIMEOUT_MS = 15_000

function videoCover(url: string, signal: AbortSignal): Promise<FileCover> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true

    let done = false
    const cleanup = () => {
      window.clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
    }
    const fail = (reason: string) => {
      if (done) return
      done = true
      cleanup()
      reject(new Error(reason))
    }
    const succeed = (cover: FileCover) => {
      if (done) return
      done = true
      cleanup()
      resolve(cover)
    }

    // Sem isto, um vídeo que nunca dispara `loadedmetadata` nem `error` (URL
    // que estola, CORS silencioso) prende o slot de render e nenhuma outra capa
    // da sessão renderiza.
    const timer = window.setTimeout(
      () => fail('tempo esgotado ao ler o vídeo'),
      COVER_TIMEOUT_MS,
    )

    signal.addEventListener('abort', () => fail('abortado'), { once: true })

    video.onloadedmetadata = () => {
      // `duration` é Infinity em webm de MediaRecorder (gravação de tela) até o
      // arquivo ser percorrido inteiro, e atribuir Infinity a `currentTime`
      // lança TypeError dentro do handler — a Promise nunca settlaria.
      const duration = video.duration
      if (!Number.isFinite(duration) || duration <= 0) {
        // Sem duração confiável, tenta um instante fixo em vez de desistir.
        video.currentTime = 0.1
        return
      }
      // 10% da duração: o frame 0 costuma ser preto (fade in, slate).
      video.currentTime = Math.min(
        duration * 0.1,
        Math.max(duration - 0.1, 0.1),
      )
    }
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        const ratio = video.videoWidth ? COVER_WIDTH / video.videoWidth : 1
        canvas.width = COVER_WIDTH
        canvas.height = Math.round((video.videoHeight || 270) * ratio)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('canvas indisponível')
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        succeed({ kind: 'canvas', value: canvas.toDataURL('image/jpeg', 0.7) })
      } catch {
        fail('não foi possível extrair o frame')
      }
    }
    video.onerror = () => fail('vídeo ilegível')
    video.src = url
  })
}

async function textCover(url: string, signal: AbortSignal): Promise<FileCover> {
  // Range: o suficiente para encher a capa, não o arquivo inteiro.
  const response = await fetch(url, {
    signal,
    headers: { Range: 'bytes=0-2047' },
  })
  if (!response.ok && response.status !== 206) {
    throw new Error(`HTTP ${response.status}`)
  }
  const raw = await response.text()
  const snippet = raw.replace(/\r/g, '').split('\n').slice(0, 12).join('\n')
  return { kind: 'text', value: snippet.trim() }
}

export function useFileCover(
  file: Ref<CoverTarget>,
  enabled: Ref<boolean>,
): Ref<FileCover | null> {
  const cover = ref<FileCover | null>(coverCache.get(file.value.id) ?? null)
  let controller: AbortController | null = null

  async function derive(): Promise<void> {
    // Aborta ANTES de qualquer caminho, inclusive os que retornam cedo: se uma
    // rasterização do arquivo anterior seguisse viva enquanto o componente já
    // mostra outro arquivo, ela terminaria escrevendo a capa velha por cima da
    // nova (card do PDF antigo sob o nome do arquivo novo).
    controller?.abort()
    controller = new AbortController()
    const { signal } = controller

    const target = file.value
    const cached = coverCache.get(target.id)
    if (cached) {
      cover.value = cached
      return
    }

    const url = target.previewUrl
    const kind = kindOf(target)
    if (!url) {
      cover.value = { kind: 'none', value: '' }
      return
    }

    // Imagem não passa pela fila: é só apontar o `src`.
    if (kind === 'image') {
      const result: FileCover = { kind: 'image', value: url }
      cacheCover(target.id, result)
      cover.value = result
      return
    }

    await acquireRenderSlot()
    try {
      if (signal.aborted) return
      let result: FileCover
      if (kind === 'pdf') result = await pdfCover(url, signal)
      else if (kind === 'video') result = await videoCover(url, signal)
      else if (kind === 'markdown' || kind === 'text' || kind === 'code')
        result = await textCover(url, signal)
      else result = { kind: 'none', value: '' }

      if (signal.aborted) return
      cacheCover(target.id, result)
      cover.value = result
    } catch {
      // ABORTO NÃO É FALHA. Todos os derivadores rejeitam quando abortados, e
      // gravar `none` no cache aqui marcaria o arquivo como "sem capa" para o
      // resto da sessão só porque o usuário trocou de pasta no meio do render.
      // Sem cache, a próxima visita tenta de novo, que é o certo.
      if (signal.aborted) return
      // Falha real: capa é enfeite, então cai na tipográfica, que é um estado
      // desenhado de propósito e não um erro para o usuário.
      const fallback: FileCover = { kind: 'none', value: '' }
      cacheCover(target.id, fallback)
      cover.value = fallback
    } finally {
      releaseRenderSlot()
    }
  }

  watch(
    [enabled, () => file.value.id, () => file.value.previewUrl],
    ([isEnabled]) => {
      if (isEnabled) void derive()
    },
    { immediate: true },
  )

  onScopeDispose(() => controller?.abort())

  return cover
}
