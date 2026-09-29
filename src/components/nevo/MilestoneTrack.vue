<script setup lang="ts">
/**
 * MilestoneTrack: "Marcos de sequência", as chamas-cristal de 7, 14, 30, 60 e
 * 100 dias.
 *
 * Props:
 * - `milestones`: `StreakMe.milestones` (conquista vem de `reached`, que a API
 *   calcula pelo recorde). Lista vazia usa os 5 marcos locais pelo `best`.
 * - `current`: sequência atual (quanto falta para o próximo marco).
 * - `best`: recorde (conquista não se perde quando a sequência quebra).
 * - `nextDays`: `StreakMe.nextMilestone.days`, o MESMO próximo marco do palco
 *   da home e do popover do chip. Sem ele, vale a mesma regra da API.
 *
 * Duas leituras separadas, cada uma com a sua régua:
 * - conquista, pelo RECORDE: chama colorida + check; não conquistado, cinza;
 * - próximo marco, pela sequência ATUAL: o primeiro acima dela, com anel de
 *   progresso e "Faltam N dias". Depois de uma quebra ele pode ser um marco já
 *   conquistado (check + anel, "para repetir"): é o que o palco e o chip dizem
 *   e o que a comemoração vai festejar.
 *
 * Usado em: StreakHero (home).
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Check } from 'lucide-vue-next'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import type { StreakMilestone } from '@/service/streak/streak-service'
import NevoFlame from './NevoFlame.vue'
import {
  NEVO_MILESTONES,
  daysLabel,
  milestoneOf,
  milestoneTone,
  remainingLabel,
  type NevoMilestone,
} from './nevo-assets'

const props = defineProps<{
  milestones: readonly StreakMilestone[]
  current: number
  best: number
  /** Próximo marco da API (`null` = todos passados); omitido, calcula igual à API. */
  nextDays?: number | null
}>()

const source = computed<StreakMilestone[]>(() => {
  const list = props.milestones.length
    ? [...props.milestones]
    : NEVO_MILESTONES.map((m) => ({ days: m.days, key: m.key, label: m.label, reached: false }))
  return list.sort((a, b) => a.days - b.days)
})

const items = computed(() => {
  const withReach = source.value.map((m) => ({ ...m, reached: m.reached || props.best >= m.days }))
  // Próximo marco = o primeiro ACIMA da sequência atual, a regra do
  // `nextMilestone` da API (usado no palco e no chip). A conquista continua
  // vindo do recorde; as duas réguas não se misturam.
  const nextDays =
    props.nextDays !== undefined
      ? props.nextDays
      : (withReach.find((m) => m.days > props.current)?.days ?? null)
  return withReach.map((m) => {
    const meta: NevoMilestone | null = milestoneOf(m.key)
    const isNext = m.days === nextDays
    const remaining = Math.max(0, m.days - props.current)
    const remainingText = remainingLabel(remaining).toLowerCase()
    const stateText =
      m.reached && isNext
        ? `conquistado; próximo marco de novo, ${remainingText}`
        : m.reached
          ? 'conquistado'
          : isNext
            ? `próximo marco, ${remainingText}`
            : 'ainda não conquistado'
    return {
      ...m,
      isNext,
      remaining,
      // Já conquistado e de novo à frente: "Faltam 2 dias para repetir".
      nextText: m.reached
        ? `${remainingLabel(remaining)} para repetir`
        : remainingLabel(remaining),
      progress: Math.max(0, Math.min(100, (props.current / m.days) * 100)),
      flame: meta?.flame ?? 'seq-basico',
      blurb: meta?.blurb ?? '',
      tone: milestoneTone(m.key),
      srText: `${daysLabel(m.days)}, ${m.label}: ${stateText}.`,
    }
  })
})

// No estreito a faixa rola: abre já mostrando o próximo marco (mesma regra do
// TierTrack; `scrollLeft` para não rolar a página junto).
const scroller = ref<HTMLElement | null>(null)

function centerNext() {
  const el = scroller.value
  if (!el || el.scrollWidth <= el.clientWidth) return
  const target = el.querySelector<HTMLElement>('.mtrack__item.is-next')
  if (!target) return
  el.scrollLeft = target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2
}

onMounted(centerNext)
watch(
  () => items.value.find((m) => m.isNext)?.days,
  () => void nextTick(centerNext),
)
</script>

<template>
  <div ref="scroller" class="mtrack" tabindex="0" role="region" aria-label="Marcos de sequência">
    <ol class="mtrack__list">
      <li
        v-for="m in items"
        :key="m.key"
        class="mtrack__item"
        :class="{ 'is-reached': m.reached, 'is-next': m.isNext }"
        :style="{ '--mt-tone': m.tone }"
      >
        <span class="mtrack__sr">{{ m.srText }}</span>

        <span class="mtrack__stage" aria-hidden="true">
          <ProgressRing
            v-if="m.isNext"
            :value="m.progress"
            :size="62"
            :stroke="4"
            aria-hidden="true"
          >
            <!-- Conquistado antes (pelo recorde): a chama segue acesa no anel. -->
            <NevoFlame :sprite="m.flame" :lit="m.reached" :size="34" />
          </ProgressRing>
          <NevoFlame v-else :sprite="m.flame" :lit="m.reached" :size="52" />
          <span v-if="m.reached" class="mtrack__badge">
            <Check :size="14" :stroke-width="3" />
          </span>
        </span>

        <span class="mtrack__days" aria-hidden="true">{{ daysLabel(m.days) }}</span>
        <span class="mtrack__label" aria-hidden="true">{{ m.label }}</span>
        <span v-if="m.isNext" class="mtrack__next" aria-hidden="true">{{ m.nextText }}</span>
        <span v-else class="mtrack__blurb" aria-hidden="true">{{ m.blurb }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.mtrack {
  /* offsetParent dos itens: o cálculo de centralização conta a partir daqui. */
  position: relative;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scrollbar-width: thin;
  border-radius: var(--radius-lg);
  padding: 6px 8px 10px;
}

.mtrack:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.mtrack__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(132px, 1fr);
  gap: 10px;
}

.mtrack__item {
  position: relative;
  scroll-snap-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
  padding: 10px 8px;
  border-radius: var(--radius-lg);
}

/* O próximo marco é o convite: cartão com tinta leve da chama dele. */
.mtrack__item.is-next {
  border: 1px solid color-mix(in srgb, var(--mt-tone) 35%, var(--border));
  background: color-mix(in srgb, var(--mt-tone) 7%, var(--surface-2));
}

.mtrack__sr {
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

.mtrack__stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 66px;
  height: 66px;
  margin-bottom: 4px;
}

.mtrack__badge {
  position: absolute;
  right: 0;
  bottom: 2px;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 2px solid var(--surface);
  /* Mesmo verde do dia garantido (5,7:1 no claro; o --success dá 2,6:1). */
  background: var(--streak-done);
  color: var(--surface);
}

.mtrack__days {
  font-size: 0.9375rem;
  font-weight: 750;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.mtrack__label {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-3);
}

.is-reached .mtrack__label {
  color: var(--mt-tone);
}

.mtrack__blurb,
.mtrack__next {
  font-size: 0.8125rem;
  line-height: 1.35;
  color: var(--text-3);
}

.mtrack__next {
  font-weight: 700;
  color: var(--streak-flame);
}

/* Não conquistado e não próximo: o número também recua. */
.mtrack__item:not(.is-reached):not(.is-next) .mtrack__days {
  color: var(--text-2);
}
</style>
