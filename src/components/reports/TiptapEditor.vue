<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import Image from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import CharacterCount from '@tiptap/extension-character-count'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks,
  Quote, Code, Code2,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Highlighter, Link as LinkIcon, Image as ImageIcon,
  Table as TableIcon, Undo2, Redo2,
  Superscript as SuperscriptIcon, Subscript as SubscriptIcon,
  Plus, X, Minus,
  TableCellsMerge, TableCellsSplit,
  Trash2,
} from 'lucide-vue-next'

const lowlight = createLowlight(common)

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const showLinkInput = ref(false)
const linkUrl = ref('')

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit.configure({
      codeBlock: false,
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { class: 'editor-link' },
    }),
    Placeholder.configure({
      placeholder: 'Escreva o relatório aqui...',
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Underline,
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    Image.configure({ inline: true }),
    Highlight.configure({ multicolor: true }),
    Typography,
    Superscript,
    Subscript,
    CharacterCount,
    TextStyle,
    Color,
    CodeBlockLowlight.configure({ lowlight }),
  ],
  onUpdate: ({ editor: e }) => {
    emit('update:modelValue', e.getHTML())
  },
})

const charCount = computed(() => editor.value?.storage.characterCount?.characters() ?? 0)
const wordCount = computed(() => editor.value?.storage.characterCount?.words() ?? 0)

watch(() => props.modelValue, (value) => {
  if (editor.value && value !== editor.value.getHTML()) {
    editor.value.commands.setContent(value)
  }
})

function setLink() {
  if (!linkUrl.value) {
    editor.value?.chain().focus().extendMarkRange('link').unsetLink().run()
  } else {
    editor.value?.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.value }).run()
  }
  showLinkInput.value = false
  linkUrl.value = ''
}

function addImage() {
  const url = window.prompt('URL da imagem:')
  if (url) {
    editor.value?.chain().focus().setImage({ src: url }).run()
  }
}

function insertTable() {
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}
</script>

<template>
  <div class="tiptap-editor">
    <!-- Toolbar -->
    <div class="toolbar">
      <!-- Undo/Redo -->
      <button class="toolbar-btn" @click="editor?.chain().focus().undo().run()" :disabled="!editor?.can().undo()">
        <Undo2 :size="15" />
      </button>
      <button class="toolbar-btn" @click="editor?.chain().focus().redo().run()" :disabled="!editor?.can().redo()">
        <Redo2 :size="15" />
      </button>
      <div class="toolbar-divider" />

      <!-- Text formatting -->
      <button class="toolbar-btn" :class="{ active: editor?.isActive('bold') }" @click="editor?.chain().focus().toggleBold().run()">
        <Bold :size="15" />
      </button>
      <button class="toolbar-btn" :class="{ active: editor?.isActive('italic') }" @click="editor?.chain().focus().toggleItalic().run()">
        <Italic :size="15" />
      </button>
      <button class="toolbar-btn" :class="{ active: editor?.isActive('underline') }" @click="editor?.chain().focus().toggleUnderline().run()">
        <UnderlineIcon :size="15" />
      </button>
      <button class="toolbar-btn" :class="{ active: editor?.isActive('strike') }" @click="editor?.chain().focus().toggleStrike().run()">
        <Strikethrough :size="15" />
      </button>
      <div class="toolbar-divider" />

      <!-- Headings -->
      <button class="toolbar-btn" :class="{ active: editor?.isActive('heading', { level: 1 }) }" @click="editor?.chain().focus().toggleHeading({ level: 1 }).run()">
        <Heading1 :size="15" />
      </button>
      <button class="toolbar-btn" :class="{ active: editor?.isActive('heading', { level: 2 }) }" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()">
        <Heading2 :size="15" />
      </button>
      <button class="toolbar-btn" :class="{ active: editor?.isActive('heading', { level: 3 }) }" @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()">
        <Heading3 :size="15" />
      </button>
      <div class="toolbar-divider" />

      <!-- Lists -->
      <button class="toolbar-btn" :class="{ active: editor?.isActive('bulletList') }" @click="editor?.chain().focus().toggleBulletList().run()">
        <List :size="15" />
      </button>
      <button class="toolbar-btn" :class="{ active: editor?.isActive('orderedList') }" @click="editor?.chain().focus().toggleOrderedList().run()">
        <ListOrdered :size="15" />
      </button>
      <button class="toolbar-btn" :class="{ active: editor?.isActive('taskList') }" @click="editor?.chain().focus().toggleTaskList().run()">
        <ListChecks :size="15" />
      </button>
      <div class="toolbar-divider" />

      <!-- Block elements -->
      <button class="toolbar-btn" :class="{ active: editor?.isActive('blockquote') }" @click="editor?.chain().focus().toggleBlockquote().run()">
        <Quote :size="15" />
      </button>
      <button class="toolbar-btn" :class="{ active: editor?.isActive('code') }" @click="editor?.chain().focus().toggleCode().run()">
        <Code :size="15" />
      </button>
      <button class="toolbar-btn" :class="{ active: editor?.isActive('codeBlock') }" @click="editor?.chain().focus().toggleCodeBlock().run()">
        <Code2 :size="15" />
      </button>
      <div class="toolbar-divider" />

      <!-- Alignment -->
      <button class="toolbar-btn" :class="{ active: editor?.isActive({ textAlign: 'left' }) }" @click="editor?.chain().focus().setTextAlign('left').run()">
        <AlignLeft :size="15" />
      </button>
      <button class="toolbar-btn" :class="{ active: editor?.isActive({ textAlign: 'center' }) }" @click="editor?.chain().focus().setTextAlign('center').run()">
        <AlignCenter :size="15" />
      </button>
      <button class="toolbar-btn" :class="{ active: editor?.isActive({ textAlign: 'right' }) }" @click="editor?.chain().focus().setTextAlign('right').run()">
        <AlignRight :size="15" />
      </button>
      <button class="toolbar-btn" :class="{ active: editor?.isActive({ textAlign: 'justify' }) }" @click="editor?.chain().focus().setTextAlign('justify').run()">
        <AlignJustify :size="15" />
      </button>
      <div class="toolbar-divider" />

      <!-- Extras -->
      <button class="toolbar-btn" :class="{ active: editor?.isActive('highlight') }" @click="editor?.chain().focus().toggleHighlight().run()">
        <Highlighter :size="15" />
      </button>
      <button class="toolbar-btn" :class="{ active: editor?.isActive('superscript') }" @click="editor?.chain().focus().toggleSuperscript().run()">
        <SuperscriptIcon :size="15" />
      </button>
      <button class="toolbar-btn" :class="{ active: editor?.isActive('subscript') }" @click="editor?.chain().focus().toggleSubscript().run()">
        <SubscriptIcon :size="15" />
      </button>
      <div class="toolbar-divider" />

      <!-- Insert -->
      <button class="toolbar-btn" @click="showLinkInput = !showLinkInput">
        <LinkIcon :size="15" />
      </button>
      <button class="toolbar-btn" @click="addImage">
        <ImageIcon :size="15" />
      </button>
      <button class="toolbar-btn" @click="insertTable">
        <TableIcon :size="15" />
      </button>
      <button class="toolbar-btn" @click="editor?.chain().focus().setHorizontalRule().run()">
        <Minus :size="15" />
      </button>
    </div>

    <!-- Link input bar -->
    <div v-if="showLinkInput" class="link-bar">
      <input
        v-model="linkUrl"
        type="url"
        placeholder="https://..."
        class="link-input"
        @keydown.enter.prevent="setLink"
      />
      <button class="link-bar-btn" @click="setLink">Aplicar</button>
      <button class="link-bar-btn link-bar-btn--cancel" @click="showLinkInput = false">
        <X :size="14" />
      </button>
    </div>

    <!-- Table toolbar (contextual) -->
    <div v-if="editor?.isActive('table')" class="table-toolbar">
      <button class="toolbar-btn toolbar-btn--sm" @click="(editor?.chain().focus() as any).addColumnBefore().run()">
        <Plus :size="13" /> Col antes
      </button>
      <button class="toolbar-btn toolbar-btn--sm" @click="(editor?.chain().focus() as any).addColumnAfter().run()">
        <Plus :size="13" /> Col depois
      </button>
      <button class="toolbar-btn toolbar-btn--sm" @click="(editor?.chain().focus() as any).addRowBefore().run()">
        <Plus :size="13" /> Linha antes
      </button>
      <button class="toolbar-btn toolbar-btn--sm" @click="(editor?.chain().focus() as any).addRowAfter().run()">
        <Plus :size="13" /> Linha depois
      </button>
      <div class="toolbar-divider" />
      <button class="toolbar-btn toolbar-btn--sm" @click="(editor?.chain().focus() as any).deleteColumn().run()">
        <Trash2 :size="13" /> Col
      </button>
      <button class="toolbar-btn toolbar-btn--sm" @click="(editor?.chain().focus() as any).deleteRow().run()">
        <Trash2 :size="13" /> Linha
      </button>
      <button class="toolbar-btn toolbar-btn--sm toolbar-btn--danger" @click="(editor?.chain().focus() as any).deleteTable().run()">
        <Trash2 :size="13" /> Tabela
      </button>
      <div class="toolbar-divider" />
      <button class="toolbar-btn toolbar-btn--sm" @click="(editor?.chain().focus() as any).mergeCells().run()">
        <TableCellsMerge :size="13" /> Mesclar
      </button>
      <button class="toolbar-btn toolbar-btn--sm" @click="(editor?.chain().focus() as any).splitCell().run()">
        <TableCellsSplit :size="13" /> Dividir
      </button>
    </div>

    <!-- Editor content -->
    <EditorContent :editor="editor" class="editor-content" />

    <!-- Footer with word count -->
    <div class="editor-footer">
      <span class="char-count">{{ wordCount }} palavras &middot; {{ charCount }} caracteres</span>
    </div>
  </div>
</template>

<style scoped>
.tiptap-editor {
  border: 1px solid rgba(var(--v-theme-secondary), 0.2);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 12px;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.2);
  background: rgb(var(--v-theme-surface));
  flex-wrap: wrap;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: rgba(var(--v-theme-secondary), 0.7);
  cursor: pointer;
  transition: all 0.12s ease;
}

.toolbar-btn:hover {
  background: rgba(var(--v-theme-secondary), 0.1);
  color: rgb(var(--v-theme-secondary));
}

.toolbar-btn.active {
  background: rgba(var(--v-theme-secondary), 0.15);
  color: rgb(var(--v-theme-secondary));
}

.toolbar-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.toolbar-btn--sm {
  width: auto;
  padding: 4px 8px;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
}

.toolbar-btn--danger:hover {
  background: rgba(var(--v-theme-error), 0.1);
  color: rgb(var(--v-theme-error));
}

.toolbar-divider {
  width: 1px;
  height: 18px;
  background: rgba(var(--v-theme-secondary), 0.2);
  margin: 0 4px;
}

/* Link bar */
.link-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.2);
  background: rgba(var(--v-theme-secondary), 0.03);
}

.link-input {
  flex: 1;
  max-width: 400px;
  padding: 6px 10px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.2);
  border-radius: 6px;
  font-size: 13px;
  background: transparent;
  color: rgb(var(--v-theme-secondary));
  outline: none;
}

.link-input:focus {
  border-color: rgba(var(--v-theme-secondary), 0.4);
}

.link-bar-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: rgba(var(--v-theme-secondary), 0.1);
  color: rgba(var(--v-theme-secondary), 0.8);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s ease;
}

.link-bar-btn:hover {
  background: rgba(var(--v-theme-secondary), 0.15);
}

.link-bar-btn--cancel {
  display: flex;
  align-items: center;
  padding: 6px;
}

/* Table toolbar */
.table-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.2);
  background: rgba(var(--v-theme-secondary), 0.02);
  flex-wrap: wrap;
}

/* Editor content */
.editor-content {
  flex: 1;
  min-height: calc(100vh - 350px);
  max-height: calc(100vh - 350px);
  overflow-y: auto;
}

.editor-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 6px 12px;
  border-top: 1px solid rgba(var(--v-theme-secondary), 0.2);
  background: rgb(var(--v-theme-surface));
}

.char-count {
  font-size: 11px;
  color: rgba(var(--v-theme-secondary), 0.5);
}

/* ProseMirror styles */
:deep(.ProseMirror) {
  padding: 16px;
  outline: none;
  min-height: calc(100vh - 350px);
  font-size: 15px;
  line-height: 1.7;
  color: rgb(var(--v-theme-secondary));
}

:deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: rgba(var(--v-theme-secondary), 0.4);
  pointer-events: none;
  height: 0;
}

:deep(.ProseMirror h1) {
  font-size: 1.8em;
  font-weight: 700;
  margin: 1em 0 0.4em;
  line-height: 1.3;
}

:deep(.ProseMirror h2) {
  font-size: 1.4em;
  font-weight: 600;
  margin: 0.8em 0 0.3em;
  line-height: 1.3;
}

:deep(.ProseMirror h3) {
  font-size: 1.15em;
  font-weight: 600;
  margin: 0.7em 0 0.25em;
  line-height: 1.4;
}

:deep(.ProseMirror blockquote) {
  border-left: 3px solid rgba(var(--v-theme-secondary), 0.2);
  padding-left: 16px;
  margin: 12px 0;
  color: rgba(var(--v-theme-secondary), 0.7);
  font-style: italic;
}

:deep(.ProseMirror code) {
  background: rgba(var(--v-theme-secondary), 0.08);
  border-radius: 4px;
  padding: 2px 5px;
  font-size: 0.9em;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

:deep(.ProseMirror pre) {
  background: rgba(var(--v-theme-secondary), 0.06);
  border: 1px solid rgba(var(--v-theme-secondary), 0.1);
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
  overflow-x: auto;
}

:deep(.ProseMirror pre code) {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: 13px;
  line-height: 1.6;
}

/* Syntax highlight colors */
:deep(.hljs-keyword) { color: #c678dd; }
:deep(.hljs-string) { color: #98c379; }
:deep(.hljs-number) { color: #d19a66; }
:deep(.hljs-comment) { color: rgba(var(--v-theme-secondary), 0.4); font-style: italic; }
:deep(.hljs-function) { color: #61afef; }
:deep(.hljs-title) { color: #e5c07b; }
:deep(.hljs-built_in) { color: #56b6c2; }
:deep(.hljs-attr) { color: #d19a66; }
:deep(.hljs-variable) { color: #e06c75; }
:deep(.hljs-type) { color: #e5c07b; }

/* Link styles */
:deep(.editor-link) {
  color: #61afef;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

/* Highlight */
:deep(mark) {
  background: rgba(255, 220, 50, 0.25);
  border-radius: 2px;
  padding: 1px 2px;
}

/* Task list */
:deep(ul[data-type="taskList"]) {
  list-style: none;
  padding-left: 0;
}

:deep(ul[data-type="taskList"] li) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 4px 0;
}

:deep(ul[data-type="taskList"] li label) {
  margin-top: 3px;
}

:deep(ul[data-type="taskList"] li label input[type="checkbox"]) {
  width: 16px;
  height: 16px;
  accent-color: rgb(var(--v-theme-secondary));
  cursor: pointer;
}

:deep(ul[data-type="taskList"] li[data-checked="true"] > div > p) {
  text-decoration: line-through;
  color: rgba(var(--v-theme-secondary), 0.4);
}

/* Table styles */
:deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  border-radius: 8px;
  overflow: hidden;
}

:deep(th),
:deep(td) {
  border: 1px solid rgba(var(--v-theme-secondary), 0.15);
  padding: 8px 12px;
  text-align: left;
  min-width: 80px;
  vertical-align: top;
}

:deep(th) {
  background: rgba(var(--v-theme-secondary), 0.06);
  font-weight: 600;
  font-size: 13px;
}

:deep(td) {
  font-size: 14px;
}

:deep(.selectedCell) {
  background: rgba(var(--v-theme-secondary), 0.08);
}

:deep(.column-resize-handle) {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 4px;
  background: rgba(var(--v-theme-secondary), 0.2);
  cursor: col-resize;
}

/* Image */
:deep(img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 8px 0;
}

/* Horizontal rule */
:deep(hr) {
  border: none;
  height: 1px;
  background: rgba(var(--v-theme-secondary), 0.15);
  margin: 24px 0;
}
</style>
