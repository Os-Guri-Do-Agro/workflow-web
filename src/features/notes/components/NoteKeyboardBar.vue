<script setup lang="ts">
/**
 * Barra de formatação presa acima do teclado (spec v2-celular-roadmap-notas,
 * D3). No celular a toolbar do topo não existe: com o editor em foco, a
 * formatação mora aqui, rente ao polegar, e rola de lado quando não cabe.
 *
 * Posição: o teclado do celular encolhe só o `visualViewport` (iOS e Chrome
 * Android desde o 108); a página por baixo continua do tamanho de antes, e um
 * `position: fixed; bottom: 0` ficaria ESCONDIDO atrás do teclado. Por isso a
 * barra se prende à borda de baixo do viewport visual (`offsetTop + height`),
 * relida a cada `resize` e `scroll` dele. Sem `visualViewport`, cai no rodapé
 * fixo comum.
 *
 * Os botões não roubam o foco do editor (`mousedown.prevent`): tocar em
 * "Negrito" não pode fechar o teclado. "Fechar teclado" tira o foco de
 * propósito, e com ele a barra some e a tab bar volta.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import type { Editor } from '@tiptap/vue-3'
import {
  Bold,
  Heading2,
  Italic,
  KeyboardOff,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-vue-next'

// Altura: 44px de alvo + 4px de cada lado = 52px (o NoteEditorView conta com ela).
const props = defineProps<{
  editor: Editor | undefined
  /** Editor em foco no celular: a barra aparece. */
  active: boolean
}>()

const emit = defineEmits<{ link: [] }>()

// ── Onde fica a borda de baixo da área visível ──
const vv = typeof window !== 'undefined' ? window.visualViewport : null
const visibleBottom = ref<number | null>(null)
const keyboardOpen = ref(false)

function measure() {
  if (!vv) return
  visibleBottom.value = vv.offsetTop + vv.height
  // Teclado aberto: a área visível ficou bem mais baixa que a janela.
  keyboardOpen.value = window.innerHeight - vv.height > 120
}

if (vv) {
  useEventListener(vv, 'resize', measure, { passive: true })
  useEventListener(vv, 'scroll', measure, { passive: true })
}
watch(
  () => props.active,
  (on) => {
    if (on) measure()
  },
  { immediate: true },
)

const barStyle = computed(() => {
  if (visibleBottom.value === null) return undefined
  return { top: '0px', bottom: 'auto', transform: `translateY(calc(${visibleBottom.value}px - 100%))` }
})

// ── Estado dos botões (o mesmo truque do TipTapToolbar: o Editor não é reativo) ──
const tick = ref(0)
let detach: (() => void) | null = null
watch(
  () => props.editor,
  (editor) => {
    detach?.()
    detach = null
    if (!editor) return
    const bump = () => {
      tick.value += 1
    }
    editor.on('transaction', bump)
    editor.on('selectionUpdate', bump)
    detach = () => {
      editor.off('transaction', bump)
      editor.off('selectionUpdate', bump)
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => detach?.())

const is = (name: string, attrs?: Record<string, unknown>) => {
  void tick.value
  return props.editor?.isActive(name, attrs) ?? false
}
const canUndo = computed(() => (void tick.value, props.editor?.can().undo() ?? false))
const canRedo = computed(() => (void tick.value, props.editor?.can().redo() ?? false))

const chain = () => props.editor?.chain().focus()

interface BarAction {
  key: string
  label: string
  icon: unknown
  active?: () => boolean
  disabled?: () => boolean
  run: () => void
}

// A ordem da D3: o que mais se usa ao anotar no celular vem primeiro.
const actions: BarAction[] = [
  { key: 'taskList', label: 'Checklist', icon: ListChecks, active: () => is('taskList'), run: () => chain()?.toggleTaskList().run() },
  { key: 'bulletList', label: 'Lista', icon: List, active: () => is('bulletList'), run: () => chain()?.toggleBulletList().run() },
  { key: 'orderedList', label: 'Lista numerada', icon: ListOrdered, active: () => is('orderedList'), run: () => chain()?.toggleOrderedList().run() },
  { key: 'heading', label: 'Título', icon: Heading2, active: () => is('heading', { level: 2 }), run: () => chain()?.toggleHeading({ level: 2 }).run() },
  { key: 'bold', label: 'Negrito', icon: Bold, active: () => is('bold'), run: () => chain()?.toggleBold().run() },
  { key: 'italic', label: 'Itálico', icon: Italic, active: () => is('italic'), run: () => chain()?.toggleItalic().run() },
  { key: 'strike', label: 'Tachado', icon: Strikethrough, active: () => is('strike'), run: () => chain()?.toggleStrike().run() },
  { key: 'link', label: 'Link', icon: LinkIcon, active: () => is('link'), run: () => emit('link') },
  { key: 'undo', label: 'Desfazer', icon: Undo2, disabled: () => !canUndo.value, run: () => chain()?.undo().run() },
  { key: 'redo', label: 'Refazer', icon: Redo2, disabled: () => !canRedo.value, run: () => chain()?.redo().run() },
]

function closeKeyboard() {
  props.editor?.commands.blur()
  const el = document.activeElement
  if (el instanceof HTMLElement) el.blur()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-show="active && editor"
      class="kbar"
      :class="{ 'kbar--keyboard': keyboardOpen, 'kbar--anchored': !!barStyle }"
      :style="barStyle"
      role="toolbar"
      aria-label="Formatação da nota"
      data-note-keyboard-bar
    >
      <div class="kbar__scroll">
        <button
          v-for="a in actions"
          :key="a.key"
          type="button"
          class="kbar__btn"
          :class="{ 'kbar__btn--on': a.active?.() }"
          :data-action="a.key"
          :aria-label="a.label"
          :title="a.label"
          :aria-pressed="a.active ? a.active() : undefined"
          :disabled="a.disabled?.()"
          @mousedown.prevent
          @click="a.run()"
        >
          <component :is="a.icon" :size="19" :stroke-width="1.9" />
        </button>
      </div>
      <span class="kbar__sep" aria-hidden="true" />
      <button
        type="button"
        class="kbar__btn kbar__btn--close"
        data-action="close"
        aria-label="Fechar teclado"
        title="Fechar teclado"
        @mousedown.prevent
        @click="closeKeyboard"
      >
        <KeyboardOff :size="19" :stroke-width="1.9" />
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.kbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2400;
  display: flex;
  align-items: center;
  height: calc(52px + env(safe-area-inset-bottom, 0px));
  padding: 4px max(4px, env(safe-area-inset-right, 0px)) calc(4px + env(safe-area-inset-bottom, 0px))
    max(4px, env(safe-area-inset-left, 0px));
  background: var(--surface);
  border-top: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}

/* Com o teclado aberto, a área segura de baixo fica atrás dele. */
.kbar--keyboard {
  height: 52px;
  padding-bottom: 4px;
}

.kbar__scroll {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.kbar__scroll::-webkit-scrollbar {
  display: none;
}

.kbar__btn {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.kbar__btn:active:not(:disabled) {
  background: var(--surface-2);
}

.kbar__btn:disabled {
  opacity: 0.35;
}

.kbar__btn--on {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.kbar__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.kbar__sep {
  flex: none;
  width: 1px;
  height: 24px;
  margin: 0 4px;
  background: var(--border);
}
</style>
