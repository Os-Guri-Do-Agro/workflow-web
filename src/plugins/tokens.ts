export type ThemeName = 'dark' | 'light'
export type AccentName = 'neutral' | 'blue' | 'violet' | 'green' | 'orange' | 'pink'
export type Density = 'compact' | 'comfortable'
export type ShellVariant = 'command' | 'focus' | 'canvas'

type TokenMap = Record<string, string>

const sharedRadiusAndShadow = {
  '--radius-sm': '6px',
  '--radius': '10px',
  '--radius-lg': '14px',
  '--radius-xl': '20px',
  '--shadow-sm': '0 1px 2px rgba(0,0,0,0.20)',
  '--motion-fast': '120ms',
  '--motion': '180ms',
  '--motion-slow': '280ms',
  '--motion-ease': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  '--font-family':
    '"Inter Variable", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  '--font-mono':
    'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
}

const darkTokens: TokenMap = {
  ...sharedRadiusAndShadow,
  '--bg': '#0B0B0C',
  '--surface': '#121214',
  '--surface-2': '#17171A',
  '--surface-3': '#1D1D21',
  '--border': 'rgba(250,250,250,0.08)',
  '--border-strong': 'rgba(250,250,250,0.14)',
  '--text': '#FAFAFA',
  '--text-2': 'rgba(250,250,250,0.70)',
  '--text-3': 'rgba(250,250,250,0.48)',
  '--text-4': 'rgba(250,250,250,0.32)',
  '--status-todo': '#2E90FA',
  '--status-prog': '#F79009',
  '--status-test': '#9E77ED',
  '--status-done': '#12B76A',
  '--status-block': '#F04438',
  '--success': '#12B76A',
  '--warn': '#F79009',
  '--err': '#F04438',
  '--info': '#2E90FA',
  '--shadow': '0 8px 24px rgba(0,0,0,0.35)',
  '--shadow-overlay': '0 16px 48px rgba(0,0,0,0.45)',
}

const lightTokens: TokenMap = {
  ...sharedRadiusAndShadow,
  '--bg': '#F4F4F5',
  '--surface': '#FFFFFF',
  '--surface-2': '#F7F7F8',
  '--surface-3': '#EFEFF1',
  '--border': 'rgba(11,11,12,0.08)',
  '--border-strong': 'rgba(11,11,12,0.16)',
  '--text': '#0B0B0C',
  '--text-2': 'rgba(11,11,12,0.70)',
  '--text-3': 'rgba(11,11,12,0.48)',
  '--text-4': 'rgba(11,11,12,0.32)',
  '--status-todo': '#2E90FA',
  '--status-prog': '#F79009',
  '--status-test': '#9E77ED',
  '--status-done': '#12B76A',
  '--status-block': '#F04438',
  '--success': '#12B76A',
  '--warn': '#F79009',
  '--err': '#F04438',
  '--info': '#2E90FA',
  '--shadow': '0 6px 18px rgba(0,0,0,0.08)',
  '--shadow-overlay': '0 12px 32px rgba(0,0,0,0.14)',
}

export const themeTokens: Record<ThemeName, TokenMap> = {
  dark: darkTokens,
  light: lightTokens,
}

export const accents: Record<AccentName, { dark: string; light: string }> = {
  neutral: { dark: '#E7E7E7', light: '#0B0B0C' },
  blue: { dark: '#60A5FA', light: '#2563EB' },
  violet: { dark: '#A78BFA', light: '#7C3AED' },
  green: { dark: '#34D399', light: '#059669' },
  orange: { dark: '#FB923C', light: '#EA580C' },
  pink: { dark: '#F472B6', light: '#DB2777' },
}

const accentForeground: Record<ThemeName, string> = {
  dark: '#0B0B0C',
  light: '#FFFFFF',
}

export const vuetifyThemeColors = {
  dark: {
    primary: darkTokens['--surface'],
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
    primary: lightTokens['--surface'],
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
}
