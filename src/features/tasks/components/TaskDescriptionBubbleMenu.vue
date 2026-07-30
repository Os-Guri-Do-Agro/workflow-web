<script setup lang="ts">
/**
 * Menu de formatação da descrição da atividade.
 *
 * É a ÚNICA superfície de formatação do campo: aparece na seleção, some quando
 * não há seleção. Não existe toolbar fixa, não existe painel de personalização.
 * Foi essa a decisão de "superfície única e fundida" (A2 da spec R1): a
 * formatação vem até o cursor, e nada ocupa altura permanente num painel denso.
 *
 * ## Por que não reusa o `TipTapToolbar`
 *
 * O grupo `format` dele traz um botão de Destaque (`toggleHighlight`) e o grupo
 * `block` traz Bloco de código, e nenhuma das duas extensões está habilitada
 * neste editor. Reusar renderizaria botão que não faz nada, que é pior do que
 * não ter botão. Os botões aqui são exatamente as extensões de
 * `useTaskDescriptionEditor` e nada além.
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import type { Editor } from '@tiptap/vue-3'
// O `shouldShow` do BubbleMenu recebe o Editor do core, não o wrapper reativo do
// pacote Vue (que tem `reactiveState` e companhia a mais).
import type { Editor as CoreEditor } from '@tiptap/core'
import {
  Bold,
  Check,
  Code,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline as UnderlineIcon,
  X,
} from 'lucide-vue-next'

const props = defineProps<{ editor: Editor | undefined }>()

const linkMode = ref(false)
const linkUrl = ref('')
const linkInput = ref<HTMLInputElement | null>(null)

/**
 * O objeto `Editor` chega por prop e nunca é substituído, então o Vue não
 * re-renderiza este menu quando o cursor anda. Um contador ligado em
 * `transaction`/`selectionUpdate` é o que mantém os botões ativos em sincronia.
 * Mesmo mecanismo do `TipTapToolbar`.
 */
const tick = ref(0)
let detach: (() => void) | null = null

function attach(editor: Editor | undefined) {
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
}

watch(() => props.editor, attach, { immediate: true })
onBeforeUnmount(() => detach?.())

const isActive = (name: string) => {
  void tick.value
  return props.editor?.isActive(name) ?? false
}

const chain = () => props.editor?.chain().focus()

/**
 * O menu normalmente segue a seleção. Em modo link ele fica visível de propósito:
 * `Ctrl+K` sem seleção precisa mostrar o campo, e clicar dentro do input tira o
 * foco do editor, o que esconderia o próprio campo que a pessoa está usando.
 */
function shouldShow({ editor }: { editor: CoreEditor }): boolean {
  if (linkMode.value) return true
  return editor.isEditable && editor.isFocused && !editor.state.selection.empty
}

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
  // `extendMarkRange` faz o link valer na palavra inteira quando não há seleção,
  // que é o que se espera de Ctrl+K com o cursor no meio de uma palavra.
  const target = props.editor.chain().focus().extendMarkRange('link')
  if (url) target.setLink({ href: url }).run()
  else target.unsetLink().run()
  closeLink()
}

function closeLink() {
  linkMode.value = false
  linkUrl.value = ''
}

defineExpose({ openLink })
</script>

<template>
  <BubbleMenu v-if="editor" :editor="editor" :should-show="shouldShow" class="task-bubble">
    <div v-if="linkMode" class="task-bubble__link">
      <input
        ref="linkInput"
        v-model="linkUrl"
        type="url"
        class="task-bubble__input"
        placeholder="https://..."
        aria-label="Endereço do link"
        @keydown.enter.prevent="applyLink"
        @keydown.esc.prevent.stop="closeLink"
      />
      <button type="button" class="task-bubble__btn" aria-label="Aplicar link" @click="applyLink">
        <Check :size="14" />
      </button>
      <button type="button" class="task-bubble__btn" aria-label="Cancelar link" @click="closeLink">
        <X :size="14" />
      </button>
    </div>

    <!-- `mousedown.prevent`: clicar num botão não pode tirar o foco do texto.
         Sem isso cada clique dispara o blur, que grava, e a formatação aplicada
         em seguida grava de novo: duas requisições por botão apertado. -->
    <div v-else class="task-bubble__row" @mousedown.prevent>
      <button
        type="button"
        class="task-bubble__btn"
        :class="{ 'task-bubble__btn--on': isActive('bold') }"
        :aria-pressed="isActive('bold')"
        aria-label="Negrito"
        title="Negrito (Ctrl+B)"
        @click="chain()?.toggleBold().run()"
      >
        <Bold :size="14" />
      </button>
      <button
        type="button"
        class="task-bubble__btn"
        :class="{ 'task-bubble__btn--on': isActive('italic') }"
        :aria-pressed="isActive('italic')"
        aria-label="Itálico"
        title="Itálico (Ctrl+I)"
        @click="chain()?.toggleItalic().run()"
      >
        <Italic :size="14" />
      </button>
      <button
        type="button"
        class="task-bubble__btn"
        :class="{ 'task-bubble__btn--on': isActive('underline') }"
        :aria-pressed="isActive('underline')"
        aria-label="Sublinhado"
        title="Sublinhado (Ctrl+U)"
        @click="chain()?.toggleUnderline().run()"
      >
        <UnderlineIcon :size="14" />
      </button>
      <button
        type="button"
        class="task-bubble__btn"
        :class="{ 'task-bubble__btn--on': isActive('strike') }"
        :aria-pressed="isActive('strike')"
        aria-label="Riscado"
        title="Riscado"
        @click="chain()?.toggleStrike().run()"
      >
        <Strikethrough :size="14" />
      </button>
      <button
        type="button"
        class="task-bubble__btn"
        :class="{ 'task-bubble__btn--on': isActive('code') }"
        :aria-pressed="isActive('code')"
        aria-label="Código"
        title="Código"
        @click="chain()?.toggleCode().run()"
      >
        <Code :size="14" />
      </button>
      <button
        type="button"
        class="task-bubble__btn"
        :class="{ 'task-bubble__btn--on': isActive('link') }"
        :aria-pressed="isActive('link')"
        aria-label="Link"
        title="Link (Ctrl+K)"
        @click="openLink()"
      >
        <LinkIcon :size="14" />
      </button>

      <span class="task-bubble__sep" />

      <button
        type="button"
        class="task-bubble__btn"
        :class="{ 'task-bubble__btn--on': isActive('bulletList') }"
        :aria-pressed="isActive('bulletList')"
        aria-label="Lista"
        title="Lista"
        @click="chain()?.toggleBulletList().run()"
      >
        <List :size="14" />
      </button>
      <button
        type="button"
        class="task-bubble__btn"
        :class="{ 'task-bubble__btn--on': isActive('orderedList') }"
        :aria-pressed="isActive('orderedList')"
        aria-label="Lista numerada"
        title="Lista numerada"
        @click="chain()?.toggleOrderedList().run()"
      >
        <ListOrdered :size="14" />
      </button>
      <button
        type="button"
        class="task-bubble__btn"
        :class="{ 'task-bubble__btn--on': isActive('taskList') }"
        :aria-pressed="isActive('taskList')"
        aria-label="Checklist"
        title="Checklist"
        @click="chain()?.toggleTaskList().run()"
      >
        <ListChecks :size="14" />
      </button>
      <button
        type="button"
        class="task-bubble__btn"
        :class="{ 'task-bubble__btn--on': isActive('blockquote') }"
        :aria-pressed="isActive('blockquote')"
        aria-label="Citação"
        title="Citação"
        @click="chain()?.toggleBlockquote().run()"
      >
        <Quote :size="14" />
      </button>
    </div>
  </BubbleMenu>
</template>

<style scoped>
.task-bubble {
  display: flex;
  align-items: center;
  padding: 3px 4px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--shadow-overlay);
  backdrop-filter: blur(20px) saturate(140%);
}

.task-bubble__row,
.task-bubble__link {
  display: flex;
  align-items: center;
  gap: 2px;
}

.task-bubble__link {
  gap: 4px;
  padding: 1px;
}

.task-bubble__input {
  width: 230px;
  padding: 5px 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
}

.task-bubble__input:focus {
  outline: none;
  border-color: var(--accent);
}

.task-bubble__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 27px;
  height: 27px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.task-bubble__btn:hover {
  background: var(--surface-3);
  color: var(--text);
}

.task-bubble__btn--on {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}

.task-bubble__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.task-bubble__sep {
  width: 1px;
  height: 18px;
  margin: 0 3px;
  background: var(--border);
}

@media (prefers-reduced-motion: reduce) {
  .task-bubble__btn {
    transition-duration: 1ms;
  }
}
</style>
