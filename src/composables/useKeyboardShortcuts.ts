import { onMounted, onUnmounted } from 'vue'

type ShortcutHandler = (e: KeyboardEvent) => void

interface Shortcut {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  handler: ShortcutHandler
  /** skip when user is typing in an input/textarea */
  ignoreInputs?: boolean
}

const isInputElement = (el: EventTarget | null): boolean => {
  if (!el || !(el instanceof HTMLElement)) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  return el.isContentEditable
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const handler = (e: KeyboardEvent) => {
    for (const s of shortcuts) {
      const ctrlOrMeta = s.ctrl || s.meta
      const ctrlMatch = ctrlOrMeta ? (e.ctrlKey || e.metaKey) : true
      const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey
      const keyMatch = e.key.toLowerCase() === s.key.toLowerCase()

      if (keyMatch && ctrlMatch && shiftMatch) {
        if (s.ignoreInputs !== false && isInputElement(e.target)) continue
        e.preventDefault()
        e.stopPropagation()
        s.handler(e)
        return
      }
    }
  }

  onMounted(() => window.addEventListener('keydown', handler, true))
  onUnmounted(() => window.removeEventListener('keydown', handler, true))
}
