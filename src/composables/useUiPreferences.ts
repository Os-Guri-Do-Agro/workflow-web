import { storeToRefs } from 'pinia'
import { useTheme } from 'vuetify'
import { useUiStore } from '@/stores/uiStores'
import type { AccentName, Density, ShellVariant, ThemeName } from '@/plugins/tokens'

export function useUiPreferences() {
  const store = useUiStore()
  const { theme, accent, density, shell } = storeToRefs(store)
  const vuetifyTheme = useTheme()

  const setTheme = (value: ThemeName) => {
    store.theme = value
    vuetifyTheme.global.name.value = value
  }

  const toggleTheme = () => setTheme(theme.value === 'dark' ? 'light' : 'dark')

  const setAccent = (value: AccentName) => {
    store.accent = value
  }

  const setDensity = (value: Density) => {
    store.density = value
  }

  const setShell = (value: ShellVariant) => {
    store.shell = value
  }

  return {
    theme,
    accent,
    density,
    shell,
    setTheme,
    toggleTheme,
    setAccent,
    setDensity,
    setShell,
  }
}
