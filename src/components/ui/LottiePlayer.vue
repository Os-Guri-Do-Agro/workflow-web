<script setup lang="ts">
/**
 * Animação Lottie do produto (spec v2-mobile-e-home, L1).
 *
 * - A lib (`lottie-web`, build light: só o renderizador SVG) chega por import
 *   dinâmico: nunca entra no chunk de entrada, só quando uma animação monta.
 * - Os arquivos moram em `public/lottie/` e são desenhados pelo time (zero
 *   licença de terceiro). Neles as cores são MARCADORES (azul puro, vermelho
 *   puro, verde puro) e o player troca cada um pela cor de um token na hora,
 *   então a animação segue tema claro/escuro e o acento escolhido.
 * - `prefers-reduced-motion`: mostra o último quadro parado, sem animar.
 * - Falha de rede ou JSON inválido: some sem quebrar nada (é decoração).
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AnimationItem } from 'lottie-web'
import { useUiPreferences } from '@/composables/useUiPreferences'

const props = withDefaults(
  defineProps<{
    src: string
    size?: number
    loop?: boolean
    /** Texto para leitor de tela. Vazio = decorativa (some da árvore). */
    label?: string
    /** Marcador do arquivo para expressão CSS. Padrão: azul = sucesso, vermelho = fundo suave, verde = acento. */
    palette?: Record<string, string>
  }>(),
  { size: 96, loop: false, label: '', palette: undefined },
)

const DEFAULT_PALETTE: Record<string, string> = {
  '0,0,255': 'var(--success)',
  '255,0,0': 'color-mix(in srgb, var(--success) 16%, var(--surface))',
  '0,255,0': 'var(--accent)',
}

const host = ref<HTMLElement | null>(null)
let anim: AnimationItem | null = null
let raw: unknown = null
const failed = ref(false)
const { theme, accent } = useUiPreferences()

/** Resolve uma expressão CSS (token, color-mix) para [r,g,b] de 0 a 1. */
function resolveColor(expr: string): [number, number, number] | null {
  const probe = document.createElement('span')
  probe.style.color = expr
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).color
  probe.remove()
  const rgb = computed.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255]
  const srgb = computed.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i)
  if (srgb) return [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])]
  return null
}

function recolor(node: unknown, map: Map<string, [number, number, number]>): void {
  if (Array.isArray(node)) {
    node.forEach((child) => recolor(child, map))
    return
  }
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  const c = obj.c as { a?: number; k?: unknown } | undefined
  if (c && c.a === 0 && Array.isArray(c.k) && c.k.length >= 3 && c.k.every((n) => typeof n === 'number')) {
    const k = c.k as number[]
    const key = k
      .slice(0, 3)
      .map((n) => Math.round(n * 255))
      .join(',')
    const to = map.get(key)
    if (to) c.k = [to[0], to[1], to[2], k[3] ?? 1]
  }
  for (const value of Object.values(obj)) recolor(value, map)
}

async function render() {
  if (!host.value || failed.value) return
  try {
    if (!raw) {
      const res = await fetch(props.src)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      raw = await res.json()
    }
    const map = new Map<string, [number, number, number]>()
    for (const [marker, expr] of Object.entries(props.palette ?? DEFAULT_PALETTE)) {
      const rgb = resolveColor(expr)
      if (rgb) map.set(marker, rgb)
    }
    const data = structuredClone(raw)
    recolor(data, map)
    const { default: lottie } = await import('lottie-web/build/player/lottie_light')
    if (!host.value) return
    anim?.destroy()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    anim = lottie.loadAnimation({
      container: host.value,
      renderer: 'svg',
      loop: props.loop && !reduced,
      autoplay: !reduced,
      animationData: data,
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    })
    if (reduced) anim.addEventListener('DOMLoaded', () => anim?.goToAndStop(anim.totalFrames - 1, true))
  } catch {
    failed.value = true
  }
}

onMounted(render)
// Tema e acento mudam as cores: redesenha parado no fim (não repete a entrada).
watch([theme, accent], async () => {
  await render()
  anim?.goToAndStop(anim.totalFrames - 1, true)
})
onBeforeUnmount(() => {
  anim?.destroy()
  anim = null
})
</script>

<template>
  <div
    v-if="!failed"
    ref="host"
    class="lottie"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
  />
</template>

<style scoped>
.lottie {
  flex-shrink: 0;
  line-height: 0;
}
</style>
