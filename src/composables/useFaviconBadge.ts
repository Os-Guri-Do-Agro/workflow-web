import { watch } from 'vue'
import { useTimeTracking } from '@/composables/useTimeTracking'

/**
 * T1 (spec time-tracking-v2) — badge de "gravando" no favicon.
 *
 * Enquanto o timer roda, o favicon (a carinha da marca) ganha um ponto vermelho
 * no canto — sinal inequívoco de captura em andamento, no lugar do antigo emoji
 * de relógio no título. É reforço, não sinal único (título e widget também
 * indicam), então acessibilidade não depende só da cor do badge.
 *
 * Deve ser montado UMA vez, num ponto sempre presente (AppShell), junto de
 * `useTimerDocumentTitle`. Consome o singleton `useTimeTracking` — sem interval
 * nem subscription extra.
 *
 * O badge é estático (favicon não anima sem trocar frames num interval, o que não
 * agrega): presente = gravando, ausente = parado.
 */

// PNG rasterizado (512²) é fonte confiável para o canvas; o SVG sem width/height
// intrínseco desenha em tamanho 0 em alguns browsers.
const BRAND_FAVICON_PNG = '/brand/marca.png'
const SIZE = 64

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export function useFaviconBadge() {
  if (typeof document === 'undefined') return
  const { isRunning } = useTimeTracking()

  // Links de ícone originais do index.html — guardados para restaurar ao parar.
  const originals = Array.from(
    document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']"),
  )
  let dynamicLink: HTMLLinkElement | null = null
  let recordingDataUrl: string | null = null

  // Ponto vermelho (--err) com anel branco para destacar sobre a carinha creme.
  function drawBadge(ctx: CanvasRenderingContext2D) {
    const r = SIZE * 0.22
    const cx = SIZE - r - 2
    const cy = SIZE - r - 2
    ctx.beginPath()
    ctx.arc(cx, cy, r + SIZE * 0.05, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = cssVar('--err', '#F04438')
    ctx.fill()
  }

  // Fallback sem o PNG: disco creme da marca + badge. Nunca fica sem ícone.
  function buildFallbackDataUrl(): string {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.fillStyle = cssVar('--brand-body', '#FFDCB6')
    ctx.beginPath()
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2)
    ctx.fill()
    drawBadge(ctx)
    return canvas.toDataURL('image/png')
  }

  function apply() {
    if (!recordingDataUrl) return
    if (!dynamicLink) {
      dynamicLink = document.createElement('link')
      dynamicLink.rel = 'icon'
      dynamicLink.type = 'image/png'
    }
    dynamicLink.href = recordingDataUrl
    // Remove os originais e injeta o dinâmico para garantir precedência.
    originals.forEach((l) => l.parentNode?.removeChild(l))
    if (!dynamicLink.parentNode) document.head.appendChild(dynamicLink)
  }

  function clear() {
    if (dynamicLink?.parentNode) dynamicLink.parentNode.removeChild(dynamicLink)
    originals.forEach((l) => {
      if (!l.parentNode) document.head.appendChild(l)
    })
  }

  // Pré-carrega a carinha e gera o dataURL de "gravando" uma vez (cacheado).
  const img = new Image()
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no 2d context')
      ctx.drawImage(img, 0, 0, SIZE, SIZE)
      drawBadge(ctx)
      recordingDataUrl = canvas.toDataURL('image/png')
    } catch {
      recordingDataUrl = buildFallbackDataUrl()
    }
    if (isRunning.value) apply()
  }
  img.onerror = () => {
    recordingDataUrl = buildFallbackDataUrl()
    if (isRunning.value) apply()
  }
  img.src = BRAND_FAVICON_PNG

  watch(isRunning, (running) => {
    if (running) apply()
    else clear()
  })
}
