import { readToken } from '@/plugins/tokens'
// Helpers para os sparklines (ECharts) do Dashboard.
// O canvas do ECharts não entende `var(--xxx)` nem `color-mix`, então
// resolvemos a cor em runtime a partir das CSS custom properties.

export function resolveCssColor(input: string): string {
  if (!input.startsWith('var(')) return input
  // `readToken` cacheia: ler custom property força recálculo de estilo do
  // documento, e isto roda por sparkline.
  return readToken(input.slice(4, -1).trim(), '#6366f1')
}

export function withAlpha(input: string, alpha: number): string {
  const c = resolveCssColor(input)
  // hex #rrggbb -> #rrggbbaa
  if (/^#[0-9a-f]{6}$/i.test(c)) {
    const a = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0')
    return c + a
  }
  // hex #rgb -> expande e aplica alpha
  if (/^#[0-9a-f]{3}$/i.test(c)) {
    const r = c[1],
      g = c[2],
      b = c[3]
    const a = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0')
    return `#${r}${r}${g}${g}${b}${b}${a}`
  }
  // rgb(...) -> rgba(...)
  const m = c.match(/^rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*\)$/i)
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`
  // hsl/named: devolve como está
  return c
}

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
