<script setup lang="ts">
/**
 * NevoShowcase: a vitrine 3D da home (spec sequencia-diaria-nevo, T8), no
 * estilo dos vídeos de produto do Rotato. Notebook e celular com a interface
 * do Nevo, câmera com keyframes, o Nevo correndo, legendas por capítulo,
 * tudo em loop de 22 s.
 *
 * Carregamento em três degraus, do mais leve ao mais pesado:
 * 1. Este componente (overlay + pôster em CSS) chega por `defineAsyncComponent`
 *    quando o slot da home entra na tela. Ele NÃO importa three nem gsap.
 * 2. Se existe WebGL2, a cena (`./scene`, que traz o three) chega por
 *    `import()`. Sem WebGL, o three nem é baixado: fica o pôster em CSS.
 * 3. Enquanto as texturas carregam, o pôster continua na frente e sai com um
 *    fade quando o primeiro quadro da cena está pronto.
 *
 * Só toca quando: tem cena pronta, a pessoa não pediu movimento reduzido, não
 * pausou, a vitrine está visível e a aba está em primeiro plano. Fora disso o
 * laço de renderização para de verdade (nenhum rAF rodando).
 *
 * Movimento reduzido: um quadro estático do capítulo 1; o indicador de
 * capítulos continua clicável (troca de quadro sem animar) e o botão de tocar
 * some. Perdeu o contexto WebGL: volta para o pôster em CSS e, quando o
 * navegador devolve a GPU, remonta a cena num canvas novo.
 *
 * Renderização por software (GPU bloqueada, VM, área de trabalho remota): o
 * contexto é pedido com `failIfMajorPerformanceCaveat`, e aí vale o pôster. Na
 * CPU a cena rodava a 10 a 19 quadros por segundo disputando com a home.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  useDevicePixelRatio,
  useDocumentVisibility,
  useMediaQuery,
  useResizeObserver,
} from '@vueuse/core'
import { Pause, Play } from 'lucide-vue-next'
import type { StreakMe, StreakTeam } from '@/service/streak/streak-service'
import { nevoSrc } from '@/components/nevo/nevo-assets'
import NevoSprite from '@/components/nevo/NevoSprite.vue'
import { themeVersion } from '@/plugins/tokens'
import { SHOWCASE_CHAPTERS, chapterSubtitle } from './chapters'
// Só o TIPO: `import type` some no build e não puxa o three para este chunk.
import type { ShowcaseHandle } from './scene'

const props = withDefaults(
  defineProps<{
    streak?: StreakMe | null
    team?: StreakTeam | null
    autoplay?: boolean
  }>(),
  { streak: null, team: null, autoplay: true },
)

const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
const visibility = useDocumentVisibility()

const stageRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const chaptersRef = ref<HTMLElement | null>(null)
/** Troca a cada remontagem da cena: o canvas antigo (contexto perdido) sai do DOM. */
const canvasKey = ref(0)

type Status = 'loading' | 'ready' | 'fallback'
const status = ref<Status>('loading')
const chapterIndex = ref(0)
const userPaused = ref(!props.autoplay)
const inView = ref(false)
/**
 * A legenda troca sozinha a cada 4 s: anunciar isso no leitor de tela seria
 * falar sem parar. Só vira região viva quando a PESSOA escolhe um capítulo, e
 * volta a ficar muda na primeira troca feita pelo playback (ver `onChapter`).
 */
const userNavigated = ref(false)

let handle: ShowcaseHandle | null = null
let unmounted = false
let observer: IntersectionObserver | null = null
let lastProgress = '0'

const total = SHOWCASE_CHAPTERS.length
const chapter = computed(() => SHOWCASE_CHAPTERS[chapterIndex.value] ?? SHOWCASE_CHAPTERS[0]!)

/**
 * Posição da legenda no palco estreito, do capítulo que ESTÁ na tela. Troca no
 * `before-enter` da legenda nova (e não junto com o capítulo): com `out-in`, a
 * legenda que sai termina de sumir no lugar dela, sem pular de canto.
 */
const captionLow = ref(chapter.value.captionNarrow === 'bottom')
function onCaptionEnter() {
  captionLow.value = chapter.value.captionNarrow === 'bottom'
}
const subtitle = computed(() => chapterSubtitle(chapter.value, props.streak, props.team))
const canPlay = computed(() => status.value === 'ready' && !reduced.value)
const running = computed(
  () => canPlay.value && !userPaused.value && inView.value && visibility.value === 'visible',
)

watch(running, (run) => {
  if (run) handle?.play()
  else handle?.pause()
})

// Pediu movimento reduzido com a vitrine aberta: congela num quadro assentado.
watch(reduced, (r) => {
  if (r) handle?.seek(chapterIndex.value)
})

watch(
  () => [props.streak, props.team] as const,
  ([streak, team]) => handle?.setData(streak, team),
)

// Os controles só montam com a cena pronta, e o quadro parado pode ter sido
// desenhado antes disso: aplica o último progresso assim que a barra existe.
watch(chaptersRef, (el) => el?.style.setProperty('--chapter-p', lastProgress))

// Troca de tema: confete e sombra do chão leem tokens em runtime.
watch(themeVersion, () => handle?.refreshTheme())

useResizeObserver(stageRef, (entries) => {
  const box = entries[0]?.contentRect
  if (box) handle?.resize(box.width, box.height)
})

// Trocar de monitor (1x para 2x) muda o DPR sem mudar o tamanho em CSS, e o
// ResizeObserver não dispara: o buffer ficava no DPR antigo (borrado no 2x, ou
// pixels demais no 1x) até o próximo resize. O `resize` da cena relê o DPR.
const { pixelRatio } = useDevicePixelRatio()
watch(pixelRatio, () => {
  const el = stageRef.value
  if (el) handle?.resize(el.clientWidth, el.clientHeight)
})

/**
 * WebGL2 (o three atual não roda em WebGL1) com GPU de verdade: renderização
 * por software (SwiftShader, WARP, llvmpipe) responde `null` com
 * `failIfMajorPerformanceCaveat` e fica o pôster. O contexto de teste é
 * descartado na hora.
 */
function hasWebGL2(): boolean {
  try {
    const probe = document.createElement('canvas')
    const gl = probe.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/**
 * Canvas cujo contexto caiu, esperando o navegador devolver a GPU. O three
 * cancela o `webglcontextlost` (é o que autoriza a restauração), mas a cena já
 * foi descartada: o contexto restaurado nesse canvas ficaria vivo e sem uso.
 */
let lostCanvas: HTMLCanvasElement | null = null

function forgetLostCanvas() {
  lostCanvas?.removeEventListener('webglcontextrestored', onContextRestored)
  lostCanvas = null
}

/** A GPU voltou: solta o contexto velho e remonta a cena num canvas novo. */
function onContextRestored() {
  const old = lostCanvas
  forgetLostCanvas()
  try {
    old?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    // Sem a extensão: o canvas já saiu do DOM e o coletor leva o contexto.
  }
  if (unmounted) return
  status.value = 'loading'
  canvasKey.value++
  void nextTick(startScene)
}

function toFallback(lost = false) {
  if (lost && canvasRef.value && !lostCanvas) {
    lostCanvas = canvasRef.value
    lostCanvas.addEventListener('webglcontextrestored', onContextRestored)
  }
  status.value = 'fallback'
  // O pôster é o quadro do capítulo 1: a legenda volta para ele.
  chapterIndex.value = 0
  userNavigated.value = false
  handle?.dispose()
  handle = null
}

async function startScene() {
  const el = stageRef.value
  try {
    const { createShowcase } = await import('./scene')
    if (unmounted || !canvasRef.value) return
    const h = createShowcase(canvasRef.value, {
      onReady: () => {
        if (!unmounted) status.value = 'ready'
      },
      onContextLost: () => {
        if (!unmounted) toFallback(true)
      },
    })
    handle = h
    h.onChapter((i) => {
      // Troca que a pessoa pediu: `goTo` já gravou `i` antes do seek. Índice
      // diferente = o playback avançou sozinho, e a legenda volta a ser muda.
      if (i !== chapterIndex.value) userNavigated.value = false
      chapterIndex.value = i
    })
    // Progresso do capítulo vai direto para uma variável CSS, sem passar pela
    // reatividade: 60 atualizações por segundo não precisam re-renderizar nada.
    h.onProgress((_, p) => {
      lastProgress = p.toFixed(3)
      chaptersRef.value?.style.setProperty('--chapter-p', lastProgress)
    })
    h.setData(props.streak, props.team)
    if (el) h.resize(el.clientWidth, el.clientHeight)
    // Quem liga o laço é o `watch(running)`: `onReady` põe o status em 'ready'
    // (também na remontagem depois de perder o contexto).
  } catch {
    if (!unmounted) toFallback()
  }
}

onMounted(async () => {
  const el = stageRef.value
  if (el && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(
      ([entry]) => {
        inView.value = !!entry && entry.isIntersecting && entry.intersectionRatio >= 0.2
      },
      { threshold: [0, 0.2, 0.5] },
    )
    observer.observe(el)
  } else {
    inView.value = true
  }

  if (!hasWebGL2()) {
    status.value = 'fallback'
    return
  }
  await startScene()
})

onBeforeUnmount(() => {
  unmounted = true
  observer?.disconnect()
  observer = null
  forgetLostCanvas()
  handle?.dispose()
  handle = null
})

function togglePlay() {
  userPaused.value = !userPaused.value
}

function goTo(i: number) {
  userNavigated.value = true
  chapterIndex.value = i
  handle?.seek(i)
}

const posterLabel = computed(() => {
  const s = props.streak
  if (!s) return 'Sua sequência'
  return s.current === 1 ? 'dia seguido' : 'dias seguidos'
})
</script>

<template>
  <section
    ref="stageRef"
    class="showcase"
    :class="{ 'is-ready': status === 'ready', 'is-reduced': reduced }"
    aria-label="Vitrine animada do Nevo"
  >
    <!-- Fora do DOM no pôster: um contexto que o navegador restaurar num canvas
         sem cena não fica vivo à toa (a remontagem usa um canvas novo). -->
    <canvas
      v-if="status !== 'fallback'"
      :key="canvasKey"
      ref="canvasRef"
      class="showcase-canvas"
      aria-hidden="true"
    />

    <!-- Pôster em CSS: aparece enquanto a cena carrega e fica de vez sem WebGL. -->
    <Transition name="showcase-fade">
      <div v-if="status !== 'ready'" class="poster" aria-hidden="true">
        <div class="poster-laptop">
          <img src="/showcase/dashboard.webp" alt="" width="1600" height="900" decoding="async" />
        </div>
        <div class="poster-phone">
          <img :src="nevoSrc('fogo-normal')" alt="" class="poster-flame" decoding="async" />
          <strong v-if="streak" class="poster-days">{{ streak.current }}</strong>
          <span class="poster-label">{{ posterLabel }}</span>
        </div>
        <div class="poster-nevo">
          <NevoSprite pose="idle" motion="idle" :size="132" floor />
        </div>
      </div>
    </Transition>

    <div
      class="showcase-caption"
      :class="{ 'is-low': captionLow }"
      :aria-live="userNavigated ? 'polite' : 'off'"
    >
      <Transition name="caption-swap" mode="out-in" @before-enter="onCaptionEnter">
        <div :key="chapter.id">
          <!-- "Capítulo N de 5" só com os controles na tela: no pôster (sem
               WebGL, carregando) prometia uma sequência que não dá para navegar. -->
          <p v-if="status === 'ready'" class="caption-step">
            Capítulo {{ chapterIndex + 1 }} de {{ total }}
          </p>
          <p class="caption-title">{{ chapter.title }}</p>
          <p class="caption-sub">{{ subtitle }}</p>
        </div>
      </Transition>
    </div>

    <div v-if="status === 'ready'" class="showcase-controls">
      <ol ref="chaptersRef" class="chapters" aria-label="Capítulos da vitrine">
        <li v-for="(c, i) in SHOWCASE_CHAPTERS" :key="c.id">
          <button
            type="button"
            class="chapter-btn"
            :class="{ 'is-active': i === chapterIndex, 'is-done': i < chapterIndex }"
            :aria-label="`Ir para o capítulo ${i + 1}: ${c.title}`"
            :aria-current="i === chapterIndex ? 'step' : undefined"
            @click="goTo(i)"
          >
            <span class="chapter-bar"><span class="chapter-fill" /></span>
          </button>
        </li>
      </ol>
      <button
        v-if="canPlay"
        type="button"
        class="play-btn"
        :aria-label="userPaused ? 'Tocar vitrine' : 'Pausar vitrine'"
        @click="togglePlay"
      >
        <Play v-if="userPaused" :size="18" aria-hidden="true" />
        <Pause v-else :size="18" aria-hidden="true" />
      </button>
    </div>
  </section>
</template>

<style scoped>
/*
 * O palco é o próprio card: fundo --surface (o canvas é transparente e a cena
 * pinta só a sombra no chão), mesma elevação do .bento-cell do dashboard.
 * Largura do pai, 16:9 até 460px de altura; em telas estreitas a altura mínima
 * segura a legenda e os controles sem espremer a cena.
 */
.showcase {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 460px;
  min-height: 280px;
  overflow: hidden;
  isolation: isolate;
  container-type: inline-size;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border);
  background-color: var(--surface);
  background-image: var(--elev-1);
  box-shadow:
    var(--shadow-sm),
    inset 0 1px 0 var(--elev-hi);
}

.showcase-canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

/* ── Pôster (sem WebGL / carregando) ── */
.poster {
  position: absolute;
  inset: 0;
  z-index: 1;
  background-color: var(--surface);
  background-image: var(--elev-1);
}

.poster-laptop {
  position: absolute;
  left: 6%;
  top: 21%;
  width: 58%;
  padding: 1.2%;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-strong);
  background: var(--surface-3);
  box-shadow: var(--shadow);
}

.poster-laptop img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-sm);
}

.poster-phone {
  position: absolute;
  right: 8%;
  top: 12%;
  width: 19%;
  aspect-ratio: 9 / 19;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  box-shadow: var(--shadow);
  text-align: center;
}

.poster-flame {
  width: 42%;
  height: auto;
}

.poster-days {
  color: var(--text);
  font-size: clamp(1.5rem, 5cqw, 2.5rem);
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.poster-label {
  color: var(--text-2);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.2;
}

.poster-nevo {
  position: absolute;
  right: 25%;
  bottom: 4%;
}

.showcase-fade-leave-active {
  transition: opacity var(--motion-slow) var(--motion-ease);
}

.showcase-fade-leave-to {
  opacity: 0;
}

/* ── Legenda ── */
/* Canto superior esquerdo: o chão (embaixo) é onde o Nevo corre e as
   sombras encostam; em cima, na maior parte dos planos, só tem fundo. */
.showcase-caption {
  position: absolute;
  z-index: 2;
  top: 14px;
  left: 14px;
  max-width: min(400px, 50%);
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  /* Painel translúcido NEUTRO: a cena aparece borrada atrás, o texto fica
     sobre a cor do card (contraste AA garantido pelos tokens de texto). */
  background: color-mix(in srgb, var(--surface) 86%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: var(--shadow-sm);
}

.caption-step {
  margin: 0 0 2px;
  color: var(--text-3);
  font-size: 0.8125rem;
  font-weight: 600;
}

.caption-title {
  margin: 0;
  color: var(--text);
  font-size: var(--text-body-large);
  font-weight: 700;
  line-height: 1.25;
}

.caption-sub {
  margin: 4px 0 0;
  color: var(--text-2);
  font-size: 0.875rem;
  line-height: 1.4;
}

.caption-swap-enter-active,
.caption-swap-leave-active {
  transition:
    opacity 220ms var(--motion-ease),
    transform 220ms var(--motion-ease);
}

.caption-swap-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.caption-swap-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ── Controles ── */
.showcase-controls {
  position: absolute;
  z-index: 2;
  right: 14px;
  bottom: 14px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 86%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: var(--shadow-sm);
}

.chapters {
  display: flex;
  margin: 0;
  padding: 0;
  list-style: none;
}

.chapter-btn {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
}

.chapter-bar {
  display: block;
  width: 18px;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  /* --text-4 e não --border: a barra é controle, precisa de 3:1 com o fundo. */
  background: var(--text-4);
  transition: width var(--motion) var(--motion-ease);
}

.chapter-fill {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--text);
  transform-origin: left center;
  transform: scaleX(0);
}

.chapter-btn.is-done .chapter-fill {
  transform: scaleX(1);
}

.chapter-btn.is-active .chapter-bar {
  width: 32px;
}

.chapter-btn.is-active .chapter-fill {
  transform: scaleX(var(--chapter-p, 0));
}

/* Parado em movimento reduzido, o capítulo atual aparece inteiro. */
.showcase.is-reduced .chapter-btn.is-active .chapter-fill {
  transform: scaleX(1);
}

.chapter-btn:hover .chapter-bar {
  background: var(--text-3);
}

.play-btn {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text);
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease);
}

.play-btn:hover {
  background: color-mix(in srgb, var(--text) 14%, var(--surface-3));
}

.chapter-btn:focus-visible,
.play-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/*
 * Palco 16:9 estreito (a vitrine na coluna da home, ~614px a 1440): a legenda
 * ocupa metade da largura e, em cima, cobria o assunto dos capítulos 2 a 5.
 * Nesses ela desce para o canto de baixo à esquerda (teclado e base do
 * notebook), ao lado dos controles, sem encostar neles (~270px de pílula).
 */
@container (min-width: 561px) and (max-width: 760px) {
  .showcase-caption.is-low {
    top: auto;
    bottom: 14px;
    max-width: min(400px, calc(100% - 314px));
  }
}

/* Contêiner estreito (celular, coluna lateral): legenda em cima, controles embaixo. */
@container (max-width: 560px) {
  .showcase-caption {
    top: 10px;
    right: 10px;
    left: 10px;
    max-width: none;
    padding: 10px 12px;
  }

  .caption-step {
    display: none;
  }

  .showcase-controls {
    right: 50%;
    bottom: 10px;
    transform: translateX(50%);
  }

  .poster-laptop {
    top: 30%;
    width: 66%;
  }

  .poster-phone {
    top: 28%;
    width: 22%;
  }

  .poster-nevo {
    display: none;
  }
}

/*
 * Tela de celular: o palco fica mais alto que 16:9. A cena corrige o FOV para
 * manter o enquadramento horizontal, então a altura extra vira respiro entre a
 * legenda (em cima) e os controles (embaixo), em vez de espremer os aparelhos.
 * Media query de viewport (e não de contêiner) porque a regra é no próprio
 * palco, que não pode consultar o próprio tamanho.
 */
@media (max-width: 640px) {
  .showcase {
    min-height: 380px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .showcase-fade-leave-active,
  .caption-swap-enter-active,
  .caption-swap-leave-active,
  .chapter-bar,
  .play-btn {
    transition: none;
  }
}
</style>
