<script setup lang="ts">
/**
 * Rail lateral de insights do "Meu tempo" — preenche o espaço à direita da lista
 * com leitura rápida do período (total, média/dia, faturável), ritmo do período
 * selecionado, destaques (melhor dia, sequência, sessão mais longa) e onde o
 * tempo foi, por empresa e por tarefa. Puramente derivado (recebe tudo por
 * props); não faz fetch nem conhece o timer.
 *
 * `sampleNote` existe porque nem todo card sai do agregado do servidor: os que
 * ainda são contados na página de entradas carregada dizem isso em vez de passar
 * por total do período.
 */
import { computed } from 'vue'
import { CalendarCheck, Flame, Hourglass } from 'lucide-vue-next'
import RailCard from '@/features/time/components/RailCard.vue'
import MiniBars from '@/features/time/components/MiniBars.vue'
import BreakdownList from '@/features/time/components/BreakdownList.vue'
import { formatDurationLong } from '@/utils/duration'

const props = defineProps<{
  rangeTotalSec: number
  rangeBillableSec: number
  avgPerDaySec: number
  billablePct: number
  pulse: { key: string; sec: number; wd: string; isToday: boolean }[]
  pulseMax: number
  pulseTitle: string
  pulseDense: boolean
  byProject: { name: string; sec: number; pct: number }[]
  byTask: { name: string; sec: number; pct: number }[]
  bestDay: { label: string; sec: number } | null
  streakDays: number
  longestSessionSec: number
  /** Ex.: "nas 50 entradas carregadas". Vazio quando a lista não está truncada. */
  sampleNote: string
}>()

const streakLabel = computed(() =>
  props.streakDays === 1 ? '1 dia seguido' : `${props.streakDays} dias seguidos`,
)

/** "Sem tarefa" sozinho não é insight: só mostra a quebra se houver tarefa real. */
const hasRealTasks = computed(() => props.byTask.some((t) => t.name !== 'Sem tarefa'))
</script>

<template>
  <aside class="rail">
    <RailCard title="Resumo do período">
      <div class="rail-hero">
        <span class="rail-hero-val">{{ formatDurationLong(rangeTotalSec) }}</span>
        <span class="rail-hero-lbl">registrado</span>
      </div>
      <div class="rail-metrics">
        <div class="rail-metric">
          <span class="rail-metric-val">{{ formatDurationLong(avgPerDaySec) }}</span>
          <span class="rail-metric-lbl">média por dia</span>
        </div>
        <div class="rail-metric">
          <span class="rail-metric-val rail-metric-val--bill">
            {{ formatDurationLong(rangeBillableSec) }}
          </span>
          <span class="rail-metric-lbl">faturável</span>
        </div>
      </div>
      <div class="rail-split" :aria-label="`${billablePct}% faturável`">
        <div class="rail-split-fill" :style="{ width: billablePct + '%' }" />
      </div>
      <span class="rail-split-lbl">{{ billablePct }}% do tempo é faturável</span>
    </RailCard>

    <RailCard :title="pulseTitle">
      <MiniBars :days="pulse" :max="pulseMax" :dense="pulseDense" />
    </RailCard>

    <RailCard title="Destaques">
      <ul class="rail-facts">
        <li v-if="bestDay" class="rail-fact">
          <span class="rail-fact-icon"><CalendarCheck :size="14" /></span>
          <span class="rail-fact-main">
            <span class="rail-fact-val">{{ formatDurationLong(bestDay.sec) }}</span>
            <span class="rail-fact-lbl">melhor dia ({{ bestDay.label.toLowerCase() }})</span>
          </span>
        </li>
        <!-- A sequência é contada DENTRO do período: no dia 1º de um mês ela
             vale 1 mesmo com meio ano de hábito atrás. O rótulo diz isso. -->
        <li v-if="streakDays > 0" class="rail-fact">
          <span class="rail-fact-icon"><Flame :size="14" /></span>
          <span class="rail-fact-main">
            <span class="rail-fact-val">{{ streakLabel }}</span>
            <span class="rail-fact-lbl">registrando tempo, dentro do período</span>
          </span>
        </li>
        <li v-if="longestSessionSec > 0" class="rail-fact">
          <span class="rail-fact-icon"><Hourglass :size="14" /></span>
          <span class="rail-fact-main">
            <span class="rail-fact-val">{{ formatDurationLong(longestSessionSec) }}</span>
            <span class="rail-fact-lbl">
              sessão mais longa<template v-if="sampleNote"> ({{ sampleNote }})</template>
            </span>
          </span>
        </li>
      </ul>
    </RailCard>

    <RailCard v-if="byProject.length" title="Onde foi seu tempo">
      <BreakdownList :items="byProject" />
    </RailCard>

    <RailCard v-if="hasRealTasks" title="Top tarefas">
      <BreakdownList :items="byTask" />
      <p v-if="sampleNote" class="rail-note">Contado {{ sampleNote }}.</p>
    </RailCard>
  </aside>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Nota de base: diz de onde o número saiu quando não é o agregado do período. */
.rail-note {
  margin: 10px 0 0;
  color: var(--text-4);
  font-size: 10.5px;
  line-height: 1.4;
}

/* Resumo */
.rail-hero {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 14px;
}

.rail-hero-val {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.rail-hero-lbl {
  font-size: 12px;
  color: var(--text-3);
}

.rail-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}

.rail-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--surface-2);
}

.rail-metric-val {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.rail-metric-val--bill {
  color: var(--success);
}

.rail-metric-lbl {
  font-size: 11px;
  color: var(--text-3);
}

.rail-split {
  height: 8px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.rail-split-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--success);
  transition: width var(--motion-slow) var(--motion-ease);
}

.rail-split-lbl {
  display: block;
  margin-top: 7px;
  font-size: 11.5px;
  color: var(--text-3);
}

/* Destaques */
.rail-facts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rail-fact {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rail-fact-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-3);
}

.rail-fact-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.rail-fact-val {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.rail-fact-lbl {
  font-size: 11px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .rail-split-fill {
    transition: none;
  }
}
</style>
