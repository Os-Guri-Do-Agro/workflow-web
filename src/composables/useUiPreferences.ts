import { storeToRefs } from 'pinia'
import { useTheme } from 'vuetify'
import { useUiStore } from '@/stores/uiStores'
import {
  applyFontScale,
  applyThemeTokens,
  type AccentName,
  type Density,
  type FontScale,
  type ShellVariant,
  type ThemeName,
} from '@/plugins/tokens'

export function useUiPreferences() {
  const store = useUiStore()
  const { theme, accent, density, shell, fontScale } = storeToRefs(store)
  const vuetifyTheme = useTheme()

  const setTheme = (value: ThemeName) => {
    store.theme = value
    applyThemeTokens(value, store.accent)
    vuetifyTheme.global.name.value = value
  }

  const toggleTheme = () => setTheme(theme.value === 'dark' ? 'light' : 'dark')

  const setAccent = (value: AccentName) => {
    store.accent = value
    applyThemeTokens(store.theme, value)
  }

  const setDensity = (value: Density) => {
    store.density = value
  }

  const setShell = (value: ShellVariant) => {
    store.shell = value
  }

  const setFontScale = (value: FontScale) => {
    store.fontScale = value
    applyFontScale(value)
  }

  return {
    theme,
    accent,
    density,
    shell,
    fontScale,
    setTheme,
    toggleTheme,
    setAccent,
    setDensity,
    setShell,
    setFontScale,
  }
}
