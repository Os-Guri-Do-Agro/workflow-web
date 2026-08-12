import { watch, watchEffect } from 'vue'
import { useTimeTracking } from '@/composables/useTimeTracking'
import { idlePhase } from '@/composables/idle-state'

/**
 * T1 (spec time-tracking-v2) — badge de "gravando" no favicon.
 * Ampliado pela spec timer-ociosidade com um terceiro estado.
 *
 * Três estados, na ordem de urgência:
 *
 * - **parado:** favicon original do `index.html`.
 * - **gravando:** carinha com ponto vermelho (`--err`) no canto.
 * - **ocioso:** carinha piscando entre ponto âmbar (`--warn`) e sem ponto. É o
 *   sinal que PERSISTE enquanto a pessoa não responde: no Windows a notificação
 *   do sistema recolhe sozinha para a Central de Ações em segundos, e sem isto
 *   quem volta ao computador não veria nada.
 *
 * Deve ser montado UMA vez, num ponto sempre presente (AppShell), junto de
 * `useTimerDocumentTitle`. Consome o singleton `useTimeTracking` — sem interval
 * nem subscription extra.
 */

// PNG rasterizado (512²) é fonte confiável para o canvas; o SVG sem width/height
// intrínseco desenha em tamanho 0 em alguns browsers.
const BRAND_FAVICON_PNG = '/brand/marca.png'
const SIZE = 64
const BLINK_MS = 900

type BadgeVariant = 'recording' | 'idle' | 'plain'

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export function useFaviconBadge() {
  if (typeof document === 'undefined') return
  const { isRunning } = useTimeTracking()

  // Links de ícone originais do index.html — guardados para restaurar ao parar.
  const originals = Array.from(
    document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']"),
  )
  let dynamicLink: HTMLLinkElement | null = null
  let brandImage: HTMLImageElement | null = null
  let brandLoaded = false
  const cache = new Map<BadgeVariant, string>()
  let blinkTimer: number | null = null
  let blinkOn = true

  // Ponto colorido com anel branco para destacar sobre a carinha creme.
  function drawBadge(ctx: CanvasRenderingContext2D, color: string) {
    const r = SIZE * 0.22
    const cx = SIZE - r - 2
    const cy = SIZE - r - 2
    ctx.beginPath()
    ctx.arc(cx, cy, r + SIZE * 0.05, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  function badgeColor(variant: BadgeVariant): string | null {
    if (variant === 'recording') return cssVar('--err', '#F04438')
    if (variant === 'idle') return cssVar('--warn', '#F79009')
    return null
  }

  /** Desenha (e memoriza) a carinha com o ponto pedido. */
  function buildDataUrl(variant: BadgeVariant): string {
    const cached = cache.get(variant)
    if (cached) return cached

    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''

    if (brandLoaded && brandImage) {
      ctx.drawImage(brandImage, 0, 0, SIZE, SIZE)
    } else {
      // Fallback sem o PNG: disco creme da marca. Nunca fica sem ícone.
      ctx.fillStyle = cssVar('--brand-body', '#FFDCB6')
      ctx.beginPath()
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2)
      ctx.fill()
    }

    const color = badgeColor(variant)
    if (color) drawBadge(ctx, color)

    const url = canvas.toDataURL('image/png')
    cache.set(variant, url)
    return url
  }

  function apply(variant: BadgeVariant) {
    const href = buildDataUrl(variant)
    if (!href) return
    if (!dynamicLink) {
      dynamicLink = document.createElement('link')
      dynamicLink.rel = 'icon'
      dynamicLink.type = 'image/png'
    }
    dynamicLink.href = href
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

  function stopBlink() {
    if (blinkTimer !== null) {
      window.clearInterval(blinkTimer)
      blinkTimer = null
    }
    blinkOn = true
  }

  function startBlink() {
    if (blinkTimer !== null) return
    blinkTimer = window.setInterval(() => {
      blinkOn = !blinkOn
      apply(blinkOn ? 'idle' : 'plain')
    }, BLINK_MS)
  }

  function render() {
    if (!isRunning.value) {
      stopBlink()
      clear()
      return
    }
    if (idlePhase.value === 'warning') {
      // Quem pediu menos movimento recebe o âmbar fixo: o sinal continua, a
      // piscada não.
      if (prefersReducedMotion()) {
        stopBlink()
        apply('idle')
        return
      }
      apply('idle')
      startBlink()
      return
    }
    stopBlink()
    apply('recording')
  }

  // Pré-carrega a carinha; enquanto não chega, o fallback já funciona.
  const img = new Image()
  img.onload = () => {
    brandImage = img
    brandLoaded = true
    cache.clear()
    render()
  }
  img.onerror = () => {
    brandLoaded = false
    render()
  }
  img.src = BRAND_FAVICON_PNG

  watchEffect(render)
  watch(idlePhase, render)
}
