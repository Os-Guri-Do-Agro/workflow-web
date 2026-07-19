import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import {
  applyFontScale,
  applyThemeTokens,
  applyXpMode,
  type AccentName,
  type Density,
  type FontScale,
  type ShellVariant,
  type ThemeName,
} from '@/plugins/tokens'

const STORAGE = {
  theme: 'ui.theme',
  accent: 'ui.accent',
  density: 'ui.density',
  shell: 'ui.shell',
  fontScale: 'ui.fontScale',
  xp: 'ui.xp',
} as const

const readTheme = (): ThemeName => {
  const v = localStorage.getItem(STORAGE.theme) || localStorage.getItem('theme')
  return v === 'light' ? 'light' : 'dark'
}

const readAccent = (): AccentName => {
  const v = localStorage.getItem(STORAGE.accent) as AccentName | null
  const allowed: AccentName[] = ['teal', 'neutral', 'blue', 'violet', 'green', 'orange', 'pink']
  return v && allowed.includes(v) ? v : 'teal'
}

const readDensity = (): Density => {
  const v = localStorage.getItem(STORAGE.density) as Density | null
  return v === 'comfortable' ? 'comfortable' : 'compact'
}

const readShell = (): ShellVariant => {
  const v = localStorage.getItem(STORAGE.shell) as ShellVariant | null
  const allowed: ShellVariant[] = ['command', 'focus', 'canvas']
  return v && allowed.includes(v) ? v : 'command'
}

const readFontScale = (): FontScale => {
  const v = Number(localStorage.getItem(STORAGE.fontScale))
  const allowed: FontScale[] = [1, 1.1, 1.2, 1.3]
  return (allowed as number[]).includes(v) ? (v as FontScale) : 1
}

const readXp = (): boolean => localStorage.getItem(STORAGE.xp) === 'true'

export const useUiStore = defineStore('ui', () => {
  const theme = ref<ThemeName>(readTheme())
  const accent = ref<AccentName>(readAccent())
  const density = ref<Density>(readDensity())
  const shell = ref<ShellVariant>(readShell())
  const fontScale = ref<FontScale>(readFontScale())
  const xp = ref<boolean>(readXp())

  watch(theme, (v) => {
    localStorage.setItem(STORAGE.theme, v)
    localStorage.setItem('theme', v)
    applyThemeTokens(v, accent.value)
  })

  watch(accent, (v) => {
    localStorage.setItem(STORAGE.accent, v)
    applyThemeTokens(theme.value, v)
  })

  watch(density, (v) => {
    localStorage.setItem(STORAGE.density, v)
  })

  watch(shell, (v) => {
    localStorage.setItem(STORAGE.shell, v)
  })

  watch(fontScale, (v) => {
    localStorage.setItem(STORAGE.fontScale, String(v))
    applyFontScale(v)
  })

  watch(xp, (v) => {
    localStorage.setItem(STORAGE.xp, String(v))
    applyXpMode(v)
  })

  // Aplica a escala salva já no boot (antes de qualquer watch disparar).
  applyFontScale(fontScale.value)
  applyXpMode(xp.value)

  return { theme, accent, density, shell, fontScale, xp }
})
