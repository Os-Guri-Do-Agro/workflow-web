import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { gsap } from 'gsap'

/**
 * Número que conta até o valor (spec overhaul-visual-premium, F0).
 *
 * Import ESTÁTICO do gsap de propósito: este composable só é importado por
 * componentes de views lazy (dashboard, roadmap), então a lib cai no chunk
 * assíncrono delas, nunca no de entrada.
 *
 * Reduced-motion (reativo, padrão `useMediaQuery` do repo) salta direto para
 * o valor final; mudança de valor re-anima a partir do valor corrente (não do
 * zero), então refetch não "pisca" o número.
 */

/** Formatters pt-BR por casas decimais — construir Intl.NumberFormat custa. */
const formatters = new Map<number, Intl.NumberFormat>()
function formatterFor(decimals: number): Intl.NumberFormat {
  let fmt = formatters.get(decimals)
  if (!fmt) {
    fmt = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    formatters.set(decimals, fmt)
  }
  return fmt
}

export function useCountUp(
  source: MaybeRefOrGetter<number>,
  opts: { duration?: number; decimals?: number } = {},
) {
  const { duration = 0.7, decimals = 0 } = opts

  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')

  const current = ref(0)
  const proxy = { v: 0 }
  let tween: gsap.core.Tween | null = null

  watch(
    () => toValue(source),
    (target) => {
      const t = Number.isFinite(target) ? target : 0
      tween?.kill()
      if (reduced.value) {
        proxy.v = t
        current.value = t
        return
      }
      tween = gsap.to(proxy, {
        v: t,
        duration,
        ease: 'power2.out',
        onUpdate: () => {
          current.value = proxy.v
        },
      })
    },
    { immediate: true },
  )

  onScopeDispose(() => tween?.kill())

  const display = computed(() =>
    formatterFor(decimals).format(decimals ? current.value : Math.round(current.value)),
  )

  return { display }
}
