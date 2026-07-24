<script setup lang="ts">
/**
 * Rail lateral de insights do "Meu tempo" — preenche o espaço à direita da lista
 * com leitura rápida do período (total, média/dia, faturável), ritmo dos últimos
 * 7 dias e distribuição por projeto. Puramente derivado (recebe tudo por props);
 * não faz fetch nem conhece o timer.
 */
import { formatDurationLong } from '@/utils/duration'

defineProps<{
  rangeTotalSec: number
  rangeBillableSec: number
  avgPerDaySec: number
  billablePct: number
  last7Days: { key: string; sec: number; wd: string; isToday: boolean }[]
  last7Max: number
  byProject: { name: string; sec: number; pct: number }[]
}>()

const PROJ_COLORS = [
  'var(--accent)',
  'var(--status-todo)',
  'var(--status-prog)',
  'var(--status-test)',
  'var(--status-done)',
]
const projColor = (i: number) => PROJ_COLORS[i % PROJ_COLORS.length]

const barHeight = (sec: number, max: number) =>
  Math.max(sec > 0 ? 6 : 0, Math.round((sec / max) * 100)) + '%'
</script>

<template>
  <aside class="rail">
    <!-- Resumo do período -->
    <div class="rail-card">
      <h3 class="rail-title">Resumo do período</h3>
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
          <span class="rail-metric-val rail-metric-val--bill">{{ formatDurationLong(rangeBillableSec) }}</span>
          <span class="rail-metric-lbl">faturável</span>
        </div>
      </div>
      <div class="rail-split" :aria-label="`${billablePct}% faturável`">
        <div class="rail-split-fill" :style="{ width: billablePct + '%' }" />
      </div>
      <span class="rail-split-lbl">{{ billablePct }}% do tempo é faturável</span>
    </div>

    <!-- Ritmo dos últimos 7 dias -->
    <div class="rail-card">
      <h3 class="rail-title">Ritmo (7 dias)</h3>
      <div class="rail-bars">
        <div
          v-for="d in last7Days"
          :key="d.key"
          class="rail-bar-col"
          :class="{ 'rail-bar-col--today': d.isToday }"
          :title="formatDurationLong(d.sec)"
        >
          <div class="rail-bar-track">
            <div class="rail-bar-fill" :style="{ height: barHeight(d.sec, last7Max) }" />
          </div>
          <span class="rail-bar-wd">{{ d.wd }}</span>
        </div>
      </div>
    </div>

    <!-- Onde foi seu tempo (por projeto) -->
    <div v-if="byProject.length" class="rail-card">
      <h3 class="rail-title">Onde foi seu tempo</h3>
      <ul class="rail-proj">
        <li v-for="(p, i) in byProject" :key="p.name" class="rail-proj-row">
          <div class="rail-proj-head">
            <span class="rail-proj-dot" :style="{ background: projColor(i) }" />
            <span class="rail-proj-name">{{ p.name }}</span>
            <span class="rail-proj-dur">{{ formatDurationLong(p.sec) }}</span>
          </div>
          <div class="rail-proj-track">
            <div class="rail-proj-fill" :style="{ width: p.pct + '%', background: projColor(i) }" />
          </div>
        </li>
      </ul>
    </div>
  </aside>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rail-card {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.rail-title {
  margin: 0 0 14px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-3);
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
  background: linear-gradient(90deg, var(--success), color-mix(in srgb, var(--success) 55%, var(--accent)));
  transition: width var(--motion-slow) var(--motion-ease);
}

.rail-split-lbl {
  display: block;
  margin-top: 7px;
  font-size: 11.5px;
  color: var(--text-3);
}

/* Ritmo (mini barras) */
.rail-bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 6px;
  height: 96px;
}

.rail-bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  height: 100%;
}

.rail-bar-track {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--text-4) 12%, transparent);
  overflow: hidden;
}

.rail-bar-fill {
  width: 100%;
  min-height: 0;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 45%, var(--surface-3));
  transition: height var(--motion-slow) var(--motion-ease);
}

.rail-bar-col--today .rail-bar-fill {
  background: var(--accent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 45%, transparent);
}

.rail-bar-wd {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-4);
}

.rail-bar-col--today .rail-bar-wd {
  color: var(--accent);
}

/* Onde foi o tempo */
.rail-proj {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.rail-proj-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 6px;
}

.rail-proj-dot {
  width: 8px;
  height: 8px;
  border-radius: 3px;
  flex-shrink: 0;
}

.rail-proj-name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-proj-dur {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.rail-proj-track {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.rail-proj-fill {
  height: 100%;
  border-radius: 999px;
  min-width: 3px;
  transition: width var(--motion-slow) var(--motion-ease);
}

@media (prefers-reduced-motion: reduce) {
  .rail-split-fill,
  .rail-bar-fill,
  .rail-proj-fill {
    transition: none;
  }
}
</style>
