<script setup lang="ts">
/**
 * Cadastros por dia: o período atual (linha cheia) contra o anterior (linha
 * tracejada), alinhados dia a dia. Dia cortado pelo recorte (de 1 a 4) desenha
 * no meio do intervalo com marcador vazado e o tooltip diz "menos de 5"; dia
 * sem envio do app fica sem ponto (a linha quebra), nunca vira zero.
 * Cores de token do tema (nunca as do ECharts) e repintura pelo `chartThemeDep`.
 */
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { chartFontFamily, chartThemeDep, chartTooltip, resolveCssColor, withAlpha } from '@/plugins/echarts-theme'
import type { AppSeriesPoint } from '@/service/marketing/marketing-app-data'
import { fmtDay, fmtSum, midValue } from './app-data-format'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent])

const props = defineProps<{ series: AppSeriesPoint[]; label?: string }>()

const CURRENT_TOKEN = 'var(--tag-teal)'
const PREVIOUS_TOKEN = 'var(--text-3)'

const option = computed(() => {
  void chartThemeDep()
  const cur = resolveCssColor(CURRENT_TOKEN)
  const prev = resolveCssColor(PREVIOUS_TOKEN)
  const text = resolveCssColor('var(--text-3)')
  const grid = withAlpha('var(--border)', 0.9)
  const surface = resolveCssColor('var(--surface)')
  const font = chartFontFamily()
  const point = (s: AppSeriesPoint['value'], color: string) =>
    s
      ? {
          value: midValue(s),
          symbol: s.cut ? 'emptyCircle' : 'circle',
          symbolSize: s.cut ? 7 : 4,
          itemStyle: { color: s.cut ? surface : color, borderColor: color, borderWidth: s.cut ? 1.5 : 0 },
        }
      : { value: null }
  const interval = props.series.length > 31 ? 13 : props.series.length > 10 ? 4 : 0
  return {
    animation: false,
    grid: { left: 34, right: 10, top: 12, bottom: 22 },
    tooltip: {
      trigger: 'axis',
      ...chartTooltip(),
      formatter: (items: { dataIndex: number }[]) => {
        const i = items[0]?.dataIndex ?? 0
        const p = props.series[i]
        if (!p) return ''
        const linha = (dia: string, s: AppSeriesPoint['value'], cor: string) =>
          `<div style="display:flex;gap:8px;align-items:center"><span style="width:8px;height:8px;border-radius:2px;background:${cor}"></span>${fmtDay(dia)}: <b>${s ? fmtSum(s) : 'sem envio'}</b></div>`
        return `${linha(p.date, p.value, cur)}${linha(p.previousDate, p.previous, prev)}`
      },
    },
    xAxis: {
      type: 'category' as const,
      boundaryGap: false,
      data: props.series.map((p) => fmtDay(p.date)),
      axisLine: { lineStyle: { color: grid } },
      axisTick: { show: false },
      axisLabel: { color: text, fontFamily: font, fontSize: 11, interval },
    },
    yAxis: {
      type: 'value' as const,
      minInterval: 1,
      splitLine: { lineStyle: { color: grid } },
      axisLabel: { color: text, fontFamily: font, fontSize: 11 },
    },
    series: [
      {
        name: 'Período anterior',
        type: 'line' as const,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 1.5, color: prev, type: 'dashed' as const },
        itemStyle: { color: prev },
        data: props.series.map((p) => (p.previous ? midValue(p.previous) : null)),
      },
      {
        name: props.label ?? 'Cadastros',
        type: 'line' as const,
        showSymbol: true,
        connectNulls: false,
        lineStyle: { width: 2, color: cur },
        itemStyle: { color: cur },
        data: props.series.map((p) => point(p.value, cur)),
      },
    ],
  }
})
</script>

<template>
  <div class="adc">
    <ul class="adc__legend" aria-label="Séries do gráfico">
      <li><span class="adc__dot" :style="{ background: CURRENT_TOKEN }" aria-hidden="true" />{{ label ?? 'Cadastros' }} no período</li>
      <li><span class="adc__dash" aria-hidden="true" />Período anterior</li>
      <li class="adc__note"><span class="adc__ring" aria-hidden="true" />menos de 5 no dia</li>
    </ul>
    <VChart class="adc__chart" :option="option" autoresize />
  </div>
</template>

<style scoped>
.adc {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.adc__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: var(--text-2);
}

.adc__legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.adc__dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.adc__dash {
  width: 14px;
  border-top: 2px dashed var(--text-3);
}

.adc__ring {
  width: 8px;
  height: 8px;
  border: 1.5px solid var(--tag-teal);
  border-radius: 50%;
}

.adc__note {
  color: var(--text-3);
}

.adc__chart {
  width: 100%;
  height: 200px;
}
</style>
