import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export interface UseLazyLoadOptions {
  /** Margem ao redor do viewport para antecipar o load (default: 200px). */
  rootMargin?: string
  /** Fração visível para disparar (default: 0). */
  threshold?: number
  /** Se o IntersectionObserver não existir, monta imediatamente (default: true). */
  fallbackEager?: boolean
}

export interface UseLazyLoadReturn {
  /** Ref a aplicar no elemento sentinela (`ref="target"`). */
  target: Ref<HTMLElement | null>
  /** `true` assim que o alvo entra (ou já entrou) no viewport. Não volta para `false`. */
  isVisible: Ref<boolean>
}

/**
 * Progressive disclosure via IntersectionObserver.
 *
 * Usado para só montar/buscar seções pesadas (Agenda, Feed, Projects) quando
 * elas entram no viewport — o caminho crítico (Hero + Stats) renderiza primeiro.
 *
 * Uma vez visível, `isVisible` permanece `true` (one-shot): a seção não
 * desmonta ao sair da tela, evitando refetch e flicker.
 */
export function useLazyLoad(options: UseLazyLoadOptions = {}): UseLazyLoadReturn {
  const { rootMargin = '200px', threshold = 0, fallbackEager = true } = options

  const target = ref<HTMLElement | null>(null)
  const isVisible = ref(false)
  let observer: IntersectionObserver | null = null

  onMounted(() => {
    if (typeof IntersectionObserver === 'undefined') {
      if (fallbackEager) isVisible.value = true
      return
    }

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            isVisible.value = true
            observer?.disconnect()
            observer = null
            break
          }
        }
      },
      { rootMargin, threshold },
    )

    if (target.value) {
      observer.observe(target.value)
    }
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return { target, isVisible }
}
