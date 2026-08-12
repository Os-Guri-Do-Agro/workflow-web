// Helpers para os sparklines (ECharts) do Dashboard.
// A resolução de cor token→hex mora em `plugins/echarts-theme.ts` (F0 do
// overhaul visual); aqui fica só a option do sparkline em si.
import { resolveCssColor, withAlpha } from '@/plugins/echarts-theme'

export function sparkOption(data: number[], color: string) {
  const resolved = resolveCssColor(color)
  return {
    grid: { top: 2, right: 2, bottom: 2, left: 2 },
    xAxis: { type: 'category', show: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value', show: false, min: (v: { min: number }) => v.min - v.min * 0.2 },
    series: [
      {
        type: 'line',
        data,
        smooth: 0.55,
        symbol: 'none',
        lineStyle: {
          color: resolved,
          width: 1.6,
          shadowBlur: 8,
          shadowColor: resolved,
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: withAlpha(color, 0.5) },
              { offset: 1, color: withAlpha(color, 0) },
            ],
          },
        },
      },
    ],
  }
}
