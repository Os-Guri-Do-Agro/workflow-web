<script setup lang="ts">
/**
 * NevoSprite: o Nevo (xícara mascote) desenhado a partir dos sprites
 * recortados de `public/brand/nevo/`, com animação só em CSS (custa zero no
 * chunk: pode ficar montado na topbar sem gsap).
 *
 * Props:
 * - `pose`: sprite base (ver `NEVO_SPRITES` em nevo-assets). Em `walk`/`run`
 *   é ignorada: a base vira o primeiro frame do flipbook.
 * - `motion`: `idle` (respira e flutua), `walk`/`run` (flipbook de frames com
 *   balanço), `bounce` (pulo com squash & stretch e pausa), `sleep` (respiração
 *   lenta + "z" subindo), `still` (parado). Padrão `idle`.
 * - `size`: altura em px (padrão 120). A largura sai da proporção do sprite.
 * - `flip`: espelha na horizontal (olhar para o outro lado).
 * - `alt`: vazio (padrão) = decorativo, fica fora do leitor de tela.
 * - `floor`: sombra de chão elíptica, neutra, que acompanha o pulo.
 *
 * Movimento reduzido: vira `still` (e o flipbook mostra só o primeiro frame).
 *
 * Usado em: StreakHero (home), TierTrack, StreakCelebration, popover do chip.
 */
import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { NEVO_FLIPBOOKS, nevoSize, nevoSrc, type NevoSpriteName } from './nevo-assets'

export type NevoMotion = 'idle' | 'walk' | 'run' | 'bounce' | 'sleep' | 'still'

const props = withDefaults(
  defineProps<{
    pose: NevoSpriteName
    motion?: NevoMotion
    size?: number
    flip?: boolean
    alt?: string
    floor?: boolean
  }>(),
  { motion: 'idle', size: 120, flip: false, alt: '', floor: false },
)

const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')

/** Duração de um ciclo do flipbook (os dois frames). */
const CYCLE: Partial<Record<NevoMotion, number>> = { walk: 0.5, run: 0.3 }

const book = computed<readonly NevoSpriteName[] | null>(() =>
  props.motion === 'walk' || props.motion === 'run' ? NEVO_FLIPBOOKS[props.motion] : null,
)

const activeMotion = computed<NevoMotion>(() => (reduced.value ? 'still' : props.motion))

/**
 * Frames empilhados. Todos entram no DOM de uma vez (já baixados e
 * decodificados), e a troca é só de opacidade: trocar o `src` a cada passo
 * piscava enquanto a imagem nova decodificava.
 */
const frames = computed<readonly NevoSpriteName[]>(() => {
  const b = book.value
  if (!b) return [props.pose]
  return reduced.value ? b.slice(0, 1) : b
})

/**
 * Escala única para todos os frames, pela MAIOR altura: frames de uma mesma
 * animação têm caixas diferentes e, com escala própria, o personagem mudava
 * de tamanho a cada passo. Todos alinham pelo pé (fundo da caixa).
 */
const layout = computed(() => {
  const dims = frames.value.map((f) => nevoSize(f))
  const maxH = Math.max(...dims.map(([, h]) => h))
  const maxW = Math.max(...dims.map(([w]) => w))
  const scale = props.size / maxH
  return {
    width: Math.round(maxW * scale),
    height: props.size,
    frames: frames.value.map((name, i) => {
      const [w, h] = dims[i] ?? [maxW, maxH]
      return {
        name,
        src: nevoSrc(name),
        width: Math.round(w * scale),
        height: Math.round(h * scale),
        // Fase do frame no ciclo: 0, 1/n, 2/n... (vira atraso negativo no CSS).
        phase: i / frames.value.length,
      }
    }),
  }
})

const flipbookOn = computed(() => layout.value.frames.length > 1)

const rootStyle = computed(() => ({
  width: `${layout.value.width}px`,
  height: `${layout.value.height}px`,
  '--nevo-h': `${props.size}px`,
  '--nevo-cycle': `${CYCLE[props.motion] ?? 0.5}s`,
}))

const decorative = computed(() => !props.alt)
</script>

<template>
  <span
    class="nevo"
    :class="[`nevo--${activeMotion}`, { 'nevo--flipbook': flipbookOn, 'nevo--floor': floor }]"
    :style="rootStyle"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : alt"
    :aria-hidden="decorative ? 'true' : undefined"
  >
    <span v-if="floor" class="nevo__floor" />
    <span class="nevo__body">
      <span class="nevo__flip" :class="{ 'is-flipped': flip }">
        <img
          v-for="f in layout.frames"
          :key="f.name"
          class="nevo__frame"
          :class="flipbookOn ? `nevo__frame--of${layout.frames.length}` : undefined"
          :src="f.src"
          :width="f.width"
          :height="f.height"
          :style="flipbookOn ? { '--nevo-phase': f.phase } : undefined"
          alt=""
          draggable="false"
          decoding="async"
        />
      </span>
    </span>
    <span v-if="activeMotion === 'sleep' || (reduced && motion === 'sleep')" class="nevo__zzz">
      <span class="nevo__z nevo__z--1">z</span>
      <span class="nevo__z nevo__z--2">z</span>
      <span class="nevo__z nevo__z--3">z</span>
    </span>
  </span>
</template>

<style scoped>
.nevo {
  position: relative;
  display: inline-block;
  flex: none;
  vertical-align: bottom;
  /* O pulo e o "z" saem da caixa; cortar aqui decapitava o personagem. */
  overflow: visible;
  pointer-events: none;
  user-select: none;
}

.nevo__body,
.nevo__flip {
  position: absolute;
  inset: 0;
  /* Squash & stretch nascem do pé, como num corpo apoiado no chão. */
  transform-origin: 50% 100%;
}

.nevo__flip.is-flipped {
  transform: scaleX(-1);
}

.nevo__frame {
  position: absolute;
  left: 50%;
  bottom: 0;
  max-width: none;
  object-fit: contain;
  object-position: 50% 100%;
  transform: translateX(-50%);
}

/* Repouso do flipbook: só o primeiro frame. É também o estado que sobra se a
   animação for cortada (movimento reduzido roda 1 iteração e solta o estilo). */
.nevo--flipbook .nevo__frame {
  opacity: 0;
}
.nevo--flipbook .nevo__frame:first-child {
  opacity: 1;
}

.nevo__frame--of2 {
  animation: nevo-frames-2 var(--nevo-cycle) steps(1, end) infinite;
  animation-delay: calc(var(--nevo-cycle) * var(--nevo-phase) * -1);
}
.nevo__frame--of3 {
  animation: nevo-frames-3 var(--nevo-cycle) steps(1, end) infinite;
  animation-delay: calc(var(--nevo-cycle) * var(--nevo-phase) * -1);
}

/* ─── Sombra de chão ─────────────────────────────────────────────────────── */
.nevo__floor {
  position: absolute;
  left: 50%;
  bottom: calc(var(--nevo-h) * -0.035);
  width: 64%;
  height: max(4px, calc(var(--nevo-h) * 0.07));
  border-radius: 50%;
  /* Neutra (token), sem cor: é chão, não brilho. */
  background: radial-gradient(closest-side, var(--nevo-floor), transparent);
  transform: translateX(-50%);
}

/* ─── Movimentos do corpo ────────────────────────────────────────────────── */
.nevo--idle .nevo__body {
  animation: nevo-breathe 3.2s ease-in-out infinite;
}
.nevo--idle .nevo__floor {
  animation: nevo-floor-breathe 3.2s ease-in-out infinite;
}

.nevo--walk .nevo__body {
  animation: nevo-walk-bob var(--nevo-cycle) linear infinite;
}
.nevo--run .nevo__body {
  animation: nevo-run-bob var(--nevo-cycle) linear infinite;
}
.nevo--walk .nevo__floor,
.nevo--run .nevo__floor {
  animation: nevo-floor-step calc(var(--nevo-cycle) / 2) ease-in-out infinite;
}

.nevo--bounce .nevo__body {
  animation: nevo-bounce 1.8s infinite;
}
.nevo--bounce .nevo__floor {
  animation: nevo-floor-bounce 1.8s infinite;
}

.nevo--sleep .nevo__body {
  animation: nevo-sleep 4.2s ease-in-out infinite;
}

/* ─── "z" do sono ────────────────────────────────────────────────────────── */
.nevo__zzz {
  position: absolute;
  top: 4%;
  right: 6%;
  width: 0;
  height: 0;
}
.nevo__z {
  position: absolute;
  left: 0;
  bottom: 0;
  /* Nunca abaixo de 12px, mesmo com o Nevo pequeno. */
  font-size: max(0.75rem, calc(var(--nevo-h) * 0.11));
  font-weight: 800;
  line-height: 1;
  color: var(--text-3);
  /* `backwards`: durante o atraso o "z" fica no 0% (invisível), senão os dois
     últimos apareciam parados na escada antes de começar a subir. */
  animation: nevo-z 3s ease-out infinite backwards;
}
/* Posições de repouso em escada: é o que aparece com movimento reduzido. */
.nevo__z--1 {
  transform: translate(0, 0);
}
.nevo__z--2 {
  font-size: max(0.8125rem, calc(var(--nevo-h) * 0.13));
  transform: translate(0.6em, -0.8em);
  animation-delay: 1s;
}
.nevo__z--3 {
  font-size: max(0.875rem, calc(var(--nevo-h) * 0.15));
  transform: translate(1.2em, -1.6em);
  animation-delay: 2s;
}

/* ─── Keyframes (100% é sempre o repouso) ────────────────────────────────── */
@keyframes nevo-frames-2 {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
  100% {
    opacity: 0;
  }
}

@keyframes nevo-frames-3 {
  0% {
    opacity: 1;
  }
  33.333% {
    opacity: 0;
  }
  100% {
    opacity: 0;
  }
}

@keyframes nevo-breathe {
  0%,
  100% {
    transform: translateY(0) scale(1, 1);
  }
  50% {
    transform: translateY(-2.5%) scale(0.992, 1.018);
  }
}

@keyframes nevo-floor-breathe {
  0%,
  100% {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }
  50% {
    transform: translateX(-50%) scale(0.92);
    opacity: 0.8;
  }
}

/* Um passo por frame: sobe no meio de cada passo, balança para o lado dele. */
@keyframes nevo-walk-bob {
  0%,
  50%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  25% {
    transform: translateY(-3%) rotate(-2deg);
  }
  75% {
    transform: translateY(-3%) rotate(2deg);
  }
}

@keyframes nevo-run-bob {
  0%,
  50%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  25% {
    transform: translateY(-6%) rotate(-3deg);
  }
  75% {
    transform: translateY(-6%) rotate(3deg);
  }
}

@keyframes nevo-floor-step {
  0%,
  100% {
    transform: translateX(-50%) scale(1);
  }
  50% {
    transform: translateX(-50%) scale(0.9);
  }
}

/*
 * Pulo em ~1 s e pausa até 1,8 s. Cada trecho tem a própria curva:
 * antecipação (agacha), impulso (estica subindo), ápice (solta), queda
 * (acelera e estica), impacto (achata), rebote com overshoot e assentamento.
 */
@keyframes nevo-bounce {
  0% {
    transform: translateY(0) scale(1, 1);
    animation-timing-function: cubic-bezier(0.3, 0, 0.6, 1);
  }
  6% {
    transform: translateY(0) scale(1.1, 0.88);
    animation-timing-function: cubic-bezier(0.2, 0.8, 0.4, 1);
  }
  13% {
    transform: translateY(-12%) scale(0.92, 1.1);
    animation-timing-function: cubic-bezier(0.2, 0.6, 0.4, 1);
  }
  24% {
    transform: translateY(-24%) scale(1, 1);
    animation-timing-function: cubic-bezier(0.5, 0, 0.8, 0.5);
  }
  34% {
    transform: translateY(-5%) scale(0.95, 1.07);
    animation-timing-function: linear;
  }
  37% {
    transform: translateY(0) scale(1.14, 0.85);
    animation-timing-function: cubic-bezier(0.2, 0.8, 0.4, 1);
  }
  44% {
    transform: translateY(-4%) scale(0.97, 1.04);
    animation-timing-function: ease-in-out;
  }
  50% {
    transform: translateY(0) scale(1.03, 0.97);
    animation-timing-function: ease-out;
  }
  56%,
  100% {
    transform: translateY(0) scale(1, 1);
  }
}

@keyframes nevo-floor-bounce {
  0%,
  56%,
  100% {
    transform: translateX(-50%) scale(1, 1);
    opacity: 1;
  }
  6% {
    transform: translateX(-50%) scale(1.1, 1);
    opacity: 1;
  }
  24% {
    transform: translateX(-50%) scale(0.62, 0.8);
    opacity: 0.45;
  }
  37% {
    transform: translateX(-50%) scale(1.14, 1);
    opacity: 1;
  }
  44% {
    transform: translateX(-50%) scale(0.95, 1);
    opacity: 0.9;
  }
}

@keyframes nevo-sleep {
  0%,
  100% {
    transform: scale(1, 1);
  }
  50% {
    transform: scale(1.012, 1.03);
  }
}

/* Cada "z" nasce na própria posição de repouso e sobe em diagonal sumindo. */
@keyframes nevo-z {
  0% {
    opacity: 0;
    translate: 0 0;
    scale: 0.7;
  }
  25% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    translate: 0.8em -1.4em;
    scale: 1.1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nevo__body,
  .nevo__floor,
  .nevo__frame,
  .nevo__z {
    animation: none !important;
  }
}
</style>
