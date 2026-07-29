export type ThemeName = 'dark' | 'light'
export type AccentName = 'teal' | 'neutral' | 'blue' | 'violet' | 'green' | 'orange' | 'pink'
export type Density = 'compact' | 'comfortable'
export type ShellVariant = 'command' | 'focus' | 'canvas'
/** Escala de fonte do app ("Aumento de fonte" — acessibilidade 50+). */
export type FontScale = 1 | 1.1 | 1.2 | 1.3

type TokenMap = Record<string, string>

const sharedRadiusAndShadow = {
  '--radius-sm': '6px',
  '--radius': '10px',
  '--radius-lg': '14px',
  '--radius-xl': '20px',
  // `--shadow-sm` é redefinida por tema logo abaixo: a mesma sombra suave que
  // funciona no claro desaparece sobre fundo escuro.
  '--shadow-sm': '0 1px 2px rgba(0,0,0,0.20)',
  '--motion-fast': '120ms',
  '--motion': '180ms',
  '--motion-slow': '280ms',
  '--motion-ease': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  // Geist (self-host, ver assets/fonts/geist) é a fonte do produto — variável
  // 100–900, então os pesos intermediários (550/650/720…) renderizam exatos.
  // Inter fica de fallback caso a woff2 ainda não tenha carregado: é a grotesque
  // mais próxima em métrica, o swap quase não desloca layout.
  '--font-family':
    '"Geist", "Inter Variable", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  '--font-mono':
    'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  // Cores fixas de identidade da marca (o mascote xícara). Não variam por tema:
  // são as mesmas do selo em `/brand/marca.svg`. Use quando um componente precisa
  // pintar algo "na cor da marca" (glow do launcher, realces de brand) sem hex solto.
  '--brand-body': '#FFDCB6',
  '--brand-ink': '#4B1B03',
  '--brand-accent': '#ED732A',
  // Tipografia ampliada (modo 50+ / leitura confortável). Escala junto via calc()
  // com --font-scale, aplicada em runtime por applyFontScale().
  '--text-body-large': 'calc(15px * var(--font-scale, 1))',
  '--text-title-large': 'calc(24px * var(--font-scale, 1))',
  // Scrim dos overlays (AppDialog/ConfirmDialog). Preto nos dois temas de
  // propósito: escurecer é o sinal universal de "modal na frente"; véu claro
  // sobre tema claro lê como tela desabilitada.
  '--scrim': 'rgba(0, 0, 0, 0.62)',
  // Metais do pódio (troféu e medalhas do ranking). Não variam por tema: ouro
  // é ouro no claro e no escuro. Cada metal tem três paradas (luz, corpo,
  // sombra) porque o volume vem do gradiente, não de brilho ao redor.
  '--metal-gold-hi': '#FFE9A8',
  '--metal-gold': '#E8B33C',
  '--metal-gold-lo': '#9C6A12',
  '--metal-silver-hi': '#F4F7FA',
  '--metal-silver': '#C2CBD6',
  '--metal-silver-lo': '#7E8894',
  '--metal-bronze-hi': '#F0C39A',
  '--metal-bronze': '#C58045',
  '--metal-bronze-lo': '#7E4A1F',
}

/**
 * Paleta escura redesenhada por cálculo de contraste, não a olho.
 *
 * O que estava errado antes, medido: os degraus de superfície davam 1,05 de
 * razão entre vizinhos (o olho não vê abaixo de ~1,12), a borda ficava em
 * 1,23 contra a superfície (invisível) e `--text-2` para `--text-3` tinha 4%
 * de diferença. Sem degrau, sem borda e sem hierarquia de texto, a tela vira
 * uma massa preta chapada, que é exatamente a sensação de "feio".
 *
 * Critérios que a paleta nova cumpre (validados um a um):
 * - texto principal >= 12:1 sobre `--surface-2`, secundário >= 6:1,
 *   terciário >= 4,5:1 (piso AA) e meta >= 3:1;
 * - passos de texto perceptíveis (~1,6) e regulares entre si;
 * - borda >= 1,45 e borda forte >= 1,9 contra a superfície que separam.
 *
 * O leve viés azul é proposital: cinza neutro puro no escuro lê como "morto",
 * e alguns graus de temperatura dão profundidade sem virar tema colorido.
 */
const darkTokens: TokenMap = {
  ...sharedRadiusAndShadow,
  '--bg': '#111317',
  '--surface': '#181B21',
  '--surface-2': '#20242C',
  '--surface-3': '#2A2F39',
  '--border': 'rgba(230,238,250,0.14)',
  '--border-strong': 'rgba(230,238,250,0.24)',
  '--text': '#F0F3F7',
  '--text-2': 'rgba(240,243,247,0.78)',
  '--text-3': 'rgba(240,243,247,0.58)',
  '--text-4': 'rgba(240,243,247,0.42)',
  // Elevação: no escuro o que "levanta" um card é luz vindo de cima, não sombra
  // (sombra preta sobre fundo preto não aparece). O gradiente e o fio de luz na
  // borda superior fazem o papel que a sombra faz no tema claro.
  '--elev-1': 'linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.014) 42%, rgba(255,255,255,0) 100%)',
  '--elev-hi': 'rgba(255,255,255,0.10)',
  '--status-todo': '#2E90FA',
  '--status-prog': '#F79009',
  '--status-test': '#9E77ED',
  '--status-done': '#12B76A',
  '--status-block': '#F04438',
  '--success': '#12B76A',
  '--warn': '#F79009',
  '--err': '#F04438',
  '--info': '#2E90FA',
  // No escuro a sombra precisa ser mais profunda e mais espalhada que no claro:
  // sobre fundo já escuro, sombra fraca simplesmente não aparece, e sem ela
  // nada parece estar acima de nada.
  '--shadow-sm': '0 1px 2px rgba(0,0,0,0.40)',
  '--shadow': '0 10px 30px rgba(0,0,0,0.50)',
  '--shadow-overlay': '0 24px 64px rgba(0,0,0,0.60)',
  // Tons de identidade de PESSOA (avatares por iniciais). Dessaturados de
  // propósito: são tinta de fundo + cor de texto via color-mix, nunca cor de
  // status — saturação de status aqui viraria ruído semântico no card.
  '--avatar-1': '#8FA8E8',
  '--avatar-2': '#63C1B4',
  '--avatar-3': '#B39DE8',
  '--avatar-4': '#E0A1B8',
  '--avatar-5': '#D4B476',
  '--avatar-6': '#93C79C',
}

/**
 * Tema claro. O fundo é um cinza suave DE PROPÓSITO (não branco): com o app
 * inteiro branco, cards brancos somem no fundo e a tela vira uma folha chapada.
 * Medido (WCAG): card sobre fundo passou de 1,10 para 1,14 com o --bg atual —
 * separação visível sem escurecer a página. Os degraus de texto seguem os
 * mesmos pisos do tema escuro (texto principal 18:1, secundário 7,2:1,
 * meta 4,7:1 sobre --surface-2 — todos acima do AA).
 */
const lightTokens: TokenMap = {
  ...sharedRadiusAndShadow,
  '--bg': '#F0F0F2',
  '--surface': '#FFFFFF',
  '--surface-2': '#F6F6F8',
  '--surface-3': '#ECECEF',
  '--border': 'rgba(11,11,12,0.08)',
  '--border-strong': 'rgba(11,11,12,0.16)',
  '--text': '#0B0B0C',
  '--text-2': 'rgba(11,11,12,0.70)',
  '--text-3': 'rgba(11,11,12,0.70)',
  '--text-4': 'rgba(11,11,12,0.58)',
  '--status-todo': '#2E90FA',
  '--status-prog': '#F79009',
  '--status-test': '#9E77ED',
  '--status-done': '#12B76A',
  '--status-block': '#F04438',
  '--success': '#12B76A',
  '--warn': '#F79009',
  '--err': '#F04438',
  '--info': '#2E90FA',
  // No claro a superfície já é branca: a elevação vem da sombra, então o
  // gradiente é quase imperceptível e serve só para tirar o aspecto chapado.
  '--elev-1': 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(11,11,12,0.012) 100%)',
  '--elev-hi': 'rgba(255,255,255,0.9)',
  '--shadow': '0 6px 18px rgba(0,0,0,0.08)',
  '--shadow-overlay': '0 12px 32px rgba(0,0,0,0.14)',
  // Tons de identidade de pessoa — versão escura dos mesmos 6 matizes do tema
  // dark (texto legível sobre a tinta clara; ver comentário lá).
  '--avatar-1': '#3E63B8',
  '--avatar-2': '#0F8177',
  '--avatar-3': '#6D4FC1',
  '--avatar-4': '#B34A6E',
  '--avatar-5': '#96690F',
  '--avatar-6': '#35793F',
}

export const themeTokens: Record<ThemeName, TokenMap> = {
  dark: darkTokens,
  light: lightTokens,
}

export const accents: Record<AccentName, { dark: string; light: string }> = {
  /*
   * Teal é o acento padrão por eliminação, não por gosto: as cinco cores de
   * status já ocupam azul (a fazer), laranja (em andamento), violeta (em teste),
   * verde (concluído) e vermelho (bloqueado). Qualquer acento nessas famílias
   * competiria com o significado de status dentro do mesmo card. Teal fica de
   * fora dessa lista e ainda é a cor da seta na marca Stack Roads.
   */
  teal: { dark: '#2DD4BF', light: '#0D9488' },
  // O neutro do escuro acompanha a temperatura da paleta: branco puro sobre
  // superfície levemente azulada lê como um remendo amarelado.
  neutral: { dark: '#E6ECF5', light: '#0B0B0C' },
  blue: { dark: '#60A5FA', light: '#2563EB' },
  violet: { dark: '#A78BFA', light: '#7C3AED' },
  green: { dark: '#34D399', light: '#059669' },
  orange: { dark: '#FB923C', light: '#EA580C' },
  pink: { dark: '#F472B6', light: '#DB2777' },
}

const accentForeground: Record<ThemeName, string> = {
  dark: '#0A0C11',
  light: '#FFFFFF',
}

export const vuetifyThemeColors = {
  dark: {
    // primary = cor de AÇÃO (azul). Antes apontava para --surface, o que deixava
    // todo componente Vuetify com color="primary" invisível (superfície sobre superfície).
    primary: accents.blue.dark,
    secondary: darkTokens['--text'],
    background: darkTokens['--bg'],
    surface: darkTokens['--surface-2'],
    error: darkTokens['--err'],
    info: darkTokens['--info'],
    success: darkTokens['--success'],
    warning: darkTokens['--warn'],
    'primary-lighten': '#B0B0B0',
    'secondary-lighten': '#424242',
  },
  light: {
    // primary = cor de AÇÃO (azul). Ver comentário no tema dark.
    primary: accents.blue.light,
    secondary: lightTokens['--text'],
    background: lightTokens['--bg'],
    surface: lightTokens['--surface-2'],
    error: lightTokens['--err'],
    info: lightTokens['--info'],
    success: lightTokens['--success'],
    warning: lightTokens['--warn'],
    'primary-lighten': '#616161',
    'secondary-lighten': '#D0D0D0',
  },
} as const

function hexToRgbTriple(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `${r},${g},${b}`
}

/**
 * Aplica a escala de fonte global ("Aumento de fonte" — acessibilidade 50+).
 *
 * Expõe `--font-scale` no `:root` (consumido por `--text-body-large` e
 * `--text-title-large` via `calc()`) e ajusta o `font-size` raiz, de modo que
 * qualquer dimensão em `rem` e os tokens tipográficos cresçam juntos em runtime,
 * sem reload. `1` = tamanho padrão; `1.3` = 30% maior.
 */
export function applyFontScale(scale: FontScale = 1): void {
  const root = document.documentElement
  root.style.setProperty('--font-scale', String(scale))
  // 16px é o tamanho raiz padrão dos browsers; escalamos a partir dele.
  root.style.fontSize = `${16 * scale}px`
  root.setAttribute('data-font-scale', String(scale))
}

/**
 * Modo Windows XP (easter egg). Liga/desliga o atributo `data-xp` no <html>;
 * as sobrescritas visuais vivem em `styles/xp.css` (tema Luna + wallpaper
 * Bliss). Convive com o tema normal: desligar volta exatamente ao que era.
 */
export function applyXpMode(on: boolean): void {
  const root = document.documentElement
  if (on) root.setAttribute('data-xp', 'true')
  else root.removeAttribute('data-xp')
}

export function applyThemeTokens(theme: ThemeName, accent: AccentName = 'neutral'): void {
  const root = document.documentElement
  const tokens = themeTokens[theme]
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value)
  }
  root.style.setProperty('--accent', accents[accent][theme])
  root.style.setProperty('--accent-fg', accentForeground[theme])
  root.setAttribute('data-theme', theme)
  root.setAttribute('data-accent', accent)
  root.style.colorScheme = theme

  // Safety net: also write Vuetify's theme CSS vars on :root. Vuetify normally
  // scopes them under .v-application.v-theme--X, but if the theme swap on the
  // v-app class doesn't fire (e.g., initial mount, HMR edge case), these root-
  // level values ensure rgb(var(--v-theme-X)) references still track the theme.
  const vt = vuetifyThemeColors[theme] as Record<string, string | undefined>
  const vMap: Record<string, string | undefined> = {
    '--v-theme-primary': vt.primary,
    '--v-theme-secondary': vt.secondary,
    '--v-theme-background': vt.background,
    '--v-theme-surface': vt.surface,
    '--v-theme-error': vt.error,
    '--v-theme-info': vt.info,
    '--v-theme-success': vt.success,
    '--v-theme-warning': vt.warning,
    '--v-theme-on-background': vt.secondary,
    '--v-theme-on-surface': vt.secondary,
    // Texto sobre a nova primary azul: branco garante legibilidade dos botões primary.
    '--v-theme-on-primary': '#FFFFFF',
    '--v-theme-on-secondary': vt.primary,
  }
  for (const [key, value] of Object.entries(vMap)) {
    if (value) root.style.setProperty(key, hexToRgbTriple(value))
  }

  // Also force the Vuetify theme class on every .v-application wrapper.
  // Vuetify's reactive setter (theme.global.name.value) normally handles this,
  // but if it fails to propagate (timing / HMR / multiple instances), this
  // guarantees .v-theme--X matches the active theme so Vuetify components
  // repaint immediately...
  const apps = document.querySelectorAll('.v-application')
  apps.forEach((el) => {
    el.classList.remove('v-theme--dark', 'v-theme--light')
    el.classList.add(`v-theme--${theme}`)
  })
}
