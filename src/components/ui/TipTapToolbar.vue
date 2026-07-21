<script setup lang="ts">
/**
 * Toolbar tokenizada compartilhada por todos os editores TipTap do app
 * (notas, relatórios, descrição de evento). Substitui as três implementações
 * em `<button>` cru que existiam antes, cada uma com seu próprio CSS.
 *
 * `groups` controla o que aparece: o bubble menu de notas pede só formatação,
 * enquanto o editor de relatório pede a barra inteira.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight,
  Bold, Code, Code2, Heading1, Heading2, Heading3, Highlighter,
  Image as ImageIcon, Italic, Link as LinkIcon, List, ListChecks, ListOrdered,
  Minus, Quote, Redo2, Strikethrough, Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon, Table as TableIcon, Underline as UnderlineIcon, Undo2,
} from 'lucide-vue-next'

export type ToolbarGroup =
  | 'history' | 'format' | 'heading' | 'list' | 'block' | 'align' | 'script' | 'insert'

const props = withDefaults(
  defineProps<{
    editor: Editor | undefined
    groups?: ToolbarGroup[]
    size?: 'sm' | 'md'
    /** Sem borda e sem fundo: para uso dentro de um popover que já tem casca. */
    bare?: boolean
  }>(),
  {
    groups: () => ['history', 'format', 'heading', 'list', 'block', 'align', 'script', 'insert'],
    size: 'md',
    bare: false,
  },
)

const emit = defineEmits<{ link: []; image: []; table: [] }>()

const iconSize = computed(() => (props.size === 'sm' ? 14 : 15))
const has = (group: ToolbarGroup) => props.groups.includes(group)

/**
 * O objeto `Editor` chega por prop e nunca é substituído, então o Vue não
 * re-renderiza esta toolbar quando o estado muda. Um contador ligado ao evento
 * `transaction` é o que mantém os botões ativos em sincronia com o cursor.
 */
const tick = ref(0)
let detach: (() => void) | null = null

watch(
  () => props.editor,
  (editor) => {
    detach?.()
    detach = null
    if (!editor) return
    const bump = () => { tick.value += 1 }
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

const isActive = (name: string, attrs?: Record<string, unknown>) => {
  void tick.value
  return props.editor?.isActive(name, attrs) ?? false
}
const isAlign = (align: string) => {
  void tick.value
  return props.editor?.isActive({ textAlign: align }) ?? false
}
/** Também depende do tick: `can().undo()` muda a cada transação. */
const canUndo = computed(() => (void tick.value, props.editor?.can().undo() ?? false))
const canRedo = computed(() => (void tick.value, props.editor?.can().redo() ?? false))

const chain = () => props.editor?.chain().focus()
</script>

<template>
  <div v-if="editor" class="tt-toolbar" :class="[`tt-toolbar--${size}`, { 'tt-toolbar--bare': bare }]">
    <template v-if="has('history')">
      <button
        type="button" class="tt-btn" aria-label="Desfazer" title="Desfazer"
        :disabled="!canUndo" @click="chain()?.undo().run()"
      >
        <Undo2 :size="iconSize" />
      </button>
      <button
        type="button" class="tt-btn" aria-label="Refazer" title="Refazer"
        :disabled="!canRedo" @click="chain()?.redo().run()"
      >
        <Redo2 :size="iconSize" />
      </button>
      <span class="tt-divider" />
    </template>

    <template v-if="has('format')">
      <button
        type="button" class="tt-btn" aria-label="Negrito" title="Negrito"
        :class="{ 'tt-btn--active': isActive('bold') }" :aria-pressed="isActive('bold')"
        @click="chain()?.toggleBold().run()"
      >
        <Bold :size="iconSize" />
      </button>
      <button
        type="button" class="tt-btn" aria-label="Itálico" title="Itálico"
        :class="{ 'tt-btn--active': isActive('italic') }" :aria-pressed="isActive('italic')"
        @click="chain()?.toggleItalic().run()"
      >
        <Italic :size="iconSize" />
      </button>
      <button
        type="button" class="tt-btn" aria-label="Sublinhado" title="Sublinhado"
        :class="{ 'tt-btn--active': isActive('underline') }" :aria-pressed="isActive('underline')"
        @click="chain()?.toggleUnderline().run()"
      >
        <UnderlineIcon :size="iconSize" />
      </button>
      <button
        type="button" class="tt-btn" aria-label="Tachado" title="Tachado"
        :class="{ 'tt-btn--active': isActive('strike') }" :aria-pressed="isActive('strike')"
        @click="chain()?.toggleStrike().run()"
      >
        <Strikethrough :size="iconSize" />
      </button>
      <button
        type="button" class="tt-btn" aria-label="Destaque" title="Destaque"
        :class="{ 'tt-btn--active': isActive('highlight') }" :aria-pressed="isActive('highlight')"
        @click="chain()?.toggleHighlight().run()"
      >
        <Highlighter :size="iconSize" />
      </button>
      <button
        type="button" class="tt-btn" aria-label="Código" title="Código"
        :class="{ 'tt-btn--active': isActive('code') }" :aria-pressed="isActive('code')"
        @click="chain()?.toggleCode().run()"
      >
        <Code :size="iconSize" />
      </button>
      <button
        type="button" class="tt-btn" aria-label="Link" title="Link"
        :class="{ 'tt-btn--active': isActive('link') }" :aria-pressed="isActive('link')"
        @click="emit('link')"
      >
        <LinkIcon :size="iconSize" />
      </button>
      <span class="tt-divider" />
    </template>

    <template v-if="has('heading')">
      <button
        v-for="level in ([1, 2, 3] as const)" :key="level"
        type="button" class="tt-btn"
        :aria-label="`Título ${level}`" :title="`Título ${level}`"
        :class="{ 'tt-btn--active': isActive('heading', { level }) }"
        :aria-pressed="isActive('heading', { level })"
        @click="chain()?.toggleHeading({ level }).run()"
      >
        <Heading1 v-if="level === 1" :size="iconSize" />
        <Heading2 v-else-if="level === 2" :size="iconSize" />
        <Heading3 v-else :size="iconSize" />
      </button>
      <span class="tt-divider" />
    </template>

    <template v-if="has('list')">
      <button
        type="button" class="tt-btn" aria-label="Lista" title="Lista"
        :class="{ 'tt-btn--active': isActive('bulletList') }" :aria-pressed="isActive('bulletList')"
        @click="chain()?.toggleBulletList().run()"
      >
        <List :size="iconSize" />
      </button>
      <button
        type="button" class="tt-btn" aria-label="Lista numerada" title="Lista numerada"
        :class="{ 'tt-btn--active': isActive('orderedList') }" :aria-pressed="isActive('orderedList')"
        @click="chain()?.toggleOrderedList().run()"
      >
        <ListOrdered :size="iconSize" />
      </button>
      <button
        type="button" class="tt-btn" aria-label="Lista de tarefas" title="Lista de tarefas"
        :class="{ 'tt-btn--active': isActive('taskList') }" :aria-pressed="isActive('taskList')"
        @click="chain()?.toggleTaskList().run()"
      >
        <ListChecks :size="iconSize" />
      </button>
      <span class="tt-divider" />
    </template>

    <template v-if="has('block')">
      <button
        type="button" class="tt-btn" aria-label="Citação" title="Citação"
        :class="{ 'tt-btn--active': isActive('blockquote') }" :aria-pressed="isActive('blockquote')"
        @click="chain()?.toggleBlockquote().run()"
      >
        <Quote :size="iconSize" />
      </button>
      <button
        type="button" class="tt-btn" aria-label="Bloco de código" title="Bloco de código"
        :class="{ 'tt-btn--active': isActive('codeBlock') }" :aria-pressed="isActive('codeBlock')"
        @click="chain()?.toggleCodeBlock().run()"
      >
        <Code2 :size="iconSize" />
      </button>
      <span class="tt-divider" />
    </template>

    <template v-if="has('align')">
      <button
        type="button" class="tt-btn" aria-label="Alinhar à esquerda" title="Alinhar à esquerda"
        :class="{ 'tt-btn--active': isAlign('left') }" @click="chain()?.setTextAlign('left').run()"
      >
        <AlignLeft :size="iconSize" />
      </button>
      <button
        type="button" class="tt-btn" aria-label="Centralizar" title="Centralizar"
        :class="{ 'tt-btn--active': isAlign('center') }" @click="chain()?.setTextAlign('center').run()"
      >
        <AlignCenter :size="iconSize" />
      </button>
      <button
        type="button" class="tt-btn" aria-label="Alinhar à direita" title="Alinhar à direita"
        :class="{ 'tt-btn--active': isAlign('right') }" @click="chain()?.setTextAlign('right').run()"
      >
        <AlignRight :size="iconSize" />
      </button>
      <button
        type="button" class="tt-btn" aria-label="Justificar" title="Justificar"
        :class="{ 'tt-btn--active': isAlign('justify') }" @click="chain()?.setTextAlign('justify').run()"
      >
        <AlignJustify :size="iconSize" />
      </button>
      <span class="tt-divider" />
    </template>

    <template v-if="has('script')">
      <button
        type="button" class="tt-btn" aria-label="Sobrescrito" title="Sobrescrito"
        :class="{ 'tt-btn--active': isActive('superscript') }"
        @click="chain()?.toggleSuperscript().run()"
      >
        <SuperscriptIcon :size="iconSize" />
      </button>
      <button
        type="button" class="tt-btn" aria-label="Subscrito" title="Subscrito"
        :class="{ 'tt-btn--active': isActive('subscript') }"
        @click="chain()?.toggleSubscript().run()"
      >
        <SubscriptIcon :size="iconSize" />
      </button>
      <span class="tt-divider" />
    </template>

    <template v-if="has('insert')">
      <button type="button" class="tt-btn" aria-label="Imagem" title="Imagem" @click="emit('image')">
        <ImageIcon :size="iconSize" />
      </button>
      <button type="button" class="tt-btn" aria-label="Tabela" title="Tabela" @click="emit('table')">
        <TableIcon :size="iconSize" />
      </button>
      <button
        type="button" class="tt-btn" aria-label="Divisória" title="Divisória"
        @click="chain()?.setHorizontalRule().run()"
      >
        <Minus :size="iconSize" />
      </button>
    </template>

    <slot />
  </div>
</template>

<style scoped>
.tt-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.tt-toolbar--bare {
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  flex-wrap: nowrap;
}

.tt-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.tt-toolbar--sm .tt-btn {
  width: 28px;
  height: 28px;
}

.tt-btn:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}

.tt-btn:active:not(:disabled) {
  transform: scale(0.94);
}

.tt-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.tt-btn--active {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}

.tt-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.tt-divider {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--border);
}

.tt-toolbar--bare .tt-divider:last-child {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .tt-btn {
    transition-duration: 1ms;
  }
  .tt-btn:active:not(:disabled) {
    transform: none;
  }
}
</style>
