import { onBeforeUnmount, type Ref } from 'vue'
import { useEventListener } from '@vueuse/core'

/**
 * Segurar um card com o dedo (spec v2-celular-roadmap-notas, D1).
 *
 * - Segurar 300ms sem mexer "pega" o card (ele ganha a sombra de levantado).
 * - Soltar ali mesmo, sem mexer, chama `onHold`: quem usa abre a folha
 *   "Mover para". O clique que o navegador mandaria depois é engolido, senão a
 *   tarefa abriria por baixo da folha (ou o clique cairia no fundo da folha e a
 *   fecharia na hora).
 * - Mexer o dedo ANTES dos 300ms é rolagem e cancela tudo: é o que deixa
 *   deslizar sobre um card trocar de coluna.
 * - Mexer DEPOIS de pegar é arraste: o board do mês avisa por `dragStarted()`
 *   (o Sortable começou) e a folha não abre. Pego, o board não rola mais com o
 *   dedo até soltar, nem nos boards sem arraste: rolar a lista por baixo de um
 *   card levantado não é o que alguém que segurou espera.
 *
 * Só toque: mouse e caneta seguem o caminho de sempre (clique abre, o "…" move).
 * O atraso e a tolerância batem com o `delay` e o `touchStartThreshold` dados
 * ao Sortable, para os dois decidirem a mesma coisa sobre o mesmo gesto.
 */
export const HOLD_DELAY_MS = 300
/** Px de CSS que o dedo pode tremer sem o gesto virar rolagem. */
export const HOLD_TOLERANCE_PX = 8

interface LongPressOptions {
  root: Ref<HTMLElement | null>
  /** `false` desliga (quem não pode mover). */
  enabled: () => boolean
  /** O card pode ser pego? (o otimista `tmp:*`, por exemplo, não). */
  canHold?: (id: string, card: HTMLElement) => boolean
  /** Segurou e soltou sem mexer. */
  onHold: (id: string, card: HTMLElement) => void
}

const CARD = '[data-id]'
/** Tocar nestes não é segurar o card: são controles dentro dele. */
const CONTROL = 'button, a, input, textarea, select, label, [role="checkbox"], .no-drag'

export function useCardLongPress(opts: LongPressOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let card: HTMLElement | null = null
  let id: string | null = null
  let startX = 0
  let startY = 0
  let held = false
  let moved = false
  let dragging = false
  /** O clique fantasma do mesmo gesto: só nele, e só logo depois de soltar. */
  let swallow: { card: HTMLElement; until: number } | null = null

  function blockScroll(e: TouchEvent) {
    if (e.cancelable) e.preventDefault()
  }

  function reset() {
    if (timer) clearTimeout(timer)
    timer = null
    card?.classList.remove('card--held')
    document.removeEventListener('touchmove', blockScroll)
    document.removeEventListener('touchend', onEnd)
    document.removeEventListener('touchcancel', reset)
    card = null
    id = null
    held = false
    moved = false
    dragging = false
  }

  function onStart(e: TouchEvent) {
    reset()
    if (!opts.enabled() || e.touches.length !== 1) return
    const target = e.target as HTMLElement | null
    const found = target?.closest<HTMLElement>(CARD)
    if (!found || !opts.root.value?.contains(found)) return
    const control = target?.closest(CONTROL)
    if (control && found.contains(control)) return
    if (found.classList.contains('no-drag')) return
    const foundId = found.dataset.id
    if (!foundId || (opts.canHold && !opts.canHold(foundId, found))) return

    const touch = e.touches[0]!
    card = found
    id = foundId
    startX = touch.clientX
    startY = touch.clientY
    document.addEventListener('touchend', onEnd, { passive: false })
    document.addEventListener('touchcancel', reset)
    timer = setTimeout(() => {
      timer = null
      held = true
      card?.classList.add('card--held')
      document.addEventListener('touchmove', blockScroll, { passive: false })
    }, HOLD_DELAY_MS)
  }

  function onMove(e: TouchEvent) {
    if (!card) return
    const touch = e.touches[0]
    if (!touch) return
    const far =
      Math.max(Math.abs(touch.clientX - startX), Math.abs(touch.clientY - startY)) >= HOLD_TOLERANCE_PX
    if (!far) return
    if (!held) {
      // Antes de pegar: é rolagem. Sai da frente.
      reset()
      return
    }
    moved = true
  }

  function onEnd(e: TouchEvent) {
    const fire = held && !moved && !dragging && id && card
    const firedId = id
    const firedCard = card
    if (fire) {
      // Sem isto o navegador manda o clique de depois do toque: abriria a
      // tarefa por baixo da folha.
      if (e.cancelable) e.preventDefault()
      swallow = { card: firedCard!, until: Date.now() + 400 }
    }
    reset()
    if (fire && firedId && firedCard) opts.onHold(firedId, firedCard)
  }

  /** Android abre o menu de contexto do navegador ao segurar: aqui segurar é nosso. */
  function onContextMenu(e: Event) {
    if (card || (swallow && Date.now() < swallow.until)) e.preventDefault()
  }

  /**
   * Rede de segurança para o clique que escapou do `preventDefault` (o mesmo
   * dedo, no mesmo card, logo depois de soltar). Mais largo que isso engolia o
   * toque seguinte de verdade: o "…" do card abre no `click`.
   */
  function onClickCapture(e: MouseEvent) {
    const s = swallow
    swallow = null
    if (s && Date.now() < s.until && e.target instanceof Node && s.card.contains(e.target)) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  useEventListener(opts.root, 'touchstart', onStart, { passive: true })
  useEventListener(opts.root, 'touchmove', onMove, { passive: true })
  useEventListener(opts.root, 'contextmenu', onContextMenu)
  useEventListener(opts.root, 'click', onClickCapture, { capture: true })

  onBeforeUnmount(reset)

  return {
    /** O Sortable começou a arrastar: soltar não abre a folha. */
    dragStarted() {
      dragging = true
    },
  }
}
