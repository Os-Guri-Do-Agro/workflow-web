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
  const {
    theme,
    accent,
    density,
    shell,
    fontScale,
    xp,
    idleGuard,
    idleWarnMin,
    timerSounds,
    pickerShowDone,
  } = storeToRefs(store)
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

  // Easter egg Windows XP — o watch do store aplica/persiste.
  const toggleXp = () => {
    store.xp = !store.xp
  }

  // Aviso de ociosidade do timer (spec timer-ociosidade).
  const setIdleGuard = (value: boolean) => {
    store.idleGuard = value
  }

  const setIdleWarnMin = (value: number) => {
    store.idleWarnMin = value
  }

  // Meu tempo (spec time-selecao-de-tarefa-e-som).
  const setTimerSounds = (value: boolean) => {
    store.timerSounds = value
  }

  const setPickerShowDone = (value: boolean) => {
    store.pickerShowDone = value
  }

  return {
    theme,
    accent,
    density,
    shell,
    fontScale,
    xp,
    idleGuard,
    idleWarnMin,
    setIdleGuard,
    setIdleWarnMin,
    timerSounds,
    pickerShowDone,
    setTimerSounds,
    setPickerShowDone,
    setTheme,
    toggleTheme,
    setAccent,
    setDensity,
    setShell,
    setFontScale,
    toggleXp,
  }
}
