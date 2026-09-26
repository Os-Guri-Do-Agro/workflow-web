<script setup lang="ts">
/**
 * StreakCelebration: a comemoração da sequência ("Dia garantido!", "Dia
 * perfeito!", "Marco de 7 dias: Primeiro marco").
 *
 * Sem props: lê o estado singleton de `useStreakCelebration`, que também
 * observa `useStreak` e decide QUANDO abrir (uma vez por dia, ver o
 * composable). Deve ser montado UMA vez, no AppShell, fora dos shells: widget
 * de shell remonta na troca de shell e perderia a festa no meio.
 *
 * Comportamento:
 * - Teleport para o body, z 4000 (acima dos popovers de 3000 e abaixo dos
 *   dialogs de 5000: um dialog aberto continua na frente).
 * - Cartão no desenho do "Sequência mantida!" do mock: título e frase no topo,
 *   o Nevo pulando no palco (no marco, com a chama-cristal do marco atrás
 *   dele), a chama viva junto do número e o botão Continuar.
 * - Confete de partículas DOM nas cores dos tokens, sem brilho: estoura do
 *   palco, flutua e cai por ~3 s. Dois sprites de confete parados ficam no
 *   palco (o render já traz o sombreamento; nada de glow).
 * - Fecha com o botão Continuar, Esc, clique no fundo e sozinho em 7 s (o
 *   tempo pausa com o ponteiro sobre o cartão). Foco vai para o botão e volta
 *   para onde estava. Anúncio `aria-live="polite"`.
 * - Movimento reduzido: sem confete voando, sem pulo, chamas paradas (os
 *   sprites de confete do palco ficam, parados).
 *
 * Pode ser importado estaticamente: o gsap (confete) vem por import dinâmico e
 * só é baixado na primeira comemoração.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useStreakCelebration } from '@/composables/useStreakCelebration'
import NevoFlame from './NevoFlame.vue'
import NevoSprite from './NevoSprite.vue'
import { daysLabel, milestoneTone, nevoSize, nevoSrc } from './nevo-assets'

const { state, close } = useStreakCelebration()
const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')

const AUTO_CLOSE_MS = 7000
const CONFETTI_COUNT = 44
/** Cores do confete: tokens chapados, em rodízio. */
const CONFETTI_TONES = 6
const TITLE_ID = 'nevo-celebration-title'
const DESC_ID = 'nevo-celebration-desc'

const title = computed(() => {
  if (state.kind === 'milestone' && state.milestone) {
    return `Marco de ${state.milestone.days} dias: ${state.milestone.label}`
  }
  return state.kind === 'perfect' ? 'Dia perfeito!' : 'Dia garantido!'
})

const subtitle = computed(() => {
  if (state.kind === 'milestone' && state.milestone) return state.milestone.blurb
  if (state.kind === 'perfect') return 'As 3 missões de hoje foram cumpridas. Que ritmo!'
  return state.current > 1
    ? `São ${state.current} dias seguidos. Você está mandando bem!`
    : 'Primeiro dia garantido. Amanhã tem mais!'
})

const pose = computed(() => (state.kind === 'perfect' ? 'victory' : 'comemorando'))

/** Chama-cristal do marco (só no marco): fica atrás do Nevo, do lado. */
const milestoneFlame = computed(() =>
  state.kind === 'milestone' && state.milestone ? state.milestone.flame : null,
)

/** Sprite de confete parado no palco, com a proporção do arquivo. */
const DECOR_H = 58
const decor = (() => {
  const [w, h] = nevoSize('extra-confete')
  return { src: nevoSrc('extra-confete'), width: Math.round((w * DECOR_H) / h), height: DECOR_H }
})()

/** Tinta chapada atrás do palco, no tom do que se comemora. */
const stageTone = computed(() => {
  if (state.kind === 'milestone' && state.milestone) return milestoneTone(state.milestone.key)
  return state.kind === 'perfect' ? 'var(--streak-perfect)' : 'var(--streak-flame)'
})

const unitLabel = computed(() => (state.current === 1 ? 'dia seguido' : 'dias seguidos'))

/** Formas e cores do confete, fixas por índice (sem aleatório no template). */
const pieces = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
  id: i,
  shape: (['rect', 'dot', 'strip'] as const)[i % 3],
  tone: i % CONFETTI_TONES,
}))

// ─── Anúncio para leitor de tela ──────────────────────────────────────────────
// A região viva fica SEMPRE no DOM: região criada junto com o texto costuma não
// ser anunciada. O texto entra depois que o overlay abre.
const announcement = ref('')

// ─── Fechamento automático (pausa com o ponteiro em cima) ────────────────────
let timer: number | null = null
let remaining = AUTO_CLOSE_MS
let startedAt = 0

function clearTimer() {
  if (timer !== null) window.clearTimeout(timer)
  timer = null
}

function startTimer(ms: number) {
  clearTimer()
  remaining = ms
  startedAt = Date.now()
  timer = window.setTimeout(close, ms)
}

function pauseTimer() {
  if (timer === null) return
  clearTimer()
  remaining = Math.max(0, remaining - (Date.now() - startedAt))
}

function resumeTimer() {
  if (!state.open || timer !== null) return
  // Sair de cima do cartão não pode fechar na hora: sobra pelo menos 1,5 s.
  startTimer(Math.max(1500, remaining))
}

// ─── Foco ─────────────────────────────────────────────────────────────────────
const cta = ref<HTMLButtonElement | null>(null)
let lastFocus: HTMLElement | null = null

function onKeydown(e: KeyboardEvent) {
  if (!state.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    return
  }
  // Um único controle no cartão: Tab não sai do overlay para a página atrás.
  if (e.key === 'Tab') {
    e.preventDefault()
    cta.value?.focus()
  }
}

// ─── Confete (gsap sob demanda) ───────────────────────────────────────────────
const confettiLayer = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
let confettiTl: { kill: () => void } | null = null

/**
 * O confete estoura de trás do Nevo: a origem é o palco medido na hora (a
 * altura do cartão muda com o título de uma ou duas linhas).
 */
function placeConfettiOrigin(layer: HTMLElement) {
  const stage = stageEl.value?.getBoundingClientRect()
  const box = layer.getBoundingClientRect()
  if (!stage || !stage.width) return
  layer.style.setProperty('--ncel-ox', `${stage.left - box.left + stage.width / 2}px`)
  layer.style.setProperty('--ncel-oy', `${stage.top - box.top + stage.height * 0.45}px`)
}

async function launchConfetti() {
  if (reduced.value) return
  let mods: [typeof import('gsap'), typeof import('gsap/Physics2DPlugin')]
  try {
    mods = await Promise.all([import('gsap'), import('gsap/Physics2DPlugin')])
  } catch {
    // Sem rede para o chunk: a festa segue sem confete.
    return
  }
  const layer = confettiLayer.value
  if (!state.open || !layer || reduced.value) return
  const [{ gsap }, { Physics2DPlugin }] = mods
  gsap.registerPlugin(Physics2DPlugin)
  confettiTl?.kill()
  placeConfettiOrigin(layer)

  const r = gsap.utils.random
  const tl = gsap.timeline()
  layer.querySelectorAll<HTMLElement>('.ncel__piece').forEach((el, i) => {
    // Duas levas: a segunda sai logo depois e dá volume ao estouro.
    const delay = i % 2 === 0 ? 0 : 0.18
    // ~3 s no ar: com gravidade seca o confete sumia em 1,5 s e a festa
    // passava sem ninguém ver. O atrito (por passo, 30 passos/s no plugin)
    // freia o estouro em ~150 a 280px e limita a queda a ~130 a 170px/s,
    // como papel no ar: o confete fica em volta do cartão, não despenca.
    const duration = r(2.6, 3.4)
    tl.fromTo(
      el,
      { x: 0, y: 0, rotation: 0, rotationX: 0, opacity: 1, scale: r(0.75, 1.15) },
      {
        duration,
        ease: 'none',
        // Ângulo em graus no sistema da tela (270 = para cima): leque de 140°.
        physics2D: {
          velocity: r(520, 920),
          angle: r(200, 340),
          gravity: r(420, 560),
          friction: r(0.09, 0.11),
        },
        rotation: r(-540, 540),
        rotationX: r(-900, 900),
      },
      delay,
    )
    tl.to(el, { opacity: 0, duration: 0.5, ease: 'power1.in' }, delay + duration - 0.5)
  })
  confettiTl = tl
}

// ─── Abrir / fechar ───────────────────────────────────────────────────────────
function onOpen(first: boolean) {
  if (first) {
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.addEventListener('keydown', onKeydown, true)
  }
  const t = title.value
  announcement.value = `${t}${/[.!?]$/.test(t) ? '' : '.'} ${subtitle.value}`
  startTimer(AUTO_CLOSE_MS)
  void nextTick(() => {
    cta.value?.focus()
    void launchConfetti()
  })
}

function onClosed() {
  clearTimer()
  confettiTl?.kill()
  confettiTl = null
  document.removeEventListener('keydown', onKeydown, true)
  // Devolve o foco só se o elemento ainda existe (a rota pode ter mudado).
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus()
  lastFocus = null
  // Limpa depois do fechamento para a mesma frase poder ser anunciada de novo.
  window.setTimeout(() => {
    if (!state.open) announcement.value = ''
  }, 1000)
}

let wasOpen = false

// `seq` muda a cada disparo, inclusive quando uma festa maior chega com o
// overlay já aberto (garantido e logo depois perfeito): reinicia tempo e confete.
watch(
  () => state.seq,
  (seq, prev) => {
    if (!state.open || seq === prev) return
    onOpen(!wasOpen)
    wasOpen = true
  },
)

watch(
  () => state.open,
  (open) => {
    if (open) return
    if (wasOpen) onClosed()
    wasOpen = false
  },
)

// O observador de `useStreakCelebration` roda com `immediate` ainda no setup:
// um marco já visível no primeiro fetch abre a festa ANTES de os watchers acima
// existirem. Aqui ela é assumida assim que o overlay está no DOM.
onMounted(() => {
  if (state.open && !wasOpen) {
    wasOpen = true
    onOpen(true)
  }
})

onBeforeUnmount(() => {
  clearTimer()
  confettiTl?.kill()
  document.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="ncel">
      <div v-if="state.open" class="ncel" @mousedown.self="close">
        <div ref="confettiLayer" class="ncel__confetti" aria-hidden="true">
          <span
            v-for="p in pieces"
            :key="p.id"
            class="ncel__piece"
            :class="[`ncel__piece--${p.shape}`, `ncel__piece--t${p.tone}`]"
          />
        </div>

        <section
          class="ncel__card"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="TITLE_ID"
          :aria-describedby="DESC_ID"
          :style="{ '--ncel-tone': stageTone }"
          @pointerenter="pauseTimer"
          @pointerleave="resumeTimer"
        >
          <h2 :id="TITLE_ID" class="ncel__title">{{ title }}</h2>
          <p :id="DESC_ID" class="ncel__sub">{{ subtitle }}</p>

          <!-- Palco: o Nevo comemorando (no marco, com a chama dele atrás). -->
          <div
            ref="stageEl"
            class="ncel__stage"
            :class="{ 'ncel__stage--milestone': !!milestoneFlame }"
            aria-hidden="true"
          >
            <img
              class="ncel__decor ncel__decor--l"
              :src="decor.src"
              :width="decor.width"
              :height="decor.height"
              alt=""
              draggable="false"
            />
            <img
              class="ncel__decor ncel__decor--r"
              :src="decor.src"
              :width="decor.width"
              :height="decor.height"
              alt=""
              draggable="false"
            />
            <span v-if="milestoneFlame" class="ncel__mflame">
              <NevoFlame :sprite="milestoneFlame" live :size="112" />
            </span>
            <NevoSprite class="ncel__nevo" :pose="pose" motion="bounce" :size="144" floor />
          </div>

          <p class="ncel__count">
            <NevoFlame live :size="46" />
            <span class="ncel__count-text" aria-hidden="true">
              <span class="ncel__num">{{ state.current }}</span>
              <span class="ncel__unit">{{ unitLabel }}</span>
            </span>
            <span class="ncel__sr">Sequência de {{ daysLabel(state.current) }}.</span>
          </p>

          <button ref="cta" type="button" class="ncel__cta" @click="close">Continuar</button>
        </section>
      </div>
    </Transition>
    <div class="ncel__sr" aria-live="polite" aria-atomic="true">{{ announcement }}</div>
  </Teleport>
</template>

<style scoped>
.ncel {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: grid;
  place-items: center;
  padding: 20px;
  /* Scrim mais leve que o dos dialogs: é festa, não bloqueio. */
  background: color-mix(in srgb, var(--scrim) 55%, transparent);
  backdrop-filter: blur(3px);
}

/* ─── Confete ────────────────────────────────────────────────────────────── */
.ncel__confetti {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  pointer-events: none;
  perspective: 600px;
}

.ncel__piece {
  position: absolute;
  /* Sai de trás do Nevo: a origem é o palco, medido no script. O fallback é
     o centro da tela, onde o cartão fica. */
  left: var(--ncel-ox, 50%);
  top: var(--ncel-oy, 50%);
  /* Invisível até o gsap assumir: sem gsap, nada de confete parado na tela. */
  opacity: 0;
  will-change: transform, opacity;
}

.ncel__piece--rect {
  width: 8px;
  height: 13px;
  margin: -6px 0 0 -4px;
  border-radius: 2px;
}

.ncel__piece--dot {
  width: 9px;
  height: 9px;
  margin: -4px 0 0 -4px;
  border-radius: 50%;
}

.ncel__piece--strip {
  width: 5px;
  height: 16px;
  margin: -8px 0 0 -2px;
  border-radius: 3px;
}

.ncel__piece--t0 {
  background: var(--streak-flame);
}
.ncel__piece--t1 {
  background: var(--streak-perfect);
}
.ncel__piece--t2 {
  background: var(--tier-determinado);
}
.ncel__piece--t3 {
  background: var(--tier-especialista);
}
.ncel__piece--t4 {
  background: var(--success);
}
.ncel__piece--t5 {
  background: var(--accent);
}

/* ─── Cartão ─────────────────────────────────────────────────────────────── */
.ncel__card {
  position: relative;
  z-index: 1;
  width: min(380px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 22px 22px 20px;
  text-align: center;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-overlay);
  animation: ncel-pop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/*
 * Palco. Altura = Nevo (144) + pulo (~24% dele, 35px) + chão: o pulo não
 * pode passar por cima da frase logo acima.
 */
.ncel__stage {
  position: relative;
  width: 100%;
  height: 200px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 16px;
  margin: 6px 0 2px;
  border-radius: var(--radius-lg);
  /* Tinta chapada do que se comemora (sem radial, sem brilho). */
  background: color-mix(in srgb, var(--ncel-tone) 8%, var(--surface-2));
}

.ncel__nevo {
  position: relative;
  z-index: 1;
}

/*
 * Marco: a chama-cristal fica atrás do ombro do Nevo, do lado do braço
 * aberto, e o par (chama + Nevo) é que fica centrado. Por isso o Nevo anda
 * para a direita.
 */
.ncel__stage--milestone .ncel__nevo {
  margin-left: 64px;
}

.ncel__mflame {
  position: absolute;
  bottom: 34px;
  left: calc(50% - 98px);
  display: flex;
}

/* Sprites de confete parados, um de cada lado (o da direita espelhado). */
.ncel__decor {
  position: absolute;
  top: 14px;
  max-width: none;
  pointer-events: none;
  user-select: none;
  animation: ncel-decor-in 600ms cubic-bezier(0.34, 1.56, 0.64, 1) 160ms both;
}

.ncel__decor--l {
  left: 9%;
}

.ncel__decor--r {
  top: 30px;
  right: 9%;
  transform: scaleX(-1);
}

.ncel__title {
  margin: 0;
  font-size: var(--text-title-large);
  font-weight: 750;
  line-height: 1.2;
  letter-spacing: -0.01em;
  color: var(--text);
}

.ncel__sub {
  margin: 0;
  max-width: 30ch;
  font-size: var(--text-body-large);
  line-height: 1.45;
  color: var(--text-2);
}

/* Chama viva + número, com a unidade embaixo do número (como no mock). */
.ncel__count {
  margin: 2px 0 0;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.ncel__count-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
}

.ncel__num {
  font-size: 2.75rem;
  font-weight: 800;
  line-height: 0.9;
  letter-spacing: -0.03em;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.ncel__unit {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-3);
}

.ncel__cta {
  width: 100%;
  min-height: 48px;
  margin-top: 8px;
  border: 0;
  border-radius: var(--radius-lg);
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  font-size: var(--text-body-large);
  font-weight: 700;
  cursor: pointer;
  transition:
    transform var(--motion-fast) var(--motion-ease),
    filter var(--motion-fast) var(--motion-ease);
}

.ncel__cta:hover {
  filter: brightness(1.06);
}

.ncel__cta:active {
  transform: scale(0.98);
}

.ncel__cta:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.ncel__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* ─── Entrada e saída ────────────────────────────────────────────────────── */
.ncel-enter-active {
  transition: opacity var(--motion) var(--motion-ease);
}
.ncel-leave-active {
  transition: opacity var(--motion-slow) var(--motion-ease);
}
.ncel-enter-from,
.ncel-leave-to {
  opacity: 0;
}

/* Mola com overshoot, terminando no repouso. */
@keyframes ncel-pop {
  0% {
    opacity: 0;
    transform: translateY(14px) scale(0.9);
  }
  60% {
    opacity: 1;
    transform: translateY(-2px) scale(1.02);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Confete do palco "estoura" no lugar. `scale` e não `transform`: o da
   direita já usa transform para espelhar. */
@keyframes ncel-decor-in {
  0% {
    opacity: 0;
    scale: 0.3;
  }
  100% {
    opacity: 1;
    scale: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ncel__card,
  .ncel__decor {
    animation: none;
  }
  .ncel__confetti {
    display: none;
  }
}
</style>
