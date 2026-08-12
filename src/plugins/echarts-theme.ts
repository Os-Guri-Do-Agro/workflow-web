import { readToken, themeVersion } from '@/plugins/tokens'

/**
 * Tema tokenizado para ECharts (spec overhaul-visual-premium, F0).
 *
 * O canvas do ECharts não entende `var(--x)` nem `color-mix`, então tudo aqui
 * resolve token → cor concreta via `readToken` (que cacheia e é invalidado por
 * `applyThemeTokens`). Quem monta option DEVE fazê-lo num `computed` que
 * dependa do tema/acento do `uiStore` — é essa dependência que faz o gráfico
 * repintar na troca de tema; este módulo só lê o valor vigente.
 *
 * Nenhum gráfico do produto deve usar as cores default do ECharts.
 */

/**
 * Dependência reativa de tema para options de gráfico.
 *
 * Chame DENTRO do `computed` que monta a option: a leitura registra a
 * dependência em `themeVersion` (incrementada por `applyThemeTokens`), então a
 * troca de tema/acento reexecuta o computed e o canvas repinta com os tokens
 * novos — sem ritual manual de `void theme.value` por componente.
 */
export function chartThemeDep(): number {
  return themeVersion.value
}

export function resolveCssColor(input: string): string {
  if (!input.startsWith('var(')) return input
  return readToken(input.slice(4, -1).trim(), '#6366f1')
}

export function withAlpha(input: string, alpha: number): string {
  const c = resolveCssColor(input)
  if (/^#[0-9a-f]{6}$/i.test(c)) {
    const a = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0')
    return c + a
  }
  if (/^#[0-9a-f]{3}$/i.test(c)) {
    const r = c[1],
      g = c[2],
      b = c[3]
    const a = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0')
    return `#${r}${r}${g}${g}${b}${b}${a}`
  }
  const m = c.match(/^rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*\)$/i)
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`
  return c
}

/** Fonte do produto para textos desenhados em canvas. */
export function chartFontFamily(): string {
  return readToken('--font-family', 'Geist, Inter, sans-serif')
}

/**
 * Cores de STATUS resolvidas, na ordem canônica do produto
 * (a fazer → em andamento → em teste → concluído → bloqueado).
 * É a mesma associação semântica dos chips e do board — gráfico não inventa
 * significado novo de cor.
 */
export function chartStatusColors(): {
  todo: string
  prog: string
  test: string
  done: string
  block: string
} {
  return {
    todo: resolveCssColor('var(--status-todo)'),
    prog: resolveCssColor('var(--status-prog)'),
    test: resolveCssColor('var(--status-test)'),
    done: resolveCssColor('var(--status-done)'),
    block: resolveCssColor('var(--status-block)'),
  }
}

/** Tooltip com a cara do design system (surface, borda, sombra, Geist). */
export function chartTooltip(): Record<string, unknown> {
  return {
    backgroundColor: resolveCssColor('var(--surface)'),
    borderColor: resolveCssColor('var(--border-strong)'),
    borderWidth: 1,
    padding: [8, 12],
    textStyle: {
      color: resolveCssColor('var(--text)'),
      fontFamily: chartFontFamily(),
      fontSize: 12,
    },
    extraCssText: `border-radius: ${readToken('--radius', '10px')}; box-shadow: ${readToken('--shadow', '0 10px 30px rgba(0,0,0,0.5)')};`,
  }
}

/** textStyle base para qualquer texto que o ECharts desenhe. */
export function chartTextStyle(): Record<string, unknown> {
  return {
    color: resolveCssColor('var(--text-2)'),
    fontFamily: chartFontFamily(),
  }
}
