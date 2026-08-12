import type { App, Directive } from 'vue'

type GsapModule = typeof import('gsap')['gsap']

/**
 * Diretiva global `v-reveal` (spec overhaul-visual-premium, F0): entrada
 * discreta de opacity + translateY quando o elemento entra no viewport.
 *
 * Uso: `v-reveal` ou `v-reveal="indice"` (stagger: delay = indice * 60ms,
 * teto de 480ms) ou `v-reveal="{ index, y }"`.
 *
 * Decisões que não são óbvias:
 *
 * 1. O gsap entra por import DINÂMICO no primeiro elemento montado — a
 *    diretiva é registrada no `main.ts`, e um import estático arrastaria a
 *    lib para o chunk de entrada (a tela de login pagaria pelos ~28 KB).
 * 2. O elemento NUNCA nasce invisível: ele só é escondido depois que o módulo
 *    resolveu. Se a rede falhar, a página degrada para estática — nunca para
 *    conteúdo em opacity 0 permanente.
 * 3. Anti-flash: se o módulo demorou a chegar E o elemento já está visível no
 *    viewport, a animação é PULADA — esconder conteúdo que a pessoa já estava
 *    lendo para reanimá-lo é pior que não animar.
 * 4. UM IntersectionObserver para todos os elementos (config por WeakMap),
 *    não um por elemento: uma tela como o roadmap monta dezenas.
 * 5. `prefers-reduced-motion: reduce` desliga tudo antes de esconder qualquer
 *    coisa (convenção do repo; usuários 50+ do programa didático).
 */

let gsapPromise: Promise<GsapModule> | null = null
function loadGsap(): Promise<GsapModule> {
  gsapPromise ??= import('gsap').then((m) => m.gsap)
  return gsapPromise
}

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

type RevealBinding = number | { index?: number; y?: number } | undefined

interface RevealConfig {
  delay: number
  y: number
  gsap: GsapModule
}

const configs = new WeakMap<Element, RevealConfig>()
/** Elementos ainda escondidos aguardando entrar no viewport (iterável). */
const pending = new Set<Element>()
let sharedObserver: IntersectionObserver | null = null
let printHookInstalled = false

/**
 * Impressão não rola a página: elemento abaixo da dobra ainda escondido pelo
 * reveal sairia em branco no papel (o Roadmap imprime via `window.print()`).
 * Antes de imprimir, todo pendente é revelado na hora.
 */
function installPrintHook() {
  if (printHookInstalled || typeof window === 'undefined') return
  printHookInstalled = true
  window.addEventListener('beforeprint', () => {
    for (const el of pending) {
      const config = configs.get(el)
      sharedObserver?.unobserve(el)
      configs.delete(el)
      config?.gsap.set(el, { clearProps: 'opacity,transform,transition' })
    }
    pending.clear()
  })
}

function observer(): IntersectionObserver {
  sharedObserver ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const config = configs.get(entry.target)
        sharedObserver?.unobserve(entry.target)
        configs.delete(entry.target)
        pending.delete(entry.target)
        if (!config) continue
        config.gsap.to(entry.target, {
          opacity: 1,
          y: 0,
          duration: 0.55,
          delay: config.delay,
          ease: 'power3.out',
          // `transition` incluso no clearProps: o hide zera a transition CSS
          // do elemento (senão um `transition: transform` próprio, como o dos
          // stat-cards, re-easa cada frame do tween e o reveal fica mole).
          // Transform residual criaria stacking context e quebraria filho
          // position: fixed/sticky; limpar devolve o layout original.
          clearProps: 'opacity,transform,transition',
        })
      }
    },
    { threshold: 0.08 },
  )
  return sharedObserver
}

/** Janela em que esconder o elemento ainda é imperceptível (módulo em cache). */
const LATE_MODULE_MS = 150

function inViewport(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  return rect.bottom > 0 && rect.top < window.innerHeight
}

const vReveal: Directive<HTMLElement, RevealBinding> = {
  mounted(el, binding) {
    if (reducedMotion()) return
    const raw = binding.value
    const opts = typeof raw === 'number' ? { index: raw } : (raw ?? {})
    const delay = Math.min((opts.index ?? 0) * 0.06, 0.48)
    const y = opts.y ?? 14
    const mountedAt = performance.now()

    void loadGsap().then((gsap) => {
      if (!el.isConnected) return
      const late = performance.now() - mountedAt > LATE_MODULE_MS
      if (late && inViewport(el)) return
      installPrintHook()
      gsap.set(el, { opacity: 0, y, transition: 'none' })
      configs.set(el, { delay, y, gsap })
      pending.add(el)
      observer().observe(el)
    })
  },
  unmounted(el) {
    sharedObserver?.unobserve(el)
    configs.delete(el)
    pending.delete(el)
  },
}

export default {
  install(app: App) {
    app.directive('reveal', vReveal)
  },
}
