<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import notesService from '@/service/notes/notes-service'

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

const editor = useEditor({
  content: '',
  extensions: [
    StarterKit,
    Link.configure({
      openOnClick: false,
    }),
    Placeholder.configure({
      placeholder: 'Comece a escrever...',
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Underline,
  ],
  onUpdate: ({ editor }) => {
    content.value = editor.getHTML()
  },
})

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
    console.error('Erro ao buscar pastas:', e)
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
    console.error('Erro ao buscar nota:', e)
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
    } else {
      await notesService.updateNote(noteId.value, data)
    }
  } catch (e) {
    console.error('Erro ao salvar nota:', e)
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
</script>

<template>
  <div class="note-editor-page">
    <div class="editor-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">
          <v-icon size="18">mdi-arrow-left</v-icon>
        </button>
        <input
          v-model="title"
          type="text"
          class="title-input"
          placeholder="Título da nota..."
        />
      </div>
      <div class="header-right">
        <button class="save-btn" :disabled="saving" @click="saveNote">
          <v-icon size="16">{{ saving ? 'mdi-loading' : 'mdi-content-save' }}</v-icon>
          {{ saving ? 'Salvando...' : 'Salvar' }}
        </button>
      </div>
    </div>

    <div class="editor-toolbar">
      <button
        class="toolbar-btn"
        :class="{ active: editor?.isActive('bold') }"
        @click="editor?.chain().focus().toggleBold().run()"
      >
        <v-icon size="16">mdi-format-bold</v-icon>
      </button>
      <button
        class="toolbar-btn"
        :class="{ active: editor?.isActive('italic') }"
        @click="editor?.chain().focus().toggleItalic().run()"
      >
        <v-icon size="16">mdi-format-italic</v-icon>
      </button>
      <button
        class="toolbar-btn"
        :class="{ active: editor?.isActive('underline') }"
        @click="editor?.chain().focus().toggleUnderline().run()"
      >
        <v-icon size="16">mdi-format-underline</v-icon>
      </button>
      <div class="toolbar-divider" />
      <button
        class="toolbar-btn"
        :class="{ active: editor?.isActive('heading', { level: 1 }) }"
        @click="editor?.chain().focus().toggleHeading({ level: 1 }).run()"
      >
        <v-icon size="16">mdi-format-header-1</v-icon>
      </button>
      <button
        class="toolbar-btn"
        :class="{ active: editor?.isActive('heading', { level: 2 }) }"
        @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        <v-icon size="16">mdi-format-header-2</v-icon>
      </button>
      <div class="toolbar-divider" />
      <button
        class="toolbar-btn"
        :class="{ active: editor?.isActive('bulletList') }"
        @click="editor?.chain().focus().toggleBulletList().run()"
      >
        <v-icon size="16">mdi-format-list-bulleted</v-icon>
      </button>
      <button
        class="toolbar-btn"
        :class="{ active: editor?.isActive('orderedList') }"
        @click="editor?.chain().focus().toggleOrderedList().run()"
      >
        <v-icon size="16">mdi-format-list-numbered</v-icon>
      </button>
    </div>

    <div class="editor-layout">
      <div class="editor-main">
        <div v-if="loading" class="editor-loading">
          Carregando...
        </div>
        <EditorContent v-else :editor="editor" class="editor-content" />
      </div>

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
              <v-icon size="14">mdi-plus</v-icon>
            </button>
          </div>
          <div class="tags-list">
            <span v-for="tag in tags" :key="tag" class="tag">
              {{ tag }}
              <button @click="removeTag(tag)">
                <v-icon size="12">mdi-close</v-icon>
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

.save-btn:hover {
  opacity: 0.9;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 20px;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.08);
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: rgba(var(--v-theme-secondary), 0.6);
  cursor: pointer;
  transition: all 0.15s ease;
}

.toolbar-btn:hover {
  background: rgba(var(--v-theme-secondary), 0.05);
  color: rgb(var(--v-theme-secondary));
}

.toolbar-btn.active {
  background: rgba(var(--v-theme-secondary), 0.1);
  color: rgb(var(--v-theme-secondary));
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: rgba(var(--v-theme-secondary), 0.1);
  margin: 0 4px;
}

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
  color: rgba(var(--v-theme-secondary), 0.35);
  pointer-events: none;
  height: 0;
}

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
