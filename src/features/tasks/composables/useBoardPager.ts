import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { useEventListener, usePreferredReducedMotion } from '@vueuse/core'
import { usePhoneViewport } from '@/composables/usePhoneViewport'

/**
 * Board no celular, uma coluna por vez (spec v2-celular-roadmap-notas, D1).
 *
 * O board continua sendo a mesma fita de colunas com `scroll-snap`; abaixo de
 * 640px cada coluna ocupa a largura inteira e este composable só liga a fita
 * às abas: a rolagem (o dedo deslizando) diz qual aba acende, e tocar numa aba
 * rola até a coluna. A rolagem é a do navegador, então deslizar sobre um card
 * nunca vira arraste: o Sortable só pega o card depois de segurar 300ms.
 *
 * As colunas são os filhos diretos da fita com `data-col` (o status).
 */
export function useBoardPager(scroller: Ref<HTMLElement | null>) {
  const paged = usePhoneViewport()
  const active = ref(0)
  const reducedMotion = usePreferredReducedMotion()

  let frame = 0
  /** Rolagem pedida pela aba: até chegar, a posição do meio do caminho não acende aba nenhuma. */
  let target: number | null = null
  let targetTimer: ReturnType<typeof setTimeout> | null = null

  function lanes(): HTMLElement[] {
    const el = scroller.value
    if (!el) return []
    return [...el.children].filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child.hasAttribute('data-col'),
    )
  }

  /** Índice da coluna cuja borda esquerda está mais perto da borda da fita. */
  function nearest(): number {
    const el = scroller.value
    if (!el) return 0
    const left = el.getBoundingClientRect().left
    let best = 0
    let dist = Infinity
    lanes().forEach((lane, i) => {
      const d = Math.abs(lane.getBoundingClientRect().left - left)
      if (d < dist) {
        dist = d
        best = i
      }
    })
    return best
  }

  function sync() {
    frame = 0
    if (!paged.value) return
    const at = nearest()
    if (target !== null) {
      if (at !== target) return
      clearTarget()
    }
    active.value = at
  }

  function clearTarget() {
    target = null
    if (targetTimer) clearTimeout(targetTimer)
    targetTimer = null
  }

  function onScroll() {
    if (!frame) frame = requestAnimationFrame(sync)
  }

  function goTo(index: number, smooth = true) {
    const el = scroller.value
    const lane = lanes()[index]
    if (!el || !lane) return
    active.value = index
    target = index
    if (targetTimer) clearTimeout(targetTimer)
    // Rede: se a rolagem for interrompida (o dedo pegou a fita no meio), a
    // próxima rolagem volta a mandar na aba.
    targetTimer = setTimeout(clearTarget, 900)
    el.scrollTo({
      left: el.scrollLeft + lane.getBoundingClientRect().left - el.getBoundingClientRect().left,
      behavior: smooth && reducedMotion.value !== 'reduce' ? 'smooth' : 'auto',
    })
  }

  useEventListener(scroller, 'scroll', onScroll, { passive: true })

  // Girou a tela ou a janela cresceu e voltou: a fita realinha na coluna que
  // estava à vista (a largura da coluna mudou, o scrollLeft antigo não serve).
  watch(paged, (on) => {
    if (on) void nextTick(() => goTo(active.value, false))
  })
  // Só quando a LARGURA muda: no celular a barra de endereço some e volta ao
  // rolar, e isso dispara `resize` de altura no meio do gesto.
  let lastWidth = typeof window !== 'undefined' ? window.innerWidth : 0
  useEventListener(
    window,
    'resize',
    () => {
      if (window.innerWidth === lastWidth) return
      lastWidth = window.innerWidth
      if (paged.value) goTo(active.value, false)
    },
    { passive: true },
  )

  onBeforeUnmount(() => {
    if (frame) cancelAnimationFrame(frame)
    clearTarget()
  })

  return { paged, active, goTo }
}
