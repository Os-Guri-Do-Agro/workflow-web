<script setup lang="ts">
/**
 * Menu flutuante que aparece na seleção de texto. Substitui a toolbar fixa de
 * 28 botões que ficava presa no topo da página: a formatação vem até onde o
 * cursor está, e some quando não há seleção.
 *
 * No toque ele não abre (spec v2-celular-roadmap-notas, D3): selecionar com o
 * dedo já abre o menu nativo do sistema (copiar, colar, selecionar tudo) e os
 * dois disputavam o mesmo lugar em cima da seleção. Lá a formatação mora na
 * barra acima do teclado. A decisão é pelo ponteiro que fez a seleção, não
 * pela largura: um tablet com o dedo também briga; um mouse no tablet, não.
 */
import { nextTick, ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { isTextSelection, type Editor } from '@tiptap/vue-3'
import type { Editor as CoreEditor } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Check, X } from 'lucide-vue-next'
import TipTapToolbar from '@/components/ui/TipTapToolbar.vue'
import { usePhoneViewport } from '@/composables/usePhoneViewport'

const props = defineProps<{ editor: Editor | undefined }>()

const linkMode = ref(false)
const linkUrl = ref('')
const linkInput = ref<HTMLInputElement | null>(null)

async function openLink() {
  if (!props.editor) return
  linkUrl.value = props.editor.getAttributes('link').href ?? ''
  linkMode.value = true
  await nextTick()
  linkInput.value?.focus()
  linkInput.value?.select()
}

function applyLink() {
  if (!props.editor) return
  const url = linkUrl.value.trim()
  const chain = props.editor.chain().focus().extendMarkRange('link')
  if (url) chain.setLink({ href: url }).run()
  else chain.unsetLink().run()
  closeLink()
}

function closeLink() {
  linkMode.value = false
  linkUrl.value = ''
}

// ── Só com mouse, caneta ou teclado ──
const phone = usePhoneViewport()
let lastPointer = 'mouse'
useEventListener(
  document,
  'pointerdown',
  (e: PointerEvent) => {
    lastPointer = e.pointerType || 'mouse'
  },
  { capture: true, passive: true },
)

/** A regra padrão do TipTap, mais a do toque. */
function shouldShow({
  editor,
  element,
  view,
  state,
  from,
  to,
}: {
  editor: CoreEditor
  element: HTMLElement
  view: EditorView
  state: EditorState
  from: number
  to: number
}): boolean {
  if (phone.value || lastPointer === 'touch') return false
  const { doc, selection } = state
  const isEmptyTextBlock = !doc.textBetween(from, to).length && isTextSelection(selection)
  const hasEditorFocus = view.hasFocus() || element.contains(document.activeElement)
  return hasEditorFocus && !selection.empty && !isEmptyTextBlock && editor.isEditable
}
</script>

<template>
  <BubbleMenu v-if="editor" :editor="editor" :should-show="shouldShow" class="note-bubble">
    <div v-if="linkMode" class="note-bubble__link">
      <input
        ref="linkInput"
        v-model="linkUrl"
        type="url"
        class="note-bubble__input"
        placeholder="https://..."
        aria-label="Endereço do link"
        @keydown.enter.prevent="applyLink"
        @keydown.esc.prevent="closeLink"
      />
      <button type="button" class="note-bubble__act" aria-label="Aplicar link" @click="applyLink">
        <Check :size="14" />
      </button>
      <button type="button" class="note-bubble__act" aria-label="Cancelar" @click="closeLink">
        <X :size="14" />
      </button>
    </div>

    <TipTapToolbar
      v-else
      :editor="editor"
      :groups="['format', 'heading', 'list']"
      size="sm"
      bare
      @link="openLink"
    />
  </BubbleMenu>
</template>

<style scoped>
.note-bubble {
  display: flex;
  align-items: center;
  padding: 4px 6px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--shadow-overlay);
  backdrop-filter: blur(20px) saturate(140%);
}

.note-bubble__link {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
}

.note-bubble__input {
  width: 240px;
  padding: 5px 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
}

.note-bubble__input:focus {
  outline: none;
  border-color: var(--accent);
}

.note-bubble__act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  cursor: pointer;
}

.note-bubble__act:hover {
  background: var(--surface-3);
  color: var(--text);
}

.note-bubble__act:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
</style>
