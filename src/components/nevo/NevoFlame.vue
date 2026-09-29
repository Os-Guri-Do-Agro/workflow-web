<script setup lang="ts">
/**
 * NevoFlame: a chama da sequência (sprites `fogo-*` e chamas-cristal `seq-*`).
 *
 * Props:
 * - `sprite`: chama fixa (ex.: `seq-constancia` de um marco). Sem ela, usa a
 *   chama comum (`fogo-normal`) ou a do nível (`tier`).
 * - `tier`: nível de quem é dono da chama. ACESA, segue o nível: sem nível e
 *   Básico ficam na laranja animada; de Em progresso para cima vira a
 *   chama-cristal do nível (`tierLitFlame`: laranja-dourado, azul, roxo,
 *   dourado). Apagada continua cinza, igual para todo mundo.
 * - `live`: chama viva. A laranja roda o flipbook `NEVO_FLIPBOOKS.flame`
 *   (3 frames) com uma tremulação leve de escala; sprite único (cristal do
 *   nível ou `sprite` fixo) é estático no arquivo, então tremula só em CSS:
 *   escala e inclinação leves a partir da base. Nunca brilho em volta.
 * - `lit`: acesa (padrão). `false` = apagada: cinza total, opacidade baixa e
 *   sem animação (dia ainda não garantido, marco não conquistado).
 * - `size`: altura em px (padrão 32).
 * - `alt`: vazio (padrão) = decorativa.
 *
 * Movimento reduzido: estática (`fogo-normal`, o cristal do nível ou o
 * `sprite` informado).
 *
 * Usado em: chip da topbar e popover, StreakHero, StreakWeek (hoje pendente),
 * MilestoneTrack, StreakCelebration, painel da equipe, Equipe do /time.
 */
import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import type { StreakTierKey } from '@/service/streak/streak-service'
import {
  NEVO_FLIPBOOKS,
  nevoSize,
  nevoSrc,
  tierLitFlame,
  type NevoSpriteName,
} from './nevo-assets'

const props = withDefaults(
  defineProps<{
    sprite?: NevoSpriteName
    tier?: StreakTierKey | null
    live?: boolean
    lit?: boolean
    size?: number
    alt?: string
  }>(),
  { sprite: undefined, tier: null, live: false, lit: true, size: 32, alt: '' },
)

const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')

const animated = computed(() => props.live && props.lit && !reduced.value)

/** Sprite único: o fixo informado ou, acesa, o cristal do nível. */
const single = computed<NevoSpriteName | null>(
  () => props.sprite ?? (props.lit ? tierLitFlame(props.tier) : null),
)

const frames = computed<readonly NevoSpriteName[]>(() => {
  if (single.value) return [single.value]
  if (animated.value) return NEVO_FLIPBOOKS.flame
  return ['fogo-normal']
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
/** Viva e de frame único: tremula com inclinação (o flipbook já tem movimento próprio). */
const sway = computed(() => animated.value && !flipbookOn.value)
const decorative = computed(() => !props.alt)
</script>

<template>
  <span
    class="nflame"
    :class="{
      'nflame--live': animated,
      'nflame--sway': sway,
      'nflame--off': !lit,
      'nflame--flipbook': flipbookOn,
    }"
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

/* Frame único (cristal do nível, chama de marco): o arquivo é parado, então o
   movimento vem todo daqui. Escala e inclinação leves, com a base fixa, num
   ciclo um pouco mais lento que a laranja para não parecer tremor. */
.nflame--sway .nflame__body {
  animation: nflame-sway 2.2s ease-in-out infinite;
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

@keyframes nflame-sway {
  0%,
  100% {
    transform: rotate(0deg) scale(1, 1);
  }
  20% {
    transform: rotate(-2deg) scale(1.02, 0.98);
  }
  45% {
    transform: rotate(1.5deg) scale(0.98, 1.04);
  }
  70% {
    transform: rotate(-1deg) scale(1.01, 0.99);
  }
  85% {
    transform: rotate(0.6deg) scale(0.995, 1.015);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nflame__body,
  .nflame__frame {
    animation: none !important;
  }
}
</style>
