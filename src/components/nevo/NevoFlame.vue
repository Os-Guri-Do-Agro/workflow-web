<script setup lang="ts">
/**
 * NevoFlame: a chama da sequência (sprites `fogo-*` e chamas-cristal `seq-*`).
 *
 * Props:
 * - `sprite`: chama fixa (ex.: `seq-constancia` de um marco). Sem ela, usa a
 *   chama comum (`fogo-normal`).
 * - `live`: chama viva. Sem `sprite`, roda o flipbook `NEVO_FLIPBOOKS.flame`
 *   (3 frames) com uma tremulação leve de escala; com `sprite`, só tremula.
 * - `lit`: acesa (padrão). `false` = apagada: cinza total, opacidade baixa e
 *   sem animação (dia ainda não garantido, marco não conquistado).
 * - `size`: altura em px (padrão 32).
 * - `alt`: vazio (padrão) = decorativa.
 *
 * Movimento reduzido: estática (`fogo-normal` ou o `sprite` informado).
 *
 * Usado em: chip da topbar, StreakWeek (hoje pendente), MilestoneTrack,
 * StreakCelebration, painel da equipe.
 */
import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { NEVO_FLIPBOOKS, nevoSize, nevoSrc, type NevoSpriteName } from './nevo-assets'

const props = withDefaults(
  defineProps<{
    sprite?: NevoSpriteName
    live?: boolean
    lit?: boolean
    size?: number
    alt?: string
  }>(),
  { sprite: undefined, live: false, lit: true, size: 32, alt: '' },
)

const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')

const animated = computed(() => props.live && props.lit && !reduced.value)

const frames = computed<readonly NevoSpriteName[]>(() => {
  if (animated.value && !props.sprite) return NEVO_FLIPBOOKS.flame
  return [props.sprite ?? 'fogo-normal']
})

/** Mesma regra do NevoSprite: escala única pela maior altura, alinhado pelo pé. */
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
        phase: i / frames.value.length,
      }
    }),
  }
})

const flipbookOn = computed(() => layout.value.frames.length > 1)
const decorative = computed(() => !props.alt)
</script>

<template>
  <span
    class="nflame"
    :class="{ 'nflame--live': animated, 'nflame--off': !lit, 'nflame--flipbook': flipbookOn }"
    :style="{ width: `${layout.width}px`, height: `${layout.height}px` }"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : alt"
    :aria-hidden="decorative ? 'true' : undefined"
  >
    <span class="nflame__body">
      <img
        v-for="f in layout.frames"
        :key="f.name"
        class="nflame__frame"
        :src="f.src"
        :width="f.width"
        :height="f.height"
        :style="flipbookOn ? { '--nflame-phase': f.phase } : undefined"
        alt=""
        draggable="false"
        decoding="async"
      />
    </span>
  </span>
</template>

<style scoped>
.nflame {
  --nflame-cycle: 0.42s;
  position: relative;
  display: inline-block;
  flex: none;
  vertical-align: middle;
  overflow: visible;
  pointer-events: none;
  user-select: none;
}

.nflame__body {
  position: absolute;
  inset: 0;
  transform-origin: 50% 100%;
}

.nflame__frame {
  position: absolute;
  left: 50%;
  bottom: 0;
  max-width: none;
  object-fit: contain;
  object-position: 50% 100%;
  transform: translateX(-50%);
}

/* Apagada: cinza total e recolhida. É filtro de cor, não brilho. */
.nflame--off .nflame__body {
  filter: grayscale(1);
  opacity: 0.42;
}

/* No claro, a chama dourada em cinza ficava quase branca sobre branco:
   escurece e sobe a opacidade para a silhueta continuar legível. */
/* Sem :global(): no CSS scoped ele engole o resto do seletor e a regra caía
   no <html> inteiro. Prefixo de atributo comum mantém o escopo no último nó. */
[data-theme='light'] .nflame--off .nflame__body {
  filter: grayscale(1) brightness(0.78);
  opacity: 0.55;
}

/* Repouso do flipbook: só o primeiro frame visível. */
.nflame--flipbook .nflame__frame {
  opacity: 0;
  animation: nflame-frames var(--nflame-cycle) steps(1, end) infinite;
  animation-delay: calc(var(--nflame-cycle) * var(--nflame-phase) * -1);
}
.nflame--flipbook .nflame__frame:first-child {
  opacity: 1;
}

/* Tremulação: a chama estica e encolhe do pé, sem sair do lugar. */
.nflame--live .nflame__body {
  animation: nflame-flicker 1.4s ease-in-out infinite;
}

@keyframes nflame-frames {
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

@keyframes nflame-flicker {
  0%,
  100% {
    transform: scale(1, 1);
  }
  25% {
    transform: scale(1.03, 0.97);
  }
  50% {
    transform: scale(0.97, 1.05);
  }
  75% {
    transform: scale(1.02, 0.99);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nflame__body,
  .nflame__frame {
    animation: none !important;
  }
}
</style>
