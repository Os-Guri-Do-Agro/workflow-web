<script setup lang="ts">
/**
 * Rail lateral da aba Equipe: leitura rápida do placar do período (total,
 * quem está trabalhando agora, média por pessoa), ritmo dos últimos 7 dias e
 * onde a equipe gastou o tempo. Puramente derivado (recebe tudo por props).
 */
import { computed } from 'vue'
import RailCard from '@/features/time/components/RailCard.vue'
import MiniBars from '@/features/time/components/MiniBars.vue'
import BreakdownList from '@/features/time/components/BreakdownList.vue'
import { formatDurationLong } from '@/utils/duration'
import type { TeamPulseDay } from '@/features/time/composables/useTeamTime'

const props = defineProps<{
  teamTotalSec: number
  activeCount: number
  contributorCount: number
  avgPerPersonSec: number
  billableSec: number
  billablePct: number
  pulse: TeamPulseDay[]
  pulseMax: number
  byActivity: { title: string; sec: number; pct: number }[]
}>()

const activityItems = computed(() =>
  props.byActivity.map((a) => ({ name: a.title, sec: a.sec, pct: a.pct })),
)
</script>

<template>
  <aside class="trail">
    <RailCard title="Placar do período">
      <div class="trail-hero">
        <span class="trail-hero-val">{{ formatDurationLong(teamTotalSec) }}</span>
        <span class="trail-hero-lbl">da equipe</span>
      </div>

      <div class="trail-metrics">
        <div class="trail-metric">
          <span class="trail-metric-val">
            <span
              class="trail-live-dot"
              :class="{ 'trail-live-dot--on': activeCount > 0 }"
              aria-hidden="true"
            />
            {{ activeCount }}
          </span>
          <span class="trail-metric-lbl">trabalhando agora</span>
        </div>
        <div class="trail-metric">
          <span class="trail-metric-val">{{ formatDurationLong(avgPerPersonSec) }}</span>
          <span class="trail-metric-lbl">média por pessoa</span>
        </div>
      </div>

      <template v-if="teamTotalSec > 0">
        <div class="trail-split" :aria-label="`${billablePct}% faturável`">
          <div class="trail-split-fill" :style="{ width: billablePct + '%' }" />
        </div>
        <span class="trail-split-lbl">
          {{ formatDurationLong(billableSec) }} faturável ({{ billablePct }}%)
        </span>
      </template>
      <span v-else class="trail-split-lbl">
        Ninguém registrou tempo neste período ainda.
      </span>
    </RailCard>

    <RailCard title="Ritmo da equipe (7 dias)">
      <MiniBars :days="pulse" :max="pulseMax" />
    </RailCard>

    <RailCard v-if="activityItems.length" title="Onde a equipe gastou">
      <BreakdownList :items="activityItems" />
    </RailCard>
  </aside>
</template>

<style scoped>
.trail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.trail-hero {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 14px;
}

.trail-hero-val {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.trail-hero-lbl {
  font-size: 12px;
  color: var(--text-3);
}

.trail-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}

.trail-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--surface-2);
}

.trail-metric-val {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.trail-metric-lbl {
  font-size: 11px;
  color: var(--text-3);
}

.trail-live-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--text-4);
  flex-shrink: 0;
}

.trail-live-dot--on {
  background: var(--err);
  animation: trail-pulse 1.6s ease-in-out infinite;
}

.trail-split {
  height: 8px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.trail-split-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--success);
  transition: width var(--motion-slow) var(--motion-ease);
}

.trail-split-lbl {
  display: block;
  margin-top: 7px;
  font-size: 11.5px;
  color: var(--text-3);
}

@keyframes trail-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .trail-split-fill {
    transition: none;
  }
  .trail-live-dot--on {
    animation: none;
  }
}
</style>
