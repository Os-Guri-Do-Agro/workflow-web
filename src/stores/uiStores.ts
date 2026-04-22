import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import {
  applyThemeTokens,
  type AccentName,
  type Density,
  type ShellVariant,
  type ThemeName,
} from '@/plugins/tokens'

const STORAGE = {
  theme: 'ui.theme',
  accent: 'ui.accent',
  density: 'ui.density',
  shell: 'ui.shell',
} as const

const readTheme = (): ThemeName => {
  const v = localStorage.getItem(STORAGE.theme) || localStorage.getItem('theme')
  return v === 'light' ? 'light' : 'dark'
}

const readAccent = (): AccentName => {
  const v = localStorage.getItem(STORAGE.accent) as AccentName | null
  const allowed: AccentName[] = ['neutral', 'blue', 'violet', 'green', 'orange', 'pink']
  return v && allowed.includes(v) ? v : 'neutral'
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

export const useUiStore = defineStore('ui', () => {
  const theme = ref<ThemeName>(readTheme())
  const accent = ref<AccentName>(readAccent())
  const density = ref<Density>(readDensity())
  const shell = ref<ShellVariant>(readShell())

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

  return { theme, accent, density, shell }
})
