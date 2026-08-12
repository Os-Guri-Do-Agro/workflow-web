<script setup lang="ts">
/**
 * Módulo MOVIMENTO do bento: o pulso da semana em gráfico de área com as
 * DUAS séries (criadas × concluídas) — o sparkline antigo mostrava só as
 * criadas e desperdiçava a série de concluídas que a API já manda.
 */
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { Activity } from 'lucide-vue-next'
import {
  chartFontFamily,
  chartThemeDep,
  chartTooltip,
  resolveCssColor,
  withAlpha,
} from '@/plugins/echarts-theme'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent])

const props = defineProps<{
  created: number[]
  completed: number[]
  loading: boolean
}>()

const hasData = computed(
  () => props.created.some((v) => v > 0) || props.completed.some((v) => v > 0),
)

const createdTotal = computed(() => props.created.reduce((a, b) => a + b, 0))

/** Rótulos dos últimos N dias (a série é diária, terminando hoje). */
const dayLabels = computed(() => {
  const len = Math.max(props.created.length, props.completed.length)
  const fmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
  return Array.from({ length: len }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (len - 1 - i))
    return fmt.format(d).replace('.', '')
  })
})

function areaSeries(name: string, data: number[], token: string) {
  const resolved = resolveCssColor(token)
  return {
    name,
    type: 'line',
    data,
    smooth: 0.5,
    symbol: 'none',
    lineStyle: { color: resolved, width: 2 },
    areaStyle: {
      color: {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: withAlpha(token, 0.32) },
          { offset: 1, color: withAlpha(token, 0) },
        ],
      },
    },
  }
}

const option = computed(() => {
  chartThemeDep()
  return {
    grid: { top: 8, right: 4, bottom: 20, left: 4 },
    tooltip: { trigger: 'axis', ...chartTooltip() },
    xAxis: {
      type: 'category',
      data: dayLabels.value,
      boundaryGap: false,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: resolveCssColor('var(--text-4)'),
        fontFamily: chartFontFamily(),
        fontSize: 10.5,
      },
    },
    yAxis: { type: 'value', show: false },
    series: [
      areaSeries('Criadas', props.created, 'var(--accent)'),
      areaSeries('Concluídas', props.completed, 'var(--status-done)'),
    ],
  }
})
</script>

<template>
  <section class="bento-cell mov" aria-label="Movimento semanal">
    <div class="mov-head">
      <span class="eyebrow">Movimento semanal</span>
      <span v-if="createdTotal > 0" class="mov-trend">+{{ createdTotal }}</span>
    </div>
    <div class="mov-legend" aria-hidden="true">
      <span class="mov-key"><i class="mov-dot mov-dot--created" /> criadas</span>
      <span class="mov-key"><i class="mov-dot mov-dot--done" /> concluídas</span>
    </div>
    <div class="mov-chart">
      <div v-if="loading" class="mov-skel" />
      <VChart v-else-if="hasData" :option="option" :autoresize="true" />
      <div v-else class="mov-empty">
        <Activity :size="16" />
        <span>Sem atividade esta semana</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
@import './dashboard-shared.css';

.mov {
  grid-area: mov;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px 20px 10px;
}

.mov-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mov-trend {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--success);
  background: color-mix(in srgb, var(--success) 14%, transparent);
  padding: 2px 8px;
  border-radius: 999px;
}

.mov-legend {
  display: flex;
  gap: 12px;
}

.mov-key {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--text-3);
}

.mov-dot {
  width: 8px;
  height: 8px;
  border-radius: 3px;
}

.mov-dot--created {
  background: var(--accent);
}

.mov-dot--done {
  background: var(--status-done);
}

.mov-chart {
  flex: 1;
  min-height: 0;
}

.mov-skel {
  height: 100%;
  min-height: 90px;
  background: var(--surface-3);
  border-radius: 8px;
  animation: shimmer 1.4s ease infinite;
  background-size: 200% 100%;
}

.mov-empty {
  height: 100%;
  min-height: 90px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-4);
  font-size: 12px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .mov-skel {
    animation: none;
  }
}
</style>
