<script setup lang="ts">
/**
 * Cliques e leituras de QR por dia (90 dias). Duas linhas, cores de tag do
 * design system (nunca as default do ECharts), tooltip do tema e repintura na
 * troca de tema/acento pelo `chartThemeDep`. A legenda é em HTML (as duas
 * séries precisam de nome, e cor sozinha não basta).
 */
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import {
  chartFontFamily,
  chartThemeDep,
  chartTooltip,
  resolveCssColor,
  withAlpha,
} from '@/plugins/echarts-theme'
import type { UtmMetrics } from '@/service/marketing/marketing-utm'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent])

const props = defineProps<{ days: UtmMetrics['days']; hasQr: boolean }>()

const CLICK_TOKEN = 'var(--tag-teal)'
const SCAN_TOKEN = 'var(--tag-orange)'

function dayLabel(ymd: string) {
  const [, m, d] = ymd.split('-')
  return `${d}/${m}`
}

const option = computed(() => {
  void chartThemeDep()
  const click = resolveCssColor(CLICK_TOKEN)
  const scan = resolveCssColor(SCAN_TOKEN)
  const text = resolveCssColor('var(--text-3)')
  const grid = withAlpha('var(--border)', 0.9)
  const font = chartFontFamily()
  const series = [
    {
      name: 'Cliques',
      type: 'line' as const,
      showSymbol: false,
      smooth: false,
      lineStyle: { width: 2, color: click },
      itemStyle: { color: click },
      data: props.days.map((d) => d.clicks),
    },
    ...(props.hasQr
      ? [
          {
            name: 'Leituras de QR',
            type: 'line' as const,
            showSymbol: false,
            smooth: false,
            lineStyle: { width: 2, color: scan },
            itemStyle: { color: scan },
            data: props.days.map((d) => d.scans),
          },
        ]
      : []),
  ]
  return {
    animation: false,
    grid: { left: 30, right: 8, top: 10, bottom: 22 },
    tooltip: { trigger: 'axis', ...chartTooltip() },
    xAxis: {
      type: 'category' as const,
      boundaryGap: false,
      data: props.days.map((d) => dayLabel(d.day)),
      axisLine: { lineStyle: { color: grid } },
      axisTick: { show: false },
      axisLabel: { color: text, fontFamily: font, fontSize: 11, interval: 14 },
    },
    yAxis: {
      type: 'value' as const,
      minInterval: 1,
      splitLine: { lineStyle: { color: grid } },
      axisLabel: { color: text, fontFamily: font, fontSize: 11 },
    },
    series,
  }
})
</script>

<template>
  <div class="mc">
    <ul class="mc-legend" aria-label="Séries do gráfico">
      <li><span class="mc-dot" :style="{ background: CLICK_TOKEN }" aria-hidden="true" />Cliques no link</li>
      <li v-if="hasQr"><span class="mc-dot" :style="{ background: SCAN_TOKEN }" aria-hidden="true" />Leituras de QR</li>
    </ul>
    <VChart class="mc-chart" :option="option" autoresize />
  </div>
</template>

<style scoped>
.mc {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mc-legend {
  display: flex;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: var(--text-2);
}

.mc-legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.mc-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.mc-chart {
  width: 100%;
  height: 170px;
}
</style>
