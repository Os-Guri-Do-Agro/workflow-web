<script setup lang="ts">
/**
 * TierTrack: "Evolução do Nevo", os 5 níveis do mascote pela sequência atual
 * (Básico 1 a 3 dias ... Lendário 31+ dias).
 *
 * Props:
 * - `current`: sequência atual em dias (mostra "Faltam N dias" no próximo nível).
 * - `tierKey`: nível atual (`StreakMe.tier.key`; `none` = nenhum alcançado).
 *
 * Nível atual: levantado, cor cheia, Nevo animado e selo "Você está aqui".
 * Passados: check. Futuros: silhueta (cinza, opacidade) com cadeado.
 * Em tela estreita vira faixa com rolagem horizontal e snap, já centrada no
 * nível atual.
 *
 * Usado em: StreakHero (home).
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Check, Lock } from 'lucide-vue-next'
import type { StreakTierKey } from '@/service/streak/streak-service'
import NevoSprite from './NevoSprite.vue'
import { NEVO_TIERS, remainingLabel, tierRangeLabel, tierTone } from './nevo-assets'

const props = defineProps<{
  current: number
  tierKey: StreakTierKey
}>()

const currentIdx = computed(() => NEVO_TIERS.findIndex((t) => t.key === props.tierKey))

const items = computed(() =>
  NEVO_TIERS.map((t, i) => {
    const state = i < currentIdx.value ? 'past' : i === currentIdx.value ? 'current' : 'future'
    const isNext = i === currentIdx.value + 1
    const remaining = Math.max(0, t.min - props.current)
    const stateText =
      state === 'past'
        ? 'nível já alcançado'
        : state === 'current'
          ? 'seu nível atual'
          : `bloqueado, ${remainingLabel(remaining).toLowerCase()}`
    return {
      ...t,
      state,
      isNext,
      remaining,
      range: tierRangeLabel(t),
      tone: tierTone(t.key),
      srText: `${t.label}, ${tierRangeLabel(t)}: ${stateText}.`,
    }
  }),
)

// No estreito a faixa rola; o nível atual precisa aparecer sem a pessoa caçar.
// `scrollLeft` e não `scrollIntoView`: este último rola a PÁGINA também.
const scroller = ref<HTMLElement | null>(null)

function centerCurrent() {
  const el = scroller.value
  if (!el || el.scrollWidth <= el.clientWidth) return
  const target = el.querySelector<HTMLElement>('.ttrack__item.is-current')
  if (!target) return
  el.scrollLeft = target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2
}

onMounted(centerCurrent)
watch(
  () => props.tierKey,
  () => void nextTick(centerCurrent),
)
</script>

<template>
  <div
    ref="scroller"
    class="ttrack"
    tabindex="0"
    role="region"
    aria-label="Evolução do Nevo pelos níveis da sequência"
  >
    <ol class="ttrack__list">
      <li
        v-for="t in items"
        :key="t.key"
        class="ttrack__item"
        :class="`is-${t.state}`"
        :style="{ '--tt-tone': t.tone }"
      >
        <span class="ttrack__sr">{{ t.srText }}</span>

        <span v-if="t.state === 'current'" class="ttrack__here" aria-hidden="true">Você está aqui</span>

        <span class="ttrack__stage" aria-hidden="true">
          <NevoSprite
            class="ttrack__sprite"
            :pose="t.pose"
            :motion="t.state === 'current' ? t.motion : 'still'"
            :size="72"
            floor
          />
          <span v-if="t.state === 'past'" class="ttrack__badge ttrack__badge--done">
            <Check :size="14" :stroke-width="3" />
          </span>
          <span v-else-if="t.state === 'future'" class="ttrack__badge ttrack__badge--lock">
            <Lock :size="13" :stroke-width="2.4" />
          </span>
        </span>

        <span class="ttrack__range" aria-hidden="true">{{ t.range }}</span>
        <span class="ttrack__label" aria-hidden="true">{{ t.label }}</span>
        <!-- O próximo nível é o convite (inclusive no zero: "Falta 1 dia" para o Básico). -->
        <span v-if="t.isNext" class="ttrack__next" aria-hidden="true">{{ remainingLabel(t.remaining) }}</span>
        <span v-else class="ttrack__blurb" aria-hidden="true">{{ t.blurb }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.ttrack {
  /* offsetParent dos itens: o cálculo de centralização conta a partir daqui. */
  position: relative;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scrollbar-width: thin;
  border-radius: var(--radius-lg);
  /* Com overflow-x o eixo y também recorta: o topo reserva espaço para o item
     atual levantar e para o selo "Você está aqui" que sai acima dele. */
  padding: 18px 8px 10px;
}

.ttrack:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.ttrack__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(148px, 1fr);
  gap: 10px;
}

.ttrack__item {
  position: relative;
  scroll-snap-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
  padding: 12px 10px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  transition:
    transform var(--motion-slow) var(--motion-ease),
    background-color var(--motion) var(--motion-ease),
    border-color var(--motion) var(--motion-ease);
}

.ttrack__sr {
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

/* Atual: cartão levantado com tinta do nível e sombra neutra. */
.ttrack__item.is-current {
  transform: translateY(-4px);
  border-color: color-mix(in srgb, var(--tt-tone) 45%, var(--border));
  background: color-mix(in srgb, var(--tt-tone) 9%, var(--surface-2));
  box-shadow: var(--shadow);
}

.ttrack__here {
  position: absolute;
  top: -11px;
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tt-tone) 50%, var(--border));
  background: var(--surface);
  color: var(--text);
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
}

.ttrack__stage {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  /* Nevo de 72px + folga do pulo do nível atual, que usa o padding do cartão. */
  height: 80px;
  margin-bottom: 4px;
}

/* Futuro: silhueta. Filtro de cor, sem brilho. */
.is-future .ttrack__sprite {
  filter: grayscale(1);
  opacity: 0.4;
}

/* No claro o cinza do sprite quase some no branco: escurece um pouco. */
[data-theme='light'] .is-future .ttrack__sprite {
  filter: grayscale(1) brightness(0.82);
  opacity: 0.5;
}

.ttrack__badge {
  position: absolute;
  right: -6px;
  bottom: 2px;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 2px solid var(--surface);
}

.ttrack__badge--done {
  background: var(--success);
  color: var(--surface);
}

.ttrack__badge--lock {
  background: var(--surface-3);
  color: var(--text-3);
}

.ttrack__range {
  font-size: 0.9375rem;
  font-weight: 750;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.ttrack__label {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--tt-tone);
}

.ttrack__blurb,
.ttrack__next {
  font-size: 0.8125rem;
  line-height: 1.35;
  color: var(--text-3);
}

.ttrack__next {
  font-weight: 700;
  color: var(--streak-flame);
}

.is-future .ttrack__range {
  color: var(--text-2);
}

/* Nome do nível futuro sai da cor: ele ainda não foi "ganho". */
.is-future .ttrack__label {
  color: var(--text-3);
}

@media (prefers-reduced-motion: reduce) {
  .ttrack__item {
    transition: none;
  }
}
</style>
