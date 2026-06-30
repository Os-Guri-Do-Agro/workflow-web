<script setup lang="ts">
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import Skeleton from '@/components/ui/Skeleton.vue'
import { sparkOption } from './spark'
import type { StatCard } from '@/composables/useDashboardOrchestration'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent])

defineProps<{
  stats: StatCard[]
  loading: boolean
}>()
</script>

<template>
  <section class="stats-row">
    <div v-for="s in stats" :key="s.title" class="stat-card" :style="{ '--stat-c': s.color }">
      <div v-if="loading" class="stat-skel"><Skeleton type="row" /></div>
      <template v-else>
        <div class="stat-card-head">
          <div class="stat-chip">
            <component :is="s.icon" :size="14" />
          </div>
          <span class="stat-trend">{{ s.trend }}</span>
        </div>
        <div class="stat-value">{{ s.value }}</div>
        <div class="stat-footer">
          <span class="stat-label">{{ s.title }}</span>
          <div class="stat-spark">
            <VChart v-if="!s.noData" :option="sparkOption(s.spark, s.color)" :autoresize="true" />
            <span v-else class="stat-spark-empty" title="Sem atividade registrada">sem atividade</span>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 14px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 112px;
  position: relative;
  overflow: hidden;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: radial-gradient(closest-side, var(--stat-c), transparent 70%);
  opacity: 0.12;
  filter: blur(20px);
  pointer-events: none;
}

.stat-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
}

.stat-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.stat-chip {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--stat-c) 14%, transparent);
  color: var(--stat-c);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.stat-trend {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-2);
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.stat-value {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.035em;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.stat-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-3);
  font-weight: 500;
}

.stat-spark {
  width: 76px;
  height: 26px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.stat-spark-empty {
  font-size: 10px;
  font-style: italic;
  color: var(--text-4);
  white-space: nowrap;
}

.stat-skel {
  flex: 1;
}

/* Degradação escalonada: 4 → 2 → 1 colunas, sem scroll horizontal */
@media (max-width: 1024px) {
  .stats-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .stats-row {
    grid-template-columns: 1fr;
  }
}
</style>
