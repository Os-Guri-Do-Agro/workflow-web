import { computed, ref } from 'vue'

/**
 * Estado do onboarding ("Primeiros passos") — singleton de módulo, persistido em
 * localStorage. Abre automaticamente UMA vez por usuário; depois fica disponível
 * sob demanda (Command Palette → "Primeiros passos"). Padrão alinhado a
 * `useAssistant` / `useUiPreferences` (ver src/CLAUDE.md).
 */

const AUTO_KEY = 'onboarding.autoShown'
const DONE_KEY = 'onboarding.completed'

function loadCompleted(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) || '[]')
  } catch {
    return []
  }
}

const isOpen = ref(false)
const completed = ref<string[]>(loadCompleted())
const autoShown = ref(localStorage.getItem(AUTO_KEY) === '1')

const completedCount = computed(() => completed.value.length)

function persist() {
  localStorage.setItem(DONE_KEY, JSON.stringify(completed.value))
}

function open() {
  isOpen.value = true
}
function close() {
  isOpen.value = false
}

function isDone(id: string): boolean {
  return completed.value.includes(id)
}

function complete(id: string) {
  if (!completed.value.includes(id)) {
    completed.value = [...completed.value, id]
    persist()
  }
}

function reset() {
  completed.value = []
  persist()
}

/** Abre automaticamente na primeira vez que o app monta logado. */
function maybeAutoOpen() {
  if (autoShown.value) return
  autoShown.value = true
  localStorage.setItem(AUTO_KEY, '1')
  isOpen.value = true
}

export function useOnboarding() {
  return {
    isOpen,
    completed,
    completedCount,
    open,
    close,
    isDone,
    complete,
    reset,
    maybeAutoOpen,
  }
}
