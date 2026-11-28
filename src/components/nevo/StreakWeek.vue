<script setup lang="ts">
/**
 * StreakWeek: a semana da sequência (segunda a domingo), um círculo por dia.
 *
 * Props:
 * - `days`: 7 dias, segunda primeiro (`StreakMe.week` ou `StreakTeamMember.week`
 *   servem direto). Lista vazia mostra a semana apagada.
 * - `size`: `md` (padrão; círculos maiores, rótulos Seg..Dom e chama viva no
 *   hoje pendente) ou `sm` (só círculos, para linha de equipe e popover denso).
 * - `ariaLabel`: rótulo da lista (padrão "Sua semana"); na equipe use o nome.
 *
 * Estados: garantido (verde chapado + check), perfeito (anel dourado +
 * estrela), hoje pendente (anel tracejado laranja), descanso (lua azul-
 * acinzentada), perdido (vazio com traço discreto) e futuro (vazio apagado).
 * Cada dia tem texto para leitor de tela ("Quarta: dia garantido").
 *
 * Usado em: StreakHero (home), popover do StreakChip, TeamStreakPanel, Equipe.
 */
import { computed } from 'vue'
import { Moon, Star } from 'lucide-vue-next'
import NevoFlame from './NevoFlame.vue'
import {
  STREAK_DAY_STATE_LABEL,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  localDayKey,
  streakDayState,
  weekdayIndex,
  type StreakDayState,
} from './nevo-assets'

export interface StreakWeekDay {
  date: string
  secured: boolean
  rest: boolean
  perfect: boolean
  isToday: boolean
}

const props = withDefaults(
  defineProps<{
    days: readonly StreakWeekDay[]
    size?: 'sm' | 'md'
    ariaLabel?: string
  }>(),
  { size: 'md', ariaLabel: 'Sua semana' },
)

interface DayView {
  key: string
  short: string
  state: StreakDayState
  isToday: boolean
  srText: string
}

const items = computed<DayView[]>(() => {
  // Sem dados (carregando, vazio): a semana aparece apagada, sem inventar estado.
  if (props.days.length === 0) {
    return WEEKDAY_SHORT.map((short, i) => ({
      key: `empty-${i}`,
      short,
      state: 'future' as const,
      isToday: false,
      srText: `${WEEKDAY_LONG[i]}: sem dados`,
    }))
  }
  // "Futuro" se decide pela data de hoje da própria lista; sem hoje nela
  // (semana passada, por exemplo), pela data local.
  const today = props.days.find((d) => d.isToday)?.date ?? localDayKey()
  return props.days.map((d) => {
    const idx = weekdayIndex(d.date)
    const state = streakDayState(d, d.date > today)
    return {
      key: d.date,
      short: WEEKDAY_SHORT[idx] ?? '',
      state,
      isToday: d.isToday,
      srText: `${WEEKDAY_LONG[idx] ?? ''}: ${STREAK_DAY_STATE_LABEL[state]}`,
    }
  })
})

const md = computed(() => props.size === 'md')
</script>

<template>
  <ol class="sweek" :class="`sweek--${size}`" :aria-label="ariaLabel">
    <li
      v-for="(d, i) in items"
      :key="d.key"
      class="sweek__day"
      :class="[`is-${d.state}`, { 'is-today': d.isToday }]"
      :style="{ '--sweek-i': i }"
    >
      <span class="sweek__sr">{{ d.srText }}</span>
      <span class="sweek__dot" aria-hidden="true">
        <!-- Garantido: check desenhado (mais legível que ícone de fonte em 18px). -->
        <svg
          v-if="d.state === 'secured'"
          class="sweek__check"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M5.5 12.5l4.2 4.2L18.5 7.8" />
        </svg>
        <Star v-else-if="d.state === 'perfect'" class="sweek__icon" fill="currentColor" :stroke-width="1.5" />
        <Moon
          v-else-if="d.state === 'rest' || d.state === 'today-rest' || d.state === 'future-rest'"
          class="sweek__icon"
          :stroke-width="2.2"
        />
        <NevoFlame v-else-if="d.state === 'today-pending' && md" class="sweek__flame" live :size="18" />
        <span v-else-if="d.state === 'missed'" class="sweek__dash" />
      </span>
      <span v-if="md" class="sweek__label" aria-hidden="true">{{ d.short }}</span>
    </li>
  </ol>
</template>

<style scoped>
.sweek {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.sweek--md {
  gap: 6px;
}

.sweek--sm {
  display: inline-grid;
  grid-template-columns: repeat(7, auto);
  gap: 4px;
}

.sweek__day {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.sweek__sr {
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

/* ─── Círculo ────────────────────────────────────────────────────────────── */
.sweek__dot {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  border-radius: 999px;
  border: 2px solid var(--border-strong);
  background: transparent;
  color: var(--text-3);
  transition:
    background-color var(--motion) var(--motion-ease),
    border-color var(--motion) var(--motion-ease),
    color var(--motion) var(--motion-ease);
}

.sweek--md .sweek__dot {
  /* Cresce com a escala de fonte, mas nunca estoura a coluna. */
  width: min(2.25rem, 100%);
  aspect-ratio: 1;
}

.sweek--sm .sweek__dot {
  width: 18px;
  height: 18px;
  border-width: 1.5px;
}

.sweek__check {
  width: 62%;
  height: 62%;
}

.sweek__icon {
  width: 56%;
  height: 56%;
}

.sweek__dash {
  width: 40%;
  height: 2px;
  border-radius: 2px;
  background: var(--streak-missed);
}

/* Garantido: verde chapado, check na cor da superfície. `--streak-done` e não
   `--success`: no claro o verde do --success dá só 2,6:1 como objeto gráfico
   (círculo contra o branco e check branco sobre ele); no escuro é o mesmo. */
.is-secured .sweek__dot {
  border-color: var(--streak-done);
  background: var(--streak-done);
  color: var(--surface);
  animation: sweek-pop 380ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: calc(var(--sweek-i) * 40ms);
}

/* Perfeito: anel dourado + estrela, com uma tinta leve do mesmo tom. */
.is-perfect .sweek__dot {
  border-color: var(--streak-perfect);
  background: color-mix(in srgb, var(--streak-perfect) 16%, transparent);
  color: var(--streak-perfect);
  animation: sweek-pop 380ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: calc(var(--sweek-i) * 40ms);
}

/* Hoje pendente: anel tracejado na cor da chama (o convite do dia). */
.is-today-pending .sweek__dot {
  border-style: dashed;
  border-color: var(--streak-flame);
  background: var(--streak-flame-soft);
  color: var(--streak-flame);
}

.is-rest .sweek__dot,
.is-today-rest .sweek__dot,
.is-future-rest .sweek__dot {
  border-color: color-mix(in srgb, var(--streak-rest) 45%, transparent);
  background: color-mix(in srgb, var(--streak-rest) 12%, transparent);
  color: var(--streak-rest);
}

.is-missed .sweek__dot {
  border-color: var(--border-strong);
}

.is-future .sweek__dot {
  border-color: var(--border);
}

.is-future-rest .sweek__dot {
  opacity: 0.6;
}

/* Hoje se destaca com um anel externo neutro (o pendente já tem o tracejado
   da chama e dispensa). É contorno, não sombra colorida. */
.is-today:not(.is-today-pending) .sweek__dot {
  box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px var(--border-strong);
}
.sweek--sm .is-today:not(.is-today-pending) .sweek__dot {
  box-shadow: 0 0 0 1.5px var(--surface), 0 0 0 2.5px var(--border-strong);
}

/* ─── Rótulo ─────────────────────────────────────────────────────────────── */
.sweek__label {
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1;
  color: var(--text-3);
  white-space: nowrap;
}

.is-today .sweek__label {
  color: var(--text);
  font-weight: 750;
}

@keyframes sweek-pop {
  0% {
    transform: scale(0.8);
  }
  60% {
    transform: scale(1.08);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-secured .sweek__dot,
  .is-perfect .sweek__dot {
    animation: none;
  }
}
</style>
