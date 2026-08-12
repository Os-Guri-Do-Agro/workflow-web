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
  notesViewMode: 'ui.notesViewMode',
  driveViewMode: 'ui.driveViewMode',
  idleGuard: 'ui.idleGuard',
  idleWarnMin: 'ui.idleWarnMin',
  idlePermissionPrompt: 'ui.idlePermissionPrompt',
  timerSounds: 'ui.timerSounds',
  pickerShowDone: 'ui.pickerShowDone',
} as const

/** Grade ou lista na listagem de notas. */
export type NotesViewMode = 'grid' | 'list'

/** Grade ou lista na listagem do Drive. */
export type DriveViewMode = 'grid' | 'list'

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

const readNotesViewMode = (): NotesViewMode =>
  localStorage.getItem(STORAGE.notesViewMode) === 'list' ? 'list' : 'grid'

const readDriveViewMode = (): DriveViewMode =>
  localStorage.getItem(STORAGE.driveViewMode) === 'list' ? 'list' : 'grid'

/** Aviso de ociosidade do timer: ligado por padrão (spec timer-ociosidade). */
const readIdleGuard = (): boolean => localStorage.getItem(STORAGE.idleGuard) !== 'false'

/** Minutos parados até o aviso. A carência antes do corte é sempre 1/3 disso. */
const readIdleWarnMin = (): number => {
  const v = Number(localStorage.getItem(STORAGE.idleWarnMin))
  const allowed = [5, 10, 15, 30]
  return allowed.includes(v) ? v : 15
}

/** O card de permissão só aparece enquanto o usuário não decidiu. */
const readIdlePermissionPrompt = (): boolean =>
  localStorage.getItem(STORAGE.idlePermissionPrompt) !== 'done'

/** Som ao iniciar/parar o cronômetro: ligado por padrão, discreto. */
const readTimerSounds = (): boolean => localStorage.getItem(STORAGE.timerSounds) !== 'false'

/** Tarefas concluídas no seletor do Meu tempo: escondidas por padrão. */
const readPickerShowDone = (): boolean =>
  localStorage.getItem(STORAGE.pickerShowDone) === 'true'

export const useUiStore = defineStore('ui', () => {
  const theme = ref<ThemeName>(readTheme())
  const accent = ref<AccentName>(readAccent())
  const density = ref<Density>(readDensity())
  const shell = ref<ShellVariant>(readShell())
  const fontScale = ref<FontScale>(readFontScale())
  const xp = ref<boolean>(readXp())
  const notesViewMode = ref<NotesViewMode>(readNotesViewMode())
  const driveViewMode = ref<DriveViewMode>(readDriveViewMode())
  const idleGuard = ref<boolean>(readIdleGuard())
  const idleWarnMin = ref<number>(readIdleWarnMin())
  const idlePermissionPrompt = ref<boolean>(readIdlePermissionPrompt())
  const timerSounds = ref<boolean>(readTimerSounds())
  const pickerShowDone = ref<boolean>(readPickerShowDone())

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

  watch(notesViewMode, (v) => {
    localStorage.setItem(STORAGE.notesViewMode, v)
  })

  watch(driveViewMode, (v) => {
    localStorage.setItem(STORAGE.driveViewMode, v)
  })

  watch(idleGuard, (v) => {
    localStorage.setItem(STORAGE.idleGuard, String(v))
  })

  watch(idleWarnMin, (v) => {
    localStorage.setItem(STORAGE.idleWarnMin, String(v))
  })

  watch(idlePermissionPrompt, (v) => {
    localStorage.setItem(STORAGE.idlePermissionPrompt, v ? 'pending' : 'done')
  })

  watch(timerSounds, (v) => {
    localStorage.setItem(STORAGE.timerSounds, String(v))
  })

  watch(pickerShowDone, (v) => {
    localStorage.setItem(STORAGE.pickerShowDone, String(v))
  })

  // Aplica a escala salva já no boot (antes de qualquer watch disparar).
  applyFontScale(fontScale.value)
  applyXpMode(xp.value)

  return {
    theme,
    accent,
    density,
    shell,
    fontScale,
    xp,
    notesViewMode,
    driveViewMode,
    idleGuard,
    idleWarnMin,
    idlePermissionPrompt,
    timerSounds,
    pickerShowDone,
  }
})
