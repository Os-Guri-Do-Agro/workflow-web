<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
import notesService from '@/service/notes/notes-service'
import { useToast } from '@/composables/useToast'
import {
  ArrowLeft, Save, Loader2,
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
  Rows3, Columns3,
  Trash2,
} from 'lucide-vue-next'

const lowlight = createLowlight(common)
const { success, error: showError } = useToast()

const route = useRoute()
const router = useRouter()
const noteId = computed(() => route.params.id as string)
const isNew = computed(() => noteId.value === 'new')

const title = ref('')
const content = ref('')
const tags = ref<string[]>([])
const folderId = ref<string | null>(null)
const folders = ref<any[]>([])
const loading = ref(true)
const saving = ref(false)
const newTag = ref('')
const showLinkInput = ref(false)
const linkUrl = ref('')

const editor = useEditor({
  content: '',
  extensions: [
    StarterKit.configure({
      codeBlock: false,
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { class: 'editor-link' },
    }),
    Placeholder.configure({
      placeholder: 'Comece a escrever...',
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
    content.value = e.getHTML()
  },
})

const charCount = computed(() => editor.value?.storage.characterCount?.characters() ?? 0)
const wordCount = computed(() => editor.value?.storage.characterCount?.words() ?? 0)

onMounted(async () => {
  await fetchFolders()
  if (!isNew.value) {
    await fetchNote()
  }
  loading.value = false
})

async function fetchFolders() {
  try {
    const response = await notesService.getFolders()
    folders.value = response
  } catch (e) {
    showError('Erro ao carregar pastas')
  }
}

async function fetchNote() {
  try {
    const response = await notesService.getNote(noteId.value)
    title.value = response.title
    content.value = response.content
    tags.value = response.tags || []
    folderId.value = response.folderId

    if (editor.value) {
      editor.value.commands.setContent(response.content)
    }
  } catch (e) {
    showError('Erro ao carregar nota')
  }
}

async function saveNote() {
  saving.value = true
  try {
    const data = {
      title: title.value,
      content: content.value,
      tags: tags.value,
      folderId: folderId.value,
    }

    if (isNew.value) {
      const response = await notesService.createNote(data)
      router.replace(`/notes/${response.id}`)
      success('Nota criada com sucesso')
    } else {
      await notesService.updateNote(noteId.value, data)
      success('Nota salva com sucesso')
    }
  } catch (e) {
    showError('Erro ao salvar nota')
  } finally {
    saving.value = false
  }
}

function addTag() {
  if (newTag.value.trim() && !tags.value.includes(newTag.value.trim())) {
    tags.value.push(newTag.value.trim())
    newTag.value = ''
  }
}

function removeTag(tag: string) {
  tags.value = tags.value.filter(t => t !== tag)
}

function goBack() {
  router.push('/notes')
}

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

// Keyboard shortcut for save
watch(() => editor.value, (e) => {
  if (!e) return
  const el = e.view.dom
  el.addEventListener('keydown', (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault()
      saveNote()
    }
  })
}, { once: true })
</script>

<template>
  <div class="note-editor-page">
    <!-- Header -->
    <div class="editor-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">
          <ArrowLeft :size="18" />
        </button>
        <input
          v-model="title"
          type="text"
          class="title-input"
          placeholder="Titulo da nota..."
        />
      </div>
      <div class="header-right">
        <span class="char-count">{{ wordCount }} palavras &middot; {{ charCount }} chars</span>
        <button class="save-btn" :disabled="saving" @click="saveNote">
          <component :is="saving ? Loader2 : Save" :size="16" :class="{ 'spin': saving }" />
          {{ saving ? 'Salvando...' : 'Salvar' }}
        </button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="editor-toolbar">
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

    <!-- Editor layout -->
    <div class="editor-layout">
      <div class="editor-main">
        <div v-if="loading" class="editor-loading">Carregando...</div>
        <template v-else>
          <EditorContent :editor="editor" class="editor-content" />
        </template>
      </div>

      <!-- Sidebar -->
      <div class="editor-sidebar">
        <div class="sidebar-section">
          <label class="sidebar-label">Pasta</label>
          <select v-model="folderId" class="sidebar-select">
            <option :value="null">Sem pasta</option>
            <option v-for="folder in folders" :key="folder.id" :value="folder.id">
              {{ folder.name }}
            </option>
          </select>
        </div>

        <div class="sidebar-section">
          <label class="sidebar-label">Tags</label>
          <div class="tags-input">
            <input
              v-model="newTag"
              type="text"
              placeholder="Adicionar tag..."
              @keydown.enter.prevent="addTag"
            />
            <button @click="addTag">
              <Plus :size="14" />
            </button>
          </div>
          <div class="tags-list">
            <span v-for="tag in tags" :key="tag" class="tag">
              {{ tag }}
              <button @click="removeTag(tag)">
                <X :size="12" />
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.note-editor-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: rgb(var(--v-theme-primary));
}

/* ─── Header ─── */
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.08);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.char-count {
  font-size: 11px;
  color: rgba(var(--v-theme-secondary), 0.35);
  white-space: nowrap;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: rgba(var(--v-theme-secondary), 0.05);
  color: rgba(var(--v-theme-secondary), 0.6);
  cursor: pointer;
  transition: all 0.15s ease;
}

.back-btn:hover {
  background: rgba(var(--v-theme-secondary), 0.1);
  color: rgb(var(--v-theme-secondary));
}

.title-input {
  flex: 1;
  font-size: 18px;
  font-weight: 600;
  border: none;
  background: transparent;
  color: rgb(var(--v-theme-secondary));
  outline: none;
}

.title-input::placeholder {
  color: rgba(var(--v-theme-secondary), 0.4);
}

.save-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgb(var(--v-theme-secondary));
  color: rgb(var(--v-theme-primary));
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.save-btn:hover { opacity: 0.9; }
.save-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ─── Toolbar ─── */
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 20px;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.08);
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
  color: rgba(var(--v-theme-secondary), 0.5);
  cursor: pointer;
  transition: all 0.12s ease;
}

.toolbar-btn:hover {
  background: rgba(var(--v-theme-secondary), 0.07);
  color: rgb(var(--v-theme-secondary));
}

.toolbar-btn.active {
  background: rgba(var(--v-theme-secondary), 0.12);
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
  background: rgba(var(--v-theme-secondary), 0.08);
  margin: 0 4px;
}

/* ─── Link bar ─── */
.link-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 20px;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.08);
  background: rgba(var(--v-theme-secondary), 0.03);
}

.link-input {
  flex: 1;
  max-width: 400px;
  padding: 6px 10px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.12);
  border-radius: 6px;
  font-size: 13px;
  background: transparent;
  color: rgb(var(--v-theme-secondary));
  outline: none;
}

.link-input:focus {
  border-color: rgba(var(--v-theme-secondary), 0.3);
}

.link-bar-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: rgba(var(--v-theme-secondary), 0.1);
  color: rgba(var(--v-theme-secondary), 0.7);
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

/* ─── Table toolbar ─── */
.table-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 20px;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.08);
  background: rgba(var(--v-theme-secondary), 0.02);
  flex-wrap: wrap;
}

/* ─── Editor layout ─── */
.editor-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.editor-main {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.editor-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(var(--v-theme-secondary), 0.4);
}

.editor-content {
  max-width: 800px;
  margin: 0 auto;
}

/* ─── ProseMirror styles ─── */
.editor-content :deep(.ProseMirror) {
  min-height: 400px;
  outline: none;
  font-size: 15px;
  line-height: 1.7;
  color: rgb(var(--v-theme-secondary));
}

.editor-content :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: rgba(var(--v-theme-secondary), 0.3);
  pointer-events: none;
  height: 0;
}

.editor-content :deep(.ProseMirror h1) {
  font-size: 1.8em;
  font-weight: 700;
  margin: 1em 0 0.4em;
  line-height: 1.3;
}

.editor-content :deep(.ProseMirror h2) {
  font-size: 1.4em;
  font-weight: 600;
  margin: 0.8em 0 0.3em;
  line-height: 1.3;
}

.editor-content :deep(.ProseMirror h3) {
  font-size: 1.15em;
  font-weight: 600;
  margin: 0.7em 0 0.25em;
  line-height: 1.4;
}

.editor-content :deep(.ProseMirror blockquote) {
  border-left: 3px solid rgba(var(--v-theme-secondary), 0.15);
  padding-left: 16px;
  margin: 12px 0;
  color: rgba(var(--v-theme-secondary), 0.7);
  font-style: italic;
}

.editor-content :deep(.ProseMirror code) {
  background: rgba(var(--v-theme-secondary), 0.08);
  border-radius: 4px;
  padding: 2px 5px;
  font-size: 0.9em;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.editor-content :deep(.ProseMirror pre) {
  background: rgba(var(--v-theme-secondary), 0.06);
  border: 1px solid rgba(var(--v-theme-secondary), 0.08);
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
  overflow-x: auto;
}

.editor-content :deep(.ProseMirror pre code) {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: 13px;
  line-height: 1.6;
}

/* Syntax highlight colors */
.editor-content :deep(.hljs-keyword) { color: #c678dd; }
.editor-content :deep(.hljs-string) { color: #98c379; }
.editor-content :deep(.hljs-number) { color: #d19a66; }
.editor-content :deep(.hljs-comment) { color: rgba(var(--v-theme-secondary), 0.35); font-style: italic; }
.editor-content :deep(.hljs-function) { color: #61afef; }
.editor-content :deep(.hljs-title) { color: #e5c07b; }
.editor-content :deep(.hljs-built_in) { color: #56b6c2; }
.editor-content :deep(.hljs-attr) { color: #d19a66; }
.editor-content :deep(.hljs-variable) { color: #e06c75; }
.editor-content :deep(.hljs-type) { color: #e5c07b; }

/* Link styles */
.editor-content :deep(.editor-link) {
  color: #61afef;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

/* Highlight */
.editor-content :deep(mark) {
  background: rgba(255, 220, 50, 0.25);
  border-radius: 2px;
  padding: 1px 2px;
}

/* Task list */
.editor-content :deep(ul[data-type="taskList"]) {
  list-style: none;
  padding-left: 0;
}

.editor-content :deep(ul[data-type="taskList"] li) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 4px 0;
}

.editor-content :deep(ul[data-type="taskList"] li label) {
  margin-top: 3px;
}

.editor-content :deep(ul[data-type="taskList"] li label input[type="checkbox"]) {
  width: 16px;
  height: 16px;
  accent-color: rgb(var(--v-theme-secondary));
  cursor: pointer;
}

.editor-content :deep(ul[data-type="taskList"] li[data-checked="true"] > div > p) {
  text-decoration: line-through;
  color: rgba(var(--v-theme-secondary), 0.4);
}

/* Table styles */
.editor-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  border-radius: 8px;
  overflow: hidden;
}

.editor-content :deep(th),
.editor-content :deep(td) {
  border: 1px solid rgba(var(--v-theme-secondary), 0.1);
  padding: 8px 12px;
  text-align: left;
  min-width: 80px;
  vertical-align: top;
}

.editor-content :deep(th) {
  background: rgba(var(--v-theme-secondary), 0.06);
  font-weight: 600;
  font-size: 13px;
}

.editor-content :deep(td) {
  font-size: 14px;
}

.editor-content :deep(.selectedCell) {
  background: rgba(var(--v-theme-secondary), 0.08);
}

.editor-content :deep(.column-resize-handle) {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 4px;
  background: rgba(var(--v-theme-secondary), 0.2);
  cursor: col-resize;
}

/* Image */
.editor-content :deep(img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 8px 0;
}

/* Horizontal rule */
.editor-content :deep(hr) {
  border: none;
  height: 1px;
  background: rgba(var(--v-theme-secondary), 0.1);
  margin: 24px 0;
}

/* ─── Sidebar ─── */
.editor-sidebar {
  width: 240px;
  border-left: 1px solid rgba(var(--v-theme-secondary), 0.08);
  padding: 20px;
  overflow-y: auto;
}

.sidebar-section {
  margin-bottom: 24px;
}

.sidebar-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.5);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.sidebar-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.1);
  border-radius: 6px;
  background: transparent;
  font-size: 13px;
  color: rgb(var(--v-theme-secondary));
  cursor: pointer;
}

.tags-input {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.tags-input input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.1);
  border-radius: 6px;
  font-size: 13px;
  background: transparent;
  color: rgb(var(--v-theme-secondary));
  outline: none;
}

.tags-input button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  border: none;
  border-radius: 6px;
  background: rgba(var(--v-theme-secondary), 0.08);
  color: rgba(var(--v-theme-secondary), 0.6);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tags-input button:hover {
  background: rgba(var(--v-theme-secondary), 0.12);
  color: rgb(var(--v-theme-secondary));
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(var(--v-theme-secondary), 0.08);
  border-radius: 4px;
  font-size: 12px;
  color: rgba(var(--v-theme-secondary), 0.7);
}

.tag button {
  display: flex;
  align-items: center;
  border: none;
  background: transparent;
  color: rgba(var(--v-theme-secondary), 0.4);
  cursor: pointer;
  padding: 0;
}

.tag button:hover {
  color: rgba(var(--v-theme-secondary), 0.7);
}
</style>
